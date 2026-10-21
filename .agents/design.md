# Daily Time Log — UI/UX Design Guide

> This document collects the design principles and component specs to consult when implementing the plugin UI.
> For the full set of development rules, see [`AGENTS.md`](./AGENTS.md).

> [!NOTE]
> Sections marked *(historical)* describe the 0.1.0–0.2.x implementation. They are kept because they explain why the current design looks the way it does — the Calendar and the To-Do section were both removed, and the current spec grew out of them. They are **not** a description of the plugin today.

---

## Design Principles

1. **Pastel colors** — low-saturation soft pastels instead of vivid primary colors, to reduce eye strain.
2. **Obsidian's native controls first** — buttons use Obsidian's default styling and semantic classes (`.mod-cta`, `.mod-warning`).
3. **Native modals first** — title, background, overlay and default buttons use Obsidian's `Modal` styling.
4. **Popups follow the Obsidian theme** — Obsidian's default `Modal` styling and active theme. See §3 for details.
5. **Obsidian CSS variables first** — the sidebar and the central dashboard view use Obsidian variables such as `--text-normal` and `--background-secondary` so they follow the active theme.
6. **Multi-language support (EN / KO)** *(added)* — the default follows Obsidian's UI language, and English/Korean can be selected explicitly in the plugin settings. Only the **UI strings** switch according to the configured language — the Event heading is part of the note FORMAT, not a UI string, so it never changes with the interface language (AGENTS.md §2). See §9 for details.
7. **Theme consistency** — the sidebar, the dashboard and the modals all follow the Obsidian theme. Only the category colors are kept as user-configured data.
8. **The category pastel palette is identical to DayTime Tracker's defaults** *(confirmed 2026-08-05)* — the 5-color palette in §2.1 was confirmed to match DayTime Tracker's `DEFAULT_CATEGORIES` (Work/Study/Rest/Reading/Exercise) color values exactly. When porting the category feature, reuse this palette as the default category colors as-is.

---

## 1. Sidebar Inline Input

> [!IMPORTANT]
> *(decided 2026-08-05)* The "list + modal" input approach in §1.1 below **is replaced by the grid drag approach** in §1.2. §1.1 is kept for reference only — the replacement has shipped. Note that the To-Do half of §1.1 was removed entirely in 0.5.0 (see §1.3).

> An interface for recording timeline entries **directly in the right sidebar**, without opening the markdown editor.
> Design reference: the DayTime Tracker colour-palette mockup.

### 1.1 Feature scope *(historical — 0.1.0–0.2.x, superseded by §1.2)*

| Feature | How to reach it | Result |
|---|---|---|
| **Add a To-Do item** | Type text into the inline input at the bottom of the To-Do section and press Enter | Appends `- [ ] text` to the end of the file's `# _ToDo` block |
| **Delete a To-Do item** | Click the ✕ button that appears on hover → confirmation popup | Removes that line from the file |
| **Add a timeline entry** | Click the "+ Add" button in the timeline section → modal | Appends `- HH:mm - HH:mm description` to the end of the Event block's own content (the configured Event heading, just before any subheading) |
| **Edit/delete a timeline entry** | Click an existing entry → edit modal | Edits or removes that line |

> [!NOTE]
> File writes always go through `plugin.writeFile()` (main.ts) — which includes the self-write event guard (AGENTS.md §3)

### 1.2 Grid drag input *(shipped — ported from DayTime Tracker)*

| Feature | How to reach it | Result |
|---|---|---|
| **Add a timeline entry** | Drag-select cells on the grid (10-minute cells) → the modal opens automatically (start/end times pre-filled) | Pick a category and write a note, then save → appends `- HH:mm - HH:mm [Category] note` to the end of the Event block's own content (AGENTS.md §1.4.1) |
| **Edit/delete a timeline entry** | Click a colored block on the grid → edit modal (with a delete button) | Edits or removes that line |

- The data source and write path are **the same `parser.ts` body parsing + `plugin.writeFile()` as before**, not DayTime Tracker's frontmatter approach (AGENTS.md §1.1) — this is the single most important caveat when porting.
- The category chip UI, the color calculation (`getTextColorForBackground`) and the drag-cell selection logic are ported as-is from DayTime Tracker's `TimelineView.tsx` / `TimelineModal.tsx`.

### 1.3 To-Do section — removed in 0.5.0

The To-Do feature no longer exists. To-Do parsing, the sidebar To-Do panel, the dashboard's To-Do completion metric and the To-Do export were all removed, and the `TodoItem` type, `parseTodo`, `todoRangeMatches` and `todoLineMatches` were deleted from `parser.ts`.

Checkbox lines (`- [ ]` / `- [x]`) are now **ordinary note content**: they are never parsed as tasks, never rendered in the sidebar and never counted in dashboard metrics. The parser still recognizes a checkbox line as a "top-level" shape so that it is not silently absorbed as an Event's continuation text (AGENTS.md §1.4.2).

> [!NOTE]
> The §1.1 rows and the §4.1 / §5 layout blocks that mention a To-Do section are historical records of the removed feature, not a spec for building it again.

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

### 4.1 To-Do Section *(historical — removed in 0.5.0, see §1.3)*

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
│ Delete this event?         │  ← font-size: 12px, color: #4a5568
│                            │
│              [Cancel]  [OK] │
└────────────────────────────┘
```

- Width: `280px`
- Inherits the Obsidian `Modal` class → newly created under `src/modals/`
- `ConfirmDeleteModal` is **generic and presentational** — the caller owns the title, message and button labels, so the same modal serves every destructive action. The copy comes from the i18n table (`confirmDeleteEvent`).

---

## 5. Sidebar Layout Changes

> [!IMPORTANT]
> *(decided 2026-08-05)* The Calendar is removed entirely — the feature of jumping to a specific date is gone. The "after" layout below was planned when this document was first written (under the assumption that the calendar was kept), so it **is no longer valid**. See §5.1 for the current layout.

**Initial (before 0.1.0)**
```
Calendar
├── Timeline list (read-only)
└── To-Do list (checkbox toggling only)
```

**0.1.0~0.2.x (calendar kept — historical)**
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

### 5.1 Current layout *(shipped — ported from DayTime Tracker)*

```
┌─────────────────────────────────────────┐
│ Date header (e.g. 2026-08-05 (Tue))      │  [Today]
├─────────────────────────────────────────┤
│ 00 AM │▢▢▢▢▢▢                          │
│ 01 AM │▢▢▢▢▢▢                          │  ← 10-minute grid, drag to select
│  ...  │  [category-colored block]        │     (§1.2)
│ 23 PM │▢▢▢▢▢▢                          │
└─────────────────────────────────────────┘
```

- Without the Calendar, the sidebar always reflects **only the currently active file**. If there is no active file, or it is not a daily note, only the empty-state message and the "open/create today's note" button are shown (§1.2, AGENTS.md §3 "New Daily Note Creation & Confirmation Policy").
- The grid's display range follows the `startHour`/`endHour` settings (AGENTS.md §2).
- There is **no To-Do panel** — the feature was removed in 0.5.0 (§1.3).

---

## 6. CSS Class Naming

All classes use the `dwl-*` prefix. The table below lists the classes that are **not** obvious from their name — the full list lives in `styles.css`.

| Class | Description |
|---|---|
| `dwl-section` | Shared section wrapper |
| `dwl-section-header` | Section header row (title) |
| `dwl-section-title` | Section header title text |
| `dwl-view-container` / `dwl-view` | The sidebar view and its inner container |
| `dwl-view-header` / `dwl-view-date-title` | Sidebar header and the date it shows |
| `dwl-missing-heading-banner` | "No Event section" banner (AGENTS.md §1.7) |
| `dwl-empty-state-block` | The empty state shown when there is no daily note to show |
| `dwl-category-chips` / `dwl-category-chip` / `dwl-category-chip-preview` | Category picker in the add/edit modal |
| `dwl-cat-badge` | The `[Category]` badge rendered in a note (also `dwl-cat-badge--<slug>` for the per-category variant) |
| `dwl-modal-body` / `dwl-modal-text` | Modal shell and its body text |
| `dwl-modal-field` / `dwl-modal-label` | A labelled modal field |
| `dwl-modal-time-row` / `dwl-modal-time-input` / `dwl-modal-textarea` | The time inputs and the description textarea |
| `dwl-modal-buttons` / `dwl-modal-btn-delete` | Modal button row, and the delete button |
| `dwl-category-setting-item` / `dwl-category-section-desc` | Per-category row and the section description in Settings |

> [!NOTE]
> The `dwl-todo-*` and `dwl-timeline-item` classes this table used to list no longer exist — the To-Do feature was removed in 0.5.0 (§1.3) and the timeline list was replaced by the grid. The modal's save/cancel buttons use Obsidian's own `.mod-cta` styling rather than project classes (§2.2).

### 6.1 Grid/category classes *(shipped — ported from DayTime Tracker)*

DayTime Tracker's `timeline-*` classes were ported with the **`dwl-` prefix** to match this project's conventions (`.timeline-grid` → `.dwl-grid`, `.timeline-cell` → `.dwl-grid-cell`, `.timeline-log-block` → `.dwl-grid-block`).

| Class | Description |
|---|---|
| `dwl-grid-wrap` | Outer wrapper around the whole grid |
| `dwl-grid` | The grid itself (one column per 10-minute cell) |
| `dwl-grid-row` | One hour's row |
| `dwl-grid-hour-label` / `dwl-grid-hour-num` / `dwl-grid-hour-ampm` | The hour label and its number/AM-PM parts |
| `dwl-grid-cells` | The cells of one hour row |
| `dwl-grid-cell` | A single 10-minute cell; `.is-selecting` marks it during a drag |
| `dwl-grid-block` | A rendered Event block on the grid |

**Grid gutter.** The gap between neighbouring Event blocks is set by the `--dwl-block-gap` custom property on `.dwl-grid` (default `5px`). It is applied as **geometry**, not as borders: the vertical gutter splits the gap above and below each block (`height: calc(100% - var(--dwl-block-gap))`, `top: calc(var(--dwl-block-gap) / 2)`), and the horizontal gutter insets each block by half a gap on either side (the inline `left`/`width` `calc()` offsets in `TimelineView.tsx`). Both axes read the same property, so the horizontal and vertical gutters always match. Borders are deliberately avoided here, because Chrome floors fractional border widths to whole pixels and the two axes would drift apart.

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
| **2** | To-Do inline add input | `components/TodoList.ts`, `view.ts`, `styles.css` | ✅ done (removed in 0.5.0) |
| **3** | To-Do ✕ delete + confirmation popup | `components/TodoList.ts`, `modals/ConfirmDeleteModal.ts` | ✅ done (removed in 0.5.0) |
| **4** | Timeline "+ Add" modal | `modals/TimelineModal.tsx`, `components/TimelineView.tsx` | ✅ done |
| **5** | Click a timeline entry → edit modal | `components/TimelineView.tsx`, `modals/TimelineModal.tsx` | ✅ done |
| **6** | Apply the full CSS styling | `styles.css` | ✅ done |
| **7** | Grid drag input + category chips (the DayTime Tracker port) | `components/TimelineView.tsx`, `modals/TimelineModal.tsx`, `styles.css` | ✅ done |

Each phase builds and tests independently.

> [!NOTE]
> The §7 checklist (re-read → re-validate the line → abort on mismatch → write → refresh) was extracted into reusable pure functions during implementation: `timelineLineMatches` (line re-validation) and `appendLineToBlock` / `replaceLineRangeAt` / `removeLineRangeAt` (the add/edit/delete themselves) in `parser.ts`. All are unit-tested without any Obsidian API dependency (`parser.test.ts`).

> [!IMPORTANT]
> *(2026-08-05)* The table above is the phase record from the 0.1.0~0.2.x (list + calendar) implementation. The grid + category port that followed it **also shipped** — phase 7 above records it. The To-Do phases (2 and 3) describe a feature that was removed in 0.5.0 (§1.3); `TodoList.ts` no longer exists.

---

## 9. Multi-language (i18n) UI Strings

> This is a **separate concern** from the parser's heading recognition (AGENTS.md §1.3). The parser recognizes exactly ONE configured heading, whatever the interface language; what is covered here are the **on-screen strings** shown in the sidebar (button labels, section titles, placeholders, modal text, etc.), which follow the single configured language.

### 9.1 Structure

- `src/i18n.ts` defines the `STRINGS: Record<"en" | "ko", Record<string, string>>` constant and the `t(key: string): string` helper. `t()` returns the current language's string for the given key.
- When the language setting (`SettingTab.ts`) changes, the sidebar must re-render (reuse the settings-change listener in `view.ts` or `refresh()`).
- Strings with a placeholder like `%s` are substituted with `t(key).replace('%s', value)`.

### 9.2 String key table

| Key | EN | KO |
|---|---|---|
| `modalAddTitle` | What did you do? | 무엇을 했나요? |
| `modalEditTitle` | Edit Daily Activity | 일과 수정 |
| `lblTimeSet` | Time Setting | 시간 설정 |
| `lblContent` | Content | 내용 |
| `descPlaceholder` | Enter detailed content. | 상세 내용을 입력해 주세요. |
| `btnSave` | Save | 저장 |
| `btnCancel` | Cancel | 취소 |
| `btnDelete` | Delete | 삭제 |
| `btnAdd` | Add | 추가 |
| `confirmTitle` | Notice | 알림 |
| `confirmDeleteEvent` | Delete this event? | 이 이벤트를 삭제하시겠습니까? |
| `confirmOk` | Confirm | 확인 |

The default language is `"auto"` (the same as `DEFAULT_SETTINGS` in `settings.ts`), which resolves to Obsidian's UI language; `"en"` and `"ko"` are explicit overrides that are preserved as saved.

> [!NOTE]
> The `STRINGS` map in `src/i18n.ts` is the **source of truth** — it has grown well past the original mockup-based table above (it now also carries the sidebar empty states, the dashboard's metric labels and tooltips, and the Settings screen). The table above lists the modal's strings only.

> [!NOTE]
> The To-Do keys this table used to list (`sectionTodo`, `todoPlaceholder`, `confirmDeleteTask`, `emptyEvent`, `headerToday`) were removed with the feature in 0.5.0 (§1.3). `i18n.test.ts` fails if a key is declared in one language and not the other, and fails if a key is never referenced — so the two tables cannot drift apart unnoticed.

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
| Total notes | Whole vault | Scans filenames (dates) only, does not read contents. Notes dated after today are excluded |
| Recording period (oldest ~ most recent) | Whole vault | Same as above. A note dated after today is excluded |
| Current streak (consecutive days) | Whole vault | Counting back from today until a break. 0 if there is no note for today |
| Total event time recorded | Selected window | Reads file contents (`app.vault.cachedRead`). The window is user-selectable (7d / 30d / 90d / All) |
| Daily average | Selected window | The window's total ÷ the number of distinct days that **recorded** time (AGENTS.md §1.8) |
| Top category | Selected window | The category with the most recorded time in the window |

**Performance consideration**: statistics that need to read file contents are limited to the selected window. Even if the vault has accumulated years of notes, opening the dashboard does not re-read everything — the "All Time" window is the only one that reads every daily note.

### 11.2 Layout

```
┌─────────────────────────────────────────┐
│ Work Insights        [window ▾] [Refresh]│
├─────────────────────────────────────────┤
│ [Total Notes]  [Event Time (30)]  [Top Category] │
├─────────────────────────────────────────┤
│ Time Distribution by Category             │
├───────────────────────┬─────────────────┤
│ Recent Note Activities │ Period Summary  │
└───────────────────────┴─────────────────┘
```

- KPI cards: `dwl-dashboard-kpi-card` (label + badge, value, and a footer sub-line)
- Clicking a recent-note list item opens that note via `workspace.openLinkText(file.path, "", false)`
- If there is not a single daily note, only the empty-state message (`dashboardEmptyVault`) is shown. If every daily note is dated in the **future**, a notice (`dashboardFutureOnlyNotice`) explains that those days have not happened yet

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
> *(confirmed 2026-08-05)* The Dashboard is **kept unchanged in both feature and implementation** through this restructuring. It is not a target of the React conversion either.

---

## 12. Ribbon Menu *(shipped)*

The two ribbon icons (`main.ts`):

| Icon | Tooltip | Action |
|---|---|---|
| `calendar-clock` | Open sidebar | `activateView()` |
| `gauge` | Open Work Insights | `activateDashboard()` |

> [!IMPORTANT]
> The sidebar's ribbon icon was explicitly requested because the entry point for opening the sidebar had disappeared (without a ribbon icon it was reachable only through the command palette). Be careful not to drop it by accident while restructuring the UI onto the grid.

> [!NOTE]
> The tooltips are **re-set on every language change** (`refreshViews()` calls `setTooltip` on both elements), because Obsidian has no live-update API for a ribbon icon's tooltip. The ribbon icon's own `title` attribute is set once at load.

---

## 13. Settings Screen *(shipped)*

`SettingTab.ts` uses section dividers (`.setHeading()`) and arranges the fields in this order:

1. **General**: start hour / end hour (grid display range, dropdowns), daily-note folder (text + folder autocomplete), Event heading text/level, language (dropdown, defaults to Auto)
2. **Category management**: reset-to-defaults button + a row per category (display-name text input, color picker, delete button for non-default categories) + an "add category" row (max 10 categories)

The settings tab shows the general settings and the category management. Sidebar colors use Obsidian theme variables; there is no separate setting for them.
