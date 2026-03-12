import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * PATCH /api/auctions/sync-status
 *
 * Syncs auction statuses based on current time:
 *   upcoming  → active   when start_time has passed
 *   active    → closed   when end_time has passed
 *
 * Requires any authenticated session. Uses the service role to bypass RLS.
 */
export async function PATCH() {
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
      { error: "Service keys not configured" },
      { status: 500 },
    );
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const now = new Date().toISOString();

  // Step 1: Directly close upcoming auctions whose end_time has already passed
  // (handles auctions that expired without ever transitioning through 'active')
  const { error: expiredCloseError } = await serviceClient
    .from("auctions")
    .update({ status: "closed" })
    .eq("status", "upcoming")
    .lte("end_time", now);

  if (expiredCloseError) {
    console.error("sync-status: expired-close error", expiredCloseError);
  }

  // Step 2: Activate upcoming auctions whose start_time has passed but end_time hasn't yet
  const { error: activateError } = await serviceClient
    .from("auctions")
    .update({ status: "active" })
    .eq("status", "upcoming")
    .lte("start_time", now)
    .gt("end_time", now);

  if (activateError) {
    console.error("sync-status: activate error", activateError);
  }

  // Step 3: Close active auctions whose end_time has passed
  const { error: closeError } = await serviceClient
    .from("auctions")
    .update({ status: "closed" })
    .eq("status", "active")
    .lte("end_time", now);

  if (closeError) {
    console.error("sync-status: close error", closeError);
  }

  return NextResponse.json({ ok: true });
}
