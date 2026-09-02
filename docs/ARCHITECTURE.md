# Architecture

REHEARSE is deliberately local-first. A useful rehearsal should not require uploading internal schedules, personnel lists, venue notes, or scripts to a third party.

## Data flow

1. File adapters extract text and tables in the browser.
2. `eventEngine` normalizes them into moments, dimensions and sources, then compiles same-name moments across files into field-level conflicts and source-backed rehearsal scenarios.
3. Material coverage derives only the evidence families needed by the current event and names the providing role plus fallback input.
4. The material screen lets a user adopt one conflicting source value for the current simulation without editing the original files.
5. Content timing compares the rundown budget with a labeled estimate or a preferred media/human measurement; media evidence keeps duration, file fingerprint and editable waveform segments while the raw file remains local and ephemeral. Script edits invalidate prior measurements.
6. `simulation` injects a delay or interruption at one moment, calculates projected times under three explicit strategies, and stores the chosen run on the same project model.
7. A saved run drives the spoken rehearsal range. Validation requires a concrete result; record person and evidence attachment are optional, and attachments are represented by local metadata plus a SHA-256 fingerprint.
8. Exports consume that model instead of maintaining separate copies. Legacy `injects` and `decisions` fields remain readable for project-file compatibility but are not part of the primary UI.

## Core invariants

- Every generated risk must contain evidence or an explicit global-material check.
- User edits rebuild downstream risks and simulation inputs while preserving still-valid timing and validation evidence.
- A saved simulation does not close a risk; only a concrete rehearsal result does.
- A complete, plausible or explicitly confirmed human rehearsal measurement outranks a text-duration estimate; an implausibly short fragment remains quarantined.
- A timing finding must retain the script name, rundown source, affected moment and downstream handoff.
- A cross-file finding must retain every conflicting source name, source reference and value.
- A risk cannot close through a bare checkbox; a concrete result is mandatory.
- People and owner fields may inform resource checks, but they do not create assignment, blame or an additional approval hierarchy.
- An open high-severity risk caps readiness below the ready band.
- Imported source files are not persisted; normalized material text is stored locally in the browser workspace.
- Imported `.rehearse.json` files must pass the published JSON Schema; a matching format label or project ID alone is never trusted.

## Modules

- `src/lib/eventEngine.js`: file parsing, source compilation and deterministic event-model inference.
- `src/lib/simulation.js`: material-backed scenario catalog, timeline propagation, strategy comparison and rehearsal cues.
- `src/lib/projectOps.js`: workspace persistence, source-value adoption, timing evidence, validation and exports.
- `src/App.jsx`: product workflow and browser interactions.
- `worker/index.js`: static Sites-compatible worker entry.

## Planned extension points

- `FileAdapter`: OCR, cloud documents and additional spreadsheet formats.
- `ModelEnhancer`: optional model-assisted extraction behind a server-side adapter.
- `RiskRule`: domain-specific checks without forking the UI.
- `OutputAdapter`: PDF, Feishu, Slack or ticket-system actions.

The exported project schema is the compatibility boundary. New adapters should operate on that model instead of coupling directly to React components.
