import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const DAILY_LOGIN_BONUS = 10;

export async function POST() {
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
      { error: "Service keys are not configured" },
      { status: 500 },
    );
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role, credits, last_login_bonus_date")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: `Failed to fetch profile: ${profileError.message}` },
      { status: 500 },
    );
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.role !== "bidder") {
    return NextResponse.json({ awarded: false, reason: "non-bidder" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const lastBonusDate = profile.last_login_bonus_date
    ? String(profile.last_login_bonus_date).slice(0, 10)
    : null;

  if (lastBonusDate === today) {
    return NextResponse.json({ awarded: false, reason: "already-awarded" });
  }

  const previousCredits = profile.credits ?? 0;
  const updatedCredits = previousCredits + DAILY_LOGIN_BONUS;

  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({
      credits: updatedCredits,
      last_login_bonus_date: today,
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update login bonus: ${updateError.message}` },
      { status: 500 },
    );
  }

  const { error: txError } = await serviceClient.from("credit_transactions").insert({
    user_id: user.id,
    amount: DAILY_LOGIN_BONUS,
    type: "mining",
    note: "Daily login bonus",
  });

  if (txError) {
    // Best-effort rollback to keep credits and transaction log consistent.
    await serviceClient
      .from("profiles")
      .update({
        credits: previousCredits,
        last_login_bonus_date: profile.last_login_bonus_date,
      })
      .eq("id", user.id);

    return NextResponse.json(
      { error: `Failed to log login bonus: ${txError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    awarded: true,
    amount: DAILY_LOGIN_BONUS,
    credits: updatedCredits,
  });
}
