import { describe, expect, it } from "vitest";
import {
  calculateEarnedDays,
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

describe("authoritative short-rate reference example", () => {
  // Reproduces the provided reference: premium 50,500; pro rata factor 0.773;
  // short rate factor 0.9 * 0.773 = 0.696; minimum earned 25%; $10 fully earned (TRIA).
  // Dates chosen so unearned/total = 282/365 = 0.7726 -> rounds to 0.773.
  it("matches the reference to the dollar", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-03-25",
      depositPremium: 50500,
      fullyEarnedCharges: 10,
      minimumEarnedPremiumPercent: 25,
      cancellationType: "insured",
      preset: "minimumPremiumEndorsement"
    });

    expect(result.proRataFactor).toBe(0.773);
    expect(result.cancellationReturnFactor).toBe(0.696);
    expect(result.earnedFromCancellation).toBe(15362); // 50500 * 0.304 + 10
    expect(result.earnedFromMinimum).toBe(12635); // 50500 * 0.25 + 10
    expect(result.earnedPremium).toBe(15362); // cancellation factor controls
    expect(result.finalReturnPremium).toBe(35148); // 50500 * 0.696
  });
});

describe("short-rate method", () => {
  it("applies the 0.9 penalty to the pro rata factor for an insured cancellation", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01", // 184/365 = 0.504
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 0,
      cancellationType: "insured"
    });

    expect(result.proRataFactor).toBe(0.504);
    expect(result.appliesShortRate).toBe(true);
    expect(result.cancellationReturnFactor).toBe(0.454); // round(0.9 * 0.504)
    expect(result.finalReturnPremium).toBe(4540); // 10000 * 0.454
  });

  it("treats non-payment cancellations as short rate", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 0,
      cancellationType: "nonPayment"
    });

    expect(result.appliesShortRate).toBe(true);
    expect(result.cancellationReturnFactor).toBe(0.454);
  });

  it("lets the minimum earned premium control when it earns more", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01", // short-rate earned = 1 - 0.454 = 0.546
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 60, // earns more than 0.546
      cancellationType: "insured"
    });

    expect(result.earnedFromMinimum).toBe(6000); // 10000 * 0.60
    expect(result.earnedFromCancellation).toBe(5460); // 10000 * 0.546
    expect(result.earnedPremium).toBe(6000);
    expect(result.finalReturnPremium).toBe(4000); // 10000 * (1 - 0.60)
  });
});

describe("pro rata method", () => {
  it("uses straight pro rata (no penalty) for a company cancellation", () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 0,
      cancellationType: "company"
    });

    expect(result.appliesShortRate).toBe(false);
    expect(result.cancellationReturnFactor).toBe(0.504); // pro rata, no 0.9
    expect(result.finalReturnPremium).toBe(5040);
  });

  it('forces pro rata for any type under the "standard" preset', () => {
    const result = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 0,
      cancellationType: "insured",
      preset: "standard"
    });

    expect(result.appliesShortRate).toBe(false);
    expect(result.cancellationReturnFactor).toBe(0.504);
  });
});

describe("fully earned charges", () => {
  it("retains fully earned charges and never returns them", () => {
    const withCharge = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 0,
      fullyEarnedCharges: 250,
      cancellationType: "insured"
    });
    const withoutCharge = calculateReturnPremium({
      policyEffectiveDate: "2026-01-01",
      policyExpirationDate: "2027-01-01",
      cancellationEffectiveDate: "2026-07-01",
      depositPremium: 10000,
      minimumEarnedPremiumPercent: 0,
      cancellationType: "insured"
    });

    // The fully earned charge is kept by the carrier; the premium returned is unchanged.
    expect(withCharge.fullyEarnedChargesRetained).toBe(250);
    expect(withCharge.finalReturnPremium).toBe(withoutCharge.finalReturnPremium);
  });
});
