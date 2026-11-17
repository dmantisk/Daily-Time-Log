# Project Rules & Instructions for AI Agents

> Detailed, on-demand reference. The concise always-on project guide is [AGENTS.md](./AGENTS.md); this file retains the former numbered rules referenced by older design and review notes.

Welcome, AI Agent! You are working on the **Daily Work Log** Obsidian Plugin. This project aims to build an Obsidian plugin that visualizes daily time tracking directly from daily markdown files.

Please strictly adhere to the following rules and specifications during development.

---

## 4. Development Workflow & Testing Guidelines

- **Decoupled Parser Strategy**: `src/parser.ts` MUST be implemented as a pure TypeScript utility with ZERO dependencies on the Obsidian API. This allows developers to run high-speed unit tests on parsing logic in a pure Node/Vitest environment.
- **Build Pipeline**: The build script utilizes `esbuild` to bundle code. Always compile changes using the configured scripts (e.g., `npm run dev` or `npm run build`).
- **Testing a build in a real vault**: the plugin folder in a test vault is a set of **hard links** to `dist/` (`main.js`, `styles.css`, `manifest.json`), so a rebuild is picked up without copying anything. `data.json` is deliberately **NOT** linked — it is the vault's own file, because it holds that vault's plugin settings and writing to it must not change the repository's `dist/` copy. To set this up:
  ```powershell
  $v = "<vault>\.obsidian\plugins\daily-time-log"; $d = "<repo>\dist"
  New-Item -ItemType Directory -Path $v -Force
  "main.js","styles.css","manifest.json" | ForEach-Object { New-Item -ItemType HardLink -Path "$v\$_" -Target "$d\$_" -Force }
  Copy-Item "$d\data.json" "$v\data.json" -Force
  ```
  Do **not** point the plugin folder at `dist/` with a directory junction — that shares `data.json` too, and the vault's settings would then overwrite the repository's copy.
- **Safety First**: Do not overwrite or modify existing user data structure without validating the parser behavior first. Unit tests in `src/parser.ts` are a prerequisite before making modifications to parsing logic.
- **Required parser test coverage** (in addition to existing regex/line-index cases):
  - Files with a leading YAML frontmatter block (frontmatter must be stripped, not mistaken for the Event heading).
  - Files with the configured Event heading present, at various levels and text values.
  - Files where the configured heading is **absent** (must yield zero events — no whole-body fallback).
  - Files where a heading that is *not* the configured one is present (must NOT open an Event block).
  - Files where the configured text appears at a **different** heading level (must NOT open an Event block — level is part of the match).
  - Files where the Event block is terminated by a heading at the **same level or above**, and files where a **deeper** heading (subheading) keeps its content inside the block.
  - Files with a **fenced code block** inside the Event section: a `#` line inside a fence does not close the section, an event-shaped line inside a fence is not an Event, and the fence is not absorbed into the preceding event's description.
  - An **indented checkbox** after an event: it is not absorbed into the event's description, and it survives an edit and a delete of the event above it.
  - An **out-of-range time** (e.g. `99:99`): the line still parses, but its duration is clamped to a single day, and it cannot inflate the dashboard totals.
  - `isWithinEventHeading` (the heading-list form of the same rule, used by the category-badge renderer) — including a cross-check that it agrees with the file-based block range.
- **Required `categoryBadges.ts` reading-view test coverage** (`src/categoryBadges.reading.test.ts`): the reading view is DOM-dependent, so this file is the one place where a real DOM is required — it runs under the `happy-dom` environment and drives the real `processCategoryBadgesInReadingView()` rather than a reimplementation.
  - A `[Category]` token under the configured heading renders a badge; one under a deeper (sub)heading also renders.
  - A token after a heading at the **same level or above** does **not** render a badge (the Event section has ended).
  - A token in a note with no configured heading does not render a badge.
  - A non-default configured heading text/level is honoured.
  - A heading whose text is rendered from a link (`<h1><a href="...">Event</a></h1>`) opens the section — the parser must agree, or the note would show badges inside an Event section the parser never opened.
  - A heading whose text is rendered from an IMAGE (`<h1><img alt="Event" src="y.png"></h1>`) does **not** open the section — the image's `textContent` is `""`, not its alt text.
  - A **cross-check that pins the parser to the DOM**: `normalizeHeadingText(raw)` must equal the `textContent` of the equivalent rendered heading, for both a link heading and an image heading. This is the shape that catches the two sides drifting apart — a re-implementation on one side is not enough.
  - A **fenced code block** inside the Event section: the fence renders as `<pre><code>`, so a `#` inside it is not a heading element, a `[Category]` token inside it gets no badge, and a heading inside it does not close the section — plus a cross-check that the parser and the DOM report the same number of events and badges for a note containing a fence.
  - Tokens that are not in event-line position (prose, checkboxes) and unknown categories do not render a badge.
  - Files outside the core plugin's configured folder, and files whose paths do not strictly match its date format, are left untouched.
- **Test environment notes**:
  - The published `obsidian` package is **types-only** (`"main": ""`), so it cannot be imported at runtime under Vitest. `vitest.config.ts` aliases `obsidian` to `src/test/obsidian-mock.ts`, a minimal runtime stub, which is what makes DOM-level module testing possible at all. Keep that stub in sync with the production `from "obsidian"` imports.
  - The default Vitest environment stays `node`; a test file opts into a DOM with a `@vitest-environment happy-dom` docblock.
  - Obsidian's DOM helpers (`createEl`, `createDiv`, `empty`, `addClass`, …) are added to `HTMLElement` by Obsidian itself, not by the DOM standard. `src/test/obsidian-dom-mock.ts` installs them for tests; call `installObsidianDomHelpers()` at the top of any test that renders Obsidian UI.
  - The `Setting` mock in `src/test/obsidian-mock.ts` is a real builder: `addText`/`addDropdown`/`addColorPicker`/`addButton` invoke the callback immediately and record the component on the setting, so a test can find it via `Setting.created` and drive it (e.g. `text.setValueFromUser("...")`).
  - The `Setting` mock reproduces Obsidian's real DOM: the name and description live inside `.setting-item-info`, the controls in a sibling `.setting-item-control`. The plugin's own CSS targets those two classes, so the stub has to nest them the same way.
  - The `Notice` mock records every message it is given in `Notice.shown` (cleared with `Notice.reset()`), so a test can assert on what the plugin told the user.
- **Required `TimelineModal` test coverage** (`src/modals/TimelineModal.test.ts`): the modal is imperative and built from Obsidian's components, so the *rules* it enforces are what must be guarded.
  - The time format is validated, and the end time accepts `24:00` while the start time does not.
  - A description left untouched keeps its **original raw markup** on save (the textarea shows the HTML-stripped form, but a plugin that wrote `<font>`/`<b>` tags must not lose them) — and an edited description does not.
  - Consecutive blank lines are capped at one, and a continuation line shaped like a real event is rejected.
  - The category chips select and deselect, and the delete button asks for the delete.
- **Required `ConfirmDeleteModal` test coverage** (`src/modals/ConfirmDeleteModal.test.ts`): the dialog is Obsidian's own `ConfirmationModal`, so the app owns the button row — but the plugin's behaviour (message shown, confirm runs the callback, cancel does nothing) still has to be guarded.
- **Required `TimelineController` test coverage** (`src/components/TimelineController.test.ts`): the sidebar grid is plain DOM + a native window listener, so it needs a real DOM.
  - A drag that ends on a grid cell opens **exactly one** add-Event modal.
  - A drag that ends outside the grid also opens exactly one modal.
  - A second, separate drag still opens its own modal.
  - An Event crossing midnight renders a bar in the evening hours AND a bar in the early-morning hours (one bar per `timelineDaySegments` segment).
- **Required `SettingTab` test coverage** (`src/SettingTab.test.ts`): the settings tab is a chain of UI callbacks, so it needs a real DOM and the functional `Setting` mock.
  - The settings tab does not expose a duplicate daily-note folder or format setting; both come from the core Daily Notes plugin.
  - *(§1.4.1)* Event lines with and without the `[Category]` token, including files that mix both within the same block (notes written before and after the category feature shipped).
  - *(§1.4.2)* Continuation-line absorption for Event items, including: `lineCount` tracking, verbatim (untrimmed) preservation of a continuation line's own leading whitespace, trailing-blank-line trimming from the collected text while still counting it in `lineCount`, stopping (and resetting the "current item" pointer) at a line matching a checkbox or a heading, and a single blank line still absorbing normally vs. a SECOND consecutive blank line stopping the run and excluding the rest from `lineCount`.
- **Required `dailyNote.ts` test coverage** (`src/dailyNote.test.ts`):
  - Core-format dates parse and round-trip through `formatDateBasename`, including nested paths generated by `YYYY/MM/DD`.
  - Non-matching or calendar-invalid dates return `null` in strict mode.
  - `isDailyNoteFileName` accepts a date-named `.md` file and rejects date-named files with any other extension — the plugin WRITES to the files it treats as daily notes, so a non-Markdown file must never be picked up and overwritten.
- **Required `dashboardCollector.ts` test coverage** (`src/dashboardCollector.test.ts`):
  - `isWithinRecentWindow` bounds the window on BOTH ends. Notes dated after `today` are excluded — a future-dated daily note (a pre-created template, a copied note) records no elapsed time, so counting it would inflate the period totals and put a not-yet-happened day at the top of the recent-activity list. The future bound applies to the "All Time" window too.
  - `isOnOrBeforeToday` is the single shared future bound (1.8): it accepts today and every earlier day, rejects a future day, and ignores the time of day.
  - `computeDashboardStats` excludes future-dated notes from the **vault-wide** figures too — `totalNotes`, `oldestDate`, `newestDate` and the streak — not just from the period totals. The period figures and the vault-wide figures must never disagree about which notes count.
  - `computeDashboardStats` also excludes a future-dated note handed to it directly in `recentParsed` (defence in depth — it must contribute no minutes, no category breakdown, no activity row and no average).
  - The "Daily Avg" denominator is the number of distinct dates that recorded time: a note that recorded nothing is excluded, two files carrying the same date count as one day, and a window where nothing recorded time reports 0.
- **Required `DashboardView.ts` test coverage** (`src/DashboardView.test.ts`): the dashboard is vanilla DOM, so it needs a real DOM.
  - Every KPI card label and every Period Summary row carries a tooltip explaining how the metric is computed.
  - The "Daily Avg" tooltip states that the denominator is the days that recorded time.
  - The "Total Notes" tooltip states that future-dated notes are not counted.
  - The value element carries no tooltip — only the label does.
  - The window dropdown's **value** is the window (`30`), not its label, and it agrees with the "Event Time (30)" metric label. A `<select>` whose options carry no value falls back to the option's TEXT, so a mock that drops `createEl`'s `value` field makes the control show one window while the figures cover another.
- **Required `obsidian-dom-mock.ts` test coverage** (`src/test/obsidian-dom-mock.test.ts`): the DOM mock stands in for the helpers Obsidian adds to the `HTMLElement` prototype, and it drifts. When it drops a field the real `DomElementInfo` supports, the rendered DOM is not what Obsidian would produce and the test asserts on the wrong thing. The mock must cover the full `DomElementInfo` surface the plugin uses — `text` (string *and* `DocumentFragment`), `cls` (string *and* array), `title`, `attr` (with `null` meaning "remove the attribute"), `value` (applied to the element's value **property**, not as an attribute), `type`, `href`, `placeholder`, `prepend` and `parent`.
- **Required `settings.ts` test coverage** (`src/settings.test.ts`):
  - `validateCategoryName` rejects a blank name and a name already used by another category (case-insensitively), accepts a fresh name, and accepts a category keeping its own name when its index is passed as `ignoreIndex`.
  - `copyCategories` / `createDefaultCategories` copy DEEPLY: mutating the copy must not reach the source list or `DEFAULT_CATEGORIES`.
  - `findCategoryByDisplayName` matches case-insensitively and ignores surrounding whitespace, and returns `undefined` for an unknown, empty or missing name.
- **Version bookkeeping**: `update-version.mjs` (ported from DayTime Tracker's `update-version.js`; kept as `.mjs` since this `package.json` doesn't set `"type": "module"`) syncs `manifest.json`'s version from `package.json` and maintains `versions.json`, which maps each released plugin version to the `minAppVersion` it required at release time — required by Obsidian for correct backward-compatible version resolution. The `package.json` `"version"` script `git add`s both `manifest.json` and `versions.json`.
- **Watch the backslash level in regexes.** `stripHtml`'s entity pattern used `\\d` inside a regex LITERAL, where it matches a literal backslash followed by `d` — so no numeric entity (`'`) was ever decoded. Numeric entities are now decoded by `NUMERIC_ENTITY_REGEX` (decimal and hexadecimal, with out-of-range code points left untouched).
- **The release guard compares versions EXACTLY.** `.github/scripts/extract-changelog.mjs` compares the README's newest changelog heading against the version from `manifest.json`. It must not use a prefix match: with `startsWith`, a `0.5.10` entry would pass the guard for a release of `0.5.1` and the release notes would describe the wrong version. The heading is `<version>` optionally followed by a date in parentheses, e.g. `0.5.1 (2026-10-20)`; only the first space-delimited token is compared. Covered by `src/releaseGuard.test.ts`.