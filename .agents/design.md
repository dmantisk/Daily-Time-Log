# Daily Work Log — UI/UX Design Guide

> This document collects the design principles and component specs to consult when implementing the plugin UI.
> For code structure and architecture decisions, see [`implementation_plan.md`](../ref_docs/implementation_plan.md).
> For the full set of development rules, see [`AGENTS.md`](./AGENTS.md).

---

## Design Principles

1. **Pastel colors** — low-saturation soft pastels instead of vivid primary colors, to reduce eye strain.
2. **Obsidian's native controls first** — buttons use Obsidian's default styling and semantic classes (`.mod-cta`, `.mod-warning`).
3. **Native modals first** — title, background, overlay and default buttons use Obsidian's `Modal` styling.
4. **Popups follow the Obsidian theme** — Obsidian's default `Modal` styling and active theme. See §3 for details.
5. **Obsidian CSS variables first** — the sidebar and the central dashboard view use Obsidian variables such as `--text-normal` and `--background-secondary` so they follow the active theme.
6. **Multi-language support (EN / KO)** *(added)* — the default follows Obsidian's UI language, and English/Korean can be selected explicitly in the plugin settings. The parser always recognizes both languages' markers at once (AGENTS.md 1.3), so the UI strings switch according to the configured language, independently of that. See §9 for details.
7. **Theme consistency** — the sidebar, the dashboard and the modals all follow the Obsidian theme. Only the category colors are kept as user-configured data.
8. **The category pastel palette is identical to DayTime Tracker's defaults** *(confirmed 2026-08-05)* — the 5-color palette in §2.1 was confirmed to match DayTime Tracker's `DEFAULT_CATEGORIES` (Work/Study/Rest/Reading/Exercise) color values exactly. When porting the category feature, reuse this palette as the default category colors as-is.

---

## 1. Sidebar Inline Input

> [!IMPORTANT]
> *(decided 2026-08-05)* The "list + modal" input approach in §1.1 below **is replaced by the grid drag approach** (port from DayTime Tracker, see `ref_docs/TODO.md` §2.2/§3). This section is kept for reference until the replacement lands; the actual new spec is in §1.2.

> An interface for adding To-Dos and recording timeline entries **directly in the right sidebar**, without opening the markdown editor.
> Design reference: `DayTimeTracker_internal/ref_docs/designSample/color-palette-mockup.html`

### 1.1 Feature scope *(old approach — to be replaced)*

| Feature | How to reach it | Result |
|---|---|---|
| **Add a To-Do item** | Type text into the inline input at the bottom of the To-Do section and press Enter | Appends `- [ ] text` to the end of the file's `# _ToDo` block |
| **Delete a To-Do item** | Click the ✕ button that appears on hover → confirmation popup | Removes that line from the file |
| **Add a timeline entry** | Click the "+ Add" button in the timeline section → modal | Appends `- HH:mm - HH:mm description` to the end of the Event block's own content (the configured Event heading, just before any subheading) |
| **Edit/delete a timeline entry** | Click an existing entry → edit modal | Edits or removes that line |

> [!NOTE]
> File writes always go through `plugin.writeFile()` (main.ts) — which includes the self-write event guard (AGENTS.md §3)

### 1.2 New approach — grid drag input *(to be implemented, port from DayTime Tracker)*

| Feature | How to reach it | Result |
|---|---|---|
| **Add a timeline entry** | Drag-select cells on the grid (10-minute cells) → the modal opens automatically (start/end times pre-filled) | Pick a category and write a note, then save → appends `- HH:mm - HH:mm [Category] note` to the end of the Event block's own content (AGENTS.md §1.4.1) |
| **Edit/delete a timeline entry** | Click a colored block on the grid → edit modal (with a delete button) | Edits or removes that line |
| **Add/delete a To-Do item** | The collapsible To-Do panel at the bottom keeps §1.1's inline input / ✕ delete behaviour | Unchanged |

- The data source and write path are **the same `parser.ts` body parsing + `plugin.writeFile()` as before**, not DayTime Tracker's frontmatter approach (AGENTS.md §1.1, `ref_docs/TODO.md` §6.1 — the single most important caveat when porting).
- The category chip UI, the color calculation (`getTextColorForBackground`) and the drag-cell selection logic are ported as-is from DayTime Tracker's `TimelineView.tsx` / `TimelineModal.tsx`.

---

## 2. Color System

### 2.1 Category Pastel Palette

These are the default category colors stored in `settings.ts`, not theme colors or CSS variables. Users can change them in settings; category blocks and badges intentionally retain their configured colors across Obsidian themes. Text contrast is calculated from each configured color.

### 2.2 Buttons and controls

Use Obsidian's native styles for modal actions: `.mod-cta` for save/confirm and `.mod-warning` for destructive actions. Other controls should inherit Obsidian's active-theme styling.

---

## 3. Modal Styling Principles

The modal shell, title, background, overlay and default buttons use Obsidian `Modal`'s native styling. Additional CSS is used only for content layout and input sizing, and references Obsidian CSS variables for colors. The save/delete actions use Obsidian's `.mod-cta` / `.mod-warning` styles respectively.

---

## 4. Component Layout

### 4.1 To-Do Section

```
┌─────────────────────────────────────────┐
│ Today's To-Dos   3                        │  ← section header
├─────────────────────────────────────────┤
│ [Add a new to-do... (Enter)]            │  ← inline input (pinned to top)
│                                         │
│  ☑  Prepare the work meeting (strikethrough)  ✕│  ← completed item
│  ☐  Read for 1 hour                     ✕│  ← ✕ appears on hover
│  ☐  Light stretching                    ✕│
└─────────────────────────────────────────┘
```

**Inline input behaviour**
- `Enter` → if there is text, append `- [ ] text` to the file and reset the input
- `Escape` / blur → cancel and reset the input
- Enter on an empty string → ignored

**✕ delete button behaviour**
- Normally: `opacity: 0`, no background
- On item hover: `opacity: 1`, text color `#bfbfbf`
- On button hover: text color `#ef4444` (no background change)
- On click: open the confirmation popup

### 4.2 Add/Edit Timeline Entry Modal

```
┌─────────────────────────────────────────┐
│ What did you do?                         │  ← title (black)
├─────────────────────────────────────────┤
│ Time Setting                             │
│ [09:00]           [10:00]                │  ← start / end
│                                         │
│ Content                                  │
│ [Enter detailed content.                ]│  ← textarea (vertical resize)
│                                         │
│ [Delete]                 [Cancel] [Save] │
└─────────────────────────────────────────┘
```

| Field | Type | Format | Validation |
|---|---|---|---|
| Start time | `<input type="text">` | `HH:mm` | `TIME_VALUE_REGEX` from `parser.ts` (checks the hour 00-23 and minute 00-59 ranges — the digit-count-only `/\d{1,2}:\d{2}/` was discarded because it also let `99:99` through) |
| End time | `<input type="text">` | `HH:mm` | Same as above |
| Content | `<textarea>` | Free text | None (empty values allowed) |

- **Delete button**: hidden when adding, shown when editing
- **Save result**: appended to the end of the Event block's own content in the `- HH:mm - HH:mm content` format (right below the configured Event heading, before any subheading)
- **Edit**: that line is replaced in place (after re-validating the line index)

### 4.3 Confirmation Popup

```
┌────────────────────────────┐
│ Notice                      │  ← black title, font-size: 14px
│                            │
│ Delete the to-do            │  ← font-size: 12px, color: #4a5568
│ 'Read for 1 hour'?          │
│                            │
│              [Cancel]  [OK] │
└────────────────────────────┘
```

- Width: `280px`
- Inherits the Obsidian `Modal` class → newly created under `src/modals/`

---

## 5. Sidebar Layout Changes

> [!IMPORTANT]
> *(decided 2026-08-05)* The Calendar is removed entirely — the feature of jumping to a specific date is gone (`ref_docs/TODO.md` §4). The "after" layout below was planned when this document was first written (under the assumption that the calendar was kept), so it **is no longer valid**. See §5.1 for the current layout.

**Initial (before 0.1.0)**
```
Calendar
├── Timeline list (read-only)
└── To-Do list (checkbox toggling only)
```

**0.1.0~0.2.x (calendar kept — obsolete)**
```
Calendar
├── Timeline section
│   ├── Header ("_Event") + [+ Add] button
│   ├── Entry list (click → edit modal)
│   └── Empty-state message
└── To-Do section
    ├── Header ("_ToDo") + count
    ├── Inline input (pinned to top)
    └── Entry list (checkbox + ✕ button)
```

### 5.1 New layout *(to be implemented, port from DayTime Tracker)*

```
┌─────────────────────────────────────────┐
│ Date header (e.g. 2026-08-05 (Tue))      │  [Today]
├─────────────────────────────────────────┤
│ 00 AM │▢▢▢▢▢▢                          │
│ 01 AM │▢▢▢▢▢▢                          │  ← 10-minute grid, drag to select
│  ...  │  [category-colored block]        │     (§1.2)
│ 23 PM │▢▢▢▢▢▢                          │
├─────────────────────────────────────────┤
│ Today's To-Dos  (2/5)                ▼   │  ← collapsible To-Do panel (pinned to bottom)
│  [Add a new to-do...]                     │
│  ☑ ...  ☐ ...                          │
└─────────────────────────────────────────┘
```

- Without the Calendar, the sidebar always reflects **only the currently active file**. If there is no active file, or it is not a daily note, only the empty-state message and the "open/create today's note" button are shown (§1.2, AGENTS.md §3 "New Daily Note Creation & Confirmation Policy").
- The grid's display range follows the `startHour`/`endHour` settings (AGENTS.md §2).

---

## 6. CSS Class Naming

Keep the existing `dwl-*` prefix and add the new classes:

| Class | Description |
|---|---|
| `dwl-section` | Shared section wrapper for timeline/To-Do |
| `dwl-section-header` | Section header row (title + button) |
| `dwl-section-add-btn` | "+ Add" button |
| `dwl-todo-input-wrap` | To-Do inline input wrapper |
| `dwl-todo-input` | The actual `<input>` element |
| `dwl-todo-delete-btn` | ✕ delete button |
| `dwl-timeline-item` | Individual timeline entry (clickable) |
| `dwl-modal-time-input` | Time input field inside the modal |
| `dwl-modal-btn-save` | Save/confirm button |
| `dwl-modal-btn-cancel` | Cancel button |
| `dwl-modal-btn-delete` | Delete button |

### 6.1 New grid/category classes *(to be implemented)*

Port DayTime Tracker's `timeline-*` classes, but rename them with the **`dwl-` prefix** to match this project's conventions (e.g. `.timeline-grid` → `.dwl-grid`, `.timeline-cell` → `.dwl-grid-cell`, `.timeline-log-block` → `.dwl-grid-block`, `.timeline-todos-container` → reuse the existing `dwl-section`). The exact mapping is finalized when the CSS is ported.

---

## 7. File-Write Safety Checklist

> [!IMPORTANT]
> Every write operation (add/edit/delete) must follow this order.

1. `app.vault.read(currentFile)` — re-read the latest content
2. Re-validate the line index — check that `lines[item.line]` still matches what was expected
3. On mismatch → abort the write and call `refresh()` (re-sync the UI)
4. `plugin.writeFile(file, newContent)` — includes the self-write guard
5. Call `refresh()`

---

## 8. Implementation Phases (in priority order)

| Phase | Work | Affected files | Status |
|---|---|---|---|
| **1** | `src/i18n.ts` — EN/KO string tables + the `t()` helper | `src/i18n.ts` | ✅ done |
| **2** | To-Do inline add input | `components/TodoList.ts`, `view.ts`, `styles.css` | ✅ done |
| **3** | To-Do ✕ delete + confirmation popup | `components/TodoList.ts`, `modals/ConfirmDeleteModal.ts` | ✅ done |
| **4** | Timeline "+ Add" modal | `modals/EventEntryModal.ts`, `components/Timeline.ts` | ✅ done |
| **5** | Click a timeline entry → edit modal | `components/Timeline.ts`, `modals/EventEntryModal.ts` | ✅ done |
| **6** | Apply the full CSS styling | `styles.css` | ✅ done |

Each phase builds and tests independently. (The modal filename is unified as `EventEntryModal.ts`, consistent with the `_TimeTracker Line` → `_Event` marker rename — `task.md` already reflects this name)

> [!NOTE]
> The §7 checklist (re-read → re-validate the line → abort on mismatch → write → refresh) was extracted into reusable pure functions during implementation: `todoLineMatches` / `timelineLineMatches` (item 2: line re-validation) and `appendLineToBlock` / `replaceLineAt` / `removeLineAt` (the add/edit/delete themselves) in `parser.ts`. All are unit-tested without any Obsidian API dependency (`parser.test.ts`).

> [!IMPORTANT]
> *(2026-08-05)* The table above is the phase record from the 0.1.0~0.2.x (list + calendar) implementation. **The phased plan for the grid + category port is managed in [`ref_docs/TODO.md`](../ref_docs/TODO.md) §3 instead of updating this table** (to avoid duplicated sources of truth — the same principle as the document header's note about code structure/architecture decisions).

---

## 9. Multi-language (i18n) UI Strings

> This is a **separate concern** from the parser's multi-language marker recognition (AGENTS.md 1.3). The parser always recognizes EN/KO markers at once, but what is covered here are the **on-screen strings** shown in the sidebar (button labels, section titles, placeholders, modal text, etc.), which follow the single configured language.

### 9.1 Structure

- `src/i18n.ts` defines the `STRINGS: Record<"en" | "ko", Record<string, string>>` constant and the `t(key: string): string` helper. `t()` returns the current language's string for the given key.
- When the language setting (`SettingTab.ts`) changes, the sidebar must re-render (reuse the settings-change listener in `view.ts` or `refresh()`).
- Strings with a placeholder like `%s` (`confirmDeleteTask`) are substituted with `t(key).replace('%s', value)`.

### 9.2 String key table (based on the mockup)

| Key | EN | KO |
|---|---|---|
| `sectionEvent` | ⏱ Event | ⏱ 이벤트 |
| `sectionTodo` | ☑ To-Do | ☑ 할 일 |
| `btnAdd` | + Add | + 추가 |
| `btnToday` | Today | 오늘 |
| `todoPlaceholder` | Add new task... (Enter) | 새로운 할 일 추가... (Enter) |
| `modalAddTitle` | What did you do? | 무엇을 했나요? |
| `modalEditTitle` | Edit Event | 이벤트 수정 |
| `lblTimeSet` | Time | 시간 설정 |
| `lblContent` | Content | 내용 |
| `descPlaceholder` | Enter details (optional). | 상세 내용을 입력해 주세요. |
| `btnSave` | Save | 저장 |
| `btnCancel` | Cancel | 취소 |
| `btnDelete` | Delete | 삭제 |
| `confirmTitle` | Notice | 알림 |
| `confirmDeleteTask` | Delete '%s'? | '%s' 할 일을 삭제하시겠습니까? |
| `confirmDeleteEvent` | Delete this event? | 이 이벤트를 삭제하시겠습니까? |
| `confirmOk` | OK | 확인 |
| `emptyEvent` | No events recorded. | 기록이 없습니다. |
| `headerToday` | Today | 오늘 |

The default language is `"auto"` (the same as `DEFAULT_SETTINGS` in `settings.ts`), which resolves to Obsidian's UI language; `"en"` and `"ko"` are explicit overrides that are preserved as saved.

> [!NOTE]
> During the actual implementation, items that were not in the table above (`emptyTodo`, `noActiveNote`, `noDescription`, `noteNotFoundConfirm`, `btnCreate`, `invalidTimeFormat`, `dashboardTitle`, and the §11 dashboard-related keys) turned out to be needed as well, and were added to `i18n.ts`. This table is the original spec based on the mockup; the source of truth is the `STRINGS` map in `src/i18n.ts`.

---

## 10. Theme Behaviour

The sidebar follows Obsidian's active theme. The CSS color tokens reference `--background-primary`, `--background-secondary`, `--background-modifier-hover`, `--background-modifier-border`, `--text-normal`, `--text-muted`, `--text-faint` and `--interactive-accent`. There is no separate sidebar theme setting.

### 10.1 Scope of Theming

| Target | Theme source | Setting |
|---|---|---|
| Sidebar (`view.ts`) | Obsidian active theme variables | None — follows the Obsidian theme as-is |
| Modals/popups (event/confirm) | Obsidian `Modal` default styling and theme variables | None — follows the Obsidian theme as-is |
| Dashboard (`DashboardView.ts`) | Obsidian's own theme variables | None — follows the Obsidian theme as-is |

### 10.2 Custom Category Colors

Category colors are user data stored in settings, and are applied to the timeline blocks and to the matching category badges. All other on-screen colors use Obsidian theme variables.

---

## 11. Dashboard View

> A screen that scans and summarizes every daily note in the vault. **It opens as a regular tab in the main workspace, not in the sidebar** (`activateDashboard()` → `workspace.getLeaf("tab")`).

### 11.1 Statistics

| Statistic | Calculation scope | Notes |
|---|---|---|
| Total notes | Whole vault | Scans filenames (dates) only, does not read contents |
| Recording period (oldest ~ most recent) | Whole vault | Same as above |
| Current streak (consecutive days) | Whole vault | Counting back from today until a break. 0 if there is no note for today |
| To-Do completion rate over the last 30 days | Last 30 days | **Only this statistic** reads actual file contents (`app.vault.cachedRead`) |
| Total event time recorded over the last 30 days | Last 30 days | Same as above, reusing `timelineDurationMinutes` (the overnight-event handling is the same) |

**Performance consideration**: statistics that need to read file contents are limited to the last 30 days (`getRecentWindowStart` in `dashboardCollector.ts`). Even if the vault has accumulated years of notes, opening the dashboard does not re-read everything.

### 11.2 Layout

```
┌─────────────────────────────────────────┐
│ Dashboard                       [Refresh] │
├─────────────────────────────────────────┤
│ [Total Notes]  [Current Streak]  [Date Range]   │
│ [Last 30d Completion]  [Last 30d Event Time]  │
├─────────────────────────────────────────┤
│ Recent Notes                                │
│  2026-07-14                              │
│  2026-07-13                              │
│  ...                                     │
└─────────────────────────────────────────┘
```

- Statistic cards: `dwl-dashboard-stat-card` (label + value)
- Clicking a recent-note list item opens that note via `workspace.openLinkText(file.path, "", false)`
- If there is not a single daily note, only the empty-state message (`dashboardEmptyVault`) is shown

### 11.2.1 Metric tooltips

Every metric label carries an explanation of **how the number is computed**, shown on hover.

A bare label ("Daily Avg", "Date Range", "Current Streak") does not say what the number beside it means, so the figure cannot be interpreted on its own. The explanation is a `tipStat*` key in `i18n.ts`, attached with Obsidian's `setTooltip()` to the **label** element — never to the value, which is the number itself. The label gets `cursor: help` so it looks hoverable.

A KPI card's **footer** (the sub-line under the value, e.g. "Daily Avg: 3h 30m") carries the tooltip explaining the metric it summarises, and gets `cursor: help` for the same reason.

| Metric | Tooltip explains |
|---|---|
| Total Notes | Counts daily notes dated on or before today; future-dated notes are excluded |
| Current Streak | Consecutive days with a note, counting back from today; 0 if today has none |
| Date Range | The oldest and the newest daily note in the vault |
| Event Time | The total time recorded across all Events in the selected window |
| Daily Avg | The average per day **that recorded time** — days whose note recorded nothing are not counted |
| Top Category | The category with the most recorded time in the selected window |

> [!NOTE]
> The "Daily Avg" row is the one that most needs it: the denominator is the days that recorded time, NOT the days in the window and NOT the number of notes. A day with no note is a day that was not recorded at all, not a day that recorded zero.

### 11.3 Theming

It follows the active theme using Obsidian's own theme variables.

> [!NOTE]
> *(confirmed 2026-08-05)* The Dashboard is **kept unchanged in both feature and implementation** through this restructuring. It is not a target of the React conversion either (`ref_docs/TODO.md` §2.1).

---

## 12. Ribbon Menu *(to be implemented)*

Keep the two ribbon icons (`main.ts`):

| Icon | Tooltip | Action |
|---|---|---|
| `calendar-clock` | Open DailyWorkLog | `activateView()` |
| `gauge` | Open the DailyWorkLog dashboard | `activateDashboard()` |

> [!IMPORTANT]
> This was explicitly requested because the entry point for opening the sidebar had disappeared (without a ribbon icon it was reachable only through the command palette). Be careful not to drop it by accident while restructuring the UI onto the grid — it is checked separately in `ref_docs/TODO.md` Phase 6.

---

## 13. Settings Screen Restructure *(to be implemented)*

Expand `SettingTab.ts` to match DayTime Tracker's field layout. Use section dividers (`.setHeading()`) and arrange the fields in this order:

1. **General**: start hour / end hour (grid display range, dropdowns), daily-note folder (text + folder autocomplete), language (dropdown, defaults to Auto)
2. **Category management**: reset-to-defaults button + a row per category (display-name text input up to 10 chars, color picker, delete button for non-default categories) + an "add category" row (max 10 categories)

The settings tab shows the general settings and the category management. Sidebar colors use Obsidian theme variables; there is no separate setting for them.
