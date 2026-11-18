# Parser rules - format (§1.1, §1.2, §1.2.1, §1.7, §1.8)

## 1.1 Document Format (Minimal Metadata)

- Daily note identity MUST follow the core Daily Notes plugin's `format` and `folder` settings. A slash in the format (for example `YYYY/MM/DD`) creates a nested path, so the full vault-relative path must be parsed rather than only the basename.
- **CRITICAL**: Do NOT enforce or auto-generate YAML Frontmatter unless explicitly configured or requested. Minimizing metadata bloat is a core design philosophy — a prior project (DayTime Tracker) pushed most content into YAML frontmatter, making the raw markdown unreadable without the plugin. This project intentionally keeps all visual information in the markdown body instead. **This constraint is non-negotiable even when porting UI/features from DayTime Tracker** — reuse its rendering/interaction code, never its frontmatter-based data layer.
- The plugin reads the core Daily Notes plugin's settings directly; it must not expose a duplicate folder or date-format setting. If the core plugin settings are unavailable, retain the `YYYY-MM-DD`-at-vault-root fallback.
- A file MAY still legitimately contain a YAML frontmatter block (added manually by the user or by another plugin). The parser MUST NOT misinterpret it as a content block marker — see **1.2 Frontmatter Handling** below.
- **Date parsing must be strict.** `src/dailyNote.ts` uses Obsidian's Moment instance and the core plugin's date format in strict mode, rejecting malformed dates instead of rolling them over. Treat date-format slashes as path separators and strip the core plugin's configured folder before parsing.

## 1.2 Frontmatter Handling (MUST run before block-marker detection)

- If line index `0` of the file is exactly `---`, treat everything from line `0` up to and including the next line that is exactly `---` as a YAML frontmatter block and skip it before searching for block markers.
- If no closing `---` is found, do not treat it as frontmatter (fall through to normal parsing).
- **"Exactly `---`" means exactly** — do NOT `.trim()` the line before comparing (a real body line like `" --- "` with actual leading/trailing spaces must NOT be mistaken for a frontmatter delimiter). The only normalization allowed is stripping a trailing `\r` so CRLF-terminated files aren't broken — that's a line-ending encoding detail, not a content difference. This is deliberately stricter than the block-marker matching in 1.3, which DOES trim (hand-typed H1 headings are expected to have stray whitespace; a frontmatter fence is not).
- This stripping logic MUST be implemented as a pure function inside `src/parser.ts` (no Obsidian API dependency), consistent with the Decoupled Parser Strategy in Section 4.
- **Line indices must stay relative to the original file.** Do not renumber lines after stripping — downstream line-index tracking (1.4) depends on original file line numbers.

## 1.2.1 Line Endings (CRLF)

- **The parse MUST be line-ending agnostic.** A CRLF file splits on `"\n"` and leaves a trailing `"\r"` on every line, and JavaScript's `.` does **not** match `\r` — so `TIME_RANGE_REGEX`, which ends in `(.*)$`, would fail to match **every** Event line and the note would parse as having **no events at all**, with no error. The reading view disagrees with the parser about the same file (it renders the lines the parser never saw), which is the parser/DOM disagreement class §1.3 exists to prevent.
  - `splitContentLines()` in `src/parser.ts` is the single place that strips the trailing `\r`; every read path goes through it (`stripFrontmatter`, `parseDailyNote`, `findEventBlockInContent`, and the staleness guards in the sidebar). Do NOT call `content.split("\n")` directly on file content — that reintroduces the defect.
- **The write path MUST preserve the file's existing line-ending style.** `replaceLineAt()`, `replaceLineRangeAt()`, `removeLineRangeAt()` and `appendLineToBlock()` re-join with the ending the file already uses (detected once per write), so editing one line in a CRLF note does not convert that line to LF and leave the file with mixed line endings.
- Stripping the `\r` does **not** change the line COUNT, so line indices stay relative to the original file (see §1.2).

## 1.7 Notes Without the Event Heading (No Fallback)

- If the configured Event heading (1.3) is not found anywhere in the file, the file has **no Event block** and the parser returns **zero events**. There is deliberately **no whole-body fallback**: the configured heading is the single source of truth for where events live.
- The sidebar shows a "No Event section" banner above the grid for such notes (`emptyStateTitleNoEventHeading` / `emptyStateDescNoEventHeading` in `i18n.ts`) instead of silently showing nothing, so the user can tell "no heading" apart from "heading but no events". The grid itself stays usable — creating the first Event writes the configured heading into the note (see 1.3).
- The Dashboard treats such notes as having zero Event time (they still count as existing notes for streak/total purposes, but they do NOT count toward the daily average — see 1.8).
- **Do NOT auto-migrate notes** by inserting the Event heading into them. Notes without the heading are left untouched unless the user (or the sidebar's inline Event creation) adds it explicitly.

## 1.8 Dashboard Statistics

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
