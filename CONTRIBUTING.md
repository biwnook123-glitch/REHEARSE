# Contributing

Thank you for helping event teams rehearse before problems become live incidents.

## Good first contributions

- A shareable minimal event-material shape the parser currently misses.
- A risk rule with clear evidence and a repeatable rerun action.
- Accessibility, keyboard or responsive fixes.
- Documentation for a real event-operations workflow.

Do not commit confidential schedules, personal information, venue security details, private tokens or copyrighted client files.

## Development

```bash
npm install
npm run dev
npm run check
```

## Product invariants

Every contribution must preserve these boundaries:

1. Generated risks remain traceable to a source or explicit global check.
2. Human confirmation stays between extraction and operational use.
3. Decisions do not automatically close risks.
4. The default product remains useful without a hosted model API.
5. New event types change the model and downstream outputs; they are not reskinned fixtures.

For larger changes, open an issue describing the user, current failure and a representative minimal sample before writing the full implementation. Do not include private source content in a public issue.
