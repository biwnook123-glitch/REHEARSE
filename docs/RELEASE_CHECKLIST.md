# Public preview release checklist

REHEARSE should first publish as a **public preview**, not as production-ready event control software.

## Repository gate

- `npm ci`
- `npm audit --omit=dev` reports no known vulnerabilities.
- `npm run check` passes the fixture benchmark, automated tests and production build.
- `docker build -t rehearse:release .` succeeds.
- Working tree is clean and `CHANGELOG.md` matches the release.

## Product gate

- Import at least one spreadsheet and one text fixture through the real browser UI.
- Confirm the imported event changes the timeline, dimensions, scenarios and rehearsal output.
- Exercise start delay, duration extension and interruption recovery semantics.
- Verify suspiciously short timing evidence remains quarantined until explicitly confirmed.
- Export a `.rehearse.json` project and import it into a clean browser profile.
- Check the primary journey at 1440px and 390px with no horizontal overflow or browser-console errors.

## GitHub setup

- Set repository visibility to public only after the release commit is selected.
- Add a concise description, homepage/demo URL, social preview and topics from `package.json`.
- Protect `main` and require the CI workflow before merge.
- Enable Dependabot alerts, secret scanning, push protection and GitHub code scanning/default setup.
- Create a draft `v0.1.0` release, mark it as a pre-release, and use generated release notes as the starting point.
- Re-read the source archive from the draft release before publishing it.

## Claim boundary

The fixture benchmark is a deterministic regression gate over seven inspectable event structures. It is not a statistical accuracy claim for arbitrary documents. Public copy should say **public preview**, retain the documented parser limits and invite reproducible fixture submissions.
