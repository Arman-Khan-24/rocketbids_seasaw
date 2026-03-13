import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Recommendation = "INVEST" | "AVOID" | "WAIT";

type GeminiOverlayResponse = {
  recommendation: Recommendation;
  explanation: string;
  labels: {
    safe: string;
    optimal: string;
    aggressive: string;
  };
};

type RecentBidInput = {
  amount: number;
  timestamp: string;
};

function limitWords(value: string, maxWords: number): string {
  const words = value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\r\n]+/g, " ").trim();
}

function sanitizeOverlay(raw: Partial<GeminiOverlayResponse>): GeminiOverlayResponse {
  const recommendation =
    raw.recommendation === "INVEST" ||
    raw.recommendation === "AVOID" ||
    raw.recommendation === "WAIT"
      ? raw.recommendation
      : "WAIT";

  const explanation =
    limitWords(cleanText(raw.explanation), 12) || "Momentum unclear with current auction pressure.";

  const labels = raw.labels ?? {
    safe: "Lower risk choice",
    optimal: "Balanced pressure move",
    aggressive: "High push for lead",
  };

  return {
    recommendation,
    explanation,
    labels: {
      safe: limitWords(cleanText(labels.safe), 8) || "Lower risk choice",
      optimal: limitWords(cleanText(labels.optimal), 8) || "Balanced pressure move",
      aggressive:
        limitWords(cleanText(labels.aggressive), 8) || "High push for lead",
    },
  };
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return trimmed.slice(start, end + 1);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: {
    current_bid?: unknown;
    last_5_bids?: unknown;
    active_bidders?: unknown;
    time_remaining_seconds?: unknown;
    war_mode?: unknown;
    credit_balance?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const currentBid = Number(body.current_bid ?? 0);
  const activeBidders = Number(body.active_bidders ?? 0);
  const timeRemainingSeconds = Number(body.time_remaining_seconds ?? 0);
  const warMode = Boolean(body.war_mode);
  const creditBalance = Number(body.credit_balance ?? 0);

  const last5BidsRaw = Array.isArray(body.last_5_bids) ? body.last_5_bids : [];
  const last5Bids: RecentBidInput[] = last5BidsRaw
    .slice(0, 5)
    .map((item) => ({
      amount: Number((item as { amount?: unknown }).amount ?? 0),
      timestamp: String((item as { timestamp?: unknown }).timestamp ?? ""),
    }))
    .filter((item) => Number.isFinite(item.amount) && item.timestamp.length > 0);

  const prompt = [
    "You are an auction bidding assistant for RocketBids.",
    "Return ONLY valid JSON with this exact shape:",
    '{"recommendation":"INVEST|AVOID|WAIT","explanation":"max 12 words","labels":{"safe":"max 8 words","optimal":"max 8 words","aggressive":"max 8 words"}}',
    "Rules:",
    "- recommendation must be exactly one word from INVEST, AVOID, WAIT.",
    "- explanation must be under 12 words.",
    "- each label must be under 8 words.",
    "- no markdown, no extra keys, no code fences.",
    "Input data:",
    JSON.stringify({
      current_bid: currentBid,
      last_5_bids: last5Bids,
      active_bidders: activeBidders,
      time_remaining_seconds: timeRemainingSeconds,
      war_mode: warMode,
      credit_balance: creditBalance,
    }),
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2900);

  try {
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 120,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      return NextResponse.json(
        { error: "Gemini request failed" },
        { status: 502 },
      );
    }

    const geminiData = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const rawText =
      geminiData.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";

    const jsonText = extractJsonObject(rawText);
    if (!jsonText) {
      return NextResponse.json(
        { error: "Gemini returned invalid format" },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(jsonText) as Partial<GeminiOverlayResponse>;
    return NextResponse.json(sanitizeOverlay(parsed));
  } catch {
    return NextResponse.json(
      { error: "Gemini timeout or network error" },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
