# TODO

Outstanding findings from the repository review.

Each item is a defect with a concrete reproduction. Items are worked
through **one at a time**, and each fix is committed and pushed on its
own — see the commit history for the first batch of review fixes
(v0.5.2).

Conventions used below:

- **Severity** — how visible the defect is to a user, and how likely it
  is to cause data loss.
- **Status** — `open` until a fix is committed, then `done` with the
  commit hash.

> **There are no open findings.** Both review batches are complete and
> released: the first (14 findings) in v0.5.2, the second (5 findings) in
> v0.5.3. The dashboard metric tooltips followed in the same release.
>
> The findings below are kept as the **record** of what was wrong and why
> the fix looks the way it does — each one states the reproduction, the
> reasoning and the commit that fixed it. A future review should read them
> before changing the areas they touch.

---

## Findings (all resolved)

### 1. Image headings: the parser and the badge renderer disagree — **High**

- **Status:** done — fixed in the v0.5.3 review batch (commit `285316b`)
- **Location:** `src/parser.ts` — `normalizeHeadingText()`
- **Introduced by:** the v0.5.2 fix "make the parser recognize a link heading the way the DOM does" (commit `47fe231`)
- **Severity:** High — a regression that re-creates the exact class of
  defect the parser/badge agreement rule in `.agents/AGENTS.md` §1.3
  exists to prevent

**What happens**

`normalizeHeadingText()` replaces an image with its alt text, so the
parser reads a heading of `![Event](y.png)` as the text `Event` and
opens an Event section for it. The reading view does not do that: a
rendered `<h1><img alt="Event" src="y.png"></h1>` has a `textContent` of
`""` — the empty string, not `Event`. The badge renderer therefore does
**not** open the section.

The two sides disagree about the same file, in the opposite direction
from the disagreement fix 11 set out to remove.

**Reproduction**

```ts
const config = { text: "Event", level: 1 };
const content = "# ![Event](y.png)\n- 09:00 - 10:00 [Work] a\n# Other\n- 11:00 - 12:00 [Rest] b";

findEventBlockInContent(content, config);   // { start: 0, end: 1 }  — parser OPENS the section
isWithinEventHeading([{ level: 1, text: "" }], config); // false     — DOM side does NOT
```

**Fix**

Strip the image markup instead of substituting its alt text, so an image
heading normalizes to the empty text the DOM exposes. Keep the link
handling as it is — a link's label *is* its rendered text, and that part
of fix 11 is correct.

**Test to add**

Pin the parser and the DOM together for an image heading: assert that
`normalizeHeadingText("![Event](y.png)")` equals the `textContent` of
the equivalent rendered `<h1>`. A regression test in
`src/parser.test.ts` plus a matching DOM-level case in
`src/categoryBadges.reading.test.ts` is the shape that caught this.

**Resolution**

`stripInlineMarkup()` now removes image markup entirely (both the
inline and the reference-style form) instead of substituting its alt
text, so `![Event](y.png)` normalizes to `""` — the same text the
rendered `<h1>` exposes. Links keep their label, which is correct: a
link's label *is* its rendered text.

Tests added:
- `src/parser.test.ts` — the image heading normalizes to `""`, a
  heading that is only an image does **not** match the configured
  heading, a link heading still matches, and an image inside a code span
  is left alone.
- `src/categoryBadges.reading.test.ts` — a DOM-level case asserting
  that an image heading opens no section, plus a **cross-check** that
  pins the parser to the DOM: `normalizeHeadingText(raw)` must equal
  the `textContent` of the equivalent rendered heading, for both the
  image and the link form.

`.agents/AGENTS.md` §1.3 now states the image rule explicitly (an image
normalizes to the empty string, not to its alt text), and §4 lists the
new required reading-view coverage.

---

### 2. "Daily Avg" divides by notes, not by days in the window — **Medium**

- **Status:** done — fixed in the v0.5.3 review batch (commit `8f53ee3`)
- **Location:** `src/dashboardCollector.ts` — `avgEventMinutesPerDay`
- **Severity:** Medium — a misleading statistic, no data loss

**What happens**

`activeDaysCount` is the number of *notes* inside the selected window,
so the "Daily Avg" figure is an average per **note**, not per **day**.
Ten 60-minute notes inside a 30-day window report 60m/day, whereas a
per-calendar-day figure would be 20m. A day with no note is not a day on
which nothing was recorded — it is a day that was not recorded at all.

The label does not say which of the two is meant, so the number is
uninterpretable as presented.

**Reproduction**

```ts
const days = 10; // ten notes, each with one 60-minute Event
// → recentEventMinutes: 600
// → avgEventMinutesPerDay: 60   (per active day, 10)
// → per calendar day in a 30-day window: 20
```

**Fix**

Decide which meaning is intended and make the label match it. If it is
a per-calendar-day figure, divide by the number of days in the window
rather than by the number of notes.

**Resolution**

*Decided:* the figure is the **total recorded time divided by the
number of notes with recorded time** — i.e. it is an average over the
days that actually recorded something, and NOT a per-calendar-day
average (a day with no note is a day that was not recorded at all, not
a day that recorded zero).

Because a daily note **is** a day (`YYYY-MM-DD.md`, one per date), the
"Daily Avg" label stays accurate: the denominator is a count of days.
The old code was wrong even against that intent, because it divided by
the number of *notes* rather than by the number of notes that recorded
time — so a note that existed but recorded nothing was counted as a
zero-minute day and dragged the average down.

`computeDashboardStats` now counts the **distinct dates** whose note
recorded at least one minute, and divides by that:

- a note that recorded nothing is excluded (it is a day that recorded
  nothing, not a day that recorded a zero);
- two files carrying the same date (`2026-07-14.md` and
  `archive/2026-07-14.md`) count as **one** day;
- a window where nothing recorded time reports `0`, not a division by
  an empty set.

Tests added in `src/dashboardCollector.test.ts` (`"divides by the days
that recorded time, not by the number of notes"`, `"excludes a note
that recorded no time from the denominator"`, `"counts two files
carrying the same date as one day"`, and the zero case), and
`.agents/AGENTS.md` §1.8 now states the rule.

---

### 3. "Total Notes" and "Date Range" still count future-dated notes — **Medium**

- **Status:** done — fixed in the v0.5.3 review batch (commit `05afe8f`)
- **Location:** `src/dashboardCollector.ts` — `computeDashboardStats()`,
  `src/DashboardView.ts` — the empty-vault check
- **Related to:** the v0.5.2 fix "exclude future-dated notes from the
  dashboard window" (commit `6100189`)
- **Severity:** Medium — an internal inconsistency in the same dashboard

**What happens**

The period totals now exclude notes dated after today, but the
vault-wide figures do not. `totalNotes` still counts them, and
`newestDate` still reports one. The dashboard can therefore show
"Total Notes: 2" and a date range ending 2026-07-31 while its own time
figures ignore that note entirely.

Separately, the "no daily notes yet" empty state only appears when the
vault contains **no** notes at all. A vault holding only future-dated
notes shows an empty state that never appears and a dashboard full of
zeros.

**Reproduction**

```ts
const dates = [new Date(2026, 6, 14), new Date(2026, 6, 31)];
computeDashboardStats(dates, [{ date: dates[0], parsed: { timeline: [] } }], dates[0]);
// → totalNotes: 2, newestDate: 2026-07-31
// → but the period totals ignore the 2026-07-31 note
```

**Fix**

Apply the same future-date bound to the vault-wide counts, or make the
difference explicit in the labels. Also decide what the dashboard should
show when a vault contains only future-dated notes.

**Resolution**

*Decided:* future-dated notes are **excluded** from the vault-wide
figures, and a vault holding only future-dated notes shows a **notice**
rather than a dashboard of unexplained zeros.

- The future bound is now ONE shared rule — `isOnOrBeforeToday()` in
  `src/dashboardCollector.ts` — applied to the period window
  (`isWithinRecentWindow`), to the vault-wide figures (`totalNotes`,
  `oldestDate`, `newestDate`, the streak), and to `recentParsed` inside
  `computeDashboardStats` itself. Applying it inside the collector as
  well makes the function self-consistent whatever the caller passes in,
  so the period figures and the vault-wide figures can never disagree
  about which notes count.
- The bound is a **calendar-day** bound — the time of day is irrelevant.
- The streak is now computed from the same filtered set, so a
  future-dated note cannot extend it either.
- `DashboardView` distinguishes the two empty-ish states: a vault with no
  daily notes at all keeps the "No daily notes yet." state, while a
  vault with only future-dated notes shows the new
  `dashboardFutureOnlyNotice` message, explaining that those days have
  not arrived yet so nothing is counted until they do.

Tests added in `src/dashboardCollector.test.ts` (a new
`"computeDashboardStats — future-dated notes"` block plus the
`isOnOrBeforeToday` block), and `.agents/AGENTS.md` §1.8 now states the
rule.

---

### 4. A zero-length range counts as a full day — **Low**

- **Status:** done — fixed in the v0.5.3 review batch (commit `78b0aeb`)
- **Location:** `src/parser.ts` — `timelineDurationMinutes()`
- **Severity:** Low — needs an unusual hand-written value, but the
  reported number is 24 hours off by the largest amount possible

**What happens**

The overnight check is `endMinutes <= startMinutes`, so an Event whose
start equals its end (`09:00 - 09:00`) is treated as crossing midnight
and counts as **1440 minutes**. `timelineDaySegments()` correctly
returns no segment for the same range, so the grid draws nothing while
the dashboard reports 24 hours of recorded time.

**Reproduction**

```ts
timelineDurationMinutes({ start: "09:00", end: "09:00" }); // 1440 — expected 0
```

**Fix**

Treat `endMinutes === startMinutes` as zero rather than as an overnight
range: the overnight branch should be `endMinutes < startMinutes`.

**Resolution**

The overnight branch is now `endMinutes < startMinutes`, so a
zero-length range counts as 0 minutes — agreeing with
`timelineDaySegments()`, which draws no segment for it.

Test added in `src/parser.test.ts` (`"counts a zero-length range as
zero, not as a full day"`), and `.agents/AGENTS.md` §1.4 now states
the rule explicitly.

---

### 5. `recentNotesTitle` is a dead translation key — **Low**

- **Status:** done — fixed in the v0.5.3 review batch (commit `5f035d4`)
- **Location:** `src/i18n.ts` — `recentNotesTitle` (English and Korean)
- **Severity:** Low — dead code only

**What happens**

`recentNotesTitle` ("Recent Notes" / "최근 노트") is defined in both
languages but never used — the dashboard shows `activityNotesTitle`
("Recent Note Activities") instead. `i18n.test.ts` asserts that both
languages carry an identical key set, so the dead key cannot simply be
dropped from one side.

**Fix**

Delete the key from the `UIStringKey` union and from both language
tables, keeping the two key sets in step.

**Resolution**

The key is removed from the `UIStringKey` union and from both the
English and the Korean tables, so the two key sets stay in step.

A new `i18n.test.ts` case now guards against this class of dead code:
it scans the source tree for every key's use as a quoted literal and
fails if any key is declared but never referenced. The `UIStringKey`
union itself is excluded from that scan — it is the definition site,
not a use. This makes the dead key impossible to reintroduce unnoticed,
which is what the "drop it from one side" constraint made hard before.

---

## Done

### Dashboard metric tooltips — v0.5.3

Raised as a question rather than a defect: *is there any info on what
each metric means anywhere in the plugin UI?* There was not — not in the
dashboard, not in the sidebar, not in the README, and not in
`.agents/design.md`. Every figure was a bare label ("Total Notes",
"Current Streak", "Date Range", "Event Time", "Daily Avg", "Top
Category") with nothing saying how the number beside it was computed.
That ambiguity is exactly why the "Daily Avg" denominator defect
(findings #2 and #3 above) stayed invisible to users.

Each metric label now carries a tooltip explaining how it is computed,
attached with Obsidian's `setTooltip()`. The explanations live in new
`tipStat*` i18n keys (English and Korean), and the labels get
`cursor: help` so they look hoverable.

| Commit | Change |
|--------|--------|
| `d361c75` | Tooltips on every KPI label and Period Summary row |
| `d77fa09` | `cursor: help` on the KPI footer, so it looks hoverable too |
| `e123f9b` | Test DOM mock now matches Obsidian's `DomElementInfo` |

The mock fix came out of rendering the real dashboard to static HTML
and looking at it: the window dropdown showed "Last 7 Days" while the
metrics said "Event Time (30)". Production code was correct — it passes
`value` to `createEl` — but the mock dropped the field, so the select
fell back to the option's *text*. A test asserting on that dropdown
would have asserted on the wrong thing.

### Second review batch — released in v0.5.3

All 5 findings listed above were fixed, each in its own commit:

| # | Severity | Finding | Commit |
|---|----------|---------|--------|
| 1 | High | Image headings: the parser and the badge renderer disagree | `285316b` |
| 2 | Medium | "Daily Avg" divides by notes, not by days in the window | `8f53ee3` |
| 3 | Medium | "Total Notes" and "Date Range" still count future-dated notes | `05afe8f` |
| 4 | Low | A zero-length range counts as a full day | `78b0aeb` |
| 5 | Low | `recentNotesTitle` is a dead translation key | `5f035d4` |

See the v0.5.3 changelog entry in `README.md` for the user-facing
description of each change. The rules the fixes established are recorded
in `.agents/AGENTS.md` (§1.3, §1.4, §1.8, §2, §4), and each fix ships
with a regression test that fails without it.

### First review batch — released in v0.5.2

All 14 findings from the first review were fixed, each in its own
commit. See the v0.5.2 changelog entry in `README.md` for the
user-facing description of each change.
