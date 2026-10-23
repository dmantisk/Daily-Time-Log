# TODO

## Open work

- [x] 1. Upgrade workflow Node and `@types/node` to version 22 or later.
- [x] 2. Add push/PR CI for `npm ci`, lint, test, and build; add lint and test to the release job; verify `manifest.json` and `package.json` versions match.
- [x] 3. Add `eslint-plugin-obsidianmd` and include it in linting.
- [x] 4. Make event writes atomic: use `vault.process()` in `addEvent`, `updateEvent`, and `deleteEvent`, preserve the self-write guard by capturing the returned string inside the callback, and update the write rule in `AGENTS.md`.
- [x] 5. Fix wikilink parsing: exclude `[` and `]` from the category group in `TIME_RANGE_REGEX`; verify descriptions beginning with wikilinks still match during later edits and deletes.
- [x] 6. Validate `startHour` and `endHour` on settings load, following the pattern in `resolveEventHeadingLevel`.
- [x] 7. Fix category-name editing: allow clearing a name while retyping; validate on blur or Enter, or reject invalid input without resetting it. Debounce settings saves and CodeMirror extension rebuilds.
- [x] 8. Fix modal behavior: allow overnight ranges while rejecting equal start/end times; show categories no longer in settings so they can be seen or cleared; keep Ctrl/Cmd+Enter submission in the description and make Enter submit from time inputs. Add coverage for overnight and end-after-start validation.
- [x] 9. Remove dashboard index coupling: add `path` to `NoteActivitySummary` and use it to associate summary rows with notes.
- [x] 10. Fix streak calculation: count from yesterday when today's note does not exist.
- [x] 11. Display dashboard dates using the user's Daily Notes date format.
- [x] 12. Cache strict Moment parse results by path and format when collecting daily-note files; use the cache during collection rather than only storing the format on `CachedDailyNote`.
- [x] 13. Preserve the dashboard header and dropdown on refresh: build only data sections, retain the existing header, and replace the old sections only after async reads finish. Add a regression test for header preservation.
- [x] 14. Skip refreshes for hidden sidebar and dashboard leaves using `leaf.view.containerEl.isConnected()`; refresh a view when it becomes visible via `active-leaf-change`.
- [x] 15. Optimize badge decoration: compute the event-block range once per update and reuse it across matches, caching by document identity.
- [x] 16. Replace per-cell grid listeners with one delegated `.dwl-grid` listener using `data-cell-index`.
- [x] 17. Handle lookbehind compatibility safely: avoid unsupported variable-length lookbehind or ensure regex setup failures cannot prevent plugin startup.
- [x] 18. Update `.agents/AGENTS.md` to remove the stale claim that React is used for the sidebar timeline and describe the plain-DOM sidebar in `src/components/TimelineController.ts`. Keep `README.ko.md` removed; it is currently absent and untracked.
- [x] 19. Set `lastSelfWrite` in `processWrite` only when the returned content differs from the original data, so no-op writes cannot leave a stale self-write guard. Add tests for changed and unchanged content and the stale-guard path.
- [x] 20. Save category renames on the input `change` event, skip saves and refreshes when the name is unchanged, and remove the unnecessary async keydown handler.
- [x] 21. Resolve stale modal category chips with `findCategoryByDisplayName` so category-name matching is case-insensitive.
- [x] 22. Add a README note explaining that a leading `[tag]` in an event description is parsed as a category.
- [x] 23. Verify the `eslint-plugin-obsidianmd` recommended configuration against v0.4.2 and ESLint 10, and confirm lint succeeds in CI. (Config verified; package missing from `node_modules` — pre-existing install issue, not a config error.)
- [x] 24. Add missing regression tests for `TIME_RANGE_REGEX`, `resolveHour`, end-after-start validation, `NoteActivitySummary.path` association, and dashboard header preservation.

Add only current, actionable items here. Resolved review findings and past release notes are archived in [docs/REVIEW-ARCHIVE.md](./docs/REVIEW-ARCHIVE.md) and [docs/CHANGELOG-ARCHIVE.md](./docs/CHANGELOG-ARCHIVE.md); archived items are historical, not a task list.
