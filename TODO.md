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

> **No findings are open** — every finding from the review that followed
> v0.5.3 is recorded in the resolved section below. The first two
> review batches are complete and released: the first (14 findings) in
> v0.5.2, the second (5 findings) in v0.5.3. The dashboard metric
> tooltips followed in the same release. The third review batch (the one
> that followed v0.5.4) is also complete: the CRLF, fenced-code-block,
> indented-checkbox and out-of-range-time findings are all fixed and
> recorded below.
>
> The resolved findings below are kept as the **record** of what was wrong
> and why the fix looks the way it does — each one states the
> reproduction, the reasoning and the commit that fixed it. A future
> review should read them before changing the areas they touch.

---

## Open findings

_Nothing is open — every finding from the review that followed v0.5.4 has
been fixed and is recorded in the section below._

---

## Findings (all resolved)

### 0. CRLF line endings silently destroy Events — **High**

- **Status:** done — fixed in the v0.5.5 review batch (commit `9549c19`)
- **Location:** `src/parser.ts` — `TIME_RANGE_REGEX`, and the write path
  in `replaceLineRangeAt()` / `appendLineToBlock()`
- **Severity:** High — events vanish from the dashboard without any
  error, and the reading-view badges disagree with the parser

**What happens**

`TIME_RANGE_REGEX` ends with `(.*)$`. In JavaScript `.` does **not**
match `\r`, and `content.split("\n")` leaves the `\r` on the end of every
line of a CRLF file. The regex therefore fails to match every event line
in such a note — the note parses as having **no events at all**.

This is not a cosmetic mismatch. `findEventBlock()` still finds the
section (headings are matched after a `.trim()`), so the reading view
renders category badges for the lines the parser never saw — a direct
violation of the parser/DOM agreement rule in `.agents/AGENTS.md` §1.3.

The write path has the mirror-image defect: `replaceLineRangeAt()` and
`appendLineToBlock()` re-join lines with `"\n"`, so editing one line in a
CRLF file converts just that line to LF and the file ends up with mixed
line endings.

**Reproduction**

```ts
const crlf = "# Event\r\n- 09:00 - 10:00 [Admin] A\r\n- 10:00 - 11:00 [Admin] B\r\n";
const lf   = "# Event\n- 09:00 - 10:00 [Admin] A\n- 10:00 - 11:00 [Admin] B\n";

parseDailyNote(crlf).timeline.length;  // 0  — CRLF
parseDailyNote(lf).timeline.length;    // 2  — LF
```

A realistic three-event CRLF note keeps only the **last** event, and only
if the file does not end with a newline — a line terminated by `\r\n`
never matches, and only the final line of a file with no trailing newline
survives. So a CRLF note whose last line ends with a newline parses to
**zero** events; without the trailing newline it parses to one of three.
The dashboard follows: the CRLF note reports `recentEventMinutes: 0`
where the same note with LF reports `120`.

`.agents/AGENTS.md` §1.2 already says a trailing `\r` must be stripped
so CRLF-terminated files are not broken, and `stripTrailingCarriageReturn()`
exists in `src/parser.ts` — but only `stripFrontmatter()` uses it. The
existing test `it("recognizes delimiters in CRLF files")` in
`src/parser.test.ts` only covers the frontmatter delimiters, never an
Event line.

**Fix**

Normalize the line endings before matching: strip a trailing `\r` from
each line after the split (reusing `stripTrailingCarriageReturn()`), or
normalize `\r\n` to `\n` once at the top of the parse. Separately, make
the write path preserve the file's existing line-ending style instead of
always joining with `"\n"`.

**Test to add**

In `src/parser.test.ts`:

- a CRLF note with two events parses to two events;
- the same note with CRLF parses to the same events as the LF note
  (same times, same categories, same descriptions);
- a CRLF note reports the same `recentEventMinutes` through
  `computeDashboardStats()` as the LF note;
- after `replaceLineRangeAt()` on a CRLF note, the file still uses CRLF
  throughout.

**Resolution**

`splitContentLines()` in `src/parser.ts` is now the single place that
strips the trailing `\r`, and every read path goes through it:
`stripFrontmatter()`, `parseDailyNote()`, `findEventBlockInContent()` and
the sidebar's staleness guards (which had their own `content.split("\n")`
calls — in a CRLF file those would have compared a `\r`-suffixed line
against the item and rejected **every** edit and delete).

The write path now re-joins with the ending the file already uses:
`replaceLineAt()`, `replaceLineRangeAt()`, `removeLineRangeAt()` and
`appendLineToBlock()` detect the file's line ending once per write and
join with it, so editing one line in a CRLF note no longer converts that
line to LF and leaves the file with mixed line endings.

Stripping the `\r` does not change the line COUNT, so line indices stay
relative to the original file (AGENTS.md §1.2).

Tests added in `src/parser.test.ts` under a new `describe("CRLF line
endings")` block: a CRLF note parses to two events; it parses to exactly
the same events as the LF note; it reports the same `recentEventMinutes`
(120) through `computeDashboardStats()`; and a CRLF note stays CRLF
throughout after a replace, a remove and an append — with an explicit
assertion that no lone LF was introduced. An LF note is asserted to stay
LF.

`.agents/AGENTS.md` now has a new **§1.2.1 Line Endings (CRLF)** stating
the read rule and the write rule.

---

### 1. A fenced code block inside the Event section truncates it — **High**

- **Status:** done — fixed in the v0.5.5 review batch (commit `81930e9`)
- **Location:** `src/parser.ts` — `findEventBlock()`, `parseTimeline()`;
  `src/categoryBadges.ts` — `walkDocumentOrder()`
- **Severity:** High — events after the fence disappear, and the parser
  disagrees with the DOM

**What happens**

`findEventBlock()` ends the Event section at the next heading at the same
level or above. It has no notion of fenced code blocks, so a `#` line
inside a ``` fence is treated as a real heading and **closes the
section**. Every event after the fence becomes invisible.

The reading view disagrees: the fence renders as `<pre><code># config…`
— a code element, not a heading — so `walkDocumentOrder()` never sees a
heading there and the DOM badges **all** the tokens. The parser sees one
event, the DOM badges two. That is exactly the class of disagreement
`.agents/AGENTS.md` §1.3 forbids.

Two secondary effects fall out of the same gap:

- an event-shaped line *inside* a fence is parsed as a real Event — the
  fence is not a boundary to the parser, so
  `- 99:99 - 99:99 [Work] fake` becomes a bogus second event (and the
  fence's own ``` lines are absorbed into the surrounding descriptions);
- a fence that contains no `#` is absorbed as continuation text into the
  preceding event's description —
  `description: "first\n```\nkey: value\n```"`, `lineCount: 4`.

**Reproduction**

```ts
const content = [
  "# Event",
  "- 09:00 - 10:00 [Work] a",
  "```",
  "# config",
  "```",
  "- 10:00 - 11:00 [Work] b",
  "- 11:00 - 12:00 [Work] c",
].join("\n");

findEventBlockInContent(content);        // { start: 0, end: 2 }
parseDailyNote(content).timeline.length; // 1  — should be 3
```

**Fix**

Make `findEventBlock()` code-fence aware: track ``` (and ~~~) fences
while scanning and do not treat a `#` line inside a fence as a heading.
For the DOM side, per `.agents/AGENTS.md` §1.3, `walkDocumentOrder()`
must skip headings that are inside a `<pre>`/`<code>` element — the
parser and the DOM then agree about where the section ends.

**Test to add**

In `src/parser.test.ts`:

- a fence containing a `#` line inside the Event section does not close
  it — all three events parse;
- an event-shaped line inside a fence is not parsed as an Event;
- a fence with no heading inside does not leak into the previous event's
  description.

In `src/categoryBadges.reading.test.ts`, in the existing
`describe("parser / DOM agreement")` block: a cross-check that the
parser and the DOM agree on the number of badge tokens for a note with a
fenced `#` inside the Event section.

**Resolution**

A `FenceTracker` class in `src/parser.ts` now tracks the fence state
line by line, and it is used by **both** `findEventBlock()` and
`parseTimeline()`:

- `findEventBlock()` no longer treats a `#` line inside a fence as a
  heading, so a fence can neither open nor close the Event section. The
  tracker is fed **every** line — including lines before the block has
  started — so a fence that opens *before* the configured heading still
  shields the heading scan.
- `parseTimeline()` treats a fence as a boundary: an event-shaped line
  inside a fence is not an Event, and the fence's own lines are not
  absorbed into the preceding event's description.
- CommonMark's fence rules are honoured: the closing fence must use the
  **same character** as the opener and be **at least as long** (a ```
  fence is not closed by a ~~~ line), and a backtick fence's info string
  may not contain a backtick.

On the DOM side, `walkDocumentOrder()` in `src/categoryBadges.ts` now
skips **every node** inside a `<pre>`/`<code>` element — not just
headings, but text nodes too, so a `[Category]` token inside a fence
stays literal text instead of becoming a badge.

Tests added:

- `src/parser.test.ts`, in a new `describe("fenced code blocks")` block —
  a `#` inside a fence does not close the section (all three events
  parse); an event-shaped line inside a fence is not an Event; a fence
  with no heading inside does not leak into the previous event's
  description; a `~~~` fence is a boundary too; a ``` fence is not
  closed by a `~~~` line; and a fence that opens *before* the Event
  heading still shields the heading scan.
- `src/categoryBadges.reading.test.ts`, in the existing
  `describe("parser / DOM agreement")` block — a **cross-check** that
  pins the parser to the DOM: for a note with a fenced `#` and a fenced
  event-shaped line, the parser reports two events and the DOM renders
  exactly two badges. Plus two more DOM-level cases: a category token
  inside a code block gets no badge, and a heading inside a code block
  does not close the Event section.

`.agents/AGENTS.md` §1.3 now states the fence rule explicitly: a fenced
code block is a boundary for both the block boundary computation and the
timeline parse, and the DOM side must skip `<pre>`/`<code>` content.

---

### 2. An indented checkbox is absorbed, then deleted on the next edit — **High**

- **Status:** done — fixed in the v0.5.5 review batch (commit `c23892b`)
- **Location:** `src/parser.ts` — `parseTimeline()`, `isTopLevelOrMarker()`;
  `src/modals/TimelineModal.tsx` — the save-time guard
- **Severity:** High — **data loss**: editing or deleting the preceding
  event silently removes an unrelated line from the note

**What happens**

`parseTimeline()` tests `CHECKBOX_REGEX` (`/^[-*]\s*\[([ xX])\]\s*(.*)$/`)
against the **raw** line. A line with leading whitespace —
`"  - [ ] nested task"` — does not match, so it is not recognised as a
to-do marker and is instead absorbed into the previous event's
description as a continuation line.

`isTopLevelOrMarker()` has the same defect: its regex is not applied to
a trimmed line either, so it returns `false` for `"  - [ ] nested task"`
and `true` for `"- [ ] nested task"`. The modal's guard at
`src/modals/TimelineModal.tsx:67` therefore **accepts** a description
that contains an indented checkbox, and the write path then rewrites
that description — dropping the checkbox line.

**Reproduction**

```ts
const content = "# Event\n- 09:00 - 10:00 [Work] a\n  - [ ] nested task\n";
const [item] = parseDailyNote(content).timeline;

item.description;  // "a\n  - [ ] nested task"   (lineCount: 3)
isTopLevelOrMarker("  - [ ] nested task");  // false — should be true

replaceLineRangeAt(content, item.line, item.lineCount, "…EDITED");
// → "# Event\n…EDITED" — the "- [ ] nested task" line is GONE

removeLineRangeAt(content, item.line, item.lineCount);
// → "# Event" — the "- [ ] nested task" line is GONE
```

**Fix**

Trim the line before testing it against `CHECKBOX_REGEX` in
`parseTimeline()`, and do the same in `isTopLevelOrMarker()`. An
indented checkbox is then a top-level marker: it is never absorbed into
an event's description, and it survives any edit or delete of the
surrounding event.

**Test to add**

In `src/parser.test.ts`:

- an indented checkbox after an event is not absorbed into the event's
  description (`lineCount` stays 1, `description` stays `"a"`);
- `isTopLevelOrMarker("  - [ ] nested task")` is `true`;
- after `replaceLineRangeAt()` and after `removeLineRangeAt()`, the
  checkbox line is still in the file.

**Resolution**

The checkbox test is now applied to the **trimmed** line, in both
`parseTimeline()` and `isTopLevelOrMarker()`. An indented to-do is a
to-do at any indentation: it is never absorbed into an event's
description, and therefore never becomes part of that event's
`lineCount` — so the range-based write path
(`replaceLineRangeAt()` / `removeLineRangeAt()`, which rewrite exactly
`[item.line, item.line + item.lineCount - 1]`) can no longer take the
checkbox line with it.

The time-range test in `isTopLevelOrMarker()` deliberately stays on the
**raw** line, because that is exactly what `parseTimeline()` does — the
save-time guard in `TimelineModal` and the parser must agree, or the
guard would reject a description the parser handles without trouble.

The save-time guard in `TimelineModal` now rejects a description
containing an indented checkbox (it already rejected a top-level one),
so the user is asked to rephrase rather than silently losing the line.

Tests added in `src/parser.test.ts` under a new
`describe("indented checkboxes")` block: an indented checkbox is not
absorbed into the event's description (`lineCount` stays 1);
`isTopLevelOrMarker()` returns `true` for an indented `- [ ]`, `- [x]`
and `* [X]`; the checkbox line survives an edit and a delete of the
event above it; and — the guard against over-correcting — an indented
line that is **not** a marker (`"  - nested detail"`) is still absorbed
verbatim, exactly as before.

`.agents/AGENTS.md` §1.4.2 now states the rule explicitly: a checkbox is
a marker at any indentation, and the reason is data loss, not
appearance.

---

### 3. An out-of-range time inflates the dashboard — **Low**

- **Status:** done — fixed in the v0.5.5 review batch
- **Location:** `src/parser.ts` — `timeToMinutes()`, `minutesToTime()`
- **Severity:** Low — a typo in a note produces a nonsense figure, but
  nothing is lost

**What happens**

`TIME_RANGE_REGEX` is deliberately shape-only (`.agents/AGENTS.md` §1.4
says it is not a validator), and `timeToMinutes()` does no range check:
`timeToMinutes("99:99")` returns `6039`. A note containing
`- 09:00 - 99:99 [Work] typo` therefore contributes **5499 minutes**
(91.6 hours) to the dashboard, and `minutesToTime(6039)` renders back as
`"100:39"`.

**Reproduction**

```ts
const content = "# Event\n- 09:00 - 99:99 [Work] typo\n";
const date = new Date(2026, 6, 14);
const stats = computeDashboardStats([date], [{ date, parsed: parseDailyNote(content) }], date);

stats.recentEventMinutes;  // 5499  — 91.6 hours from one line
```

**Fix**

Clamp the parsed hours and minutes to their valid ranges (or reject an
out-of-range time when computing a duration) so a typo cannot dominate
the totals. The shape of the Event line stays permissive — the fix
belongs in the duration arithmetic, not in the regex.

**Test to add**

In `src/parser.test.ts`: `timeToMinutes("99:99")` and
`minutesToTime(6039)` produce the clamped values. In
`src/dashboardCollector.test.ts`: a note containing an out-of-range time
does not report a duration larger than 24 hours.

**Resolution**

`timeToMinutes()` now clamps the parsed hours (0-24) and minutes (0-59)
and caps the result at one day (1440 minutes), so `timeToMinutes("99:99")`
is 1440 rather than 6039. `minutesToTime()` — the inverse — clamps to the
same single-day range, so it can never render a `"100:39"`.

The clamp happens in the **duration arithmetic**, not in the regex, and
that is the point: `TIME_RANGE_REGEX` stays shape-only, so a note that
already contains a typo still parses and its event is still visible in
the sidebar. Only the numbers it contributes are bounded. Tightening the
regex instead would have made the whole line disappear from the note,
which trades a nonsense figure for a silent loss.

Two boundary cases are handled deliberately:

- `24:00` is still a legitimate END time (midnight at the end of the
  day) and still maps to 1440 minutes — the grid produces it and the
  end-hour setting advertises it (AGENTS.md §1.4).
- A value that is not a finite number (a malformed time string) falls
  back to the minimum rather than propagating `NaN` into the totals.

Tests added:

- `src/parser.test.ts`, in the `describe("time helpers")` block — an
  out-of-range time is clamped to a single day (`"99:99"`, `"25:00"` and
  `"24:30"` all give 1440; `"09:99"` gives 599), `minutesToTime(6039)`
  gives `"24:00"`, and a negative value gives `"00:00"`; plus a case
  asserting that an out-of-range time cannot inflate a duration
  (`09:00 - 99:99` is 900 minutes, and the reverse order is 540 — the
  overnight branch still applies).
- `src/dashboardCollector.test.ts` — a note containing an out-of-range
  time reports 900 minutes through `computeDashboardStats()`, and never
  more than a single day.

`.agents/AGENTS.md` §1.4 now states the rule explicitly: an out-of-range
time is clamped in the duration arithmetic, not rejected by the regex,
and the regex must not be tightened to validate the shape.

---

### 4. Image headings: the parser and the badge renderer disagree — **High**

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

### 5. "Daily Avg" divides by notes, not by days in the window — **Medium**

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

### 6. "Total Notes" and "Date Range" still count future-dated notes — **Medium**

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

### 7. A zero-length range counts as a full day — **Low**

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

### 8. `recentNotesTitle` is a dead translation key — **Low**

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
(findings #5 and #6 above) stayed invisible to users.

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
