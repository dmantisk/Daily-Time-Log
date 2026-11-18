# TODO

## Open work

- [ ] 1. Test the self-write guard (`processWrite` / `isSelfTriggeredWrite` in `src/main.ts`): extract to `src/selfWriteGuard.ts` with unit tests.
- [ ] 2. Confirm the `allowScripts` field in `package.json` is honored by npm; remove it if not.
- [ ] 3. Before the next tagged release, confirm `actions/checkout@v7`, `actions/setup-node@v6` and `actions/attest-build-provenance@v4` exist (only `ci.yml` has run so far).
- [ ] 4. (Optional) Split `.agents/ref/parser-rules.md` (about 6.9k tokens) into smaller topic files.

Add only current, actionable items here. Resolved items are archived in [docs/REVIEW-ARCHIVE.md](./docs/REVIEW-ARCHIVE.md) and [docs/CHANGELOG-ARCHIVE.md](./docs/CHANGELOG-ARCHIVE.md); archived items are historical, not a task list.
