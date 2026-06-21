# Short-Rate Calc — Status & Next Steps

A generic E&S cancellation / return-premium calculator. Vite + React + TypeScript.
Kept intentionally generic: no carrier names, insured names, policy numbers, customer
documents, or proprietary rules.

## Current state (verified)
- `npm run build` ✅ passes · `npm test` ✅ 10/10 passing
- Exact short-rate methodology implemented and verified to the dollar against the reference example.
- UI polished: field-level validation, friendly empty state, step-by-step calculation breakdown.
- App code: `src/App.tsx` (UI), `src/lib/calculations.ts` (math), `src/lib/calculations.test.ts` (tests)

## Run it
```bash
npm install
npm run dev      # local dev server
npm test         # run tests
npm run build    # type-check + production build
```

## Methodology (implemented)
- Pro-rata factor = unearned days / total days.
- Short-rate return factor = 0.9 × pro-rata factor (insured / non-payment cancellations).
- Company cancellation = straight pro-rata.
- Minimum earned premium is a floor: carrier keeps the greater of earned-via-cancellation vs earned-via-MEP.
- Fully earned charges (fees, taxes, TRIA) are retained, never returned.
- Factors rounded to 3 decimals (`FACTOR_DECIMALS` in `calculations.ts`).

## Next up
1. **Confirm precision** to guarantee a match on every case: does the source system round
   factors to 3 decimals or carry full precision (`FACTOR_DECIMALS`), and how does it count
   the cancellation day? Run 2–3 real cancellations to calibrate.
2. **Configurable MEP defaults** by line of business / geography (logic pending). MEP is
   already a user input; this would add smart auto-defaults.
3. **Consolidation**: a separate local prototype has a review workflow, assumptions panel,
   copy-summary, and warning logic worth evaluating for porting here.

## Notes
- Don't reintroduce a `tsc -b` project reference — build uses a plain `tsc` type-check; Vite bundles.
- On a Mac, keep this repo OUT of an iCloud-synced folder (e.g. ~/Documents), which duplicates
  `node_modules` files (`name 2/`) and breaks the TypeScript build.
- Parallel lanes: if two agents work at once, `math` owns `calculations.ts`/tests, `ui-polish`
  owns `App.tsx`/`styles.css`; merge to `main` via small steps.
