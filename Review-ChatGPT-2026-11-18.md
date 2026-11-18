# Daily Time Log — Repository Review

**Review date:** 18 November 2026  
**Reviewed input:** `Daily-Time-Log-main.zip`  
**Archive revision marker:** `de1aaf7ae6df51e1caec6ee0cd79b1bb83ce33c7`  
**Package version:** `1.0.0`  
**Minimum Obsidian version:** `1.13.0`

## Executive summary

The repository is in generally good shape. The code has a useful separation between Markdown parsing, time calculations, vault/UI integration, and dashboard aggregation. There is meaningful automated test coverage, the plugin favours Obsidian's own UI components, note writes use `vault.process()`, and the dashboard has sensible caching and bounded concurrency.

I found **four P2 functional issues** and **four P3 correctness/edge-case issues**. I did not find a confirmed P1 release blocker in the static review. The two most important problems are both around fenced code blocks: one can put a newly created event inside a fence, and another allows a modal description to be saved even though the parser will detach the fenced portion from that event.

The test suite and production build could not be executed because dependency installation was blocked by DNS failures reaching `registry.npmjs.org`. The report therefore distinguishes source-level findings from checks that actually ran.

### Priority definitions

- **P2:** A normal supported workflow can produce incorrect or stale user-visible behaviour. Fix before the next release.
- **P3:** An edge case, display inconsistency, or hardening issue. Fix after P2 items.

---

## Findings

### P2-1 — Event insertion can occur inside a fenced code block

**Location:** `src/parser/timeline-parsing.ts:250–282` (`appendLineToBlock`, `endOfOwnContent`)  
**Related implementation:** `src/parser/event-block.ts:24–52`

`findEventBlock()` correctly tracks fenced code blocks and ignores headings inside them. However, `appendLineToBlock()` then calls `endOfOwnContent()`, which scans the same lines with `headingLevel()` but does **not** use `FenceTracker`.

A deeper heading inside a code sample is therefore mistaken for a real Event subheading. The new line is inserted before that heading while the fence is still open, so the new event is Markdown code rather than an event the plugin can parse.

**Reproduction** — with the default `# Event` heading, add an event to a note containing:

````markdown
# Event
- 09:00 - 10:00 [Work] Existing

```md
## Example
This is a code sample.
```
````

The `## Example` line is ignored by `findEventBlock()`, but it is found by `endOfOwnContent()`. The inserted event lands inside the fence and does not appear in the plugin timeline/dashboard.

**Recommended fix:** make `endOfOwnContent()` fence-aware: feed every line to a `FenceTracker` and only inspect a heading when the line is outside a fence. Add regression cases for backtick and tilde fences containing a deeper heading, plus a real deeper heading after the closing fence.

### P2-2 — The entry modal accepts fenced continuations that the parser later detaches

**Location:** `src/modals/TimelineModal.ts:220–250`  
**Related implementation:** `src/parser/timeline-parsing.ts:62–80, 167–178`

The modal's save-time guard checks continuation lines for time-range lines, checkboxes, and headings. It does not check code-fence markers. The parser deliberately treats a fence as a boundary: when it encounters the opening fence, it clears the current event and ignores the fence contents. As a result, the modal accepts descriptions that cannot round-trip as one event.

**Reproduction:** enter this description in the Add/Edit modal:

````text
Demo notes
```ts
const answer = 42;
```
````

The save succeeds, but after the next parse the event description is only `Demo notes`. The code block remains in the Markdown file, but it is detached from the event and is not shown in the editor modal when the event is reopened. An unclosed fence can also cause subsequent event-shaped lines to be treated as code until the fence closes.

This conflicts with the existing save-time validation principle: content that the parser will silently stop absorbing should be rejected rather than accepted and then disappear from the plugin-managed description.

**Recommended fix:** either reject a continuation that opens a fenced block (and explain why), or explicitly implement code-fence-aware continuation storage and line-range editing. Given the parser's documented rule that fences are boundaries, rejecting such descriptions is the smaller and safer change. Add closed- and unclosed-fence modal tests.

### P2-3 — “Add log entry” command does not refresh an already-open timeline

**Location:** `src/main.ts:208–216, 237–264, 341–399`  
**Comparison:** `src/components/TimelineController.ts:191–199`

The command path writes the note in `addEventToFile()` and then displays a success notice, but it does not explicitly reload the timeline view. At the same time, the vault modify handler recognises the write as the plugin's own write and calls `scheduleRefresh(false)`. That flag deliberately skips `refreshTimelineView()` and refreshes only the dashboard.

The sidebar grid's own add/edit path is fine because `TimelineController` calls `reloadFile()` after saving. The separate command path does not have the equivalent refresh.

**Impact:** when the sidebar is open and the user adds an entry through the command palette, the Markdown file is updated successfully but the sidebar can continue showing the old timeline until a later refresh or view reopen.

**Recommended fix:** after a successful `addEventToFile()` write, refresh the timeline view (or route both write paths through a shared save-and-refresh helper). Add a regression test for command-originated writes while a timeline view is open.

### P2-4 — Command enable/disable settings do not update the registered commands

**Location:** `src/main.ts:70–95`; `src/SettingTab.ts:175–215`

The three commands are conditionally registered only during `onload()`. The settings toggles update the stored boolean, save settings, refresh views, and redraw the settings tab—but they do not add or remove the corresponding command during the current plugin session.

**Impact:** switching a command off leaves it available until the plugin reloads; switching it on does not make it available until the plugin reloads. The settings descriptions say “Enable or disable” without explaining this delayed effect.

**Recommended fix:** either implement command registration/unregistration when a toggle changes, or explicitly tell the user that a plugin reload is required and show a notice when a toggle changes. Add tests for both enabling and disabling after startup.

### P3-1 — Category badge matching is not anchored to an event line

**Location:** `src/parser/timeline-parsing.ts:37–48`; `src/categoryBadges.ts:384–394`  
**Parser comparison:** `src/parser/timeline-parsing.ts:34, 94–105`

The comment above `CATEGORY_BADGE_REGEX_SOURCE` says it matches a category only in the exact event-line position. The expression itself is not anchored to the start of the text node/line and does not require the list marker. It therefore matches any time-range-shaped text followed by `[Category]` anywhere in a text node.

The actual event parser requires a list item at the start of the line (`TIME_RANGE_REGEX` begins with `^[-*]`). A continuation sentence such as “The discussion ran 09:00 - 10:00 [Work]” can therefore receive a category badge even though it is not a separate Event.

**Recommended fix:** anchor the badge expression to the beginning of an event line, accounting for the fact that editor Markdown includes the list marker while rendered list-item text usually does not. Add a test for a continuation sentence containing an inline time range and category token in both editor and reading view.

### P3-2 — Custom category names can contain brackets that the file format cannot round-trip

**Location:** `src/settings.ts:67–79`; `src/SettingTab.ts:241–258, 322–348`; `src/timelineLogic.ts:132–135`; `src/parser/timeline-parsing.ts:34, 47–48`

Category-name validation checks only that a name is non-empty and unique. The settings UI limits its length but does not reject `[` or `]`. The writer inserts the name directly inside `[Category]`, while both the event parser and badge matcher exclude square brackets from the category payload.

For example, `QA[UX]` is accepted as a category but is written as `- 09:00 - 10:00 [QA[UX]] Example`; the parser cannot recover it as a category. A name ending in `]` can also leave a stray bracket in the description.

**Recommended fix:** reserve and reject square brackets (and any other delimiter/control characters the chosen note format cannot represent), with a clear validation notice. Add serialization round-trip tests for accepted category names.

### P3-3 — Dashboard period date range ignores the configured Daily Notes date format

**Location:** `src/DashboardView.ts:419–423, 459–462`

Recent activity uses `formatDateBasename(summary.date, this.plugin.getDailyNoteFormat())`, but the Period Summary date range calls `formatDateBasename()` without the user's configured format. With a custom format such as `DD/MM/YYYY` or a nested format, the same dashboard displays two different date representations.

**Recommended fix:** pass `this.plugin.getDailyNoteFormat()` to both date-range formatting calls. Add a dashboard test using a non-default format.

### P3-4 — Parser treats headings inside indented Markdown code blocks as real headings

**Location:** `src/parser/heading-normalization.ts:75–93`; `src/parser/event-block.ts:24–52`  
**Reading-view comparison:** `src/categoryBadges.ts:268–313`

`matchMarker()` and `headingLevel()` call `trim()` before matching ATX headings. A standalone line with four leading spaces, such as `    # Event`, is an indented Markdown code block under CommonMark rules, not a rendered heading. The parser can nevertheless treat it as the Event marker or as a section boundary. The reading-view walker, by contrast, ignores content inside `<pre>`/`<code>`.

**Impact:** parser/dashboard scoping can disagree with the actual rendered note for notes containing indented code blocks. This is an edge case—the repository explicitly tests fenced blocks, but does not currently define equivalent handling for indented code blocks.

**Recommended fix:** decide whether indented code blocks are in scope. For Markdown parity, recognise ATX headings with no more than three leading spaces and track indented code blocks in the parser; add parser/reading-view agreement tests. If the plugin intentionally supports fenced blocks only, document that limitation.

---

## Non-blocking design and maintenance observations

1. **Daily Notes configuration is obtained through an internal Obsidian registry.** `src/main.ts:184–187` accesses `app.internalPlugins.getPluginById("daily-notes").instance.options` using a locally declared interface. This is an integration point coupled to Obsidian internals rather than a stable public plugin API. If the internal shape changes, the getters silently fall back to an empty folder/default date format, which may make the plugin stop recognising the user's configured daily notes. Keep this access isolated and consider a user-visible diagnostic when the expected core plugin options are unavailable.
2. **A “pure” dashboard collector is not fully Obsidian-independent.** `src/dashboardCollector.ts:1–12` describes zero Obsidian API dependency, but imports `formatDateBasename` from `src/dailyNote.ts`, which imports `moment` from `obsidian`. The tests work because the Vitest config aliases `obsidian` to a local mock. Either inject the date-key formatter or adjust the module comment and testability claim.
3. **Settings hydration trusts the top-level stored value's shape.** `migrateLoadedSettings()` casts `loadData()` output and uses the `in` operator at `src/settings.ts:329–336` without first verifying it is a non-null object. A valid JSON primitive in the settings file can throw during plugin startup. The categories branch checks only `Array.isArray`, not the shape of each category object. A future hardening pass should validate the settings record and individual category entries before using them.
4. **Main plugin lifecycle behavior is under-tested compared with the pure helpers and UI components.** The repository has 18 test files, but no `main.ts` lifecycle test. The command registration and self-write refresh paths above are examples of integration behavior that unit tests around settings/parser/controller code alone will not catch.

---

## What is working well

- **Parser boundaries are explicit.** The parser has a clear single-configured-heading rule, frontmatter handling, CRLF preservation, event range validation, and dedicated fenced-code tracking.
- **Writes are comparatively safe.** Timeline edits use `vault.process()` and range-based staleness checks; the `SelfWriteGuard` prevents plugin-originated vault events from triggering an unnecessary second timeline refresh.
- **The dashboard is designed for larger vaults.** It limits concurrent note reads to batches of ten, caches parsed notes by path/mtime/heading configuration, and uses a refresh token to discard stale asynchronous renders.
- **The test suite is substantial.** There are 18 test files covering parsing, settings, dashboard aggregation/rendering, badges, the modal, timeline controller, styles, and release guard logic. The archive contains approximately 361 `it`/`test` declarations by a simple source count; this is a static count, not a passing test result.
- **The UI uses native Obsidian components where appropriate.** The modal, settings, dropdowns, and buttons use Obsidian components; the custom timeline grid and coloured category chips are more specialised UI elements.
- **Release metadata is internally consistent.** The manifest and package versions match, and the changelog extraction script works for the current release entry.

---

## Validation performed

### Checks that succeeded

| Check | Result |
|---|---|
| `node .github/scripts/release-guard.mjs` | Passed: `1.0.0 -> 1.13.0` |
| Manifest/package version comparison | Passed: both `1.0.0` |
| Changelog extraction for `1.0.0` | Passed; produced the three current changelog bullets |
| Manual source-level inspection | Completed for parser, settings, timeline controller, dashboard, tests, build configuration, and GitHub workflows |

### Checks that could not be completed

`npm ci` could not finish because requests to `registry.npmjs.org` failed with `EAI_AGAIN` DNS errors. The incomplete `node_modules` directory did not contain the project executables or type definitions.

| Check | Observed result | Interpretation |
|---|---|---|
| `npm test` | Exit 127: `vitest: not found` | Tests did not run; this is an incomplete dependency-install issue, not evidence that tests fail. |
| `tsc --noEmit --skipLibCheck` | Exit 2: missing type definitions such as `chai`, `codemirror`, `node`, and others | Type-check did not complete because installed type packages are missing. No conclusion about source type correctness can be drawn. |
| `npm run lint` | Not run | ESLint is not installed in the incomplete dependency tree. |
| `npm run format:check` | Not run | Prettier is not installed in the incomplete dependency tree. |
| Full production build | Not run | Build depends on the missing TypeScript/esbuild packages. |

No Obsidian runtime smoke test was possible in this environment.

---

## Recommended fix order

1. **Fix P2-1 and P2-2 together** in the parser/modal fence rules. Add regression tests before changing the shared parsing behaviour.
2. **Fix P2-3** so a command-originated save refreshes the already-open timeline.
3. **Fix P2-4** by either supporting live command registration changes or clearly requiring a plugin reload.
4. Address the smaller parser/category issues: P3-1, P3-2, and P3-4.
5. Correct the dashboard date display (P3-3) and take the non-blocking hardening observations in a follow-up pass.
6. Once registry access is available, run `npm ci`, then `npm run lint`, `npm run typecheck:tests`, `npm run format:check`, `npm test`, and `npm run build` in the same environment. Finally, smoke-test add/edit/delete using both the sidebar and command palette in Obsidian 1.13+.

## Overall verdict

**Good foundation; fix the four P2 issues before the next release.** I found no evidence in this static review of a broad architectural problem or a need for a rewrite. The highest-value next step is a focused parser/write-path repair with regression tests, followed by lifecycle tests for commands and vault refresh behaviour. Runtime/build confidence remains incomplete until dependencies can be installed and the CI-equivalent checks pass.
