# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Product direction

- This is a general-purpose event rehearsal room, not a single-event microsite.
- The flow simulator is the primary interface. It injects a concrete change into the material-derived timeline, calculates how time pressure and overlap propagate, compares response strategies, and carries the selected result into rehearsal.
- The event dependency map supports the simulator by locating relevant space, devices, content, platform and backup conditions. It is not a standalone visualization.
- Stress rehearsal, audio read-through, timing evidence, and validation records are downstream actions on the same simulation—not separate tools.
- The UI should feel like a calm editorial operations room: dark forest sidebar, warm paper workspace, restrained brick-red risk accents, serif Chinese display type, and dense but legible evidence cards.
- Every risk shown to a user must trace back to a source, dependency, simulation inject, or audio finding.
- This is a product, never a fixed event template. Event names, moments, dimensions, dependencies, risks, injects, and speech scripts must be derived from the current project's materials or explicit user edits.
- The stable layer is the reasoning contract (source traceability, responsibility, timing, dependency, contingency, rerun). Visual dimensions such as audience, platform, venue, supplier, or inventory appear only when the current activity needs them.
- Validate material-driven behavior with at least two structurally different event fixtures. A change of fixture must change both the visible model and downstream rehearsal output.
- Keep the repository private until the user explicitly approves a release candidate. Pre-release work must include public-source validation, cross-event fixtures, UX review, and removal of rhetorical or quiz-like AI copy.
- The product must start from incomplete, messy operator reality: users may know neither which materials are needed nor who should provide them. Begin with any available rundown, then dynamically name the missing evidence, providing role, operational purpose and lowest-cost substitute; never require a complete intake packet before producing value.
- Human-delivered content must be checked against the rundown. Text-based duration is only an estimate; a saved human rehearsal timer outranks it, script edits invalidate that measurement, and material timing risks must identify the affected next moment and enter the same decision/rerun loop.
- Do not position REHEARSE as smarter than Doubao, Feishu AI or another general model. Its defensible value is lower operator prompting burden plus persistent, source-traceable domain state: material requests, cross-file checks, measured timing, decision authority, spoken command and rerun closure. One-off summarization or drafting should remain with general AI.
- A capability is not mature because a control exists. It is mature only when the result can be reproduced from real external input and retains the source, measurement or rerun evidence needed to audit it.
- Reuse maintained open-source components for commodity capabilities after checking license, maintenance, bundle cost and product fit. Keep REHEARSE's original work focused on compiling event materials into cross-file conflicts, timing impact, decisions and evidence-backed reruns; workflow inspiration is not permission to copy code with an incompatible or unclear license.
- Keep the operational product separate from the leadership demo and repository narrative. In-app pages must describe the user's current object, evidence, owner, status, and next action; product-value explanations, general-AI comparisons, and presentation talking points belong in README or demo materials, never in the task workspace.
- The application shell is for event teams across organizations. Company-specific events may be realistic fixtures for validation and demonstration, but they must not define navigation, page copy, workflow fields, or default product assumptions.
- REHEARSE simulates the activity system, not interpersonal accountability. Existing people or owner fields may be imported as source data, but the product must not recreate task assignment, score responsibility, infer blame, or require a second approval hierarchy. Only ask for a human confirmation when the simulated fact or real rehearsal result genuinely needs one.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
