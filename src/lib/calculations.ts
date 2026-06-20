export type CancellationType = "insured" | "nonPayment" | "company";

// Kept for backward compatibility with the existing UI controls.
// "minimumPremiumEndorsement" = standard short-rate method (0.9 penalty on
//   insured / non-payment cancellations).
// "standard" = straight pro rata for every cancellation type (no short-rate penalty).
export type CalculationPreset = "standard" | "minimumPremiumEndorsement";

export interface CalculationInput {
  policyEffectiveDate: string;
  policyExpirationDate: string;
  cancellationEffectiveDate: string;
  depositPremium: number;
  cancellationType: CancellationType;
  fullyEarnedCharges?: number;
  minimumEarnedPremiumPercent?: number;
  preset?: CalculationPreset;
}

export interface CalculationResult {
  totalPolicyDays: number;
  earnedDays: number;
  unearnedDays: number;
  proRataFactor: number;
  unearnedFactor: number; // alias of proRataFactor (existing UI field)
  appliesShortRate: boolean;
  shortRatePenalty: number;
  cancellationReturnFactor: number; // factor applied before the minimum-earned floor
  depositPremium: number;
  fullyEarnedChargesRetained: number;
  proRataReturnPremium: number; // depositPremium * proRataFactor
  minimumEarnedPremiumPercent: number;
  minimumEarnedPremiumAmount: number; // depositPremium * mep% (premium earned under MEP)
  earnedFromCancellation: number; // total earned via the cancellation factor (incl. fully earned charges)
  earnedFromMinimum: number; // total earned via the minimum earned premium (incl. fully earned charges)
  earnedPremium: number; // the greater of the two earned amounts — what the carrier keeps
  returnPremiumBeforeCharges: number; // depositPremium * cancellationReturnFactor (before MEP floor)
  finalReturnPremium: number; // actual premium returned
  preset: CalculationPreset;
  cancellationType: CancellationType;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Cancellation factors are rounded to 3 decimals to match the reference example
// (pro rata 0.773 -> short rate 0.9 * 0.773 = 0.696). If the source system instead
// carries full precision internally, set this to null. Validate against real outputs.
const FACTOR_DECIMALS: number | null = 3;

// Short-rate return factor = SHORT_RATE_PENALTY * pro rata factor.
const SHORT_RATE_PENALTY = 0.9;

export function calculateReturnPremium(input: CalculationInput): CalculationResult {
  const depositPremium = normalizeMoney(input.depositPremium, "Deposit premium");
  const fullyEarnedChargesRetained = normalizeMoney(
    input.fullyEarnedCharges ?? 0,
    "Fully earned charges"
  );
  const minimumEarnedPremiumPercent = normalizePercent(
    input.minimumEarnedPremiumPercent ?? 0,
    "Minimum earned premium percentage"
  );
  const preset = input.preset ?? "minimumPremiumEndorsement";

  const totalPolicyDays = differenceInPolicyDays(
    input.policyEffectiveDate,
    input.policyExpirationDate
  );
  const earnedDays = calculateEarnedDays(
    input.policyEffectiveDate,
    input.policyExpirationDate,
    input.cancellationEffectiveDate
  );
  const unearnedDays = totalPolicyDays - earnedDays;

  const proRataFactor = roundFactor(unearnedDays / totalPolicyDays);

  // Short rate applies the 0.9 penalty on insured / non-payment cancellations.
  // Company (carrier) cancellations and the "standard" preset use straight pro rata.
  const appliesShortRate =
    preset !== "standard" &&
    (input.cancellationType === "insured" || input.cancellationType === "nonPayment");

  const cancellationReturnFactor = appliesShortRate
    ? roundFactor(SHORT_RATE_PENALTY * proRataFactor)
    : proRataFactor;

  // Earned premium computed two ways; the carrier keeps the GREATER (so the
  // minimum earned premium acts as a floor). Fully earned charges (e.g. terrorism
  // premium) are added to both sides — they are always earned and never returned.
  const mepFraction = minimumEarnedPremiumPercent / 100;
  const earnedFromCancellation = roundCurrency(
    depositPremium * (1 - cancellationReturnFactor) + fullyEarnedChargesRetained
  );
  const earnedFromMinimum = roundCurrency(
    depositPremium * mepFraction + fullyEarnedChargesRetained
  );
  const earnedPremium = Math.max(earnedFromCancellation, earnedFromMinimum);

  const totalCollected = depositPremium + fullyEarnedChargesRetained;
  const finalReturnPremium = roundCurrency(Math.max(0, totalCollected - earnedPremium));

  return {
    totalPolicyDays,
    earnedDays,
    unearnedDays,
    proRataFactor,
    unearnedFactor: proRataFactor,
    appliesShortRate,
    shortRatePenalty: SHORT_RATE_PENALTY,
    cancellationReturnFactor,
    depositPremium,
    fullyEarnedChargesRetained,
    proRataReturnPremium: roundCurrency(depositPremium * proRataFactor),
    minimumEarnedPremiumPercent,
    minimumEarnedPremiumAmount: roundCurrency(depositPremium * mepFraction),
    earnedFromCancellation,
    earnedFromMinimum,
    earnedPremium,
    returnPremiumBeforeCharges: roundCurrency(depositPremium * cancellationReturnFactor),
    finalReturnPremium,
    preset,
    cancellationType: input.cancellationType
  };
}

export function differenceInPolicyDays(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate, "Policy effective date");
  const end = parseDateOnly(endDate, "Policy expiration date");
  const days = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);

  if (days <= 0) {
    throw new Error("Policy expiration date must be after the policy effective date.");
  }

  return days;
}

export function calculateEarnedDays(
  policyEffectiveDate: string,
  policyExpirationDate: string,
  cancellationEffectiveDate: string
): number {
  const totalPolicyDays = differenceInPolicyDays(policyEffectiveDate, policyExpirationDate);
  const start = parseDateOnly(policyEffectiveDate, "Policy effective date");
  const cancel = parseDateOnly(cancellationEffectiveDate, "Cancellation effective date");
  const earnedDays = Math.round((cancel.getTime() - start.getTime()) / MS_PER_DAY);

  if (earnedDays < 0) {
    throw new Error("Cancellation effective date cannot be before the policy effective date.");
  }

  if (earnedDays > totalPolicyDays) {
    throw new Error("Cancellation effective date cannot be after the policy expiration date.");
  }

  return earnedDays;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundFactor(value: number): number {
  if (FACTOR_DECIMALS === null) {
    return value;
  }

  const multiplier = 10 ** FACTOR_DECIMALS;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function buildCalculationNote(result: CalculationResult): string {
  const method = result.appliesShortRate
    ? `Short rate (${result.shortRatePenalty} × pro rata)`
    : "Pro rata";
  const cancellationTypeLabel: Record<CancellationType, string> = {
    insured: "insured cancellation",
    nonPayment: "non-payment cancellation",
    company: "company cancellation"
  };
  const earnedBasis =
    result.earnedFromMinimum > result.earnedFromCancellation
      ? "minimum earned premium controls"
      : "cancellation factor controls";

  return [
    `Method: ${method}.`,
    `Cancellation type: ${cancellationTypeLabel[result.cancellationType]}.`,
    `Day count: ${result.earnedDays} earned / ${result.unearnedDays} unearned of ${result.totalPolicyDays} total days.`,
    `Pro rata factor ${result.proRataFactor}; cancellation return factor ${result.cancellationReturnFactor}.`,
    `Earned via cancellation ${formatCurrency(result.earnedFromCancellation)} vs earned via minimum ${formatCurrency(result.earnedFromMinimum)} — ${earnedBasis}.`,
    `Estimated return premium: ${formatCurrency(result.finalReturnPremium)}.`
  ].join(" ");
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function parseDateOnly(dateValue: string, label: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);

  if (!match) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid calendar date.`);
  }

  return parsed;
}

function normalizeMoney(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return value;
}

function normalizePercent(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100.`);
  }

  return value;
}
