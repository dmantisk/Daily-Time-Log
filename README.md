# Daily Time Log

An Obsidian plugin that visualizes time-tracking Events directly from your daily markdown notes — no YAML frontmatter required.

A fork of [seongchan/DailyWorkLog](https://github.com/seongchan/DailyWorkLog) by SeongChan Hong, used under the MIT License.

> [!NOTE]
> Vibe coded!
> Almost all commits since the fork are written by AI

## Features

- **Grid timeline**: a 10-minute-cell grid in the sidebar — drag across cells to log a new time block, click an existing block to edit it.
- **Categories**: color-coded categories (5 built-in — Work/Study/Rest/Reading/Exercise — and up to 10 in total), stored as a `[Category]` tag right in the note body.
- **Daily note location and format**: follows the core Daily Notes plugin's "New file location" and date format, including formats that create nested paths such as `YYYY/MM/DD`.
- **Navigation scope**: previous/next buttons find the adjacent dated note under the core plugin's configured location.
- **Configurable Event heading**: choose its text and Markdown heading level; only the configured heading is recognized.
- **Minimal metadata**: Events are read from a plain Markdown heading — no frontmatter needed.
- **Automatic UI language detection**: picked up from Obsidian's own language on first run, overridable in settings.
- **Theme-aware UI**: the sidebar, Work Insights, and popups follow Obsidian's active theme.
- **Work Insights**: a vault summary — total notes in configured folder, current streak, time window filtering (7d/30d/90d/All), total event time and daily average, category time breakdown visualization (Multi-Segment Progress Bar), and recent note activity history. Every metric carries a tooltip explaining how it is computed.

## Daily Note Format

Daily Time Log follows the date format and "New file location" configured in Obsidian's Daily Notes core plugin (using `YYYY-MM-DD` at the vault root if those settings are unavailable). It reads and updates existing notes but does not create them — create notes with the core plugin or another workflow. The default Event section is:

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

- `- HH:mm - HH:mm [Category] description` for an Event. The `[Category]` part is optional; the category name must match one of the names configured in **Settings → Category Management** to pick up its color (an unrecognized or missing category just shows as uncategorized). A leading `[tag]` in the description (e.g. `- 09:00 - 10:00 [[Note]] ...`) is parsed as a category token, not as part of the description.
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
- **Daily Note Folder**: the plugin reads the folder and date format from Obsidian's core Daily Notes plugin settings (not a separate plugin setting). The dashboard and category-badge scanning are scoped to that folder; when no folder is configured, the scan falls back to the whole vault.
- **Event Heading Text / Level**: configure the heading that begins the Event section in your notes. Only this exact heading (at this exact level) is recognized — change it and notes using the old heading stop being parsed as an Event block.
- **Language**: follows Obsidian's UI language by default; English or Korean can be selected as an override.
- **Category Management**: add, rename, recolor, or delete categories, or reset to the defaults. Up to 10 categories in total; names must be unique.

## Development

```bash
npm test    # run the Vitest unit test suite
npm run build   # type-check (tsc) + production build
```

## Changelog

### 0.8.1 (2026-10-22)

Performance and documentation improvements from the third-party review.

- Filtered vault-modify refresh to daily notes only; debounced refresh by 500 ms; split refresh so settings changes rebuild badges but pane switches don't.
- Added per-file `mtime` + heading-config parse cache in the dashboard; built off-screen content before DOM swap; used `cachedRead` for read-only paths; switched vault scan to `getMarkdownFiles()`; hoisted `getDailyNoteFormat()` out of loop.
- Switched drag-to-select to pointer events (`onPointerDown`/`onPointerEnter`/`onPointerUp`) with `touch-action: none`; added `pointercancel` guard; released pointer capture on down.
- Added `badgeKey` tracking so category badges rebuild when core Daily Notes folder/format changes.
- Added localized `i18n` keys for timeline notices (`Failed to save/update/delete event`, `Daily note not found`).
- Trimmed docs: `.agents/AGENTS.md` reduced to concise guide; full rules preserved in `.agents/AGENTS-reference.md`; `TODO.md` kept to open items; resolved review findings moved to `docs/REVIEW-ARCHIVE.md`; older changelog entries moved to `docs/CHANGELOG-ARCHIVE.md`.
- Updated `tsconfig.json` exclude to cover `.test.tsx` and `src/test/**`.

### 0.8.0 (2026-10-22)

Navigation between daily notes.

- **Added previous/next buttons** using native Obsidian lucide icons (`chevron-left` / `chevron-right`).
- **Navigation scoped to the configured daily note folder** (folder root only; subfolders not scanned).
- **Shows a native Notice** when the previous/next note does not exist.

> **Requires Obsidian 1.13.0 or later.**

Earlier release notes are preserved in [the changelog archive](./docs/CHANGELOG-ARCHIVE.md).

## License

MIT. Copyright (c) 2026 Hong SeongChan (original author) and dmantisk (fork maintainer).
