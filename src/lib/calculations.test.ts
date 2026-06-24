import { describe, expect, it } from "vitest";
import {
  calculateEarnedDays,
  calculateReturnPremium,
  differenceInPolicyDays,
  truncateFactor
} from "./calculations";

describe("policy day calculations", () => {
  it("derives total, earned, and unearned days", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      cancellationType: "insured"
    });

    expect(result.totalPolicyDays).toBe(365);
    expect(result.earnedDays).toBe(181);
    expect(result.unearnedDays).toBe(184);
  });

  it("rejects expiration before effective", () => {
    expect(() => differenceInPolicyDays("2026-01-01", "2025-12-31")).toThrow();
  });

  it("rejects cancellation after expiration", () => {
    expect(() => calculateEarnedDays("2026-01-01", "2027-01-01", "2027-01-02")).toThrow();
  });
});

describe("factor truncation (floor to 3 decimals, no round-half-up)", () => {
  it("truncates rather than rounding up", () => {
    expect(truncateFactor(0.19479452, 3)).toBe(0.194); // not 0.195
    expect(truncateFactor(0.64109589, 3)).toBe(0.641);
    expect(truncateFactor(0.1945, 3)).toBe(0.194); // not 0.195
  });

  it("guards against floating-point underflow on boundaries", () => {
    expect(truncateFactor(0.641, 3)).toBe(0.641); // not 0.640
    expect(truncateFactor(0.123, 3)).toBe(0.123);
    expect(truncateFactor(0.915, 3)).toBe(0.915);
  });
});

describe("regression examples (tie to the dollar)", () => {
  it("Example A — short rate, truncation guard", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2025-06-19",
      policyExpirationDate: "2026-06-19",
      cancellationEffectiveDate: "2026-04-01",
      depositPremium: 50400,
      cancellationType: "insured",
      preset: "minimumPremiumEndorsement"
    });

    expect(result.earnedDays).toBe(286);
    expect(result.unearnedDays).toBe(79);
    expect(result.appliesShortRate).toBe(true);
    expect(result.cancellationReturnFactor).toBe(0.194); // truncated, not 0.195
    expect(result.finalReturnPremium).toBe(9778); // not 9828
  });

  it("Example B — short rate, no TRIA", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2025-10-03",
      policyExpirationDate: "2026-10-03",
      cancellationEffectiveDate: "2026-01-16",
      depositPremium: 38340,
      cancellationType: "insured",
      preset: "minimumPremiumEndorsement"
    });

    expect(result.unearnedDays).toBe(260);
    expect(result.cancellationReturnFactor).toBe(0.641);
    expect(result.finalReturnPremium).toBe(24576);
  });

  it("Example C — straight pro-rata, in-force base", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2025-11-02",
      policyExpirationDate: "2026-11-02",
      cancellationEffectiveDate: "2026-03-13",
      depositPremium: 38805,
      cancellationType: "company",
      preset: "standard"
    });

    expect(result.unearnedDays).toBe(234);
    expect(result.appliesShortRate).toBe(false);
    expect(result.cancellationReturnFactor).toBe(0.641);
    expect(result.finalReturnPremium).toBe(24874);
  });

  it("Example D1 — insured short rate, minimum earned binds (early cancel)", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-02-01",
      depositPremium: 40000,
      cancellationType: "insured",
      preset: "minimumPremiumEndorsement",
      minimumEarnedPremiumPercent: 25
    });

    expect(result.unearnedDays).toBe(334);
    expect(result.appliesShortRate).toBe(true);
    expect(result.cancellationReturnFactor).toBe(0.823); // truncate(0.9 * 334/365)
    expect(result.minimumApplies).toBe(true);
    expect(result.minimumBinds).toBe(true); // 30000 < 40000 * 0.823 (32920)
    expect(result.retainedViaMinimum).toBe(10000); // 40000 * 0.25
    expect(result.finalReturnPremium).toBe(30000); // capped at 75% of deposit
  });

  it("Example D2 — carrier cancel, full pro-rata, no minimum cap", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-02-01",
      depositPremium: 40000,
      cancellationType: "company",
      minimumEarnedPremiumPercent: 25 // present, but must NOT cap a carrier cancellation
    });

    expect(result.unearnedDays).toBe(334);
    expect(result.appliesShortRate).toBe(false);
    expect(result.cancellationReturnFactor).toBe(0.915); // truncate(334/365)
    expect(result.minimumApplies).toBe(false);
    expect(result.minimumBinds).toBe(false);
    expect(result.finalReturnPremium).toBe(36600); // full pro-rata, no cap
  });
});

describe("TRIA is informational only", () => {
  const base = {
    policyEffectiveDate: "2025-10-03",
    policyExpirationDate: "2026-10-03",
    cancellationEffectiveDate: "2026-01-16",
    depositPremium: 38340,
    cancellationType: "insured" as const,
    preset: "minimumPremiumEndorsement" as const
  };

  it("offers a 5% tier and never changes the return premium", () => {
    const noTria = calculateReturnPremium(base);
    const tier2 = calculateReturnPremium({ ...base, triaTier: "tier2" });

    expect(tier2.triaRate).toBe(0.05); // 5% available
    expect(tier2.triaAmount).toBe(1917); // 38340 * 0.05, display only
    expect(tier2.finalReturnPremium).toBe(noTria.finalReturnPremium); // excluded from return
  });
});

describe("fees are excluded from the return by default", () => {
  const base = {
    policyEffectiveDate: "2025-10-03",
    policyExpirationDate: "2026-10-03",
    cancellationEffectiveDate: "2026-01-16",
    depositPremium: 38340,
    cancellationType: "insured" as const,
    preset: "minimumPremiumEndorsement" as const
  };

  it("retains fees for display but does not change the return premium", () => {
    const noFees = calculateReturnPremium(base);
    const withFees = calculateReturnPremium({ ...base, fullyEarnedCharges: 500 });

    expect(withFees.fullyEarnedChargesRetained).toBe(500);
    expect(withFees.finalReturnPremium).toBe(noFees.finalReturnPremium);
  });
});
