import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { settleAuctionCredits } from "@/lib/server/auctionSettlement";

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
      "Unable to read profile role for winners route. Falling back to user metadata.",
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
  const { auction_id } = body;

  if (!auction_id) {
    return NextResponse.json({ error: "auction_id required" }, { status: 400 });
  }

  // Fetch auction
  const { data: auction, error: auctionError } = await serviceClient
    .from("auctions")
    .select("*")
    .eq("id", auction_id)
    .single();

  if (auctionError || !auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  if (auction.status === "closed") {
    return NextResponse.json(
      { error: "Auction already closed" },
      { status: 400 },
    );
  }

  // Close the auction
  const { error: closeError } = await serviceClient
    .from("auctions")
    .update({ status: "closed" })
    .eq("id", auction_id);

  if (closeError) {
    return NextResponse.json(
      { error: "Failed to close auction" },
      { status: 500 },
    );
  }

  if (auction.current_winner_id && auction.current_bid > 0) {
    try {
      await settleAuctionCredits(serviceClient, {
        id: auction.id,
        title: auction.title,
        current_winner_id: auction.current_winner_id,
        current_bid: auction.current_bid,
      });
    } catch (settleError) {
      return NextResponse.json(
        {
          error:
            settleError instanceof Error
              ? settleError.message
              : "Auction closed but failed to settle credits",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      winner_id: auction.current_winner_id,
      winning_bid: auction.current_bid,
      title: auction.title,
    });
  }

  // Ensure any stale reservations are released if auction closes with no winner.
  try {
    await settleAuctionCredits(serviceClient, {
      id: auction.id,
      title: auction.title,
      current_winner_id: null,
      current_bid: 0,
    });
  } catch (settleError) {
    return NextResponse.json(
      {
        error:
          settleError instanceof Error
            ? settleError.message
            : "Auction closed but failed to release reservations",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    winner_id: null,
    winning_bid: 0,
    title: auction.title,
    message: "Auction closed with no bids",
  });
}
