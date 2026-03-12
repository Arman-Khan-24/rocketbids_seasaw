import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function resolveRole(
  profileRole: unknown,
  metadataRole: unknown,
): "admin" | "bidder" {
  if (profileRole === "admin" || profileRole === "bidder") {
    return profileRole;
  }

  return metadataRole === "admin" ? "admin" : "bidder";
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Storage server keys are not configured" },
      { status: 500 },
    );
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: adminProfile, error: adminProfileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminProfileError) {
    console.warn(
      "Unable to read profile role for auctions route. Falling back to user metadata.",
      adminProfileError,
    );
  }

  const resolvedRole = resolveRole(
    adminProfile?.role,
    user.user_metadata?.role,
  );
  if (resolvedRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: unknown;
    description?: unknown;
    image_url?: unknown;
    category?: unknown;
    min_bid?: unknown;
    start_time?: unknown;
    end_time?: unknown;
    blind_mode?: unknown;
  };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const imageUrl = typeof body.image_url === "string" ? body.image_url : null;
  const category =
    typeof body.category === "string" ? body.category : "General";
  const minBid = typeof body.min_bid === "number" ? body.min_bid : Number.NaN;
  const blindMode =
    typeof body.blind_mode === "boolean" ? body.blind_mode : false;

  const startTimeRaw =
    typeof body.start_time === "string" ? body.start_time : "";
  const endTimeRaw = typeof body.end_time === "string" ? body.end_time : "";
  const startTime = new Date(startTimeRaw);
  const endTime = new Date(endTimeRaw);

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!Number.isFinite(minBid) || minBid <= 0) {
    return NextResponse.json(
      { error: "Minimum bid must be greater than 0" },
      { status: 400 },
    );
  }

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return NextResponse.json(
      { error: "Valid start_time and end_time are required" },
      { status: 400 },
    );
  }

  if (endTime <= startTime) {
    return NextResponse.json(
      { error: "End time must be after start time" },
      { status: 400 },
    );
  }

  const status = startTime > new Date() ? "upcoming" : "active";

  const { data, error } = await serviceClient
    .from("auctions")
    .insert({
      title,
      description,
      image_url: imageUrl,
      category,
      min_bid: Math.trunc(minBid),
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      blind_mode: blindMode,
      created_by: user.id,
      status,
      current_bid: 0,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create auction: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id, status });
}
