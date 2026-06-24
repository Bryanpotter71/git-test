export type CancellationType = "insured" | "nonPayment" | "company";

// "minimumPremiumEndorsement" = short rate (0.9 x pro rata). "standard" = straight pro rata.
export type CalculationPreset = "standard" | "minimumPremiumEndorsement";

// Terrorism (TRIA) premium tier. Rates only — no venue/location list lives in this repo.
export type TriaTier = "none" | "tier1" | "tier2" | "tier3";

export interface CalculationInput {
  policyEffectiveDate: string;
  policyExpirationDate: string;
  cancellationEffectiveDate: string;
  depositPremium: number; // in-force risk premium at the cancellation date
  cancellationType: CancellationType;
  minimumEarnedPremiumPercent?: number;
  preset?: CalculationPreset;
  triaTier?: TriaTier;
  fullyEarnedCharges?: number; // fees — excluded from the return by default
}

export interface CalculationResult {
  totalPolicyDays: number;
  earnedDays: number;
  unearnedDays: number;
  proRataFactor: number; // truncated to 3 decimals
  shortRateFactor: number; // truncated to 3 decimals
  appliesShortRate: boolean;
  cancellationReturnFactor: number; // the applicable factor used (truncated)
  unearnedFactor: number; // alias of proRataFactor (existing UI field)
  depositPremium: number; // risk / base premium
  grossReturn: number; // round_to_dollar(risk premium * applicable factor)
  minimumEarnedPremiumPercent: number;
  retainedViaFactor: number; // risk premium - gross return
  retainedViaMinimum: number; // risk premium * mep%
  minimumBinds: boolean; // true when minimum earned premium retains more (smaller return)
  finalReturnPremium: number; // rounded to the nearest whole dollar
  triaTier: TriaTier;
  triaRate: number;
  triaAmount: number; // display only — never part of the return
  fullyEarnedChargesRetained: number; // fees — display only, excluded from the return
  cancellationType: CancellationType;
  preset: CalculationPreset;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FACTOR_DECIMALS = 3;
const SHORT_RATE_PENALTY = 0.9;

// Terrorism (TRIA) premium rate by venue tier. Tier selection only — the
// venue-to-tier mapping is intentionally kept out of this repo.
const TRIA_RATES: Record<TriaTier, number> = {
  none: 0,
  tier1: 0.1,
  tier2: 0.05,
  tier3: 0.03
};

export function calculateReturnPremium(input: CalculationInput): CalculationResult {
  const depositPremium = normalizeMoney(input.depositPremium, "Risk premium");
  const fullyEarnedChargesRetained = normalizeMoney(input.fullyEarnedCharges ?? 0, "Fees");
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

  // Raw unearned ratio. Factors are TRUNCATED (floored) to 3 decimals — never rounded
  // half-up. Short rate uses the RAW ratio (not the displayed pro-rata factor) x 0.9.
  const unearnedRatio = unearnedDays / totalPolicyDays;
  const proRataFactor = truncateFactor(unearnedRatio, FACTOR_DECIMALS);
  const shortRateFactor = truncateFactor(SHORT_RATE_PENALTY * unearnedRatio, FACTOR_DECIMALS);

  const appliesShortRate =
    preset !== "standard" &&
    (input.cancellationType === "insured" || input.cancellationType === "nonPayment");
  const cancellationReturnFactor = appliesShortRate ? shortRateFactor : proRataFactor;

  // Return = risk premium * applicable factor. Minimum earned premium binds only when
  // it retains MORE than the cancellation factor (i.e. produces a smaller return).
  const mepFraction = minimumEarnedPremiumPercent / 100;
  const grossReturnRaw = depositPremium * cancellationReturnFactor;
  const minimumReturnRaw = depositPremium * (1 - mepFraction);
  const minimumBinds = minimumReturnRaw < grossReturnRaw;
  const finalReturnPremium = roundToDollar(Math.max(0, Math.min(grossReturnRaw, minimumReturnRaw)));

  // TRIA + fees are informational only — they never feed the return math.
  const triaTier = input.triaTier ?? "none";
  const triaRate = TRIA_RATES[triaTier];
  const triaAmount = roundToDollar(depositPremium * triaRate);

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
    grossReturn: roundToDollar(grossReturnRaw),
    minimumEarnedPremiumPercent,
    retainedViaFactor: roundToDollar(depositPremium - grossReturnRaw),
    retainedViaMinimum: roundToDollar(depositPremium * mepFraction),
    minimumBinds,
    finalReturnPremium,
    triaTier,
    triaRate,
    triaAmount,
    fullyEarnedChargesRetained,
    cancellationType: input.cancellationType,
    preset
  };
}

// Truncate (floor) a positive factor to N decimals. Float noise is cleaned first so a
// value that should sit exactly on a boundary (e.g. 0.641) is not pushed down to 0.640.
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
  const method = result.appliesShortRate ? "short rate (0.9 × pro rata)" : "straight pro rata";
  const cancellationTypeLabel: Record<CancellationType, string> = {
    insured: "insured cancellation",
    nonPayment: "non-payment cancellation",
    company: "company cancellation"
  };
  const controls = result.minimumBinds
    ? "minimum earned premium controls"
    : "cancellation factor controls";

  return [
    `Method: ${method} (${cancellationTypeLabel[result.cancellationType]}).`,
    `Day count: ${result.earnedDays} earned / ${result.unearnedDays} unearned of ${result.totalPolicyDays} total days.`,
    `Applicable factor ${result.cancellationReturnFactor} (truncated to 3 decimals).`,
    `Gross return ${formatCurrency(result.grossReturn)} = risk premium × factor.`,
    `Retained via factor ${formatCurrency(result.retainedViaFactor)} vs retained via minimum (${result.minimumEarnedPremiumPercent}%) ${formatCurrency(result.retainedViaMinimum)} — ${controls}.`,
    result.triaAmount > 0
      ? `TRIA retained (informational only, excluded from the return): ${formatCurrency(result.triaAmount)}.`
      : "",
    `Estimated return premium: ${formatCurrency(result.finalReturnPremium)}.`
  ]
    .filter(Boolean)
    .join(" ");
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
