export type CancellationType = "insured" | "nonPayment" | "company";

// "minimumPremiumEndorsement" uses the preset requested for insured and non-payment cancellations.
// "standard" uses pro rata return with an optional configurable minimum earned percentage.
export type CalculationPreset = "standard" | "minimumPremiumEndorsement";

export interface CalculationInput {
  policyEffectiveDate: string;
  policyExpirationDate: string;
  cancellationEffectiveDate: string;
  depositPremium: number;
  cancellationType: CancellationType;
  minimumEarnedPremiumPercent?: number;
  preset?: CalculationPreset;
  fullyEarnedCharges?: number;
}

export interface CalculationResult {
  totalPolicyDays: number;
  earnedDays: number;
  unearnedDays: number;
  proRataFactor: number;
  shortRateFactor: number;
  appliesShortRate: boolean;
  cancellationReturnFactor: number;
  unearnedFactor: number;
  depositPremium: number;
  proRataReturnPremium: number;
  grossReturn: number;
  returnPremiumBeforeCharges: number;
  endorsementCapReturnPremium: number | null;
  endorsementShortRateReturnPremium: number | null;
  minimumEarnedPremiumPercent: number;
  minimumEarnedPremiumAmount: number;
  retainedViaFactor: number;
  retainedViaMinimum: number;
  minimumApplies: boolean;
  minimumBinds: boolean;
  finalReturnPremium: number;
  fullyEarnedChargesRetained: number;
  cancellationType: CancellationType;
  preset: CalculationPreset;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FACTOR_DECIMALS = 3;
const SHORT_RATE_MULTIPLIER = 0.9;
const ENDORSEMENT_RETURN_CAP = 0.75;
const ENDORSEMENT_MINIMUM_EARNED_PERCENT = 25;

export function calculateReturnPremium(input: CalculationInput): CalculationResult {
  const depositPremium = normalizeMoney(input.depositPremium, "Deposit premium");
  const fullyEarnedChargesRetained = normalizeMoney(
    input.fullyEarnedCharges ?? 0,
    "Fully earned charges"
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
  const unearnedRatio = unearnedDays / totalPolicyDays;

  const proRataFactor = truncateFactor(unearnedRatio, FACTOR_DECIMALS);
  const shortRateFactor = truncateFactor(SHORT_RATE_MULTIPLIER * unearnedRatio, FACTOR_DECIMALS);
  const proRataReturnRaw = depositPremium * proRataFactor;
  const proRataReturnPremium = roundToDollar(proRataReturnRaw);

  const isEndorsementInsuredPath =
    preset === "minimumPremiumEndorsement" &&
    (input.cancellationType === "insured" || input.cancellationType === "nonPayment");

  const minimumEarnedPremiumPercent = isEndorsementInsuredPath
    ? ENDORSEMENT_MINIMUM_EARNED_PERCENT
    : normalizePercent(input.minimumEarnedPremiumPercent ?? 0, "Minimum earned premium percentage");
  const minimumEarnedPremiumAmount = roundToDollar(
    depositPremium * (minimumEarnedPremiumPercent / 100)
  );

  let appliesShortRate = false;
  let cancellationReturnFactor = proRataFactor;
  let returnPremiumBeforeChargesRaw = proRataReturnRaw;
  let endorsementCapReturnPremium: number | null = null;
  let endorsementShortRateReturnPremium: number | null = null;
  let minimumApplies = minimumEarnedPremiumPercent > 0;
  let minimumBinds = false;

  if (isEndorsementInsuredPath) {
    appliesShortRate = true;
    cancellationReturnFactor = shortRateFactor;
    endorsementCapReturnPremium = roundToDollar(depositPremium * ENDORSEMENT_RETURN_CAP);
    endorsementShortRateReturnPremium = roundToDollar(depositPremium * shortRateFactor);
    returnPremiumBeforeChargesRaw = Math.min(
      depositPremium * ENDORSEMENT_RETURN_CAP,
      depositPremium * shortRateFactor
    );
    minimumApplies = true;
    minimumBinds = depositPremium * ENDORSEMENT_RETURN_CAP < depositPremium * shortRateFactor;
  } else if (preset === "standard" && minimumEarnedPremiumPercent > 0) {
    const maximumReturnAfterMinimumRaw = depositPremium * (1 - minimumEarnedPremiumPercent / 100);
    minimumBinds = maximumReturnAfterMinimumRaw < proRataReturnRaw;
    returnPremiumBeforeChargesRaw = minimumBinds ? maximumReturnAfterMinimumRaw : proRataReturnRaw;
  } else {
    minimumApplies = false;
  }

  const returnPremiumBeforeCharges = roundToDollar(returnPremiumBeforeChargesRaw);
  const finalReturnPremium = roundToDollar(
    Math.max(0, returnPremiumBeforeChargesRaw - fullyEarnedChargesRetained)
  );

  return {
    totalPolicyDays,
    earnedDays,
    unearnedDays,
    proRataFactor,
    shortRateFactor,
    appliesShortRate,
    cancellationReturnFactor,
    unearnedFactor: proRataFactor,
    depositPremium,
    proRataReturnPremium,
    grossReturn: returnPremiumBeforeCharges,
    returnPremiumBeforeCharges,
    endorsementCapReturnPremium,
    endorsementShortRateReturnPremium,
    minimumEarnedPremiumPercent,
    minimumEarnedPremiumAmount,
    retainedViaFactor: roundToDollar(depositPremium - returnPremiumBeforeChargesRaw),
    retainedViaMinimum: minimumEarnedPremiumAmount,
    minimumApplies,
    minimumBinds,
    finalReturnPremium,
    fullyEarnedChargesRetained,
    cancellationType: input.cancellationType,
    preset
  };
}

export function calculateMinimumPremiumEndorsementReturn(
  depositPremium: number,
  unearnedDays: number,
  totalPolicyDays: number,
  cancellationType: CancellationType
): number {
  const normalizedDepositPremium = normalizeMoney(depositPremium, "Deposit premium");

  if (!Number.isInteger(unearnedDays) || unearnedDays < 0) {
    throw new Error("Unearned days must be a non-negative whole number.");
  }

  if (!Number.isInteger(totalPolicyDays) || totalPolicyDays <= 0) {
    throw new Error("Total policy days must be a positive whole number.");
  }

  if (unearnedDays > totalPolicyDays) {
    throw new Error("Unearned days cannot exceed total policy days.");
  }

  const unearnedRatio = unearnedDays / totalPolicyDays;

  if (cancellationType === "company") {
    return roundToDollar(
      normalizedDepositPremium * truncateFactor(unearnedRatio, FACTOR_DECIMALS)
    );
  }

  const shortRateFactor = truncateFactor(SHORT_RATE_MULTIPLIER * unearnedRatio, FACTOR_DECIMALS);
  return roundToDollar(
    Math.min(normalizedDepositPremium * ENDORSEMENT_RETURN_CAP, normalizedDepositPremium * shortRateFactor)
  );
}

export function truncateFactor(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  const multiplier = 10 ** decimals;
  const scaled = Math.round(value * multiplier * 1e6) / 1e6;
  return Math.floor(scaled) / multiplier;
}

export function roundToDollar(value: number): number {
  return Math.round(value);
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

export function buildCalculationNote(result: CalculationResult): string {
  const cancellationTypeLabel: Record<CancellationType, string> = {
    insured: "insured cancellation",
    nonPayment: "non-payment cancellation",
    company: "company cancellation"
  };

  const lines = [
    `Cancellation type: ${cancellationTypeLabel[result.cancellationType]}.`,
    `Total policy days: ${result.totalPolicyDays}. Earned days: ${result.earnedDays}. Unearned days: ${result.unearnedDays}.`
  ];

  if (result.preset === "minimumPremiumEndorsement" && result.appliesShortRate) {
    lines.push(
      `Minimum Premium Endorsement Style: option A deposit premium x 75% = ${formatCurrency(result.endorsementCapReturnPremium ?? 0)}.`,
      `Option B deposit premium x 90% x unearned days / total policy days = ${formatCurrency(result.endorsementShortRateReturnPremium ?? 0)}.`,
      `Return premium before fully earned charges is the lesser option: ${formatCurrency(result.returnPremiumBeforeCharges)}.`
    );
  } else {
    lines.push(
      `Pro rata factor: ${result.proRataFactor} truncated to 3 decimals.`,
      `Return premium before fully earned charges: ${formatCurrency(result.returnPremiumBeforeCharges)}.`
    );

    if (result.minimumApplies) {
      lines.push(
        `Minimum earned premium: ${result.minimumEarnedPremiumPercent}% = ${formatCurrency(result.minimumEarnedPremiumAmount)} retained.`,
        result.minimumBinds
          ? "Minimum earned premium controls the return."
          : "Pro rata return controls the return."
      );
    }
  }

  lines.push(
    `Fully earned charges retained: ${formatCurrency(result.fullyEarnedChargesRetained)}.`,
    `Estimated final return premium: ${formatCurrency(result.finalReturnPremium)}.`
  );

  return lines.join("\n");
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
