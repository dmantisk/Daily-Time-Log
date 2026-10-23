# TODO

## Open work

- [x] 1. Upgrade workflow Node and `@types/node` to version 22 or later.
- [x] 2. Add push/PR CI for `npm ci`, lint, test, and build; add lint and test to the release job; verify `manifest.json` and `package.json` versions match.
- [x] 3. Add `eslint-plugin-obsidianmd` and include it in linting.
- [x] 4. Make event writes atomic: use `vault.process()` in `addEvent`, `updateEvent`, and `deleteEvent`, preserve the self-write guard by capturing the returned string inside the callback, and update the write rule in `AGENTS.md`.
- [x] 5. Fix wikilink parsing: exclude `[` and `]` from the category group in `TIME_RANGE_REGEX`; verify descriptions beginning with wikilinks still match during later edits and deletes.
- [x] 6. Validate `startHour` and `endHour` on settings load, following the pattern in `resolveEventHeadingLevel`.
- [x] 7. Fix category-name editing: allow clearing a name while retyping; validate on blur or Enter, or reject invalid input without resetting it. Debounce settings saves and CodeMirror extension rebuilds.
- [ ] 8. Fix modal behavior: allow overnight ranges while rejecting equal start/end times; show categories no longer in settings so they can be seen or cleared; keep Ctrl/Cmd+Enter submission in the description and make Enter submit from time inputs. Add coverage for overnight and end-after-start validation.
- [x] 9. Remove dashboard index coupling: add `path` to `NoteActivitySummary` and use it to associate summary rows with notes.
- [x] 10. Fix streak calculation: count from yesterday when today's note does not exist.
- [x] 11. Display dashboard dates using the user's Daily Notes date format.
- [ ] 12. Cache strict Moment parse results by path and format when collecting daily-note files; use the cache during collection rather than only storing the format on `CachedDailyNote`.
- [ ] 13. Preserve the dashboard header and dropdown on refresh: build only data sections, retain the existing header, and replace the old sections only after async reads finish. Add a regression test for header preservation.
- [ ] 14. Skip refreshes for hidden sidebar and dashboard leaves using `leaf.isVisible()`; refresh a view when it becomes visible via `active-leaf-change`.
- [x] 15. Optimize badge decoration: compute the event-block range once per update and reuse it across matches, caching by document identity.
- [x] 16. Replace per-cell grid listeners with one delegated `.dwl-grid` listener using `data-cell-index`.
- [x] 17. Handle lookbehind compatibility safely: avoid unsupported variable-length lookbehind or ensure regex setup failures cannot prevent plugin startup.
- [ ] 18. Update `.agents/AGENTS.md` to remove the stale claim that React is used for the sidebar timeline and describe the plain-DOM sidebar in `src/components/TimelineController.ts`. Keep `README.ko.md` removed; it is currently absent and untracked.
- [ ] 19. Set `lastSelfWrite` in `processWrite` only when the returned content differs from the original data, so no-op writes cannot leave a stale self-write guard. Add tests for changed and unchanged content and the stale-guard path.
- [ ] 20. Save category renames on the input `change` event, skip saves and refreshes when the name is unchanged, and remove the unnecessary async keydown handler.
- [ ] 21. Resolve stale modal category chips with `findCategoryByDisplayName` so category-name matching is case-insensitive.
- [ ] 22. Add a README note explaining that a leading `[tag]` in an event description is parsed as a category.
- [ ] 23. Verify the `eslint-plugin-obsidianmd` recommended configuration against v0.4.2 and ESLint 10, and confirm lint succeeds in CI.
- [ ] 24. Add missing regression tests for `TIME_RANGE_REGEX`, `resolveHour`, end-after-start validation, `NoteActivitySummary.path` association, and dashboard header preservation.

## Execution plan

Follow these phases in order. Keep changes limited to the listed regressions, preserve unrelated work in the working tree, and do not mark a TODO item done until its acceptance checks pass.

### Phase 1 — Establish a safe baseline

1. Inspect `git status` before editing. Do not discard or overwrite existing user changes.
2. Run `npm test`, `npm run lint`, and `npm run build` once before making changes. Record any failures that already exist so they are not mistaken for regressions introduced by this work.
3. Use the existing Vitest files under `src/` as the test homes listed below. Do not add a second test framework.

### Phase 2 — Fix modal behavior and category matching (items 8, 21, 24)

1. In `src/modals/TimelineModal.ts`, find the time validation and category-chip rendering code.
2. Change the invalid-range rule to reject equal start and end times, not every end time earlier than the start. Keep the existing time parsing/range checks, including support for `24:00`.
3. Preserve Ctrl/Cmd+Enter submission from the description textarea. Add plain Enter submission to the start and end time inputs; do not make plain Enter submit from the multiline description.
4. Resolve an old event category through `findCategoryByDisplayName`, not exact case-sensitive name equality. A differently cased old tag must resolve to the configured category, not appear as a second stale chip.
5. In `src/modals/TimelineModal.test.ts`, add tests for an overnight event such as `23:00–01:00`, equal start/end rejection, `24:00`, Enter in both time fields, existing description submission behavior, and case-insensitive stale-category resolution. Add any lower-level `resolveHour` tests to the existing settings test file where that helper is defined.
6. Acceptance: overnight events can be opened and saved, equal start/end remains invalid, Enter works only on the intended controls, and category chips do not duplicate a category because of casing.

### Phase 3 — Correct self-write tracking and category rename events (items 19, 20)

1. In `src/main.ts`, update `processWrite`: compare the callback result with the input `data`, and set `lastSelfWrite` only when the content actually changes. Leave it unset or unchanged for a no-op result.
2. Add focused tests for changed content, unchanged content, and the subsequent modify-event/self-write-guard behavior. Follow the existing Obsidian mocks; if no main-plugin test harness exists, create the smallest targeted one rather than broadening production visibility just for tests.
3. In `src/SettingTab.ts`, move category-rename handling to the input `change` event. Trim and validate the final value there; if it matches the current display name, do not save settings or refresh views. Remove the async keydown handler. Do not interrupt users while they temporarily clear/retype a value.
4. Add or update `src/SettingTab.test.ts` for unchanged values, a valid rename, invalid names, and committing a rename with Enter or blur/change.
5. Acceptance: no-op writes cannot leave a stale self-write record; an unchanged category name causes no save/refresh; valid changes still save and refresh.

### Phase 4 — Make daily-note parsing cache effective (item 12)

1. In `src/dashboardCollector.ts`, locate `CachedDailyNote` and `collectDailyNoteFiles`.
2. Add or use a cache keyed by file path that stores both the date format used and the strict parse result. Reuse a result only when the requested format matches; recompute when the format changes. Cache unsuccessful strict parses as well as successful ones if the current collector repeatedly examines those paths.
3. Preserve the strict Moment parse and all current folder, extension, and date-format behavior. Do not let cached parsing results make a file from an old format appear to match the new format.
4. Add tests in `src/dashboardCollector.test.ts` proving repeated collection reuses the parse, a changed format reparses, and valid/invalid filenames are handled as before.
5. In `src/parser.test.ts`, add a focused regression test for `TIME_RANGE_REGEX` so a description beginning with a wikilink is parsed without treating its brackets as a category. Keep the existing parse behavior for actual `[Category]` markers.
6. Acceptance: the cache is read by `collectDailyNoteFiles`, is scoped to path plus format, and tests demonstrate both reuse and invalidation; the wikilink test proves the parser still recognizes the event and description correctly.

### Phase 5 — Preserve dashboard content and refresh only visible views (items 13, 14, 24)

1. In `src/DashboardView.ts`, keep the existing header and its controls in the live container. Build only the next data sections in a temporary container.
2. Do not remove the current data sections while asynchronous reads are pending. After reads and rendering complete, remove only the old data sections and append the new sections; never call `replaceChildren` on the whole dashboard container when that would remove the header.
3. Add a delayed-read regression test in `src/DashboardView.test.ts`: render, start another refresh, and assert the header/dropdown remain present before the read resolves and afterward. Also assert the data updates.
4. Add a `DashboardView` test with note files and summaries in different orders; assert each summary row opens the note identified by its `path`, not by its array index.
5. In `src/main.ts`, check the installed Obsidian typings for `WorkspaceLeaf.isVisible()` before using it. Gate dashboard and sidebar refreshes on visibility rather than `containerEl.isConnected`.
6. Keep `refreshTimeline` meaningful: when false, do not refresh the sidebar; remove any duplicate unconditional sidebar refresh loop. On `active-leaf-change`, refresh a view only when it has just become visible and needs the missed update. Avoid refreshing the same view twice for one event.
7. Add or update focused tests for `refreshDataViews(false)`, visible versus hidden leaves, and the active-leaf-change path using the existing test harness.
8. Acceptance: changing the dashboard window cannot remove the header/dropdown; old data remains visible until replacement data is ready; summary rows open their matching note by path; a self-write refresh with `false` does not redraw the sidebar; hidden views are skipped and updated when shown.

### Phase 6 — Complete documentation and verify lint configuration (items 18, 22, 23)

1. Edit `.agents/AGENTS.md`: remove the claim that React powers the sidebar timeline and describe the plain-DOM implementation in `src/components/TimelineController.ts`.
2. Keep `README.ko.md` absent. It is not tracked and does not exist in the workspace; do not recreate it. If it unexpectedly appears as a tracked file before this task is performed, remove it rather than editing or restoring it.
3. In `README.md`, add a concise syntax note that a leading `[tag]` immediately after the time range is parsed as the category. Make clear that text intended as a literal description prefix in that position will instead be interpreted as a category.
4. Verify the installed `eslint-plugin-obsidianmd` v0.4.2 exports/accepts the recommended configuration used by the project with ESLint 10. Prefer the plugin's documented exported config; do not invent a config name. Run `npm run lint` after any config change.
5. Acceptance: docs match the current implementation and parsing behavior; the configured lint command succeeds.

### Phase 7 — Run full verification and close the list

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Fix failures caused by this work. For a failure that was present in Phase 1, report it separately and do not hide it by weakening tests or lint rules.
3. Review `git diff` to confirm only intended code, tests, and documentation changed. Confirm each test listed in the phases exists and covers the stated behavior.
4. Mark items 8 and 12–14, 18–24 done only after their individual acceptance checks and the final commands pass. Keep unresolved or baseline failures open with a short, accurate explanation.

Add only current, actionable items here. Resolved review findings and past release notes are archived in [docs/REVIEW-ARCHIVE.md](./docs/REVIEW-ARCHIVE.md) and [docs/CHANGELOG-ARCHIVE.md](./docs/CHANGELOG-ARCHIVE.md); archived items are historical, not a task list.
