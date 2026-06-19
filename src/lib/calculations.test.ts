import { describe, expect, it } from "vitest";
import {
  calculateEarnedDays,
  calculateMinimumPremiumEndorsementReturn,
  calculateReturnPremium,
  differenceInPolicyDays
} from "./calculations";

describe("policy day calculations", () => {
  it("calculates total, earned, and unearned days from date-only inputs", () => {
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

  it("rejects expiration dates before the effective date", () => {
    expect(() => differenceInPolicyDays("2026-01-01", "2025-12-31")).toThrow(
      "Policy expiration date must be after the policy effective date."
    );
  });

  it("rejects cancellation dates after expiration", () => {
    expect(() =>
      calculateEarnedDays("2026-01-01", "2027-01-01", "2027-01-02")
    ).toThrow("Cancellation effective date cannot be after the policy expiration date.");
  });
});

describe("standard return premium calculations", () => {
  it("calculates pro rata return premium with fully earned charges retained", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 25,
      fullyEarnedCharges: 250,
      cancellationType: "insured",
      preset: "standard"
    });

    expect(result.proRataReturnPremium).toBeCloseTo(5041.1);
    expect(result.minimumEarnedPremiumAmount).toBe(2500);
    expect(result.returnPremiumBeforeCharges).toBeCloseTo(5041.1);
    expect(result.fullyEarnedChargesRetained).toBe(250);
    expect(result.finalReturnPremium).toBeCloseTo(4791.1);
  });

  it("limits return premium when the minimum earned premium percentage controls", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-02-01",
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 25,
      cancellationType: "insured",
      preset: "standard"
    });

    expect(result.proRataReturnPremium).toBeCloseTo(9150.68);
    expect(result.returnPremiumBeforeCharges).toBe(7500);
    expect(result.finalReturnPremium).toBe(7500);
  });
});

describe("Minimum Premium Endorsement Style preset", () => {
  it("uses the lesser insured cancellation formula before retained charges", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      fullyEarnedCharges: 250,
      cancellationType: "insured",
      preset: "minimumPremiumEndorsement"
    });

    expect(result.returnPremiumBeforeCharges).toBeCloseTo(4536.99);
    expect(result.finalReturnPremium).toBeCloseTo(4286.99);
  });

  it("caps non-payment return premium at 75 percent of deposit premium", () => {
    const returnPremium = calculateMinimumPremiumEndorsementReturn(10000, 334 / 365, "nonPayment");

    expect(returnPremium).toBe(7500);
  });

  it("uses full pro rata unearned premium for company cancellation", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      fullyEarnedCharges: 250,
      cancellationType: "company",
      preset: "minimumPremiumEndorsement"
    });

    expect(result.returnPremiumBeforeCharges).toBeCloseTo(5041.1);
    expect(result.finalReturnPremium).toBeCloseTo(4791.1);
  });
});
