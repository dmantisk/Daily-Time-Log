# Daily Time Log

An Obsidian plugin that visualizes time-tracking Events directly from your daily markdown notes — no YAML frontmatter required.

*[한국어 안내는 README.ko.md를 참고하세요.](./README.ko.md)*

## Features

- **Grid timeline**: a 10-minute-cell grid in the sidebar — drag across cells to log a new time block, click an existing block to edit it.
- **Categories**: color-coded categories (5 built-in — Work/Study/Rest/Reading/Exercise — plus up to 10 custom), stored as a `[Category]` tag right in the note body.
- **Configurable daily note folder**: notes don't have to live at the vault root, with folder autocomplete in settings.
- **Configurable Event heading**: choose its text and Markdown heading level; historical English and Korean Event headings remain recognized.
- **Minimal metadata**: Events are read from a plain Markdown heading — no frontmatter needed.
- **Automatic UI language detection**: picked up from Obsidian's own language on first run, overridable in settings.
- **Two independent themes**: a Light/Dark toggle just for the sidebar (separate from Obsidian's own theme, popups always follow the system theme), and Work Insights that follows Obsidian's theme automatically.
- **Work Insights**: a vault summary — total notes in configured folder, current streak, time window filtering (7d/30d/90d/All), total event time and daily average, category time breakdown visualization (Multi-Segment Progress Bar), and recent note activity history.

## Daily Note Format

Daily notes must be named `YYYY-MM-DD.md`. A new note created through the plugin contains the configured Event heading; by default:

```markdown
# Event

- 9:00 - 10:30 [Work] Team meeting
```

- The `[Category]` tag right after the time range is optional — `- 9:00 - 10:30 Team meeting` (no category) still works.
- Set the Event heading text and level in plugin settings. The historical English and Korean Event headings, including underscore-prefixed variants, remain recognized.
- When the configured heading is present, only its section (up to the next heading) is parsed. Notes without an Event heading retain legacy whole-note parsing.

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

> #### **[!TIP]**  
>
> **Switching from DayTime Tracker?** That plugin stores its data as `timeline-logs` / `timeline-todos` YAML frontmatter properties instead of plain body text. `scripts/migrate-from-daytimetracker.mjs` converts your existing daily notes to this plugin's format.
>
> This script is only in the source repository, not in the release download (the release only contains `main.js`/`manifest.json`/`styles.css`) — you'll need to clone this repo and run `npm install` first:
>
> ```bash
> git clone https://github.com/seongchan/DailyWorkLog.git
> cd DailyWorkLog
> npm install
> node scripts/migrate-from-daytimetracker.mjs <path-to-your-vault>            # dry run — writes nothing, just previews
> node scripts/migrate-from-daytimetracker.mjs <path-to-your-vault> --write    # actually rewrite the files
> ```
>
> Always run the dry run first and back up your vault before using `--write` — this rewrites daily notes in place and there's no undo. See the comment at the top of the script for exactly what does and doesn't get migrated.

## Usage

### From the sidebar

- **Work Insights**: click the ribbon icon (gauge), or run **"Open Work Insights"** from the Command Palette. Opens as a normal tab in the main workspace.
- **Sidebar**: click the ribbon icon (calendar-clock), or run **"Open sidebar"** from the Command Palette (`Cmd/Ctrl+P`). You can assign either a hotkey in **Settings → Hotkeys**.
- Drag across the grid to log a new time block; click an existing block to edit or delete it.
- Use the **Today** button in the sidebar header to open (or create) today's note. Capture the timeline with a screenshot if you want to keep a visual record.

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
- **Daily Note Folder**: where new daily notes are created (vault root by default), with folder autocomplete.
- **Event Heading Text / Level**: configure the heading that begins the Event section in your notes.
- **Language**: follows Obsidian's UI language by default; English or Korean can be selected as an override.
- **Background Theme Mode**: Light or Dark, for the sidebar only.
- **Category Management**: add, rename, recolor, or delete categories, or reset to the defaults.

## Development

```bash
npm test    # run the Vitest unit test suite
npm run build   # type-check (tsc) + production build
```

## Changelog

### Unreleased

- Removed PDF/HTML export; use a screenshot to capture the timeline.
- Removed To-Do parsing, sidebar controls, dashboard metrics, and To-Do export; checkbox lines remain ordinary note content.
- Added settings for the Event heading text and Markdown level, used when parsing and creating daily notes.

### 0.4.3 (2026-08-15)

- Fixed the sidebar view (Events, To-Dos) to strip HTML tags from content when displaying it.

### 0.4.2 (2026-08-14)

- **Fixed a multi-line Event description bug**: typing multiple lines (pressing Enter) into an Event's description saved correctly to the file, but reopening that event in the sidebar showed only the first line — the rest looked lost even though it was still sitting in the file. Multi-line content is now preserved and shown in full when reopened.
- **Added continuation-line ("note") support**: any line right after an Event or To-Do line that doesn't itself look like a new item is now recognized as a note attached to the one above it (see "Multi-line notes" above for details). Events support this directly in the sidebar; To-Dos don't have a dedicated input UI for it yet, but notes written directly into the file are recognized and preserved.
- Saving a note that would collide with a real Event/To-Do shape is now blocked with a clear message, and runs of 3+ blank lines are automatically trimmed to one (see "Multi-line notes" above for the full rules).

### 0.4.1 (2026-08-08)

- **Narrowed Work Insights folder scan**: when collecting notes for statistics, the scan is now limited to the configured `dailyNoteFolder` (including subfolders) instead of walking the entire vault. Improves performance in large vaults with a narrow folder set. Falls back to a vault-wide scan when no folder is configured (the fresh-install default).
- **Removed unused dependency**: dropped the `js-yaml` package, which was never actually imported anywhere in the codebase.

### 0.4.0 (2026-08-07)

- **Redesigned Work Insights view**:
  - Overhauled the summary view into a refined UI.
  - **Configurable Folder Filtering (`dailyNoteFolder`)**: collects notes strictly from the folder specified in settings, rather than the entire vault.
  - **Time Window Filter**: filter statistics by Last 7 Days, 30 Days, 90 Days, or All Time in real-time.
  - **Category Time Breakdown**: visual multi-segment progress bar and legend grid reflecting configured category colors.
  - **Recent Note Activities**: card-based history list displaying per-note To-Do progress, top category badge, and recorded event time (click to open note).
  - **Renamed**: updated the view name from 'Dashboard' to 'Work Insights' for better clarity.

### 0.3.1 (2026-08-07)

- **Added a DayTime Tracker migration script**: `scripts/migrate-from-daytimetracker.mjs` — converts existing daily notes written by DayTime Tracker (stored in `timeline-logs`/`timeline-todos` frontmatter properties) into this plugin's body-text format. Not included in the release download — you need to clone the source repository to use it (see the tip under "Installation" above).

### 0.3.0 (2026-08-05)

- Sidebar rebuilt as a 10-minute grid timeline (drag to select a time range), replacing the old list-and-calendar layout. Calendar date navigation has been removed — use Obsidian's own file explorer or quick switcher to jump to another day's note.
- Added color-coded categories (5 built-in + up to 10 custom), stored as an optional `[Category]` tag in each Event line.
- Simplified the block markers to `Event` / `ToDo` / `Diary` (dropping the leading underscore, which rendered as italics in some viewers). Notes written with the old `_Event` / `_ToDo` / `_Diary` markers keep working.
- Added PDF/HTML export for a single day's timeline and To-Do list.
- Added a configurable daily note folder (with autocomplete), instead of always using the vault root.
- Added automatic UI language detection on first run.
- Expanded the settings screen: hour range, daily note folder, language, sidebar theme, and full category management.

## License

MIT
