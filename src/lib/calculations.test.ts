import { describe, expect, it } from "vitest";
import {
  calculateEarnedDays,
  calculateMinimumPremiumEndorsementReturn,
  calculateReturnPremium,
  differenceInPolicyDays,
  truncateFactor
} from "./calculations";

describe("policy day calculations", () => {
  it("derives total, earned, and unearned days", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-04-01",
      depositPremium: 20000,
      cancellationType: "insured"
    });

    expect(result.totalPolicyDays).toBe(365);
    expect(result.earnedDays).toBe(90);
    expect(result.unearnedDays).toBe(275);
  });

  it("handles leap-year policy periods", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2024-01-01",
      policyExpirationDate: "2025-01-01",
      cancellationEffectiveDate: "2024-03-01",
      depositPremium: 10000,
      cancellationType: "company",
      preset: "standard"
    });

    expect(result.totalPolicyDays).toBe(366);
    expect(result.earnedDays).toBe(60);
    expect(result.unearnedDays).toBe(306);
  });

  it("rejects expiration before effective", () => {
    expect(() => differenceInPolicyDays("2026-01-01", "2025-12-31")).toThrow();
  });

  it("rejects cancellation after expiration", () => {
    expect(() => calculateEarnedDays("2026-01-01", "2027-01-01", "2027-01-02")).toThrow();
  });
});

describe("factor truncation", () => {
  it("truncates rather than rounding up", () => {
    expect(truncateFactor(0.19479452, 3)).toBe(0.194);
    expect(truncateFactor(0.64109589, 3)).toBe(0.641);
    expect(truncateFactor(0.1945, 3)).toBe(0.194);
  });

  it("guards against floating-point underflow on boundaries", () => {
    expect(truncateFactor(0.641, 3)).toBe(0.641);
    expect(truncateFactor(0.123, 3)).toBe(0.123);
    expect(truncateFactor(0.915, 3)).toBe(0.915);
  });
});

describe("Minimum Premium Endorsement Style preset", () => {
  it("uses the lesser option for insured cancellation before fully earned charges", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-04-01",
      depositPremium: 20000,
      cancellationType: "insured",
      fullyEarnedCharges: 500,
      preset: "minimumPremiumEndorsement"
    });

    expect(result.shortRateFactor).toBe(0.678);
    expect(result.endorsementCapReturnPremium).toBe(15000);
    expect(result.endorsementShortRateReturnPremium).toBe(13560);
    expect(result.returnPremiumBeforeCharges).toBe(13560);
    expect(result.fullyEarnedChargesRetained).toBe(500);
    expect(result.finalReturnPremium).toBe(13060);
  });

  it("treats non-payment like insured cancellation", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-04-01",
      depositPremium: 20000,
      cancellationType: "nonPayment",
      preset: "minimumPremiumEndorsement"
    });

    expect(result.returnPremiumBeforeCharges).toBe(13560);
  });

  it("uses pro rata return for company cancellation", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-04-01",
      depositPremium: 20000,
      cancellationType: "company",
      fullyEarnedCharges: 500,
      preset: "minimumPremiumEndorsement"
    });

    expect(result.appliesShortRate).toBe(false);
    expect(result.proRataFactor).toBe(0.753);
    expect(result.returnPremiumBeforeCharges).toBe(15060);
    expect(result.finalReturnPremium).toBe(14560);
  });

  it("exposes the preset helper calculation", () => {
    expect(calculateMinimumPremiumEndorsementReturn(20000, 275, 365, "insured")).toBe(13560);
    expect(calculateMinimumPremiumEndorsementReturn(20000, 275, 365, "company")).toBe(15060);
  });
});

describe("configurable pro rata with minimum earned premium", () => {
  it("caps return premium when minimum earned premium controls", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-02-01",
      depositPremium: 40000,
      cancellationType: "insured",
      preset: "standard",
      minimumEarnedPremiumPercent: 25
    });

    expect(result.proRataFactor).toBe(0.915);
    expect(result.returnPremiumBeforeCharges).toBe(30000);
    expect(result.minimumBinds).toBe(true);
    expect(result.finalReturnPremium).toBe(30000);
  });

  it("floors final return premium at zero after fully earned charges", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-12-31",
      depositPremium: 1000,
      cancellationType: "insured",
      preset: "standard",
      minimumEarnedPremiumPercent: 25,
      fullyEarnedCharges: 500
    });

    expect(result.returnPremiumBeforeCharges).toBe(2);
    expect(result.finalReturnPremium).toBe(0);
  });
});
