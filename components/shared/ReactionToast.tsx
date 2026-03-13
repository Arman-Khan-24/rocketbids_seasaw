"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ReactionScenario =
  | "win_auction"
  | "lose_auction"
  | "outbid"
  | "bidding_war"
  | "anti_snipe"
  | "first_bid"
  | "zero_bid_close"
  | "sniper_flagged";

const REACTION_BANKS: Record<ReactionScenario, string[]> = {
  win_auction: [
    "crushed it no mercy",
    "absolute dominance",
    "the auction bows to you",
    "nobody could stop you today",
    "wallet took a hit but worth it",
  ],
  lose_auction: [
    "so close yet so far",
    "revenge arc incoming",
    "they wanted it more",
    "the credits will return",
    "not today but maybe tomorrow",
  ],
  outbid: [
    "dethroned",
    "someone just stole your crown",
    "not the top anymore",
    "they came for your spot",
    "dethronement complete",
  ],
  bidding_war: [
    "oh its getting spicy",
    "two bidders one auction",
    "this just got personal",
    "nobody is backing down",
    "war has been declared",
  ],
  anti_snipe: [
    "sneaky last second bid detected",
    "time extended nice try",
    "the clock just got longer",
    "no escape from justice",
    "classic sniper move backfired",
  ],
  first_bid: [
    "first blood",
    "someone had to go first",
    "the bidding begins",
    "opening move played",
    "and so it starts",
  ],
  zero_bid_close: [
    "nobody wanted it",
    "complete silence",
    "even the auction felt lonely",
    "crickets",
    "tough crowd",
  ],
  sniper_flagged: [
    "sniper in the lobby",
    "last second specialist detected",
    "we see you",
    "flagged and noted",
    "sneaky bidder on the radar",
  ],
};

type ReactionToastItem = {
  id: string;
  message: string;
};

interface ReactionToastContextType {
  triggerReaction: (scenario: ReactionScenario) => void;
}

const ReactionToastContext = createContext<ReactionToastContextType>({
  triggerReaction: () => {},
});

export function useReactionToast() {
  return useContext(ReactionToastContext);
}

function pickRandomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? "";
}

export function ReactionToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queue, setQueue] = useState<ReactionToastItem[]>([]);

  const active = queue.length > 0 ? queue[0] : null;

  const triggerReaction = useCallback((scenario: ReactionScenario) => {
    const lines = REACTION_BANKS[scenario] ?? [];
    if (lines.length === 0) return;

    setQueue((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        message: pickRandomLine(lines),
      },
    ]);
  }, []);

  useEffect(() => {
    if (!active) return;

    const timer = setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, 3000);

    return () => clearTimeout(timer);
  }, [active]);

  return (
    <ReactionToastContext.Provider value={{ triggerReaction }}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[70] w-full max-w-2xl -translate-x-1/2 px-4">
        <AnimatePresence>
          {active && (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.98 }}
              transition={{ duration: 0.26, ease: "easeOut" }}
              className="mx-auto w-fit rounded-xl border border-rocket-gold/60 bg-black/70 px-6 py-3 text-center shadow-xl backdrop-blur-sm"
            >
              <p className="text-base font-bold tracking-wide text-rocket-gold sm:text-lg">
                {active.message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ReactionToastContext.Provider>
  );
}
