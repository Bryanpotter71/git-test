export type CancellationType = "insured" | "nonPayment" | "company";

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
  unearnedFactor: number;
  depositPremium: number;
  proRataReturnPremium: number;
  minimumEarnedPremiumAmount: number;
  fullyEarnedChargesRetained: number;
  returnPremiumBeforeCharges: number;
  finalReturnPremium: number;
  preset: CalculationPreset;
  cancellationType: CancellationType;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const preset = input.preset ?? "standard";

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
  const unearnedFactor = unearnedDays / totalPolicyDays;

  const proRataReturnPremium = roundCurrency(depositPremium * unearnedFactor);
  const minimumEarnedPremiumAmount = roundCurrency(
    depositPremium * (minimumEarnedPremiumPercent / 100)
  );
  const standardReturnPremiumBeforeCharges = calculateStandardReturnPremium(
    depositPremium,
    proRataReturnPremium,
    minimumEarnedPremiumAmount
  );
  const returnPremiumBeforeCharges =
    preset === "minimumPremiumEndorsement"
      ? calculateMinimumPremiumEndorsementReturn(
          depositPremium,
          unearnedFactor,
          input.cancellationType
        )
      : standardReturnPremiumBeforeCharges;

  return {
    totalPolicyDays,
    earnedDays,
    unearnedDays,
    unearnedFactor,
    depositPremium,
    proRataReturnPremium,
    minimumEarnedPremiumAmount,
    fullyEarnedChargesRetained,
    returnPremiumBeforeCharges,
    finalReturnPremium: roundCurrency(
      Math.max(0, returnPremiumBeforeCharges - fullyEarnedChargesRetained)
    ),
    preset,
    cancellationType: input.cancellationType
  };
}

export function calculateMinimumPremiumEndorsementReturn(
  depositPremium: number,
  unearnedFactor: number,
  cancellationType: CancellationType
): number {
  const normalizedDepositPremium = normalizeMoney(depositPremium, "Deposit premium");

  if (cancellationType === "company") {
    return roundCurrency(normalizedDepositPremium * unearnedFactor);
  }

  const maxReturnPremium = normalizedDepositPremium * 0.75;
  const scaledUnearnedPremium = normalizedDepositPremium * 0.9 * unearnedFactor;

  return roundCurrency(Math.min(maxReturnPremium, scaledUnearnedPremium));
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

export function buildCalculationNote(result: CalculationResult): string {
  const presetLabel =
    result.preset === "minimumPremiumEndorsement"
      ? "Minimum Premium Endorsement Style"
      : "Standard pro rata with minimum earned premium";
  const cancellationTypeLabel: Record<CancellationType, string> = {
    insured: "insured cancellation",
    nonPayment: "non-payment cancellation",
    company: "company cancellation"
  };

  return [
    `Preset: ${presetLabel}.`,
    `Cancellation type: ${cancellationTypeLabel[result.cancellationType]}.`,
    `Day count: ${result.earnedDays} earned days, ${result.unearnedDays} unearned days, ${result.totalPolicyDays} total policy days.`,
    `Pro rata return premium: ${formatCurrency(result.proRataReturnPremium)}.`,
    `Fully earned charges retained: ${formatCurrency(result.fullyEarnedChargesRetained)}.`,
    `Estimated final return premium: ${formatCurrency(result.finalReturnPremium)}.`
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

function calculateStandardReturnPremium(
  depositPremium: number,
  proRataReturnPremium: number,
  minimumEarnedPremiumAmount: number
): number {
  const maximumReturnAfterMinimum = Math.max(0, depositPremium - minimumEarnedPremiumAmount);

  return roundCurrency(Math.min(proRataReturnPremium, maximumReturnAfterMinimum));
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
