import type { SupabaseClient } from "@supabase/supabase-js";

const AUCTION_WIN_BONUS = 25;

interface AuctionSettlementInput {
  id: string;
  title: string;
  current_winner_id: string | null;
  current_bid: number;
}

interface CreditReservationRow {
  user_id: string;
  amount: number;
}

interface ProfileBalanceRow {
  credits: number;
  reserved_credits: number;
}

function nonNegative(value: number) {
  return value < 0 ? 0 : value;
}

async function getProfileBalance(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<ProfileBalanceRow> {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("credits, reserved_credits")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to fetch profile balance for ${userId}`);
  }

  return {
    credits: data.credits ?? 0,
    reserved_credits: data.reserved_credits ?? 0,
  };
}

export async function settleAuctionCredits(
  serviceClient: SupabaseClient,
  auction: AuctionSettlementInput,
) {
  const winnerId = auction.current_winner_id;
  const winningAmount = auction.current_bid ?? 0;

  const { data: reservationRows, error: reservationError } = await serviceClient
    .from("credit_reservations")
    .select("user_id, amount")
    .eq("auction_id", auction.id);

  if (reservationError) {
    throw new Error(
      `Unable to fetch reservations for auction ${auction.id}: ${reservationError.message}`,
    );
  }

  const reservations: CreditReservationRow[] =
    (reservationRows as CreditReservationRow[] | null) ?? [];

  // Backward compatibility fallback in case older auctions have no reservation row.
  if (
    winnerId &&
    winningAmount > 0 &&
    !reservations.some((reservation) => reservation.user_id === winnerId)
  ) {
    reservations.push({ user_id: winnerId, amount: winningAmount });
  }

  let winnerSettled = false;

  for (const reservation of reservations) {
    if (!reservation.user_id || reservation.amount <= 0) continue;

    const profile = await getProfileBalance(serviceClient, reservation.user_id);
    const reservedAfter = nonNegative(
      (profile.reserved_credits ?? 0) - reservation.amount,
    );

    if (winnerId && reservation.user_id === winnerId) {
      const { error: reserveUpdateError } = await serviceClient
        .from("profiles")
        .update({ reserved_credits: reservedAfter })
        .eq("id", reservation.user_id);

      if (reserveUpdateError) {
        throw new Error(
          `Unable to settle winner reservation for auction ${auction.id}: ${reserveUpdateError.message}`,
        );
      }

      const { error: winnerTxError } = await serviceClient
        .from("credit_transactions")
        .insert({
          user_id: reservation.user_id,
          amount: -reservation.amount,
          type: "winner_deduct",
          auction_id: auction.id,
          note: `Won auction "${auction.title}" with bid of ${reservation.amount} credits`,
        });

      if (winnerTxError) {
        throw new Error(
          `Unable to record winner deduction for auction ${auction.id}: ${winnerTxError.message}`,
        );
      }

      const winnerCreditsAfterBonus = (profile.credits ?? 0) + AUCTION_WIN_BONUS;
      const { error: winnerBonusError } = await serviceClient
        .from("profiles")
        .update({ credits: winnerCreditsAfterBonus })
        .eq("id", reservation.user_id);

      if (winnerBonusError) {
        throw new Error(
          `Unable to apply winner bonus for auction ${auction.id}: ${winnerBonusError.message}`,
        );
      }

      const { error: winnerBonusTxError } = await serviceClient
        .from("credit_transactions")
        .insert({
          user_id: reservation.user_id,
          amount: AUCTION_WIN_BONUS,
          type: "mining",
          auction_id: auction.id,
          note: "Auction win bonus",
        });

      if (winnerBonusTxError) {
        throw new Error(
          `Unable to record winner bonus for auction ${auction.id}: ${winnerBonusTxError.message}`,
        );
      }

      winnerSettled = true;
    } else {
      const releasedCredits = (profile.credits ?? 0) + reservation.amount;
      const { error: releaseError } = await serviceClient
        .from("profiles")
        .update({
          credits: releasedCredits,
          reserved_credits: reservedAfter,
        })
        .eq("id", reservation.user_id);

      if (releaseError) {
        throw new Error(
          `Unable to release reservation for auction ${auction.id}: ${releaseError.message}`,
        );
      }

      const { error: releaseTxError } = await serviceClient
        .from("credit_transactions")
        .insert({
          user_id: reservation.user_id,
          amount: reservation.amount,
          type: "bid_refund",
          auction_id: auction.id,
          note: `Reservation released for closed auction "${auction.title}"`,
        });

      if (releaseTxError) {
        throw new Error(
          `Unable to record reservation release for auction ${auction.id}: ${releaseTxError.message}`,
        );
      }
    }
  }

  // Final fallback for winner settlement if reservations were missing.
  if (winnerId && winningAmount > 0 && !winnerSettled) {
    const winnerProfile = await getProfileBalance(serviceClient, winnerId);
    const reservedAfter = nonNegative(
      (winnerProfile.reserved_credits ?? 0) - winningAmount,
    );

    const { error: reserveUpdateError } = await serviceClient
      .from("profiles")
      .update({ reserved_credits: reservedAfter })
      .eq("id", winnerId);

    if (reserveUpdateError) {
      throw new Error(
        `Unable to settle fallback winner reservation for auction ${auction.id}: ${reserveUpdateError.message}`,
      );
    }

    const { error: winnerTxError } = await serviceClient
      .from("credit_transactions")
      .insert({
        user_id: winnerId,
        amount: -winningAmount,
        type: "winner_deduct",
        auction_id: auction.id,
        note: `Won auction "${auction.title}" with bid of ${winningAmount} credits`,
      });

    if (winnerTxError) {
      throw new Error(
        `Unable to record fallback winner deduction for auction ${auction.id}: ${winnerTxError.message}`,
      );
    }

    const winnerCreditsAfterBonus = (winnerProfile.credits ?? 0) + AUCTION_WIN_BONUS;
    const { error: winnerBonusError } = await serviceClient
      .from("profiles")
      .update({ credits: winnerCreditsAfterBonus })
      .eq("id", winnerId);

    if (winnerBonusError) {
      throw new Error(
        `Unable to apply fallback winner bonus for auction ${auction.id}: ${winnerBonusError.message}`,
      );
    }

    const { error: winnerBonusTxError } = await serviceClient
      .from("credit_transactions")
      .insert({
        user_id: winnerId,
        amount: AUCTION_WIN_BONUS,
        type: "mining",
        auction_id: auction.id,
        note: "Auction win bonus",
      });

    if (winnerBonusTxError) {
      throw new Error(
        `Unable to record fallback winner bonus for auction ${auction.id}: ${winnerBonusTxError.message}`,
      );
    }
  }

  const { error: cleanupError } = await serviceClient
    .from("credit_reservations")
    .delete()
    .eq("auction_id", auction.id);

  if (cleanupError) {
    throw new Error(
      `Unable to clear reservations for auction ${auction.id}: ${cleanupError.message}`,
    );
  }
}
