import { useMemo, useState } from "react";
import {
  buildCalculationNote,
  calculateReturnPremium,
  formatCurrency
} from "./lib/calculations";
import type { CancellationType, CalculationPreset } from "./lib/calculations";

const DISCLAIMER =
  "For estimate and audit support only. Final premium return depends on policy wording, endorsements, fees, taxes, filings, billing rules, and applicable law.";

interface FormState {
  policyEffectiveDate: string;
  policyExpirationDate: string;
  cancellationEffectiveDate: string;
  depositPremium: string;
  minimumEarnedPremiumPercent: string;
  cancellationType: CancellationType;
  fullyEarnedCharges: string;
  preset: CalculationPreset;
}

const initialFormState: FormState = {
  policyEffectiveDate: "2026-01-01",
  policyExpirationDate: "2027-01-01",
  cancellationEffectiveDate: "2026-07-01",
  depositPremium: "10000",
  minimumEarnedPremiumPercent: "25",
  cancellationType: "insured",
  fullyEarnedCharges: "250",
  preset: "minimumPremiumEndorsement"
};

function App() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [copied, setCopied] = useState(false);

  const parsedInput = useMemo(
    () => ({
      policyEffectiveDate: form.policyEffectiveDate,
      policyExpirationDate: form.policyExpirationDate,
      cancellationEffectiveDate: form.cancellationEffectiveDate,
      depositPremium: parseAmount(form.depositPremium),
      minimumEarnedPremiumPercent: parseAmount(form.minimumEarnedPremiumPercent),
      cancellationType: form.cancellationType,
      fullyEarnedCharges: parseAmount(form.fullyEarnedCharges),
      preset: form.preset
    }),
    [
      form.cancellationEffectiveDate,
      form.cancellationType,
      form.depositPremium,
      form.fullyEarnedCharges,
      form.minimumEarnedPremiumPercent,
      form.policyEffectiveDate,
      form.policyExpirationDate,
      form.preset
    ]
  );

  const calculation = useMemo(() => {
    try {
      const result = calculateReturnPremium(parsedInput);

      return {
        result,
        note: buildCalculationNote(result),
        error: null
      };
    } catch (error) {
      return {
        result: null,
        note: "",
        error: error instanceof Error ? error.message : "Unable to calculate return premium."
      };
    }
  }, [parsedInput]);

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setCopied(false);
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const copyNote = async () => {
    if (!calculation.note) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      return;
    }

    try {
      await navigator.clipboard.writeText(calculation.note);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>E&S Return Premium Calculator</h1>
          <p>Generic cancellation estimate workspace with configurable premium inputs.</p>
        </div>
      </header>

      <section className="workspace" aria-label="Return premium calculator">
        <form className="calculator-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panel-heading">
            <h2>Policy Inputs</h2>
            <p>Use sanitized values for estimation and audit review.</p>
          </div>

          <div className="field-grid">
            <Field label="Policy effective date" htmlFor="policy-effective-date">
              <input
                id="policy-effective-date"
                type="date"
                value={form.policyEffectiveDate}
                onChange={(event) => setField("policyEffectiveDate", event.target.value)}
              />
            </Field>

            <Field label="Policy expiration date" htmlFor="policy-expiration-date">
              <input
                id="policy-expiration-date"
                type="date"
                value={form.policyExpirationDate}
                onChange={(event) => setField("policyExpirationDate", event.target.value)}
              />
            </Field>

            <Field label="Cancellation effective date" htmlFor="cancellation-effective-date">
              <input
                id="cancellation-effective-date"
                type="date"
                value={form.cancellationEffectiveDate}
                onChange={(event) => setField("cancellationEffectiveDate", event.target.value)}
              />
            </Field>

            <Field label="Deposit premium" htmlFor="deposit-premium">
              <input
                id="deposit-premium"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.depositPremium}
                onChange={(event) => setField("depositPremium", event.target.value)}
              />
            </Field>

            <Field label="Cancellation type" htmlFor="cancellation-type">
              <select
                id="cancellation-type"
                value={form.cancellationType}
                onChange={(event) =>
                  setField("cancellationType", event.target.value as CancellationType)
                }
              >
                <option value="insured">Insured cancellation</option>
                <option value="nonPayment">Non-payment</option>
                <option value="company">Company cancellation</option>
              </select>
            </Field>

            <Field label="Calculation preset" htmlFor="calculation-preset">
              <select
                id="calculation-preset"
                value={form.preset}
                onChange={(event) => setField("preset", event.target.value as CalculationPreset)}
              >
                <option value="minimumPremiumEndorsement">
                  Minimum Premium Endorsement Style
                </option>
                <option value="standard">Standard minimum earned percentage</option>
              </select>
            </Field>

            <Field label="Minimum earned premium %" htmlFor="minimum-earned-premium">
              <input
                id="minimum-earned-premium"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={form.minimumEarnedPremiumPercent}
                onChange={(event) =>
                  setField("minimumEarnedPremiumPercent", event.target.value)
                }
              />
            </Field>

            <Field label="Fully earned charges" htmlFor="fully-earned-charges">
              <input
                id="fully-earned-charges"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.fullyEarnedCharges}
                onChange={(event) => setField("fullyEarnedCharges", event.target.value)}
              />
            </Field>
          </div>
        </form>

        <aside className="results-panel" aria-label="Results">
          <div className="panel-heading">
            <h2>Results</h2>
            <p>Calculated from the current policy inputs.</p>
          </div>

          {calculation.error ? (
            <div className="error-message" role="alert">
              {calculation.error}
            </div>
          ) : (
            calculation.result && (
              <>
                <div className="summary-total">
                  <span>Final return premium</span>
                  <strong>{formatCurrency(calculation.result.finalReturnPremium)}</strong>
                </div>

                <div className="metric-grid">
                  <Metric label="Total policy days" value={calculation.result.totalPolicyDays} />
                  <Metric label="Earned days" value={calculation.result.earnedDays} />
                  <Metric label="Unearned days" value={calculation.result.unearnedDays} />
                  <Metric
                    label="Pro rata return premium"
                    value={formatCurrency(calculation.result.proRataReturnPremium)}
                  />
                  <Metric
                    label="Minimum earned premium"
                    value={formatCurrency(calculation.result.minimumEarnedPremiumAmount)}
                  />
                  <Metric
                    label="Fully earned charges retained"
                    value={formatCurrency(calculation.result.fullyEarnedChargesRetained)}
                  />
                  <Metric
                    label="Return premium before charges"
                    value={formatCurrency(calculation.result.returnPremiumBeforeCharges)}
                  />
                  <Metric
                    label="Unearned factor"
                    value={`${(calculation.result.unearnedFactor * 100).toFixed(2)}%`}
                  />
                </div>

                <div className="note-block">
                  <div className="note-header">
                    <h3>Calculation note</h3>
                    <button type="button" onClick={copyNote}>
                      {copied ? "Copied" : "Copy note"}
                    </button>
                  </div>
                  <textarea readOnly value={calculation.note} aria-label="Calculation note" />
                </div>
              </>
            )
          )}
        </aside>
      </section>

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}

interface FieldProps {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}

function Field({ children, htmlFor, label }: FieldProps) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
    </label>
  );
}

interface MetricProps {
  label: string;
  value: number | string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function parseAmount(value: string): number {
  if (value.trim() === "") {
    return 0;
  }

  return Number(value);
}

export default App;
