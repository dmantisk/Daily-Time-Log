# Daily Time Log

An Obsidian plugin that visualizes time-tracking Events directly from your daily markdown notes — no YAML frontmatter required.

A fork of [seongchan/DailyWorkLog](https://github.com/seongchan/DailyWorkLog) by SeongChan Hong, maintained by [dmantisk](https://github.com/dmantisk), used under the MIT License.

## Features

- **Grid timeline**: a 10-minute-cell grid in the sidebar — drag across cells to log a new time block, click an existing block to edit it.
- **Categories**: color-coded categories (5 built-in — Work/Study/Rest/Reading/Exercise — and up to 10 in total), stored as a `[Category]` tag right in the note body.
- **Configurable daily note folder**: notes don't have to live at the vault root, with folder autocomplete in settings.
- **Configurable Event heading**: choose its text and Markdown heading level; only the configured heading is recognized.
- **Minimal metadata**: Events are read from a plain Markdown heading — no frontmatter needed.
- **Automatic UI language detection**: picked up from Obsidian's own language on first run, overridable in settings.
- **Theme-aware UI**: the sidebar, Work Insights, and popups follow Obsidian's active theme.
- **Work Insights**: a vault summary — total notes in configured folder, current streak, time window filtering (7d/30d/90d/All), total event time and daily average, category time breakdown visualization (Multi-Segment Progress Bar), and recent note activity history. Every metric carries a tooltip explaining how it is computed.

## Daily Note Format

Daily notes must be named `YYYY-MM-DD.md`. Daily Time Log reads and updates existing notes but does not create or open them — create notes with Obsidian's Daily Notes core plugin or another workflow. The default Event section is:

```markdown
# Event

- 9:00 - 10:30 [Work] Team meeting
```

- The `[Category]` tag right after the time range is optional — `- 9:00 - 10:30 Team meeting` (no category) still works.
- Category badges are rendered only inside the Event section, same as the Event lines themselves — a `[Category]` token typed elsewhere in the note stays plain text.
- Set the Event heading text and level in plugin settings. **Only the configured heading is recognized** — if you change it, notes using the previous heading are no longer treated as an Event block and contribute no Events.
- Events are read **only from under the configured heading**. The section ends at the next heading at the *same level or above* — so with `# Event` (level 1), any `#` heading ends it, while with `## Event` (level 2), a `###` subheading and its content stay inside the Event section.
- A note without the configured heading has no Event section: the sidebar shows a "No Event section" banner and Work Insights counts it as zero Event time. Adding an Event from the sidebar creates the heading in the note automatically.

## Installation

This plugin isn't published on the Community Plugins browser yet. To install manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from a [release](../../releases) (or build them yourself — see below).
2. Copy the three files into `<your vault>/.obsidian/plugins/daily-time-log/`.
3. In Obsidian, go to **Settings → Community plugins**, turn off Restricted mode if needed, and enable **Daily Time Log**.

### Building from source

```bash
npm install
npm run build   # outputs dist/main.js, dist/manifest.json, dist/styles.css
```

For active development, use `npm run dev` instead — it rebuilds automatically on every change (esbuild watch mode).

## Usage

### From the sidebar

- **Work Insights**: click the ribbon icon (gauge), or run **"Open Work Insights"** from the Command Palette. Opens as a normal tab in the main workspace.
- **Sidebar**: click the ribbon icon (calendar-clock), or run **"Open sidebar"** from the Command Palette (`Cmd/Ctrl+P`). You can assign either a hotkey in **Settings → Hotkeys**.
- Drag across the grid to log a new time block; click an existing block to edit or delete it.
- Daily Time Log does not open or create daily notes. Use Obsidian's Daily Notes core plugin or another note-creation workflow. Capture the timeline with a screenshot if you want to keep a visual record.

### Directly in the note

You don't need the sidebar at all — the sidebar is just a UI on top of plain markdown, so typing directly into the note body works exactly the same way. Under each heading, add lines in this format:

```markdown
# Event

- 9:00 - 10:30 [Work] Team meeting
- 14:00 - 14:30 Quick call with no category
```

- `- HH:mm - HH:mm [Category] description` for an Event. The `[Category]` part is optional; the category name must match one of the names configured in **Settings → Category Management** to pick up its color (an unrecognized or missing category just shows as uncategorized).
- Save the file (or just keep typing — Obsidian autosaves) and the sidebar/Work Insights pick up Event changes automatically. Checkbox lines remain note content and are not parsed as tasks.

#### Multi-line notes

Any line right after an Event line that doesn't itself look like a *new* Event, checkbox, or heading line is treated as a continuation of the one above it — handy for jotting extra detail without cluttering the single description line:

```markdown
# Event

- 9:00 - 10:30 [Work] Team meeting
Discussed Q3 roadmap and confirmed next steps with design.
Follow-up scheduled for next week.
```

- For **Events**, the sidebar already supports this — press Enter in the description field of the add/edit popup and the extra lines are saved and shown right there when you reopen it.
- A continuation line can't itself start like a new time range (`09:00 - 10:00 ...`), a checkbox (`- [ ] ...`), or a heading — it would otherwise be treated as independent note content. The sidebar blocks saving a description that would do this.
- A single blank line stays part of the item as a paragraph break, but **two or more blank lines in a row end it right there** — the rest is left in the file untouched, just no longer part of that item, so it stops showing in the sidebar and won't be affected by editing that item. Saving from the sidebar automatically collapses 3+ blank lines down to 1.

#### A note on HTML tags

When viewing Event content in the sidebar, HTML tags are stripped out. This uses simple tag-pattern matching (`<...>`), so writing a literal inequality comparison in a description (e.g. `3 < 5`, `10 > 2`) can be misread as a tag and disappear from the sidebar. If you need `<`/`>` as literal text, use the HTML entities `&lt;`/`&gt;` instead.

## Settings

- **Day Start Hour / Day End Hour**: the hour range shown on the grid.
- **Daily Note Folder Filter**: limits Daily Time Log's dashboard and category badge scanning to a folder, with folder autocomplete. Leave empty to scan the whole vault.
- **Event Heading Text / Level**: configure the heading that begins the Event section in your notes. Only this exact heading (at this exact level) is recognized — change it and notes using the old heading stop being parsed as an Event block.
- **Language**: follows Obsidian's UI language by default; English or Korean can be selected as an override.
- **Category Management**: add, rename, recolor, or delete categories, or reset to the defaults. Up to 10 categories in total; names must be unique.

## Development

```bash
npm test    # run the Vitest unit test suite
npm run build   # type-check (tsc) + production build
```

## Changelog

### 0.5.4 (2026-10-21)

A cosmetic release: the category name and the note badges both read more like the text around them.

- **Made the note category badges squarer.** The `[Category]` badge in a daily note was a full pill — the corner radius was larger than the badge's own height, so the browser clamped it and both ends curved all the way around. The badge is now a rounded rectangle with distinct corners, and its horizontal padding was tightened to match. The radius is relative to the badge's own font size, so it keeps its proportions at any text size you use. This applies to both the live editor and the reading view.
- **Removed the emphasis from category names.** A category name was drawn bolder than the text around it in the sidebar grid, the dashboard legend, and the badges — but in each of them the name is one item in a line of like items, so the extra weight made it read as an emphasised name plus its surroundings. Names are now drawn at the same weight as everything beside them. Your category colours are unchanged.
- **Removed the old name from the ribbon tooltips.** The rename to "Daily Time Log" had missed the tooltips on the sidebar and dashboard ribbon icons, which still read "DailyWorkLog" — the upstream project's internal name rather than this plugin's. They now show the plugin's own name in both English and Korean.
- **Changed the plugin's author to dmantisk.** The plugin card still credited the upstream author, which is not who maintains this fork. It now credits the fork's owner, and the README and LICENSE name both parties — the original author's copyright notice is kept, as the MIT license requires.

### 0.5.3 (2026-10-21)

A second batch of correctness fixes found in a full review of the plugin.

- **Fixed a heading written as an image being recognized.** `# ![Event](y.png)` renders as a heading containing only an image, so the reading view shows no heading text at all — but the parser substituted the image's alt text and opened an Event section the reading view never opened. The parser now strips the image, matching what the reader actually sees. A link heading still works, because a link's label really is its rendered text.
- **Fixed a zero-length Event counting as a full day.** `09:00 - 09:00` was treated as an Event crossing midnight and reported as 24 hours of recorded time, while the timeline grid correctly drew nothing for it. It now counts as zero minutes.
- **Fixed the "Daily Avg" figure dividing by the wrong thing.** It divided the recorded time by the number of notes rather than by the number of days that recorded time, so a note that recorded nothing counted as a zero-minute day and dragged the average down, and two files carrying the same date were counted as two separate days. A daily note is a day, so the average is now taken over the days that actually recorded something.
- **Fixed future-dated notes still being counted in the dashboard totals.** The period totals excluded notes dated after today, but "Total Notes" and "Date Range" still counted them, so the dashboard could report two notes and a date range ending next month while ignoring that note's time. Both now use the same rule.
- **Fixed a vault containing only future-dated notes showing an unexplained empty dashboard.** It now shows a notice explaining that those days have not arrived yet.
- **Added tooltips explaining every dashboard metric.** Labels like "Daily Avg" or "Date Range" did not say how the number beside them was computed, so the figures could not be interpreted on their own. Hovering a metric now explains it — for instance, that "Daily Avg" is the average per day *that recorded time*, and that "Total Notes" leaves out notes dated in the future.
- **Removed a dead translation key** that was declared in both languages but never used.

### 0.5.2 (2026-10-21)

A batch of correctness fixes found in a full review of the plugin.

- **Fixed non-Markdown files being treated as daily notes.** The sidebar accepted any file whose name looked like a date, whatever its extension. Since the plugin writes to the files it treats as daily notes, a date-named image or CSV could be opened and overwritten with Markdown text. Only `.md` files are accepted now.
- **Fixed two add-Event modals opening for a single grid drag.** A mouse release fired both the grid cell's handler and a window-level listener, so one drag could open the popup twice. A drag now opens exactly one.
- **Fixed the last 10 minutes of the day being unsavable.** With the end hour set to 24 the grid's final cell produces an end time of `24:00`, which the popup rejected even though the setting advertises midnight support. `24:00` is now accepted as an end time.
- **Fixed overnight Events being invisible on the grid.** An Event crossing midnight (e.g. `23:00 - 01:00`) was counted by the dashboard but drew no bar in the sidebar. It is now drawn in both the evening and the early-morning hours.
- **Fixed future-dated notes being counted in the dashboard.** The 7/30/90-day and All-Time windows now exclude notes dated after today, which recorded no elapsed time.
- **Fixed duplicate and blank category names.** Renaming a category skipped the checks that adding one enforced. A blank name cannot be written into a note, and two categories sharing a name doubled the time reported by the dashboard. Names must now be unique, and the dashboard also counts a duplicated name only once.
- **Fixed the default categories being permanently editable.** Resetting the categories copied only the list, not the entries, so editing a category after a reset altered the defaults themselves and a later reset restored the edited values. The list is now copied deeply.
- **Fixed the "Event Time (30d)" label** — it named a 30-day window even when 7 days, 90 days or All Time was selected. The label now names the selected window.
- **Fixed category names being matched inconsistently.** The note badge matched a name case-insensitively while the sidebar and the dashboard matched exactly, so a `[work]` token was colored in the note but counted as uncategorized elsewhere. All three now use one rule.
- **Fixed the daily-note folder filter not refreshing the views.** An open dashboard kept showing the previous folder's notes until it was refreshed by hand, and the note badges kept their old scope until the next reload. The change is now applied immediately.
- **Fixed a heading written as a link not being recognized.** `# [Event](url)` renders with the visible text "Event", so the note showed badges inside an Event section the parser never opened — the note yielded no Events at all. The parser now matches a linked heading the same way the reader sees it.
- **Fixed numeric HTML entities not being decoded** in sidebar descriptions, so a description containing `&#39;` showed the raw entity.
- **Fixed the release check accepting the wrong version** — a `0.5.10` changelog entry passed the check for a `0.5.1` release.
- **Corrected the README's category count** — the limit has always been 10 categories in total, not 10 on top of the 5 built-in ones.

### 0.5.1 (2026-10-20)

- **Removed the DayTime Tracker migration script** (`scripts/migrate-from-daytimetracker.mjs`) and the `js-yaml` dependency it needed. The script only ever existed in the source repository, not in the release download, so the plugin itself is unaffected.

### 0.5.0 (2026-10-20)

- **Renamed the plugin** from "Daily Work Log" to "Daily Time Log".
- **Removed PDF/HTML export**; use a screenshot to capture the timeline.
- **Removed To-Do parsing**, the sidebar To-Do panel, the Work Insights To-Do completion metric, and To-Do export; checkbox lines remain ordinary note content.
- **Removed all Daily Time Log controls for opening or creating daily notes**; use Obsidian's Daily Notes core plugin instead. The daily-note-folder setting is now a scan filter for the dashboard and category badges, not a destination for new notes.
- **Removed the sidebar-specific Light/Dark theme toggle.** The sidebar, Work Insights, and popups follow Obsidian's active theme.
- **Added settings for the Event heading text and Markdown level**, used when parsing daily notes.
- The Event heading is now **fully configurable**: only the configured heading (at the configured level) is recognized. There is no hard-coded fallback list of historical spellings, and the heading is matched in its rendered form, so `# **Event**` and `# Event #` are recognized too.
- Events are read **only from under the configured heading**, and the section ends at the next heading at the same level or above.
- **Added category badge rendering** — a `[Category]` token right after a time range is drawn as a colored badge in both the live editor and the reading view. The token is only recognized in event-line position, so brackets typed elsewhere in a note (prose, headings, checkboxes, wikilinks) stay plain text, and badges follow the same Event-section scoping rule as the Event lines themselves.
- **Added automatic UI language detection**: the plugin interface follows Obsidian's own language by default, and English or Korean can be selected as an override. The language setting no longer affects parsing.
- **Fixed a mismatch between the parser and the badge renderer** when a note contains the Event heading more than once: events were read from the first such heading, but badges were drawn around the last one. Both now use the first heading, and the section ends at the next heading of the same level or above.
- **Fixed the Event heading not being recognized when it is decorated**: a heading written as `# **Event**` or `# Event #` is now recognized, the same way the reading view renders it. Previously such a note yielded no events, while the reading view still drew badges — the two disagreed.
- **Fixed the default Event heading changing with the interface language**: the heading is part of the note format, not a UI string, so it is now always `Event` by default. Previously a Korean user who had never touched the setting silently got a different heading than the settings UI showed.
- **Removed the Korean README** (`README.ko.md`); the plugin interface is still available in Korean.

### 0.4.3 (2026-08-15)

- Fixed the sidebar view (Events, To-Dos) to strip HTML tags from content when displaying it.

### 0.4.2 (2026-08-14)

- **Fixed a multi-line Event description bug**: typing multiple lines (pressing Enter) into an Event's description saved correctly to the file, but reopening that event in the sidebar showed only the first line — the rest looked lost even though it was still sitting in the file. Multi-line content is now preserved and shown in full when reopened.
- **Added continuation-line ("note") support**: any line right after an Event or To-Do line that doesn't itself look like a new item is now recognized as a note attached to the one above it (see "Multi-line notes" above for details). Events support this directly in the sidebar; To-Dos don't have a dedicated input UI for it yet, but notes written directly into the file are recognized and preserved.
- Saving a note that would collide with a real Event/To-Do shape is now blocked with a clear message, and runs of 3+ blank lines are automatically trimmed to one (see "Multi-line notes" above for the full rules).

### 0.4.1 (2026-08-08)

- **Narrowed Work Insights folder scan**: when collecting notes for statistics, the scan is now limited to the configured `dailyNoteFolder` (including subfolders) instead of walking the entire vault. Improves performance in large vaults with a narrow folder set. Falls back to a vault-wide scan when no folder is configured (the fresh-install default).
- **Removed the `js-yaml` package** as part of an Obsidian review fix. *(The migration script did import it, so the script was temporarily broken until the dependency was restored; both are gone as of 0.5.1.)*

### 0.4.0 (2026-08-07)

- **Redesigned Work Insights view**:
  - Overhauled the summary view into a refined UI.
  - **Configurable Folder Filtering (`dailyNoteFolder`)**: collects notes strictly from the folder specified in settings, rather than the entire vault.
  - **Time Window Filter**: filter statistics by Last 7 Days, 30 Days, 90 Days, or All Time in real-time.
  - **Category Time Breakdown**: visual multi-segment progress bar and legend grid reflecting configured category colors.
  - **Recent Note Activities**: card-based history list displaying per-note To-Do progress, top category badge, and recorded event time (click to open note).
  - **Renamed**: updated the view name from 'Dashboard' to 'Work Insights' for better clarity.

### 0.3.1 (2026-08-07)

- **Added a DayTime Tracker migration script** — converts existing daily notes written by DayTime Tracker (stored in `timeline-logs`/`timeline-todos` frontmatter properties) into this plugin's body-text format. *(The script was removed in 0.5.1 — see above.)*

### 0.3.0 (2026-08-05)

- Sidebar rebuilt as a 10-minute grid timeline (drag to select a time range), replacing the old list-and-calendar layout. Calendar date navigation has been removed — use Obsidian's own file explorer or quick switcher to jump to another day's note.
- Added color-coded categories (5 built-in, up to 10 in total), stored as an optional `[Category]` tag in each Event line.
- Simplified the block markers to `Event` / `ToDo` / `Diary` (dropping the leading underscore, which rendered as italics in some viewers). Notes written with the old `_Event` / `_ToDo` / `_Diary` markers keep working.
- Added PDF/HTML export for a single day's timeline and To-Do list.
- Added a configurable daily note folder (with autocomplete), instead of always using the vault root.
- Added automatic UI language detection on first run.
- Expanded the settings screen: hour range, daily note folder, language, sidebar theme, and full category management.

## License

MIT. Copyright (c) 2026 Hong SeongChan (original author) and dmantisk (fork maintainer).
