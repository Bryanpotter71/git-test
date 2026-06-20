# Short-Rate Calc — Status & Next Steps

A generic E&S cancellation / return-premium calculator. Vite + React + TypeScript.
Kept intentionally generic: no carrier names, insured names, policy numbers, or proprietary rules.

## Current state (verified)
- `npm run build` ✅ passes
- `npm test` ✅ 8/8 passing
- App code: `src/App.tsx` (UI), `src/lib/calculations.ts` (math), `src/lib/calculations.test.ts` (tests)

## Run it
```bash
npm install
npm run dev      # local dev server
npm test         # run tests
npm run build    # type-check + production build
```

## Next up (in priority order)
1. **Get the math right.** The `minimumPremiumEndorsement` preset in `calculations.ts` is a
   GENERIC placeholder (insured/non-pay = lesser of 75% deposit or 90% × unearned factor;
   company = full pro-rata). Replace with the real methodology for the intended use case and
   update the tests in `calculations.test.ts` to lock it in.
2. **UI/UX polish.** Input validation messages, clearer error states, a readable
   step-by-step calculation breakdown, layout cleanup.

## Notes
- Don't reintroduce a `tsc -b` project reference — build uses a plain `tsc` type-check; Vite bundles.
- If developing on a Mac, keep this repo OUT of an iCloud-synced folder (e.g. ~/Documents),
  which duplicates `node_modules` files (`name 2/`) and breaks the TypeScript build.
