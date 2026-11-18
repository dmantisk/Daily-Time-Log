# Daily Time Log: fix prompts (in order)

Each section below is one self-contained prompt. Do them **one at a time**, in this order, and commit after each one so you can roll back. Paste only the files listed under "Attach" to keep free-tier usage low.

## How to use

1. Open a fresh chat or session in your AI tool for each fix.
2. Paste the **Shared rules** block first, then the fix prompt.
3. Attach only the listed files.
4. When the tool answers, apply its diff, then run the checks:
   ```bash
   npm run lint && npm run typecheck:tests && npm run format:check && npm test && npm run build
   ```
5. If something fails, paste back only the failing test name and error message, not whole files.
6. Do the manual check listed for that fix, then commit.

Line numbers below come from the version I reviewed and may have shifted. The prompts tell the tool to search by function name.

## Order

| # | Fix | Size |
|---|-----|------|
| 1 | Typecheck failures in test files (may be breaking CI) | Small |
| 2 | Command-originated writes don't refresh the open timeline | Tiny |
| 3 | Dashboard period date range ignores your date format | Tiny |
| 4 | Event insertion can land inside a fenced code block | Small |
| 5 | Modal accepts descriptions with code fences that get detached | Small |
| 6 | Category names containing `[` or `]` can't round-trip | Small |
| 7 | Command enable/disable toggles need a restart | Small |

Skipped on purpose: badge anchoring to event lines, indented `# Event` headings, hardening for a primitive in `data.json`, a `main.ts` lifecycle test suite, and the collector comment. They're low value for the cost.

---

## Shared rules (paste at the start of every session)

~~~
Project: Obsidian plugin "Daily Time Log" (TypeScript, Vitest, ESLint,
Prettier). Read AGENTS.md first; do not read AGENTS-reference.md or the
docs/ folder.

Rules for this task:
- Change ONLY the files I list. Do not refactor, rename, or reformat
  anything unrelated.
- Formatting follows .prettierrc.json: tabs, tab width 4, print width 120,
  double quotes, trailing commas es5.
- Use Obsidian APIs and the DOM only. No new dependencies.
- Do not use `any`, `@ts-ignore`, or `eslint-disable` to make errors go away.
- Add or update tests for the behavior you change.
- Show diffs only. Do not reprint unchanged files or functions.
- Do not claim you ran the build or tests. At the end, tell me to run:
  npm run lint && npm run typecheck:tests && npm run format:check && npm test && npm run build
- Search by function name; line numbers I give may be out of date.
~~~

---

## Fix 1: Typecheck failures in tests

**Why:** CI runs `npm run typecheck:tests` as its second step. A leftover `typecheck_output.txt` shows about 70 errors, mostly because test files call mock-only statics (such as `Setting.created`, `Setting.reset()`, `Notice.reset()`, `Notice.shown`) on the real Obsidian types. This may already be fixed, so check first.

**Before prompting:** run `npm run typecheck:tests`. If it passes, skip this fix. If it fails, save the output as UTF-8 (PowerShell: `npm run typecheck:tests 2>&1 | Out-File -Encoding utf8 typecheck.txt`) and attach it.

**Attach:** `typecheck.txt` (UTF-8), `tsconfig.test.json`, `vitest.config.ts`, `src/test/obsidian-mock.ts`, and the test files named in the errors (typically `SettingTab.test.ts`, `categoryBadges.editor.test.ts`, `modals/TimelineModal.test.ts`, `components/TimelineController.test.ts`).

~~~
Task: make `npm run typecheck:tests` pass without changing production code.

Context: vitest.config.ts aliases "obsidian" to src/test/obsidian-mock.ts at
runtime, but tsconfig.test.json type-checks against the real Obsidian types.
Tests use mock-only statics (Setting.created, Setting.reset, Notice.reset,
Notice.shown, ...) and mock-shaped objects (e.g. `{ path: string }` where a
TFile is expected), which the real types reject. The errors are in the
attached typecheck.txt.

Do this:
1. In each failing test file, import the mock classes that have mock-only
   statics directly from the mock module (e.g.
   `import { Setting, Notice } from "./test/obsidian-mock"`, with the
   correct relative path). At runtime this is the same module the alias
   already resolves to, so behavior must not change.
2. For objects that are only shaped like TFile or other Obsidian types, add
   a small typed helper in src/test/ (for example `fakeFile(path)` that
   returns `{ path } as unknown as TFile`) and use it, instead of repeating
   casts in every test.
3. Do not change tsconfig.json, tsconfig.test.json, vitest.config.ts, or any
   non-test source file. If you believe a config change is unavoidable,
   stop and explain why instead of making it.
4. Fix implicit-any parameters by typing them properly.

Verify by listing, per test file, what you changed. I will run
npm run typecheck:tests and npm test.
~~~

**Manual check:** none, but confirm `npm test` still passes with the same number of tests.

---

## Fix 2: Command-originated writes don't refresh the open timeline

**Why:** `addEventToFile` in `main.ts` writes through `processWrite`. The self-write guard marks that write as the plugin's own, so `scheduleRefresh(false)` skips the timeline. The sidebar's own save path reloads itself; the command path never does. With the sidebar open, adding an entry from the command palette leaves the timeline stale.

**Attach:** `src/main.ts` only.

~~~
Task: fix a stale sidebar after the "Add log entry" command.

Problem: in main.ts, addEventToFile() calls this.processWrite(...) and then
shows the success Notice. The vault "modify" event is recognized as a
self-write, so handleVaultModify calls scheduleRefresh(false), which skips
refreshTimelineView(). The open timeline sidebar keeps showing the old
entries. The sidebar's own add/edit path is fine because TimelineController
reloads the file itself.

Do this:
1. In addEventToFile(), after processWrite succeeds and before/with the
   success Notice, call this.refreshTimelineView().
2. Do not call it in the catch path.
3. Do not change scheduleRefresh, handleVaultModify, or the SelfWriteGuard.
4. There is no main.ts test file and I do not want a new mocking suite.
   Only add a test if one can be written with the existing test mocks in a
   few lines; otherwise skip the test and say so.

Keep the diff to a few lines.
~~~

**Manual check:** open the sidebar on today's note, run "Add log entry" from the command palette, save. The new entry should appear in the sidebar immediately.

---

## Fix 3: Dashboard period date range ignores your date format

**Why:** `DashboardView.ts` formats the "recent activity" dates with the configured Daily Notes format, but the period summary range calls `formatDateBasename(stats.oldestDate)` and `formatDateBasename(stats.newestDate)` without it. With a format like `DD/MM/YYYY`, the same dashboard shows two date styles.

**Attach:** `src/DashboardView.ts`, `src/DashboardView.test.ts`.

~~~
Task: make the dashboard's period date range use the configured Daily
Notes date format.

Problem: in DashboardView.ts, the recent-activity rows call
formatDateBasename(summary.date, this.plugin.getDailyNoteFormat()), but the
period summary range calls formatDateBasename(stats.oldestDate) and
formatDateBasename(stats.newestDate) with no format argument, so they fall
back to the default format.

Do this:
1. Pass this.plugin.getDailyNoteFormat() to both calls in the period
   summary range.
2. Add a test in DashboardView.test.ts that renders the dashboard with a
   non-default format (for example "DD-MM-YYYY") and asserts the period
   range text uses it.
3. Do not touch any other formatting call sites unless they have the same
   bug; if you find one, list it instead of changing it.
~~~

**Manual check:** set the core Daily Notes date format to something non-default and compare the date range with the recent-activity rows.

---

## Fix 4: Event insertion can land inside a fenced code block

**Why:** `findEventBlock` tracks fences, but `endOfOwnContent` in `src/parser/timeline-parsing.ts` does not. A deeper heading inside a code fence looks like a subheading, so a new event is inserted before it while the fence is still open and it becomes part of the code.

**Attach:** `src/parser/timeline-parsing.ts`, `src/parser/event-block.ts`, `src/parser.test.ts`.

~~~
Task: make appendLineToBlock fence-aware.

Problem: appendLineToBlock() calls endOfOwnContent() (in
src/parser/timeline-parsing.ts) to find where the configured heading's own
content ends, i.e. the first deeper subheading. endOfOwnContent() calls
headingLevel() on every line but does not track fenced code blocks, while
findEventBlock() does (using FenceTracker). So for:

    # Event
    - 09:00 - 10:00 [Work] Existing

    ```md
    ## Example
    code sample
    ```

the "## Example" line inside the fence is mistaken for a subheading, and the
new event is inserted inside the fence.

Do this:
1. In endOfOwnContent(), create a FenceTracker (already imported in this
   file) and call fence.consume(line) for every line in the loop. If it
   returns true, `continue` before the heading check, exactly like
   findEventBlock() does.
2. Do not change findEventBlock, FenceTracker, or any other function.
3. Add regression tests in src/parser.test.ts for appendLineToBlock:
   - a backtick fence containing a deeper heading -> the new line goes
     after the existing events, outside the fence, unchanged fence content
   - a tilde fence containing a deeper heading, same expectation
   - a real deeper heading AFTER the closing fence -> the new line is
     inserted before that real heading
   - existing behavior without fences is unchanged (reuse an existing test
     as a guard if one exists)
~~~

**Manual check:** with a note containing a fenced block with `## Example` under `# Event`, add an entry from the sidebar. It should appear in the timeline and the fence should be untouched.

---

## Fix 5: Modal accepts descriptions with code fences that get detached

**Why:** the parser treats a fence as a boundary: at an opening fence it clears the current event, so anything after is detached from the event. The modal's save-time check only rejects continuation lines shaped like events, checkboxes or headings, so a description containing a fence saves fine and then partly disappears.

**Attach:** `src/modals/TimelineModal.ts`, `src/modals/TimelineModal.test.ts`, `src/i18n.ts`, and `src/parser/event-block.ts` (for `FenceTracker`).

~~~
Task: reject event descriptions that contain a fenced code block.

Problem: TimelineModal's save-time validation (the block that checks
continuation lines with isTopLevelOrMarker) does not check for code fences.
The parser (parseTimeline in src/parser/timeline-parsing.ts) treats a fence
as a boundary: when it sees an opening fence it clears the current event
and ignores the fence contents. So a description like

    Demo notes
    ```ts
    const answer = 42;
    ```

saves successfully, but on the next parse the event description is just
"Demo notes" and the code is detached.

Do this:
1. In the modal's save validation, run the continuation lines (all lines
   after the first) through a FenceTracker (exported from
   src/parser/event-block.ts; if the modal imports parser things from
   "../parser", re-export FenceTracker there rather than importing from a
   deep path, following how other parser symbols are exposed). If
   consume() returns true for any line, reject the save.
2. Report the rejection the same way the existing continuation-line
   rejection does (look at how it shows its message and keeps the modal
   open), using ONE new i18n key added to the key union and to BOTH
   languages in src/i18n.ts. English text: "Descriptions can't contain code
   fences (```). Remove the fence or put the code in a separate note
   section." Provide a natural Korean translation.
3. Reject both closed and unclosed fences (an unclosed fence also swallows
   later event lines).
4. Do not change the parser.
5. Add tests in TimelineModal.test.ts: closed fence rejected, unclosed
   fence rejected, tilde fence rejected, a description with inline
   backticks (single `code`) still saves, and a normal multi-line
   description still saves.
~~~

**Manual check:** try to add an event whose description contains a ```` ``` ```` line. The modal should stay open with a clear message, and ordinary multi-line descriptions should still save.

---

## Fix 6: Category names with `[` or `]` can't round-trip

**Why:** `validateCategoryName` in `src/settings.ts` only checks for empty and duplicate names. A category like `QA[UX]` is written as `- 09:00 - 10:00 [QA[UX]] Example`, which the parser and badge matcher can't read back, because they exclude brackets from the category.

**Attach:** `src/settings.ts`, `src/settings.test.ts`, `src/SettingTab.ts`, `src/SettingTab.test.ts`, `src/i18n.ts`.

~~~
Task: reject category names that contain square brackets.

Problem: validateCategoryName() in src/settings.ts returns only "empty" or
"duplicate". A name such as "QA[UX]" is accepted, but the writer inserts it
inside [Category] and both the event parser and the badge matcher exclude
"[" and "]" from the category text, so the line cannot be parsed back.

Do this:
1. Extend CategoryNameProblem with "invalid-chars" and make
   validateCategoryName() return it when the trimmed name contains "[" or
   "]". Check "empty" first, then invalid characters, then "duplicate".
2. Find every place in src/SettingTab.ts that handles the result of
   validateCategoryName (adding a category and renaming one) and show a
   notice for the new problem, following the existing pattern. Add ONE new
   i18n key to the key union and BOTH languages in src/i18n.ts. English:
   "Category names can't contain [ or ]." Provide a natural Korean
   translation.
3. Make sure the existing "empty" and "duplicate" behavior is unchanged.
4. Do not change how existing saved categories are loaded. Do not
   auto-rename existing categories.
5. Add tests in settings.test.ts (names with [, ], and both are rejected;
   normal names still pass; an empty name still reports "empty") and in
   SettingTab.test.ts (adding and renaming with a bracket shows the
   notice and does not save).
~~~

**Manual check:** in settings, try to add a category called `QA[UX]` and to rename an existing one to include a bracket. Both should be refused with a message.

---

## Fix 7: Command enable/disable toggles need a restart

**Why:** the three commands are registered once in `onload()` inside `if (this.settings.command...Enabled)`. Flipping a toggle in settings doesn't add or remove the command until Obsidian reloads, which the settings text doesn't say.

**Attach:** `src/main.ts`, `src/SettingTab.ts`, and the matching test in `src/SettingTab.test.ts` if it covers these toggles.

~~~
Task: make the command enable/disable settings take effect immediately.

Problem: in main.ts onload(), each of the three commands (open-sidebar,
open-dashboard, add-log-entry) is registered only if its settings flag is
true at startup. Toggling the flag in the settings tab does not register or
unregister the command until the plugin reloads.

Do this:
1. Always register all three commands in onload(), and remove the
   surrounding `if (this.settings.<flag>)` wrappers.
2. Give each command a checkCallback instead of callback:
   - if the matching settings flag is false, return false (this hides the
     command from the palette and makes a bound hotkey do nothing);
   - if `checking` is true, return true without side effects;
   - otherwise run the existing action (activateView, activateDashboard,
     addLogEntry) and return true.
3. Keep the existing command ids and names, and keep the existing comment
   about names being fixed at startup language.
4. Do not change the settings tab UI or the setting keys. The toggles
   already save and refresh; they will now take effect immediately.
5. Add or update tests only where the existing test setup can cover it (for
   example a test that the checkCallback returns false when its flag is
   off). If main.ts cannot be tested with the existing mocks, skip the test
   and say so; do not build a new mocking suite.
~~~

**Manual check:** turn "Add log entry" off in settings. It should disappear from the command palette immediately. Turn it on again and it should come back, still without restarting.

---

## After all fixes

1. Run the full check once:
   ```bash
   npm ci && npm run lint && npm run typecheck:tests && npm run format:check && npm test && npm run build
   ```
2. Delete `typecheck_output.txt` and the `Daily-Time-Log-Repository-Review-2026-11-18.md` file from the repo root (the `.md` would also be checked by `format:check`).
3. Update the changelog for the next version: the add-entry command, the command toggles, the category dropdown, and fixes 2 to 7.
4. Bump the version in `manifest.json`, `package.json` and `versions.json` when you're ready to release.
5. Test on a phone: long-press drag, tap to add, and the sidebar after editing while it's collapsed.
