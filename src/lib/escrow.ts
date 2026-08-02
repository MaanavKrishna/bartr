/**
 * Escrow state machine.
 *
 * Escrow exists to remove the *reason* to go off-platform. The most common
 * marketplace fraud starts with "just Zelle me and I'll hold it" — which works
 * because neither side has any other way to trust the other. If the platform
 * holds the money until handoff, that pitch stops being attractive.
 *
 * Everything here is pure: given a state and an event, what is the next state?
 * No Stripe calls, no database. That is deliberate — money transitions are the
 * one place where an exhaustive test suite is worth more than any amount of
 * integration plumbing, and this way every rule is checkable in milliseconds.
 *
 * Two invariants the design enforces:
 *
 * 1. **Funds never sit forever.** A funded escrow always carries an
 *    `autoReleaseAt`. If the buyer neither confirms nor disputes, the money
 *    goes to the seller on that deadline. Indefinite holds are how escrow
 *    turns into theft-by-inaction.
 * 2. **Disputes freeze, they do not decide.** `disputed` has no automatic exit;
 *    only an explicit resolution moves it. Software should not adjudicate.
 */

export const ESCROW_STATES = [
  "created",
  "funded",
  "released",
  "refunded",
  "disputed",
  "cancelled",
] as const;
export type EscrowState = (typeof ESCROW_STATES)[number];

export const ESCROW_EVENTS = [
  "fund",
  "buyer_confirm",
  "seller_confirm",
  "auto_release",
  "open_dispute",
  "resolve_release",
  "resolve_refund",
  "cancel",
] as const;
export type EscrowEvent = (typeof ESCROW_EVENTS)[number];

export interface Escrow {
  state: EscrowState;
  amountCents: number;
  feeCents: number;
  buyerConfirmedAt: string | null;
  sellerConfirmedAt: string | null;
  fundedAt: string | null;
  autoReleaseAt: string | null;
  paymentRef: string | null;
}

export interface TransitionContext {
  now: Date;
  /** Days a funded escrow waits before releasing on its own. */
  autoReleaseDays?: number;
  paymentRef?: string;
}

export type TransitionResult =
  | { ok: true; escrow: Escrow; effects: EscrowEffect[] }
  | { ok: false; reason: string };

/** Side effects for the caller to perform — never performed here. */
export type EscrowEffect =
  | { kind: "capture_payment"; paymentRef: string }
  | { kind: "payout_seller"; amountCents: number }
  | { kind: "refund_buyer"; amountCents: number }
  | { kind: "notify"; who: "buyer" | "seller" | "both"; message: string };

export const DEFAULT_AUTO_RELEASE_DAYS = 3;

/** States from which no event can move the escrow. */
export function isTerminal(state: EscrowState): boolean {
  return state === "released" || state === "refunded" || state === "cancelled";
}

/**
 * Escrow is worth its friction only above a threshold — nobody wants a held
 * payment on a $4 textbook. Below it, meet and pay in person.
 */
export const ESCROW_MIN_CENTS = 5000;

export function isEscrowWorthwhile(amountCents: number): boolean {
  return amountCents >= ESCROW_MIN_CENTS;
}

/**
 * Platform fee. Kept explicit and separate from the amount so the buyer's
 * refund is always the full amount they paid — the fee is only ever taken from
 * a completed sale, never from a refund.
 */
export function feeFor(amountCents: number): number {
  if (amountCents <= 0) return 0;
  // 3% capped at $5, floored at 50c.
  return Math.min(500, Math.max(50, Math.round(amountCents * 0.03)));
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

export function applyEvent(
  escrow: Escrow,
  event: EscrowEvent,
  context: TransitionContext
): TransitionResult {
  const { now } = context;
  const iso = now.toISOString();

  if (isTerminal(escrow.state) && event !== "cancel") {
    return { ok: false, reason: `Escrow is already ${escrow.state}.` };
  }

  switch (event) {
    case "fund": {
      if (escrow.state !== "created") {
        return { ok: false, reason: "Only a new escrow can be funded." };
      }
      if (!context.paymentRef) {
        return { ok: false, reason: "Funding requires a payment reference." };
      }
      const days = context.autoReleaseDays ?? DEFAULT_AUTO_RELEASE_DAYS;
      return {
        ok: true,
        escrow: {
          ...escrow,
          state: "funded",
          fundedAt: iso,
          paymentRef: context.paymentRef,
          autoReleaseAt: addDays(now, days),
        },
        effects: [
          { kind: "capture_payment", paymentRef: context.paymentRef },
          {
            kind: "notify",
            who: "seller",
            message: "Payment is held. Arrange the handoff.",
          },
        ],
      };
    }

    case "buyer_confirm":
    case "seller_confirm": {
      if (escrow.state !== "funded") {
        return {
          ok: false,
          reason: "Only a funded escrow can be confirmed.",
        };
      }
      const next: Escrow = {
        ...escrow,
        buyerConfirmedAt:
          event === "buyer_confirm" ? iso : escrow.buyerConfirmedAt,
        sellerConfirmedAt:
          event === "seller_confirm" ? iso : escrow.sellerConfirmedAt,
      };

      // The buyer confirming is what releases the money — they are the one
      // carrying the risk, and they are the only one who can know the item
      // actually arrived. A seller confirming alone just records their side.
      if (next.buyerConfirmedAt) {
        return {
          ok: true,
          escrow: { ...next, state: "released" },
          effects: releaseEffects(escrow),
        };
      }

      return { ok: true, escrow: next, effects: [] };
    }

    case "auto_release": {
      if (escrow.state !== "funded") {
        return { ok: false, reason: "Only a funded escrow can auto-release." };
      }
      if (!escrow.autoReleaseAt) {
        return { ok: false, reason: "No auto-release deadline is set." };
      }
      if (now.getTime() < Date.parse(escrow.autoReleaseAt)) {
        return { ok: false, reason: "Auto-release deadline has not passed." };
      }
      return {
        ok: true,
        escrow: { ...escrow, state: "released" },
        effects: [
          ...releaseEffects(escrow),
          {
            kind: "notify",
            who: "buyer",
            message:
              "Funds released automatically because the hold period ended.",
          },
        ],
      };
    }

    case "open_dispute": {
      if (escrow.state !== "funded") {
        return { ok: false, reason: "Only a funded escrow can be disputed." };
      }
      return {
        ok: true,
        // Clearing the deadline is the point: a disputed escrow must never
        // release on a timer while a human is still looking at it.
        escrow: { ...escrow, state: "disputed", autoReleaseAt: null },
        effects: [
          {
            kind: "notify",
            who: "both",
            message: "This trade is under review. Funds are frozen.",
          },
        ],
      };
    }

    case "resolve_release": {
      if (escrow.state !== "disputed") {
        return { ok: false, reason: "Only a disputed escrow can be resolved." };
      }
      return {
        ok: true,
        escrow: { ...escrow, state: "released" },
        effects: releaseEffects(escrow),
      };
    }

    case "resolve_refund": {
      if (escrow.state !== "disputed" && escrow.state !== "funded") {
        return {
          ok: false,
          reason: "Only a funded or disputed escrow can be refunded.",
        };
      }
      return {
        ok: true,
        escrow: { ...escrow, state: "refunded" },
        effects: [
          // The buyer gets back everything they paid; the fee is never kept
          // on a refund.
          { kind: "refund_buyer", amountCents: escrow.amountCents },
          {
            kind: "notify",
            who: "both",
            message: "The payment was refunded in full.",
          },
        ],
      };
    }

    case "cancel": {
      if (escrow.state !== "created") {
        return {
          ok: false,
          reason: "Only an unfunded escrow can be cancelled.",
        };
      }
      return {
        ok: true,
        escrow: { ...escrow, state: "cancelled" },
        effects: [],
      };
    }

    default: {
      const exhaustive: never = event;
      return { ok: false, reason: `Unknown event: ${String(exhaustive)}` };
    }
  }
}

function releaseEffects(escrow: Escrow): EscrowEffect[] {
  return [
    {
      kind: "payout_seller",
      amountCents: escrow.amountCents - escrow.feeCents,
    },
    {
      kind: "notify",
      who: "seller",
      message: "The buyer confirmed the handoff. Funds are on the way.",
    },
  ];
}

/** A fresh, unfunded escrow for a listing. */
export function createEscrow(amountCents: number): Escrow {
  return {
    state: "created",
    amountCents,
    feeCents: feeFor(amountCents),
    buyerConfirmedAt: null,
    sellerConfirmedAt: null,
    fundedAt: null,
    autoReleaseAt: null,
    paymentRef: null,
  };
}
