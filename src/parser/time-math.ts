import type { TimelineItem } from "./timeline-parsing";

import type { LineRange } from "./event-block";

const MINUTES_PER_DAY = 24 * 60;
const MAX_HOUR = 24;
const MAX_MINUTE = 59;

/**
 * Parses "HH:mm" into minutes-since-midnight.
 *
 * The parsed hours and minutes are CLAMPED to their valid ranges: hours
 * to 0-24 and minutes to 0-59. `TIME_RANGE_REGEX` is deliberately
 * shape-only (AGENTS-reference.md — it is not a validator), so it happily
 * matches a typo like `99:99`. Without the clamp, `timeToMinutes("99:99")`
 * returned 6039 and a single mistyped line contributed 5499 minutes
 * (91.6 hours) to the dashboard's totals.
 *
 * The clamping happens HERE, in the duration arithmetic, rather than in
 * the regex: the shape of an Event line stays permissive (a note that
 * already contains a typo still parses and still shows up in the
 * sidebar), and only the numbers it contributes are bounded.
 *
 * `24:00` is a legitimate END time (midnight at the end of the day), so
 * hour 24 is allowed through and maps to 1440 minutes.
 */
export function timeToMinutes(hhmm: string): number {
	const [hours, minutes] = hhmm.split(":").map(Number);
	const safeHours = clamp(hours, 0, MAX_HOUR);
	const safeMinutes = clamp(minutes, 0, MAX_MINUTE);
	// Hour 24 is only meaningful with minute 0 — that is 24:00, midnight
	// at the end of the day. Anything past it (24:30, 99:99) is a typo,
	// and clamping it to the end of the day keeps every duration within
	// a single day.
	return Math.min(safeHours * 60 + safeMinutes, MINUTES_PER_DAY);
}

/**
 * Inverse of `timeToMinutes` — formats minutes-since-midnight as
 * zero-padded "HH:mm". Used by the grid's drag-to-select.
 *
 * The value is clamped to a single day, so a caller can never produce an
 * "HH:mm" outside the 00:00-24:00 range the grid and the end-time
 * setting understand.
 */
export function minutesToTime(minutes: number): string {
	const safeMinutes = clamp(minutes, 0, MINUTES_PER_DAY);
	const hours = Math.floor(safeMinutes / 60);
	const mins = safeMinutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Clamps `value` into the inclusive range [min, max]. A value that is
 * not a finite number (e.g. `NaN` from a malformed time string) falls
 * back to `min`.
 */
function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(value, min), max);
}

/**
 * Duration of a Timeline/Event item in minutes. If `end` is BEFORE
 * `start`, the range is treated as crossing midnight (e.g. 23:00-01:00).
 * Shared by the Timeline component (bar height) and the Dashboard's
 * "total recorded time" aggregate so the two never drift apart.
 *
 * A range whose end EQUALS its start (`09:00 - 09:00`) is a zero-length
 * range and counts as 0 minutes — it is NOT an overnight range. The
 * overnight branch is `end < start`; with `end <= start` a zero-length
 * range counted as a full day (1440 minutes), while `timelineDaySegments`
 * correctly drew no segment for it, so the grid showed nothing and the
 * dashboard reported 24 hours of recorded time.
 */
export function timelineDurationMinutes(item: Pick<TimelineItem, "start" | "end">): number {
	const startMinutes = timeToMinutes(item.start);
	const endMinutes = timeToMinutes(item.end);
	return Math.max(endMinutes - startMinutes + (endMinutes < startMinutes ? MINUTES_PER_DAY : 0), 0);
}

/**
 * The in-day segments an Event occupies, in minutes since midnight.
 *
 * A range whose end is not after its start crosses midnight (e.g.
 * `23:00 - 01:00`), so it occupies TWO segments: `23:00` to midnight and
 * midnight to `01:00`. A range ending exactly at `24:00` is a single
 * segment that runs to the end of the day.
 *
 * The grid renders one bar per segment, so an overnight Event is drawn
 * as a bar in the evening hours AND a bar in the early-morning hours.
 * Without this, comparing the raw start and end values made
 * `Math.max(start, hourStart) < Math.min(end, hourEnd)` false for every
 * hour, so an overnight Event was invisible on the grid even though the
 * dashboard counted its time.
 */
export function timelineDaySegments(item: Pick<TimelineItem, "start" | "end">): LineRange[] {
	const startMinutes = timeToMinutes(item.start);
	const endMinutes = timeToMinutes(item.end);

	if (endMinutes > startMinutes) {
		return [{ start: startMinutes, end: endMinutes }];
	}
	if (endMinutes === startMinutes) {
		// A zero-length range has no segment to draw.
		return [];
	}
	// Crosses midnight: the tail of the evening, then the head of the day.
	return [
		{ start: startMinutes, end: MINUTES_PER_DAY },
		{ start: 0, end: endMinutes },
	];
}

/**
 * Exported so callers (e.g. view.ts) can re-validate a line before mutating it in place.
 * Group 3 (category) is optional — AGENTS-reference.md: `- HH:mm - HH:mm [Category] description`.
 * Lines written before the category feature existed have no `[...]` token at all and still
 * match, with group 3 `undefined` (see parseTimeline / timelineLineMatches).
 */
export const TIME_VALUE_REGEX = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;

/**
 * The same validation for an END time, which may additionally be `24:00`
 * (midnight at the end of the day).
 *
 * The sidebar's grid can end at midnight: with the end hour set to 24,
 * dragging the last cell produces `24:00`. The settings screen explicitly
 * advertises midnight support, and the grid labels that row `12 AM`, so
 * `24:00` is the intended representation of that end time — it must not
 * be rejected on save.
 *
 * `24:00` is accepted for END times only. As a START time it would mean
 * midnight at the beginning of the day, which has no place on the grid
 * (a start of 24:00 is indistinguishable from the end of the day) and
 * could never be rendered.
 */
export const TIME_END_VALUE_REGEX = /^(?:(?:[01]?\d|2[0-3]):[0-5]\d|24:00)$/;
