# Project Rules & Instructions for AI Agents

Welcome, AI Agent! You are working on the **Daily Work Log** Obsidian Plugin. This project aims to build an Obsidian plugin that visualizes daily time tracking directly from daily markdown files.

Please strictly adhere to the following rules and specifications during development.

---

## 1. Core Architectural Constraints & File Parsing

### 1.1 Document Format (Minimal Metadata)
- Daily note files MUST follow the naming convention of `YYYY-MM-DD.md` (as a basename — see the folder note just below for where that file may live).
- **CRITICAL**: Do NOT enforce or auto-generate YAML Frontmatter unless explicitly configured or requested. Minimizing metadata bloat is a core design philosophy — a prior project (DayTime Tracker) pushed most content into YAML frontmatter, making the raw markdown unreadable without the plugin. This project intentionally keeps all visual information in the markdown body instead. **This constraint is non-negotiable even when porting UI/features from DayTime Tracker** — reuse its rendering/interaction code, never its frontmatter-based data layer.
- Daily notes are not required to live at the vault root — a configurable `dailyNoteFolder` setting (see §2) filters which folder this plugin scans, same as DayTime Tracker. The `YYYY-MM-DD.md` naming rule still applies to the basename only.
- A file MAY still legitimately contain a YAML frontmatter block (added manually by the user or by another plugin). The parser MUST NOT misinterpret it as a content block marker — see **1.2 Frontmatter Handling** below.
- **Basename → Date parsing must round-trip, not just regex-match.** `src/dailyNote.ts` `parseDateFromBasename` first checks the `YYYY-MM-DD` shape with a regex, then constructs a `Date` and re-reads its year/month/day back out to confirm they match the input exactly. This is required because `new Date(year, month, day)` silently rolls invalid values over into a neighboring date instead of erroring (e.g. `2026-02-31` becomes `2026-03-03`) — without the round-trip check, a malformed filename would be treated as some other, unrelated valid date instead of being rejected as "not a daily note".

### 1.2 Frontmatter Handling (MUST run before block-marker detection)
- If line index `0` of the file is exactly `---`, treat everything from line `0` up to and including the next line that is exactly `---` as a YAML frontmatter block and skip it before searching for block markers.
- If no closing `---` is found, do not treat it as frontmatter (fall through to normal parsing).
- **"Exactly `---`" means exactly** — do NOT `.trim()` the line before comparing (a real body line like `" --- "` with actual leading/trailing spaces must NOT be mistaken for a frontmatter delimiter). The only normalization allowed is stripping a trailing `\r` so CRLF-terminated files aren't broken — that's a line-ending encoding detail, not a content difference. This is deliberately stricter than the block-marker matching in 1.3, which DOES trim (hand-typed H1 headings are expected to have stray whitespace; a frontmatter fence is not).
- This stripping logic MUST be implemented as a pure function inside `src/parser.ts` (no Obsidian API dependency), consistent with the Decoupled Parser Strategy in Section 4.
- **Line indices must stay relative to the original file.** Do not renumber lines after stripping — downstream line-index tracking (1.4) depends on original file line numbers.

### 1.2.1 Line Endings (CRLF)
- **The parse MUST be line-ending agnostic.** A CRLF file splits on `"\n"` and leaves a trailing `"\r"` on every line, and JavaScript's `.` does **not** match `\r` — so `TIME_RANGE_REGEX`, which ends in `(.*)$`, would fail to match **every** Event line and the note would parse as having **no events at all**, with no error. The reading view disagrees with the parser about the same file (it renders the lines the parser never saw), which is the parser/DOM disagreement class §1.3 exists to prevent.
  - `splitContentLines()` in `src/parser.ts` is the single place that strips the trailing `\r`; every read path goes through it (`stripFrontmatter`, `parseDailyNote`, `findEventBlockInContent`, and the staleness guards in the sidebar). Do NOT call `content.split("\n")` directly on file content — that reintroduces the defect.
- **The write path MUST preserve the file's existing line-ending style.** `replaceLineAt()`, `replaceLineRangeAt()`, `removeLineRangeAt()` and `appendLineToBlock()` re-join with the ending the file already uses (detected once per write), so editing one line in a CRLF note does not convert that line to LF and leave the file with mixed line endings.
- Stripping the `\r` does **not** change the line COUNT, so line indices stay relative to the original file (see §1.2).

### 1.3 Event Block Marker (Single Configurable Heading)
The Event block is identified by **one user-configured heading** (`eventHeadingText` + `eventHeadingLevel` in Settings), not by a generic `---` divider (a `---` divider was rejected because it collides with YAML frontmatter's closing delimiter).

> [!IMPORTANT]
> **Only the configured heading is recognized.** The parser has NO hard-coded fallback list of historical spellings — there is no `LEGACY_EVENT_HEADINGS` equivalent. A heading that does not match the configured text *and* level is ordinary note content.
> - Consequence: if the user changes the Event heading in Settings, notes written with the previous heading stop being treated as an Event block **entirely** — they yield zero events (there is NO whole-body fallback; see 1.7). This is intentional — the configured heading is the single source of truth.
> - Because matching is by exact text, a user's own unrelated heading can only collide if it is literally the configured text at the configured level. The user chose that text, so this is the intended target, not a guess.
> - This plugin does not scaffold new notes (see 3. Obsidian API Best Practices), so there is no "creation side" to keep in sync. The first line of defense is the user's own Daily Notes template containing the configured heading.

**Matching rules**:
- The heading must have **exactly** the configured level (`#` repeated `eventHeadingLevel` times, 1–6) followed by the configured text. A different level is NOT a match, even with the same text.
- Matching MUST be tolerant of accidental hand-typing: trim surrounding whitespace and match case-insensitively (e.g. `# event` still matches a configured `Event`).
- The heading text is matched as a literal string — regex metacharacters in it are escaped, not interpreted.
- **Heading text is normalized to its RENDERED form before comparison** (`normalizeHeadingText` in `parser.ts`). The reading view renders inline markup, so `# **Event**` becomes `<h1>Event</h1>`; if the parser compared the raw text it would disagree with the DOM. Normalization removes emphasis/strong/strikethrough markers, unwraps inline code, **replaces inline links with their label text** (`[Event](url)` -> `Event`), **removes inline images entirely** (`![Event](url)` -> `""`), drops the ATX closing sequence (`# Event #`), decodes HTML entities, and collapses whitespace. The *configured* text is normalized the same way, so a setting of `Event` matches a heading written as `**Event**`.
- **An inline IMAGE normalizes to the EMPTY string, not to its alt text.** A link's label *is* its rendered text (an `<a>` element's `textContent`), but an image renders as an `<img>` element whose `textContent` is `""` — the alt text is an ATTRIBUTE, not rendered text. So `![Event](y.png)` must normalize to `""`, and a heading that is only an image must NOT open the Event block. Substituting the alt text made the parser open a section the reading view never opened (and, in the opposite direction, made the two sides disagree about the same file).
- **Inline code spans are exempt from the markup stripping.** A code span renders its contents literally, so `` `**Event**` `` shows as `**Event**` in the DOM — the markers are part of the visible text and must survive. `normalizeHeadingText` splits the raw text into code and non-code parts and only transforms the non-code parts.
- Emphasis is only stripped when unambiguous (CommonMark's intraword rule): `_` inside a word is literal, so `foo_bar_baz` stays `foo_bar_baz` and does **not** match a configured `foobarbaz`.
- The DOM side must NOT re-strip markup: text taken from a rendered heading goes through `normalizeRenderedHeadingText` (whitespace only), because the markup has already been rendered away.

**Boundary computation**:
1. Scan the file top to bottom and record the line number of the **first** occurrence of the configured heading only.
2. The block spans from that recorded position to the next heading at the **same level or above** (i.e. a heading whose level is `<=` the configured level), or to end-of-file.
   - **Deeper headings are subheadings and stay INSIDE the block.** With the heading configured at H2, a `### Sub` heading and its content remain part of the Event block; only an H1 or H2 ends it. This lets a note group events under nested sub-headings.
3. If the configured heading is not found anywhere in the file, the file has **no Event block** and yields **zero events** — there is no whole-body fallback (see 1.7).

**Inline creation**: `appendLineToBlock` inserts a new Event line at the end of the heading's **own** content — i.e. before the first deeper (sub)heading inside the block — so the Event list stays grouped directly under the configured heading and nested sections keep their own content. When the note has no Event block at all, the configured heading is created at the end of the file and the new line goes right under it (otherwise the event would land outside every block and never be parsed back).

**Category badges are scoped the same way**: `categoryBadges.ts` renders a `[Category]` badge only for tokens inside the configured Event section — in the live editor via the block range from `findEventBlockInContent`, and in the reading view via `isWithinEventHeading` (which takes the rendered `<h1>`–`<h6>` headings preceding the token). A `[Category]` typed outside the Event section stays plain text, matching the parser's strict scoping. `isWithinEventHeading` lives in `parser.ts` (not `categoryBadges.ts`) so it stays unit-testable without the Obsidian API — `parser.test.ts` covers it, including a cross-check that it agrees with the file-based block range.

**The badge rule MUST mirror the parser's block rule exactly** (boundary computation steps 1–2 above):
- The section is opened by the **FIRST** heading matching the configured text *and* level — a later heading with the same text does **not** re-open it.
- It is closed by the next heading at the **same level or above**; deeper headings are subheadings and stay inside.
- Consequence: with two `# Event` headings, only the content between the first and the second is inside the section — the same range `findEventBlock` returns for that file. The reading view and the live editor must never disagree about which lines belong to the Event block. A "last heading wins" rule is wrong here and was the cause of a real parser/renderer mismatch.

**Reading-view heading walk**: the reading view collects the headings that precede a token with a **single document-order traversal** (`walkDocumentOrder`), walking elements and text nodes together (`SHOW_ELEMENT | SHOW_TEXT`) and accumulating headings as they are met. A `TreeWalker` created with `SHOW_ELEMENT` can never yield a text node, so an element-only walker must **not** be compared against a text node to detect "reached the target" — doing so makes the walk run to the end of the document and silently applies the scoping rule to the whole note. The DOM-level behaviour is covered by `src/categoryBadges.reading.test.ts` (see §4).

### 1.4 Event Block
- Lines representing time ranges are formatted as: `- HH:mm - HH:mm [description]` (e.g., `- 09:00 - 10:30 Coding session`).
- Use regex pattern: `/^[-*]\s*(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})\s*(.*)/` to extract. This allows for optional single-digit hours (e.g. `9:00`) and flexible separators (`-` or `~`).
- **`TIME_RANGE_REGEX` (above) is for parsing existing lines — it is NOT a validator.** It only checks the shape `\d{1,2}:\d{2}` and happily matches `99:99`. Anywhere the user TYPES a new time value (e.g. `EventEntryModal`'s start/end inputs), validate with the separate, stricter `TIME_VALUE_REGEX` (also in `parser.ts`), which range-checks hours 00-23 and minutes 00-59. Do not reuse `TIME_RANGE_REGEX` for input validation, and do not loosen `TIME_VALUE_REGEX` back to a shape-only check.
- **An END time may additionally be `24:00`** (midnight at the end of the day) — use `TIME_END_VALUE_REGEX` for it. The sidebar grid produces `24:00` when the end hour is set to 24, and the end-hour setting explicitly advertises midnight support, so rejecting it made the final 10-minute range of the day unsavable. A START time may NOT be `24:00`: it has no place on the grid and could never be rendered. `timeToMinutes("24:00")` is 1440, so the grid and duration math already handle it.
- **An Event whose end is BEFORE its start crosses midnight** (e.g. `23:00 - 01:00`). `timelineDurationMinutes` counts the full range, and the grid must draw it as **two in-day segments** — `timelineDaySegments` (in `parser.ts`) returns them: the tail of the evening and the head of the day. The grid must NOT compare the raw start and end values, because `Math.max(start, hourStart) < Math.min(end, hourEnd)` is then false for every hour and the Event becomes invisible on the grid while the dashboard still counts its time.
- **A zero-length range (`09:00 - 09:00`) records ZERO minutes.** The overnight branch is `end < start`, never `end <= start`: with `<=`, a zero-length range counted as a full day (1440 minutes) even though `timelineDaySegments` correctly draws no segment for it — the grid showed nothing while the dashboard reported 24 hours of recorded time.

#### 1.4.1 Category extension *(decided 2026-08-05)*
- Timeline lines gain an optional category token right after the time range: `- HH:mm - HH:mm [Category] description` (e.g. `- 09:00 - 10:30 [업무] 회의 준비`).
- The bracketed text is the category's **current display name (localized label), stored verbatim** — not a stable internal key — so the raw file stays human-readable without the plugin (consistent with §1.1's core philosophy). Trade-off: renaming a category in Settings does NOT retroactively update text already written into old notes; those old lines simply stop matching any configured category and render as "uncategorized" (no color). This is an accepted trade-off, not a bug.
- New backward-compatible regex (replaces the 1.4 pattern above once implemented):
  ```
  /^[-*]\s*(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})\s*(?:\[([^\]]*)\]\s*)?(.*)$/
  ```
  Group 3 = category (may be `undefined`), group 4 = description. Lines written before this feature existed (no `[Category]` token) MUST continue to parse identically to before — they simply have `category: undefined` and render uncategorized. `parser.test.ts` MUST cover both the old (no-category) and new (with-category) line shapes, plus mixed files containing both.

#### 1.4.2 Continuation Lines / Multi-line Text *(decided 2026-08-14)*
- **Motivating bug**: `TimelineModal`'s description `<textarea>` allows the user to type real newlines. Those got written to the file verbatim (multiple physical lines) but `parseTimeline` only ever read the first line per item — the rest silently vanished from the parsed `description` on the next load, even though the raw text was still sitting in the file. See `imsi.md` (repo root, working notes from the investigation) for the full incident writeup.
- **Rule**: within a block, a line matching `TIME_RANGE_REGEX` starts a new item. A line matching neither a time range nor a checkbox nor a heading is absorbed **verbatim** (no trim, so it round-trips byte-for-byte) into the immediately preceding item's `description`, joined with `\n`. A line that DOES match a checkbox or a heading (`isTopLevelOrMarker` in `parser.ts`), stops the run **and clears the "current item" pointer** — it is neither absorbed nor treated as a new item.
  - The "clears the pointer" half is required so that a checkbox line never inherits an earlier Event item's continuation run. Regression case: `parser.test.ts` → `"does not absorb headings, time-range lines, or checkboxes as continuation text"`.
  - It's also required so that a heading line (which ends the Event block per 1.3, or is a subheading inside it) is never absorbed as if it were a note — see the `isTopLevelOrMarker` JSDoc in `parser.ts`.
- **`lineCount`**: every `TimelineItem` carries `lineCount` (>= 1) — the number of physical lines it occupies, including absorbed continuation lines. Range-based `replaceLineRangeAt`/`removeLineRangeAt` must be used for anything touching a possibly-multi-line item, so a note's continuation lines get replaced/removed together with the item that owns them rather than left behind as orphaned text.
- **Trailing blank lines**: absorbed like any other continuation line for `lineCount` purposes (they still occupy physical lines that must move together with the item on edit/delete), but trimmed off the collected `description`/`text` string itself (`.trimEnd()`) so they don't show up as trailing whitespace when the item is re-edited.
- **A second consecutive blank line ends the run too** *(decided 2026-08-14, follow-up)*: one blank line absorbs as a meaningful paragraph break, but two-or-more in a row is treated exactly like hitting `isTopLevelOrMarker` — the run stops and `current` is cleared, so the blank line and everything after it become orphaned (excluded from `lineCount`), never deleted, just no longer part of this item. This is the read-side half of a two-layer defense against meaningless/runaway gaps:
  - **Write side**: `TimelineModal`'s `handleSave` collapses any run of 3+ typed newlines down to exactly 2 (i.e. caps at one blank line) before it's ever written — so content created *through the sidebar* never produces a double-blank gap in the first place.
  - **Read side** (this rule): catches gaps that reached the file some other way (hand-edited directly, or pre-existing from before this feature shipped), which can't be intercepted at write time. Because the orphaned tail is excluded from `lineCount`, opening that item in the sidebar naturally never shows it (no separate "visible vs. full" tracking needed), AND re-saving that item only overwrites `[item.line, item.line + item.lineCount - 1]` — the orphaned tail is structurally outside that range, so an edit-and-resave can never destroy it. *(decided 2026-08-14)* Deliberately never deleted, even though it's now permanently detached from any item once orphaned this way — the user (or a future manual edit) may still want it; only an intentional edit of the raw file removes it.
- **Save-time validation**: `TimelineModal` rejects saving a description whose 2nd-or-later line matches `isTopLevelOrMarker` — such a line would otherwise silently stop being absorbed (and everything after it lost) on the very next parse, with no visible error. Reject-and-ask-the-user-to-rephrase was chosen over silently auto-escaping the line, so nothing the user typed gets silently altered. (This is a distinct case from the blank-line rule above, which IS silently auto-collapsed rather than rejected — a run of extra blank lines carries no meaning worth interrupting the user over, unlike a line shaped like a real event or checkbox.)

### 1.5 To-Do Blocks — REMOVED
> [!NOTE]
> To-Do parsing was removed. Checkbox lines (`- [ ]` / `- [x]`) are now ordinary note content: they are never parsed as tasks, never rendered in the sidebar, and never counted in dashboard metrics. The parser still recognizes a checkbox line as a "top-level" shape so that it is not silently absorbed as an Event's continuation text (see 1.4.2). The `TodoItem` type, `parseTodo`, `todoRangeMatches`, `todoLineMatches`, and the `todos` field on `ParsedDailyNote` no longer exist.

### 1.6 Journal Blocks — REMOVED
> [!NOTE]
> The reserved Diary/Journal block is gone. Free-form sections in a note are ordinary Markdown and are never structurally parsed. A heading at the same level or above the configured Event heading ends the Event block (see 1.3); deeper headings are subheadings inside it.

### 1.7 Notes Without the Event Heading (No Fallback)
- If the configured Event heading (1.3) is not found anywhere in the file, the file has **no Event block** and the parser returns **zero events**. There is deliberately **no whole-body fallback**: the configured heading is the single source of truth for where events live.
- The sidebar shows a "No Event section" banner above the grid for such notes (`emptyStateTitleNoEventHeading` / `emptyStateDescNoEventHeading` in `i18n.ts`) instead of silently showing nothing, so the user can tell "no heading" apart from "heading but no events". The grid itself stays usable — creating the first Event writes the configured heading into the note (see 1.3).
- The Dashboard treats such notes as having zero Event time (they still count as existing notes for streak/total purposes, but they do NOT count toward the daily average — see 1.8).
- **Do NOT auto-migrate notes** by inserting the Event heading into them. Notes without the heading are left untouched unless the user (or the sidebar's inline Event creation) adds it explicitly.

### 1.8 Dashboard Statistics
- **A note dated after `today` is a day that has not happened yet, so it is counted NOWHERE.** A daily note can legitimately be dated in the future — a template pre-created for tomorrow, a template with a fixed date, a note copied from another vault — but such a note records no elapsed time. The bound is a CALENDAR-day bound (the time of day is irrelevant) and it applies to:
  - the period totals (`isWithinRecentWindow` — including the "All Time" window, whose start bound is dropped but whose future bound is not);
  - the vault-wide figures — `totalNotes`, `oldestDate`, `newestDate` and the current streak;
  - the time totals, the category breakdown, the activity list and the daily average (applied inside `computeDashboardStats` itself, so the function is self-consistent whatever the caller passes in).
  - The ONE shared rule lives in `isOnOrBeforeToday()` in `dashboardCollector.ts`. There must be no second, differently-implemented future bound.
- **The "Daily Avg" figure divides by the DAYS that recorded time** — the window's total recorded minutes ÷ the number of distinct dates whose note recorded at least one minute. A daily note IS a day, so the label is accurate; the denominator is a count of days, not of files.
  - A note that exists but recorded nothing is a day that recorded **nothing**, not a day that recorded a zero — it must not drag the average down.
  - Two files carrying the same date (`2026-07-14.md` and `archive/2026-07-14.md`) are ONE day and must not be counted twice.
  - Dividing by the number of *notes* was wrong on both counts (it counted empty notes as zero-minute days, and counted same-date files as separate days).
- **A vault holding only future-dated notes shows a NOTICE, not the "No daily notes yet." empty state and not a dashboard of unexplained zeros** — `dashboardFutureOnlyNotice` in `i18n.ts` explains that those days have not arrived yet, so nothing is counted until they do. The "no daily notes yet" state stays reserved for a vault with no daily notes at all.
- **Every dashboard metric carries an EXPLANATION of how it is computed, shown on hover.** A bare label ("Daily Avg", "Date Range", "Current Streak") does not say what the number beside it means, so the figure cannot be interpreted on its own — the ambiguity behind the "Daily Avg" denominator defect was invisible to users for exactly this reason. The explanation lives in a `tipStat*` i18n key, attached with Obsidian's `setTooltip()` to the metric's LABEL element (never to the value, which is the number itself). The label also gets `cursor: help` so it looks hoverable. `src/DashboardView.test.ts` asserts that every KPI label and every Period Summary row has one, and that the "Daily Avg" tooltip states that the denominator is the days that recorded time.

---

## 2. Settings & Localization

- Plugin settings are persisted via Obsidian's standard `loadData()` / `saveData()` pattern (`src/settings.ts` defines `DailyWorkLogSettings` and `DEFAULT_SETTINGS`; `main.ts` merges loaded data over the defaults on `onload`).
- `language: "auto" | "en" | "ko"`, exposed through a `PluginSettingTab` (`src/SettingTab.ts`) as a dropdown. Default is `"auto"` and resolves to Obsidian's UI language via `getLanguage()`; unsupported UI languages fall back to English. Existing `"en"` / `"ko"` values remain explicit overrides.
- `SettingTab` still uses the imperative `display()` method only, not also the newer declarative `getSettingDefinitions()` API (Obsidian 1.13.0+, surfaced as Community Plugin review feedback: `obsidianmd/settings-tab/prefer-setting-definitions`). *(re-confirmed 2026-08)* Per `getSettingDefinitions()`'s own JSDoc in `obsidian.d.ts`, `display()` simply isn't called on 1.13.0+ once `getSettingDefinitions()` returns a non-empty array, and is otherwise untouched on older versions — so implementing **both** side by side would cost **zero** compatibility (no need to bump `minAppVersion` at all). The real cost is maintaining two parallel definitions of every setting in sync by hand (Obsidian's own migration guide requires updating both whenever a setting changes) — an ongoing burden, not a one-time one. Decision: **not worth it yet** given the current settings surface (~6 setting groups); revisit once a meaningful share of users are on 1.13.0+. The `prefer-setting-definitions` warning is expected and should stay unaddressed until then.
- The language preference controls plugin UI strings only. It has NO effect on parsing: the Event heading is a separate, explicit setting (1.3) and the parser recognizes only that exact heading.
- **The Event heading's DEFAULT must not be localized.** The heading is part of the note FORMAT, not a UI string, so it must not change with the interface language — otherwise a Korean user who never touched the setting would silently get a different heading than the settings UI shows. `DEFAULT_SETTINGS.eventHeadingText` is derived from the parser's `DEFAULT_EVENT_HEADING` (single source of truth), and `loadSettings()` resolves missing/invalid values through `resolveEventHeadingText` / `resolveEventHeadingLevel` in `settings.ts`. There is deliberately NO `defaultEventHeading` entry in the i18n table.
- Adding a new supported language means: add its UI strings to `STRINGS` and weekday labels to `WEEKDAYS` in `i18n.ts`, and add a matching dropdown option in `SettingTab.ts`. Keep the language-keyed maps in exact parity (`i18n.test.ts` asserts `STRINGS.en` and `STRINGS.ko` have identical key sets). The parser needs no per-language entry — there is no marker-label list any more.
- **A translation key must be USED, not just declared.** `i18n.test.ts` scans the source tree and fails if any key in `STRINGS` is never referenced as a quoted literal — so a dead key cannot be added by accident. The `UIStringKey` union is excluded from that scan (it is the definition site, not a use). This matters because the two language tables must stay in exact key-set parity: a dead key cannot be dropped from one side alone, and it cannot be dropped from both without also removing it from the union.
- Sidebar, Dashboard, and modals follow Obsidian's active theme. Prefer Obsidian's native modal/button styles and CSS variables for UI colors; fixed category colors are intentional user-configurable data.
- `startHour` / `endHour: number` — the grid timeline's displayed hour range (DayTime Tracker parity). Affects only the grid view's rendering window, not what's stored in the note body — an event outside the configured range is still parsed and stored, just not shown until the range is widened.
- `dailyNoteFolder: string` — optional vault-relative folder **filter** for the daily notes this plugin scans (Dashboard stats, category badges), with folder autocomplete (`AbstractInputSuggest`, ported from DayTime Tracker's `FolderSuggest`). Empty string = scan the whole vault. This plugin does not create notes, so it never determines *where* a `YYYY-MM-DD.md` file lives — the filename rule itself (§1.1) is unchanged.
- `categories: CustomCategory[]` — up to 10 entries, each `{ name, displayName, color }`, defaults ported from DayTime Tracker (Work/Study/Rest/Reading/Exercise, pastel colors matching `design.md` §2.1, which already used the same palette). CRUD (add/rename/recolor/delete/reset-to-default) lives in `SettingTab.ts`. See §1.4.1 for how a category is represented inside a Timeline line.
- **A category's display name must be non-blank and unique.** `validateCategoryName()` in `settings.ts` enforces both, and BOTH the add and the rename path in `SettingTab.ts` use it — a rename used to skip the checks that adding enforced. A blank name cannot be written into a note as `[Name]` (it parses back as uncategorized), and two categories sharing a display name would each be credited with the same minutes by the dashboard, which keys its totals by display name, doubling the reported time. `validateCategoryName` takes an optional `ignoreIndex` so a category keeping its own name is not treated as a duplicate of itself.
- **The category list must always be a DEEP copy.** The settings screen mutates category objects in place (renaming changes `displayName`, the colour picker changes `color`), so a shallow `[...DEFAULT_CATEGORIES]` copy would leave the copy sharing the very objects in `DEFAULT_CATEGORIES` — editing a category after a reset would permanently alter the defaults, and a later reset would restore the edited values. Use `copyCategories()` / `createDefaultCategories()` from `settings.ts` for every copy, including in `loadSettings()`.
- **A category token is resolved by ONE shared rule.** `findCategoryByDisplayName()` in `settings.ts` matches a display name case-insensitively, trimming whitespace, and is used by the category-badge renderer, the sidebar timeline, and the dashboard. The three must never disagree: the badge renderer used to match case-insensitively while the timeline and dashboard matched exactly, so a `[work]` token was drawn with the configured `Work` colour in the note but counted as uncategorized in the sidebar and the dashboard. A token that matches no configured category is uncategorized everywhere.

---

## 3. Obsidian API Best Practices

- *(decided 2026-08-05)* **UI framework scope**: React 18 (ported from DayTime Tracker) is used ONLY for the sidebar's Timeline/To-Do view and its entry modal (`view.tsx`/`TimelineView.tsx`). The Dashboard view and all confirm-style modals stay vanilla DOM (`createDiv`/`createEl`), unchanged. **`parser.ts` remains framework-agnostic regardless** — introducing React does NOT relax the "zero Obsidian API dependency, pure functions" rule in §4, because that rule is scoped to `parser.ts` specifically, not to the codebase as a whole. The View layer choosing React vs. vanilla DOM is an orthogonal, separate decision.
- **Avoid Raw Node `fs` API**: Always use Obsidian's Vault and Workspace APIs (`this.app.vault.read()`, `this.app.vault.modify()`, `this.app.workspace.getActiveFile()`) to modify and read note contents. Using node's native filesystem library bypasses Obsidian's sync mechanisms and may corrupt indices.
- **Event Listeners**:
  - Listen to `layout-change` or `active-leaf-change` on `this.app.workspace` to update the view state dynamically when the user switches documents.
  - Listen to `modify` events on `this.app.vault` to sync edits made in the editor panel to the sidebar UI.
  - **Guard against self-triggered updates**: when the plugin itself writes a change (e.g. adding or editing an Event), the resulting `modify` event must not cause a redundant/looping re-render. Track the last write the plugin performed (e.g. file path + content hash, or a short-lived flag) and skip reprocessing a `modify` event that matches it.
  - **Don't let the tracked "current file" go stale on `active-leaf-change`**: if there IS an active file and it's not a daily note, clear the tracked current file (otherwise the sidebar keeps showing — and can keep writing to — a note that's no longer on screen). If there is NO active file at all (e.g. the sidebar itself has focus), leave the tracked file as-is rather than blanking the view on every leaf switch.
  - **`refresh()`-style re-render MUST guard against overlapping calls.** The current implementation does a synchronous `container.empty()` before an `await vault.read()`; if two triggers (e.g. `active-leaf-change` and `modify` firing close together) call it around the same time, a later call's `empty()` can wipe an earlier call's DOM mid-flight, and then BOTH calls' post-`await` continuations append their own Event sections into the same container — producing visibly duplicated sections. Use an incrementing token: capture it at the top of the render function, and after the `await`, bail out without rendering if a newer call has since incremented it. Now that the sidebar (`view.tsx`) has moved to React, this specific double-`empty()` failure mode no longer applies there — React's reconciliation replaces the manual `container.empty()` + rebuild pattern — but any remaining manual/imperative render paths (e.g. Dashboard, which stays vanilla DOM) must keep this guard.
  - ~~**`refresh()` MUST reuse the same `Calendar` instance...**~~ *(2026-08-05, obsolete since the Calendar component was removed)* This whole concern (preserving `Calendar`'s viewed-month state across re-renders) no longer applies once the Calendar component is removed.
- **CSS Variable Usage**: Use Obsidian's CSS custom properties (variables) like `--text-normal`, `--background-secondary`, `--interactive-accent`, etc. This ensures the plugin respects the user's active theme (light/dark mode) seamlessly.
- **New Daily Note Creation & Confirmation Policy**:
  - **The plugin does not create or open daily notes.** There is no "today note" button and no scaffolding path. Users create notes with Obsidian's Daily Notes core plugin (or any other workflow) and configure that plugin's own folder and template.
  - The plugin's `dailyNoteFolder` setting is therefore **a scan filter only** — it limits which folder the Dashboard and the category badges read from. It does not determine where notes are created.
  - *(same behaviour as DayTime Tracker)* There is no calendar/date-picker UI — the sidebar only ever reflects the currently active file.
  - Jumping to a specific past/future date's note is no longer a plugin feature — users rely on Obsidian's own file explorer / quick switcher for that.

---

## 4. Development Workflow & Testing Guidelines

- **Decoupled Parser Strategy**: `src/parser.ts` MUST be implemented as a pure TypeScript utility with ZERO dependencies on the Obsidian API. This allows developers to run high-speed unit tests on parsing logic in a pure Node/Vitest environment.
- **Build Pipeline**: The build script utilizes `esbuild` to bundle code. Always compile changes using the configured scripts (e.g., `npm run dev` or `npm run build`).
- **Safety First**: Do not overwrite or modify existing user data structure without validating the parser behavior first. Unit tests in `src/parser.ts` are a prerequisite before making modifications to parsing logic.
- **Required parser test coverage** (in addition to existing regex/line-index cases):
  - Files with a leading YAML frontmatter block (frontmatter must be stripped, not mistaken for the Event heading).
  - Files with the configured Event heading present, at various levels and text values.
  - Files where the configured heading is **absent** (must yield zero events — no whole-body fallback).
  - Files where a heading that is *not* the configured one is present (must NOT open an Event block).
  - Files where the configured text appears at a **different** heading level (must NOT open an Event block — level is part of the match).
  - Files where the Event block is terminated by a heading at the **same level or above**, and files where a **deeper** heading (subheading) keeps its content inside the block.
  - `isWithinEventHeading` (the heading-list form of the same rule, used by the category-badge renderer) — including a cross-check that it agrees with the file-based block range.
- **Required `categoryBadges.ts` reading-view test coverage** (`src/categoryBadges.reading.test.ts`): the reading view is DOM-dependent, so this file is the one place where a real DOM is required — it runs under the `happy-dom` environment and drives the real `processCategoryBadgesInReadingView()` rather than a reimplementation.
  - A `[Category]` token under the configured heading renders a badge; one under a deeper (sub)heading also renders.
  - A token after a heading at the **same level or above** does **not** render a badge (the Event section has ended).
  - A token in a note with no configured heading does not render a badge.
  - A non-default configured heading text/level is honoured.
  - A heading whose text is rendered from a link (`<h1><a href="...">Event</a></h1>`) opens the section — the parser must agree, or the note would show badges inside an Event section the parser never opened.
  - A heading whose text is rendered from an IMAGE (`<h1><img alt="Event" src="y.png"></h1>`) does **not** open the section — the image's `textContent` is `""`, not its alt text.
  - A **cross-check that pins the parser to the DOM**: `normalizeHeadingText(raw)` must equal the `textContent` of the equivalent rendered heading, for both a link heading and an image heading. This is the shape that catches the two sides drifting apart — a re-implementation on one side is not enough.
  - Tokens that are not in event-line position (prose, checkboxes) and unknown categories do not render a badge.
  - Files outside the configured daily-note folder, and files that are not `YYYY-MM-DD`-named, are left untouched.
- **Test environment notes**:
  - The published `obsidian` package is **types-only** (`"main": ""`), so it cannot be imported at runtime under Vitest. `vitest.config.ts` aliases `obsidian` to `src/test/obsidian-mock.ts`, a minimal runtime stub, which is what makes DOM-level module testing possible at all. Keep that stub in sync with the production `from "obsidian"` imports.
  - The default Vitest environment stays `node`; a test file opts into a DOM with a `@vitest-environment happy-dom` docblock.
  - Obsidian's DOM helpers (`createEl`, `createDiv`, `empty`, `addClass`, …) are added to `HTMLElement` by Obsidian itself, not by the DOM standard. `src/test/obsidian-dom-mock.ts` installs them for tests; call `installObsidianDomHelpers()` at the top of any test that renders Obsidian UI.
  - The `Setting` mock in `src/test/obsidian-mock.ts` is a real builder: `addText`/`addDropdown`/`addColorPicker`/`addButton` invoke the callback immediately and record the component on the setting, so a test can find it via `Setting.created` and drive it (e.g. `text.setValueFromUser("...")`).
- **Required `TimelineView` test coverage** (`src/components/TimelineView.test.tsx`): the sidebar grid is React + a native window listener, so it needs a real DOM.
  - A drag that ends on a grid cell opens **exactly one** add-Event modal. A release fires the cell's React `onMouseUp` AND the window-level `mouseup` listener; both run before React re-renders, so a state-based guard cannot suppress the second one — the component uses a `useRef` latch (`dragHandledRef`) that is released on the next `mousedown`.
  - A drag that ends outside the grid also opens exactly one modal.
  - A second, separate drag still opens its own modal — the latch must not stay latched forever.
  - An Event crossing midnight renders a bar in the evening hours AND a bar in the early-morning hours (one bar per `timelineDaySegments` segment).
- **Required `SettingTab` test coverage** (`src/SettingTab.test.ts`): the settings tab is a chain of UI callbacks, so it needs a real DOM and the functional `Setting` mock.
  - Changing the daily-note folder refreshes the views. The folder filter drives the dashboard's note scan and the category badge scope, so both must be rebuilt when it changes — otherwise the open dashboard keeps showing the previous folder's notes until it is refreshed by hand, and the editor badges keep the old scope until the next reload. The folder change is **debounced** (it triggers a vault-wide scan), so the test waits for the debounce window.
  - *(§1.4.1)* Event lines with and without the `[Category]` token, including files that mix both within the same block (notes written before and after the category feature shipped).
  - *(§1.4.2)* Continuation-line absorption for Event items, including: `lineCount` tracking, verbatim (untrimmed) preservation of a continuation line's own leading whitespace, trailing-blank-line trimming from the collected text while still counting it in `lineCount`, stopping (and resetting the "current item" pointer) at a line matching a checkbox or a heading, and a single blank line still absorbing normally vs. a SECOND consecutive blank line stopping the run and excluding the rest from `lineCount`.
- **Required `dailyNote.ts` test coverage** (`src/dailyNote.test.ts`, same pure/no-Obsidian-dependency reasoning as parser.ts):
  - Valid `YYYY-MM-DD` basenames parse and round-trip through `formatDateBasename`.
  - Non-matching basenames (wrong shape, un-padded numbers) return `null`.
  - Calendar-invalid dates (`2026-02-31`, `2026-13-01`, Feb 29 on a non-leap year) return `null` instead of a silently rolled-over `Date`.
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
- **Watch the backslash level in regexes.** `stripHtml`'s entity pattern used `\\d` inside a regex LITERAL, where it matches a literal backslash followed by `d` — so no numeric entity (`&#39;`) was ever decoded. Numeric entities are now decoded by `NUMERIC_ENTITY_REGEX` (decimal and hexadecimal, with out-of-range code points left untouched).
- **The release guard compares versions EXACTLY.** `.github/scripts/extract-changelog.mjs` compares the README's newest changelog heading against the version from `manifest.json`. It must not use a prefix match: with `startsWith`, a `0.5.10` entry would pass the guard for a release of `0.5.1` and the release notes would describe the wrong version. The heading is `<version>` optionally followed by a date in parentheses, e.g. `0.5.1 (2026-10-20)`; only the first space-delimited token is compared. Covered by `src/releaseGuard.test.ts`.

---

## 5. Reference Assets

---

## 5. UI Design Reference

When implementing or modifying **any UI component** (sidebar view, modals, CSS, components), you MUST read [`.agents/design.md`](./design.md) first.

It defines:
- Design principles (pastel color palette, desaturated buttons, minimal delete button)
- Component layouts (Event grid, Timeline modal, Confirmation popup)
- CSS class naming conventions (`dwl-*`)
- Color system and button specs
- File write safety checklist for new write operations
