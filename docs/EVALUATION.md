# Evaluation

REHEARSE separates product tests from claims about real-world usefulness.

## Reproducible fixture benchmark

Run:

```bash
npm run evaluate
npm run --silent evaluate:json
```

`fixture-0.1.0` currently covers seven inspectable activity structures, 45 expected moments and 30 flow risks. The current baseline is:

| Metric | Result |
| --- | ---: |
| Metadata exact accuracy | 21/21 (100%) |
| Moment extraction precision / recall / F1 | 100% / 100% / 100% |
| Duration exact accuracy | 40/40 (100%) |
| Source-reference accuracy | 45/45 (100%) |
| Dimension precision / recall | 100% / 100% |
| Cross-file finding precision / recall | 100% / 100% |
| Required-risk recall | 21/21 (100%) |
| Risk traceability | 30/30 (100%) |
| Flow-risk scenario coverage | 30/30 (100%) |

The gold specification lives separately from the parser in [`benchmarks/gold.mjs`](../benchmarks/gold.mjs). CI fails when any metric regresses.

## Automated behavior checks

- Seven structurally different event inputs: brand gala, technology launch, beauty experience event, partner convention, multi-city consumer event, outdoor market and training event.
- Material changes alter moments, dimensions, simulation scenarios and downstream rehearsal output.
- Two files that disagree about the same moment produce field-level compile findings with exact source rows, while the timeline keeps one consolidated moment.
- Imported media measurements preserve real duration, source fingerprint and waveform segment metadata; text-only estimates remain labeled as estimates.
- Validation closure requires a concrete rerun result; record person and attachment are optional, and reopening removes stale proof.
- Spoken rehearsal follows the saved simulation, its actual propagation range and projected times instead of a generic script.
- Rule coverage includes timing/parallel tracks, version differences, contingency, compliance copy, inventory and crowd movement. People fields remain material metadata and do not create a second responsibility workflow.
- A same-time parallel session with independent rooms and owners is not treated as a conflict; shared-room or shared-owner overlap is.
- User edits propagate to downstream rehearsal artifacts.
- Project persistence and export round-trip preserve adopted source values, saved simulations and validation records.
- Static hosting fallback behavior is covered.

Run them with:

```bash
npm test
```

The full release gate is:

```bash
npm run check
```

## What this does not prove

Passing fixtures does not prove high extraction accuracy on arbitrary production documents, nor that generated risks improve a real event.

## What improves maturity after public preview

Public preview is appropriate once the repository, benchmark, automated tests, browser journey and package checks pass. A future production-readiness claim needs structurally novel operator materials covering at least:

- conferences and product launches;
- outdoor markets or public activations;
- internal training events;
- livestream or hybrid events;
- multi-venue or multi-track programs.

For every new structure, evaluate:

1. Moment extraction precision and recall.
2. Source-reference correctness.
3. Time, version, contingency and source-reference coverage.
4. False-positive and missed-risk review by an event operator.
5. Human correction time before the model is usable.
6. Whether rehearsal found an issue earlier than the existing workflow.

Those materials do not need to become public fixtures. If they cannot be shared, contributors can report the document structure, expected output and minimal failing shape without committing confidential content.

Until that broader evidence exists, public copy uses **public preview**, reports the exact fixture scope and shows source-backed scenarios, assumptions, projected times and completed reruns instead of an invented universal accuracy or readiness score.

Public structural sources and transformation notes are recorded in [PUBLIC_VALIDATION.md](PUBLIC_VALIDATION.md).
