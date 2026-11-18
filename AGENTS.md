# Project Guide for Agents

Keep this file short: it is the always-on project context. Load detailed references only when the task needs them.

## Project essentials

- Daily Time Log is an Obsidian plugin that reads/edits Events in daily-note Markdown bodies; no frontmatter, no duplicate Daily Notes folder/format settings.
- Daily-note identity from Obsidian's core Daily Notes `folder`/`format`; preserve `YYYY-MM-DD` fallback.
- `src/parser.ts`, `src/parser/`, `src/dailyNote.ts`: pure, independently testable logic. Keep Obsidian APIs in view/plugin layer.
- Only the configured heading opens the Event section. Parser and category-badge rendering must agree; preserve source line indices/endings; never absorb unrelated note content into a writable Event.
- Read via Vault API; write via `plugin.processWrite()` (atomic `vault.process()` with returned string captured in callback) to keep Obsidian sync and self-write guard intact.
- Prefer Obsidian native UI. Sidebar timeline (`src/components/TimelineController.ts`) uses plain DOM (no React); dashboard/modals use Obsidian components/DOM.
- The sidebar timeline is intentionally pointer-only: entries are plain text in the daily note, so keyboard and screen-reader users edit the note directly. Do not add keyboard handlers, ARIA roles or tabindex to timeline blocks unless asked.

## Architecture

- `src/main.ts`: plugin lifecycle, settings, refresh, vault-event coordination.
- `src/parser.ts`, `src/parser/`, `src/dailyNote.ts`, `src/dashboardCollector.ts`: pure parsing/date/statistics logic. `src/parser.ts` is a barrel that re-exports the modules in `src/parser/` (heading-normalization, event-block, timeline-parsing, time-math, html). Outside `src/parser/`, import from `./parser`, not from the submodules.
- `src/components/TimelineController.ts`: plain-DOM sidebar timeline — ItemView lifecycle, grid rendering, drag/pointer handling (no React).
- `src/DashboardView.ts`: vault-wide dashboard.
- `src/categoryBadges.ts`: live-editor and reading-view category badges.
- `src/SettingTab.ts`, `src/settings.ts`, `src/i18n.ts`: settings, category rules, English/Korean strings.

## Commands

- `npm test` — full Vitest suite.
- `npm run build` — TypeScript check, release guard, production bundle.
- `npm run lint` — ESLint.
- Run focused tests for changed behavior, then build; no new packages unless dependencies missing.

## On-demand references

- [Parser rules & file parsing](./.agents/ref/parser-rules.md): §1 — document format, frontmatter, line endings, Event block marker, Event block, continuation lines, no-fallback, dashboard stats.
- [Settings & i18n](./.agents/ref/settings-i18n.md): §2 — settings persistence, language, categories, validation, deep copy, category resolution.
- [Obsidian API best practices](./.agents/ref/obsidian-api.md): §3 — UI framework scope, native components, Vault/Workspace APIs, event listeners, CSS variables, note creation policy.
- [Testing guidelines](./.agents/ref/testing.md): §4 — decoupled parser, build pipeline, test vault setup, required test coverage for all modules.
- [UI design reference](./.agents/ref/ui-design.md): §6 — links to `.agents/design.md` for design principles, layouts, CSS conventions, color system, write safety.
- [UI/UX design guide](./.agents/design.md): read before changing views, modals, or CSS.
- [Open work](./TODO.md): only current, actionable items.

## Working rules

- One small change at a time; touch only files named in the task. If >3 files, stop and ask.
- Shell is PowerShell on Windows 11. No grep, sed, export. Chain with `;`.
- Files contain Korean text: keep UTF-8. Never rewrite with `>` or `Set-Content` without `-Encoding utf8`; prefer editor tools.
- Match existing style: tabs, double quotes. No reformatting unrelated code.
- Comments explain why. Never paste TODO text into code.
- User-visible strings go through `t()` in `src/i18n.ts` with English/Korean entries.
- After code changes run `npm test` then `npm run build`. Do not tick a TODO until both pass.
- No new dependencies unless asked.
- Never retype or rewrite text containing HTML entities (&amp; &lt; &gt; &quot; &#39;). The editor tools can decode them. Move such code by cut/paste, or edit around it.
