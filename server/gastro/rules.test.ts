import { describe, expect, it } from "vitest";
import { calculateIntentScore, eventFeeForGross, feeForDaily, netAfterFee, DAILY_MINIMUMS_CENTS } from "./rules";

describe("GastroConecta financial and intent rules", () => {
  it("scores ready events in the high-intent band without exceeding 100", () => {
    expect(calculateIntentScore({ stage: "ready", date: "2026-12-01", city: "São Paulo", location: "Centro", guests: 40, budgetCents: 200000 })).toBe(100);
    expect(calculateIntentScore({ stage: "research", city: "São Paulo" })).toBeLessThanOrEqual(49);
    expect(calculateIntentScore({ stage: "comparing", guests: 10 })).toBeGreaterThanOrEqual(50);
  });

  it("uses integer cents and preserves the freelancer daily rate", () => {
    expect(feeForDaily(15001)).toBe(1500);
    expect(eventFeeForGross(10001, 10)).toBe(1000);
    expect(netAfterFee(10001, 1000)).toBe(9001);
    expect(DAILY_MINIMUMS_CENTS.Cozinheiro).toBeGreaterThan(0);
  });
});
