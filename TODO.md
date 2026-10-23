# TODO

## Open work

- [x] 1. Upgrade workflow Node and `@types/node` to version 22 or later.
- [x] 2. Add push/PR CI for `npm ci`, lint, test, and build; add lint and test to the release job; verify `manifest.json` and `package.json` versions match.
- [x] 3. Add `eslint-plugin-obsidianmd` and include it in linting.
- [x] 4. Make event writes atomic: use `vault.process()` in `addEvent`, `updateEvent`, and `deleteEvent`, preserve the self-write guard by capturing the returned string inside the callback, and update the write rule in `AGENTS.md`.
- [x] 5. Fix wikilink parsing: exclude `[` and `]` from the category group in `TIME_RANGE_REGEX`; verify descriptions beginning with wikilinks still match during later edits and deletes.
- [x] 6. Validate `startHour` and `endHour` on settings load, following the pattern in `resolveEventHeadingLevel`.
- [x] 7. Fix category-name editing: allow clearing a name while retyping; validate on blur or Enter, or reject invalid input without resetting it. Debounce settings saves and CodeMirror extension rebuilds.
- [x] 8. Fix modal behavior: reject end times that are not after start times; show categories no longer in settings so they can be seen or cleared; allow Enter to submit.
- [x] 9. Remove dashboard index coupling: add `path` to `NoteActivitySummary` and use it to associate summary rows with notes.
- [x] 10. Fix streak calculation: count from yesterday when today's note does not exist.
- [x] 11. Display dashboard dates using the user's Daily Notes date format.
- [x] 12. Cache strict Moment parse results by path and format when collecting daily-note files.
- [x] 13. Preserve dashboard controls on refresh by rebuilding data sections without rebuilding the dropdown.
- [x] 14. Skip refreshes for hidden sidebar and dashboard leaves; refresh them when shown.
- [x] 15. Optimize badge decoration: compute the event-block range once per update and reuse it across matches, caching by document identity.
- [x] 16. Replace per-cell grid listeners with one delegated `.dwl-grid` listener using `data-cell-index`.
- [x] 17. Handle lookbehind compatibility safely: avoid unsupported variable-length lookbehind or ensure regex setup failures cannot prevent plugin startup.
- [x] 18. Update `AGENTS.md` to describe the plain-DOM sidebar in `TimelineController.ts` and fix the stale `README.ko.md` changelog error reference.

Add only current, actionable items here. Resolved review findings and past release notes are archived in [docs/REVIEW-ARCHIVE.md](./docs/REVIEW-ARCHIVE.md) and [docs/CHANGELOG-ARCHIVE.md](./docs/CHANGELOG-ARCHIVE.md); archived items are historical, not a task list.
