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

---

## Open findings

### 1. Image headings: the parser and the badge renderer disagree — **High**

- **Status:** open
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

---

### 2. "Daily Avg" divides by notes, not by days in the window — **Medium**

- **Status:** open
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

---

### 3. "Total Notes" and "Date Range" still count future-dated notes — **Medium**

- **Status:** open
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

---

### 4. A zero-length range counts as a full day — **Low**

- **Status:** open
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

---

### 5. `recentNotesTitle` is a dead translation key — **Low**

- **Status:** open
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

---

---

## Done

### First review batch — released in v0.5.2

All 14 findings from the first review were fixed, each in its own
commit. See the v0.5.2 changelog entry in `README.md` for the
user-facing description of each change.
