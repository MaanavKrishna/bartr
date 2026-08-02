import { describe, expect, it } from "vitest";

import {
  applyEvent,
  createEscrow,
  DEFAULT_AUTO_RELEASE_DAYS,
  ESCROW_MIN_CENTS,
  feeFor,
  isEscrowWorthwhile,
  isTerminal,
  type Escrow,
  type EscrowEvent,
  type EscrowState,
} from "@/lib/escrow";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const LATER = new Date("2026-06-10T12:00:00.000Z");

function funded(overrides: Partial<Escrow> = {}): Escrow {
  const result = applyEvent(createEscrow(22000), "fund", {
    now: NOW,
    paymentRef: "pi_123",
  });
  if (!result.ok) throw new Error(result.reason);
  return { ...result.escrow, ...overrides };
}

describe("fees", () => {
  it("takes 3% within a floor and a cap", () => {
    expect(feeFor(10000)).toBe(300);
    expect(feeFor(1000)).toBe(50); // floor
    expect(feeFor(100000)).toBe(500); // cap
  });

  it("is zero for a zero amount", () => {
    expect(feeFor(0)).toBe(0);
  });
});

describe("worthwhile threshold", () => {
  it("does not bother with escrow on small amounts", () => {
    expect(isEscrowWorthwhile(ESCROW_MIN_CENTS - 1)).toBe(false);
    expect(isEscrowWorthwhile(ESCROW_MIN_CENTS)).toBe(true);
  });
});

describe("funding", () => {
  it("moves created → funded and sets an auto-release deadline", () => {
    const result = applyEvent(createEscrow(22000), "fund", {
      now: NOW,
      paymentRef: "pi_123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.escrow.state).toBe("funded");
    expect(result.escrow.paymentRef).toBe("pi_123");
    expect(result.escrow.autoReleaseAt).toBe(
      new Date(
        NOW.getTime() + DEFAULT_AUTO_RELEASE_DAYS * 86_400_000
      ).toISOString()
    );
  });

  it("refuses to fund without a payment reference", () => {
    const result = applyEvent(createEscrow(22000), "fund", { now: NOW });
    expect(result.ok).toBe(false);
  });

  it("refuses to fund twice", () => {
    const result = applyEvent(funded(), "fund", {
      now: NOW,
      paymentRef: "pi_456",
    });
    expect(result.ok).toBe(false);
  });

  it("always sets a deadline — funds never sit forever", () => {
    expect(funded().autoReleaseAt).not.toBeNull();
  });
});

describe("release", () => {
  it("releases when the buyer confirms", () => {
    const result = applyEvent(funded(), "buyer_confirm", { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.escrow.state).toBe("released");
    expect(result.effects).toContainEqual({
      kind: "payout_seller",
      amountCents: 22000 - feeFor(22000),
    });
  });

  it("does not release when only the seller confirms", () => {
    const result = applyEvent(funded(), "seller_confirm", { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.escrow.state).toBe("funded");
    expect(result.escrow.sellerConfirmedAt).not.toBeNull();
    expect(result.effects).toEqual([]);
  });

  it("releases once the buyer follows the seller", () => {
    const afterSeller = applyEvent(funded(), "seller_confirm", { now: NOW });
    expect(afterSeller.ok).toBe(true);
    if (!afterSeller.ok) return;

    const afterBuyer = applyEvent(afterSeller.escrow, "buyer_confirm", {
      now: NOW,
    });
    expect(afterBuyer.ok).toBe(true);
    if (!afterBuyer.ok) return;
    expect(afterBuyer.escrow.state).toBe("released");
  });

  it("pays the seller the amount minus the fee", () => {
    const result = applyEvent(funded(), "buyer_confirm", { now: NOW });
    if (!result.ok) throw new Error("expected ok");
    const payout = result.effects.find(e => e.kind === "payout_seller");
    expect(payout).toEqual({
      kind: "payout_seller",
      amountCents: 22000 - 500,
    });
  });
});

describe("auto-release", () => {
  it("refuses before the deadline", () => {
    const result = applyEvent(funded(), "auto_release", { now: NOW });
    expect(result.ok).toBe(false);
  });

  it("releases after the deadline", () => {
    const result = applyEvent(funded(), "auto_release", { now: LATER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.escrow.state).toBe("released");
  });

  it("cannot auto-release an unfunded escrow", () => {
    const result = applyEvent(createEscrow(22000), "auto_release", {
      now: LATER,
    });
    expect(result.ok).toBe(false);
  });
});

describe("disputes", () => {
  it("freezes a funded escrow and clears the deadline", () => {
    const result = applyEvent(funded(), "open_dispute", { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.escrow.state).toBe("disputed");
    // The critical bit: no timer may release money while a human is reviewing.
    expect(result.escrow.autoReleaseAt).toBeNull();
  });

  it("never auto-releases once disputed", () => {
    const disputed = applyEvent(funded(), "open_dispute", { now: NOW });
    if (!disputed.ok) throw new Error("expected ok");

    const auto = applyEvent(disputed.escrow, "auto_release", { now: LATER });
    expect(auto.ok).toBe(false);
  });

  it("has no automatic exit — only explicit resolution moves it", () => {
    const disputed = applyEvent(funded(), "open_dispute", { now: NOW });
    if (!disputed.ok) throw new Error("expected ok");

    for (const event of ["fund", "buyer_confirm", "auto_release"] as const) {
      expect(applyEvent(disputed.escrow, event, { now: LATER }).ok).toBe(false);
    }

    expect(
      applyEvent(disputed.escrow, "resolve_release", { now: LATER }).ok
    ).toBe(true);
    expect(
      applyEvent(disputed.escrow, "resolve_refund", { now: LATER }).ok
    ).toBe(true);
  });
});

describe("refunds", () => {
  it("returns the full amount, never keeping the fee", () => {
    const result = applyEvent(funded(), "resolve_refund", { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effects).toContainEqual({
      kind: "refund_buyer",
      amountCents: 22000,
    });
  });
});

describe("cancellation", () => {
  it("cancels an unfunded escrow", () => {
    const result = applyEvent(createEscrow(22000), "cancel", { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.escrow.state).toBe("cancelled");
  });

  it("refuses to cancel once money is held", () => {
    expect(applyEvent(funded(), "cancel", { now: NOW }).ok).toBe(false);
  });
});

describe("terminal states", () => {
  const terminal: EscrowState[] = ["released", "refunded", "cancelled"];

  it("marks the right states terminal", () => {
    for (const state of terminal) expect(isTerminal(state)).toBe(true);
    for (const state of ["created", "funded", "disputed"] as EscrowState[]) {
      expect(isTerminal(state)).toBe(false);
    }
  });

  it("accepts no event from a terminal state", () => {
    const events: EscrowEvent[] = [
      "fund",
      "buyer_confirm",
      "seller_confirm",
      "auto_release",
      "open_dispute",
      "resolve_release",
      "resolve_refund",
    ];

    for (const state of terminal) {
      const escrow = { ...funded(), state };
      for (const event of events) {
        expect(applyEvent(escrow, event, { now: LATER }).ok).toBe(false);
      }
    }
  });
});

describe("exhaustive reachability", () => {
  it("never produces a state outside the declared set", () => {
    const states: EscrowState[] = [
      "created",
      "funded",
      "released",
      "refunded",
      "disputed",
      "cancelled",
    ];
    const events: EscrowEvent[] = [
      "fund",
      "buyer_confirm",
      "seller_confirm",
      "auto_release",
      "open_dispute",
      "resolve_release",
      "resolve_refund",
      "cancel",
    ];

    for (const state of states) {
      for (const event of events) {
        const result = applyEvent({ ...funded(), state }, event, {
          now: LATER,
          paymentRef: "pi_x",
        });
        if (result.ok) expect(states).toContain(result.escrow.state);
      }
    }
  });

  it("only ever emits money effects alongside a terminal money state", () => {
    const states: EscrowState[] = ["created", "funded", "disputed"];
    const events: EscrowEvent[] = [
      "fund",
      "buyer_confirm",
      "seller_confirm",
      "auto_release",
      "open_dispute",
      "resolve_release",
      "resolve_refund",
      "cancel",
    ];

    for (const state of states) {
      for (const event of events) {
        const result = applyEvent({ ...funded(), state }, event, {
          now: LATER,
          paymentRef: "pi_x",
        });
        if (!result.ok) continue;

        const movesMoney = result.effects.some(
          e => e.kind === "payout_seller" || e.kind === "refund_buyer"
        );
        if (movesMoney) {
          expect(["released", "refunded"]).toContain(result.escrow.state);
        }
      }
    }
  });
});
