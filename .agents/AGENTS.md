# Project Guide for Agents

Keep this file short: it is the always-on project context. Load detailed references only when the task needs them.

## Project essentials

- Daily Time Log is an Obsidian plugin that reads and edits Events in daily-note Markdown bodies; do not add frontmatter or duplicate Daily Notes folder/format settings.
- Daily-note identity comes from Obsidian's core Daily Notes `folder` and `format`; preserve the root `YYYY-MM-DD` fallback.
- `src/parser.ts` and `src/dailyNote.ts` are pure, independently testable logic. Keep Obsidian APIs in the view/plugin layer.
- Only the configured heading opens the Event section. Keep parser and category-badge rendering in agreement, preserve source line indices and line endings, and never absorb unrelated note content into a writable Event.
- Read notes through the Vault API and write through `plugin.writeFile()` so Obsidian sync and the self-write guard remain intact.
- Prefer Obsidian's native UI components. React is used for the sidebar timeline; the dashboard and modals use Obsidian components/DOM.

## Architecture

- `src/main.ts`: plugin lifecycle, settings, refresh and vault-event coordination.
- `src/parser.ts`, `src/dailyNote.ts`, `src/dashboardCollector.ts`: pure parsing/date/statistics logic.
- `src/view.tsx`, `src/components/TimelineView.tsx`: sidebar timeline.
- `src/DashboardView.ts`: vault-wide dashboard.
- `src/categoryBadges.ts`: live-editor and reading-view category badges.
- `src/SettingTab.ts`, `src/settings.ts`, `src/i18n.ts`: settings, category rules and English/Korean strings.

## Commands

- `npm test` — full Vitest suite.
- `npm run build` — TypeScript check, release guard and production bundle.
- `npm run lint` — ESLint.
- Run focused tests for changed behavior, then build; do not install packages unless dependencies are missing.

## On-demand references

- [Detailed architecture and correctness rules](./AGENTS-reference.md): consult for parser, file-write, settings, refresh, and test edge cases. Numbered references in older docs refer to this file.
- [UI/UX design guide](./design.md): read before changing views, modals, or CSS.
- [Open work](../TODO.md): only current, actionable items belong here.
- [Historical review findings](../docs/REVIEW-ARCHIVE.md): resolved or time-specific review context; verify before applying.
- [Archived release notes](../docs/CHANGELOG-ARCHIVE.md): older user-facing release history.
