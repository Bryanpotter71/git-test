import { useMemo, useState } from "react";
import { buildCalculationNote, calculateReturnPremium, formatCurrency } from "./lib/calculations";
import type { CancellationType, CalculationPreset } from "./lib/calculations";

const DISCLAIMER =
  "This calculator is for estimation and workflow support only. Final return premium amounts should be confirmed against approved business rules, regulatory requirements, and authorized policy documentation.";

const initialForm = {
  policyEffectiveDate: "2026-01-01",
  policyExpirationDate: "2027-01-01",
  cancellationEffectiveDate: "2026-04-01",
  depositPremium: "20000",
  cancellationType: "insured" as CancellationType,
  preset: "minimumPremiumEndorsement" as CalculationPreset,
  minimumEarnedPremiumPercent: "25",
  fullyEarnedCharges: "500"
};

function App() {
  const [form, setForm] = useState(initialForm);

  const calculation = useMemo(() => {
    try {
      const result = calculateReturnPremium({
        policyEffectiveDate: form.policyEffectiveDate,
        policyExpirationDate: form.policyExpirationDate,
        cancellationEffectiveDate: form.cancellationEffectiveDate,
        depositPremium: Number(form.depositPremium || 0),
        cancellationType: form.cancellationType,
        preset: form.preset,
        minimumEarnedPremiumPercent:
          form.preset === "standard" ? Number(form.minimumEarnedPremiumPercent || 0) : undefined,
        fullyEarnedCharges: Number(form.fullyEarnedCharges || 0)
      });
      return { result, note: buildCalculationNote(result), error: "" };
    } catch (error) {
      return {
        result: null,
        note: "",
        error: error instanceof Error ? error.message : "Unable to calculate return premium."
      };
    }
  }, [form]);

  const update = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">Generic cancellation toolkit</span>
          <h1>E&amp;S Return Premium Calculator</h1>
          <p>Estimate return premium using sanitized sample values and configurable inputs.</p>
        </div>
      </header>

      <section className="workspace" aria-label="Return premium calculator">
        <form className="calculator-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panel-heading">
            <h2>Policy Inputs</h2>
            <p>Use sample values only.</p>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Policy effective date</span>
              <input type="date" value={form.policyEffectiveDate} onChange={(event) => update("policyEffectiveDate", event.target.value)} />
            </label>
            <label className="field">
              <span>Policy expiration date</span>
              <input type="date" value={form.policyExpirationDate} onChange={(event) => update("policyExpirationDate", event.target.value)} />
            </label>
            <label className="field">
              <span>Cancellation effective date</span>
              <input type="date" value={form.cancellationEffectiveDate} onChange={(event) => update("cancellationEffectiveDate", event.target.value)} />
            </label>
            <label className="field">
              <span>Deposit premium</span>
              <input type="number" min="0" step="0.01" value={form.depositPremium} onChange={(event) => update("depositPremium", event.target.value)} />
            </label>
            <label className="field">
              <span>Cancellation type</span>
              <select value={form.cancellationType} onChange={(event) => update("cancellationType", event.target.value)}>
                <option value="insured">Insured cancellation</option>
                <option value="nonPayment">Non-payment</option>
                <option value="company">Company cancellation</option>
              </select>
            </label>
            <label className="field">
              <span>Calculation preset</span>
              <select value={form.preset} onChange={(event) => update("preset", event.target.value)}>
                <option value="minimumPremiumEndorsement">Minimum Premium Endorsement Style</option>
                <option value="standard">Configurable pro rata + minimum earned</option>
              </select>
            </label>
            {form.preset === "standard" ? (
              <label className="field">
                <span>Minimum earned premium %</span>
                <input type="number" min="0" max="100" step="0.01" value={form.minimumEarnedPremiumPercent} onChange={(event) => update("minimumEarnedPremiumPercent", event.target.value)} />
              </label>
            ) : null}
            <label className="field">
              <span>TRIA / fully earned charges</span>
              <input type="number" min="0" step="0.01" value={form.fullyEarnedCharges} onChange={(event) => update("fullyEarnedCharges", event.target.value)} />
            </label>
          </div>
        </form>

        <aside className="results-panel" aria-label="Results">
          <div className="panel-heading">
            <h2>Results</h2>
            <p>Copy the note from the text box below.</p>
          </div>
          {calculation.error ? <div className="error-message">{calculation.error}</div> : null}
          {calculation.result ? (
            <>
              <div className="summary-total">
                <span>Estimated final return premium</span>
                <strong>{formatCurrency(calculation.result.finalReturnPremium)}</strong>
              </div>
              <ol className="breakdown-steps">
                <li className="breakdown-step"><div className="breakdown-step-main"><span>Total policy days</span><strong>{calculation.result.totalPolicyDays}</strong></div></li>
                <li className="breakdown-step"><div className="breakdown-step-main"><span>Earned days</span><strong>{calculation.result.earnedDays}</strong></div></li>
                <li className="breakdown-step"><div className="breakdown-step-main"><span>Unearned days</span><strong>{calculation.result.unearnedDays}</strong></div></li>
                <li className="breakdown-step"><div className="breakdown-step-main"><span>Return before charges</span><strong>{formatCurrency(calculation.result.returnPremiumBeforeCharges)}</strong></div></li>
                <li className="breakdown-step"><div className="breakdown-step-main"><span>Fully earned charges retained</span><strong>{formatCurrency(calculation.result.fullyEarnedChargesRetained)}</strong></div></li>
                <li className="breakdown-step is-final"><div className="breakdown-step-main"><span>Estimated final return premium</span><strong>{formatCurrency(calculation.result.finalReturnPremium)}</strong></div></li>
              </ol>
              <details className="note-block" open>
                <summary>Calculation note</summary>
                <textarea readOnly value={calculation.note} aria-label="Calculation note" />
              </details>
            </>
          ) : null}
        </aside>
      </section>

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}

export default App;
