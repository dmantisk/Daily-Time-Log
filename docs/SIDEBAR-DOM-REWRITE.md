# Vanilla sidebar rewrite

Branch: `feature/sidebar-vanilla-dom`  
Base: current `main` at `1d3356e` (`0.8.1`). The earlier draft cited `3b4dd19`,
which was not the checked-out `main` commit.

## Goal

Remove React from the sidebar bundle while preserving the Obsidian view
lifecycle, note editing safeguards, and existing desktop behavior. Keep
`isDesktopOnly: false`; mobile input is part of the supported UI.

## Architecture

1. `src/view.ts` is the thin `ItemView` lifecycle owner. It creates the
   controller in `onOpen()`, delegates `refresh()`, and destroys the controller
   in `onClose()`.
2. `src/components/TimelineController.ts` owns sidebar state, rendering,
   note reads/writes, modals, and pointer listener cleanup.
3. `src/timelineLogic.ts` owns dependency-free calculations: cell indexing,
   drag/tap time ranges, event-line formatting, touch-press movement threshold,
   and bar geometry.

Keep parsing/date behavior in `src/parser.ts` and `src/dailyNote.ts`. Do not
change the settings format or the `main.ts` refresh scheduling.

## Behavior to preserve

- 10-minute cells, configured start/end hours, date header/navigation,
  empty/missing-heading states, categories, tooltips, overlapping/overnight
  bars, and existing `dwl-*` classes.
- `parseDailyNote()`, `getEventHeadingConfig()`, and `cachedRead()` for note
  reloads.
- All writes use `plugin.writeFile()` after a `vault.read()`. Update/delete
  keep the `timelineRangeMatches()` guard. The plugin self-write guard remains
  unchanged.
- Async reloads use a load token so stale reads cannot overwrite newer state.
- `refresh()` remains callable from the existing `main.ts` scheduling and
  settings paths.
- Pop-out support uses the sidebar container's `ownerDocument` and
  `defaultView`; new DOM is created with `createDiv()` / `createEl()`.

## Pointer and touch behavior

- Ignore non-primary pointers. Release pointer capture on pointerdown when
  capture is held. Use `pointerenter` and a `pointermove` fallback that resolves
  the cell with the container document's `elementFromPoint()`.
- Mouse/pen selection starts immediately. Touch selection starts after a
  250 ms long press; movement beyond the small pre-press threshold cancels the
  timer so normal scrolling can proceed.
- A touch tap on an empty cell opens a 30-minute add range. Tapping an event
  block uses the existing edit flow.
- Set `touch-action: none` only after the touch long press arms selection, and
  clear it on pointerup, pointerleave, pointercancel, refresh, and destroy.
- Pointercancel clears pending timers and selection state. Pointerup outside
  the grid is handled by listeners owned and removed by the controller.
- Long-press feedback is the selection class and guarded `navigator.vibrate()`.
- On coarse-pointer devices, navigation controls and event blocks have at least
  44 px high hit targets. Widths remain responsive and use `rem`, percentages,
  and Obsidian theme variables.

## Implementation sequence

1. Capture the pre-change production bundle size and create/use the feature
   branch from the current `main`.
2. Extract pure timeline logic and unit tests while the old React view still
   exists.
3. Add the vanilla controller and wire the `ItemView` lifecycle.
4. Port behavior tests to happy-dom, covering drag/release/cancel, async read
   races, note writes, listener cleanup, long-press timing, touch taps, and
   pointermove hit testing.
5. Remove the React view/tests and React runtime/type dependencies; remove JSX
   compiler configuration and update this document.

Commit one verified step at a time. Keep the implementation scoped to the
sidebar; do not change the parser, date handling, dashboard collector, or
settings format.

## Validation results

- `npm test`: 267 tests passed.
- `npm run build`: passed.
- `npm run lint`: passed.
- Production `dist/main.js`: 196,784 bytes before the rewrite; 58,770 bytes
  after. Reduction: 138,014 bytes (70.13%).
- React / React DOM and their type packages are absent from the project
  dependencies. `tsconfig.json` no longer enables JSX.
- Automated pointer/timer tests passed in happy-dom. **Obsidian iOS/Android
  device testing was not available in this environment; do not treat the
  mobile behavior below as device-verified.**

## Manual phone checklist (Obsidian iOS and Android)

- Swipe the grid before long-pressing and confirm the sidebar scrolls normally.
- Long-press a cell, drag across hours, and confirm selection feedback appears.
- Tap an empty cell and confirm the add modal defaults to a 30-minute range.
- Tap an event block and confirm the edit modal opens.
- Rotate the device and confirm the grid remains usable at the narrower width.
- Trigger a system gesture during a drag and confirm cancellation leaves no
  stuck selection.
- Add, edit, and delete an event; confirm the daily note text is correct.

## References

- Sidebar lifecycle/controller: `src/view.ts`, `src/components/TimelineController.ts`
- Pure timeline calculations: `src/timelineLogic.ts`
- Dashboard DOM patterns: `src/DashboardView.ts`
- Parser/date logic: `src/parser.ts`, `src/dailyNote.ts`
- Refresh and settings: `src/main.ts`, `src/settings.ts`
- Design rules: `.agents/design.md`, `.agents/AGENTS-reference.md`
