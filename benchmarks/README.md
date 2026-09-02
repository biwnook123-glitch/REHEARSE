# Fixture benchmark

`npm run evaluate` runs the current parser and scenario engine against seven inspectable event fixtures with a separate gold specification in `gold.mjs`.

The gate checks exact project metadata, moment precision/recall, durations, source rows, event-specific dimensions, cross-file findings, required risk recall, evidence traceability and whether every flow risk can enter simulation. CI fails on any regression.

This benchmark is deliberately narrow. A perfect score means the documented fixtures remain reproducible; it does not mean arbitrary spreadsheets, scanned PDFs or enterprise documents will parse perfectly. Add a new case when a real input exposes a new document structure, and keep its expected result independent from the parser implementation.

Machine-readable output:

```bash
npm run --silent evaluate:json
```
