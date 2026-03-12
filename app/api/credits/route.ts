import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
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
      "Unable to read profile role for credits route. Falling back to user metadata.",
      adminProfileError,
    );
  }

  const resolvedRole =
    adminProfile?.role === "admin" || adminProfile?.role === "bidder"
      ? adminProfile.role
      : user.user_metadata?.role === "admin"
        ? "admin"
        : "bidder";

  if (resolvedRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { user_id, amount, type, note, auction_id } = body;

  if (!user_id || !amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const validTypes = ["assign", "bid_deduct", "bid_refund", "winner_deduct"];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: "Invalid transaction type" },
      { status: 400 },
    );
  }

  // Fetch current profile
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("credits")
    .eq("id", user_id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Update credits
  const newCredits =
    type === "assign" ? profile.credits + amount : profile.credits - amount;

  if (newCredits < 0) {
    return NextResponse.json(
      { error: "Insufficient credits for this operation" },
      { status: 400 },
    );
  }

  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", user_id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update credits" },
      { status: 500 },
    );
  }

  // Log transaction
  const transactionAmount = type === "assign" ? amount : -amount;
  await serviceClient.from("credit_transactions").insert({
    user_id,
    amount: transactionAmount,
    type,
    auction_id: auction_id || null,
    note: note || null,
  });

  return NextResponse.json({
    success: true,
    new_balance: newCredits,
  });
}
