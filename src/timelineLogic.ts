import { minutesToTime, timeToMinutes } from "./parser";
import { cellIndexToTime, getTimelineCellCount, timeToCellIndex } from "./settings";
import type { TimelineItem } from "./parser";

export const CELL_MINUTES = 10;
export const CELLS_PER_HOUR = 60 / CELL_MINUTES;
export const LONG_PRESS_DURATION_MS = 250;
export const TOUCH_MOVE_CANCEL_THRESHOLD = 8;

/**
 * Returns default start/end times for a new log entry.
 * - If timeline has entries, start = last entry's end (modulo 1440)
 * - Otherwise start = nowMinutes rounded down to nearest 10
 * - End = (start + 10) % 1440
 */
export function getDefaultEntryTimes(
	timeline: Pick<TimelineItem, "end">[],
	nowMinutes: number
): { start: string; end: string } {
	let startMinutes: number;
	if (timeline.length > 0) {
		const lastEnd = timeline[timeline.length - 1].end;
		startMinutes = timeToMinutes(lastEnd) % 1440;
	} else {
		startMinutes = Math.floor(nowMinutes / 10) * 10;
	}
	const endMinutes = (startMinutes + 10) % 1440;
	return {
		start: minutesToTime(startMinutes),
		end: minutesToTime(endMinutes),
	};
}

export interface PendingTouchPress {
	pointerId: number;
	cellIndex: number;
	startX: number;
	startY: number;
	timerId: number;
}

export interface TimelineEventLineValues {
	start: string;
	end: string;
	category?: string;
	description: string;
}

export interface TimelineBlockGeometry {
	leftPercent: number;
	widthPercent: number;
	isShort: boolean;
}

/**
 * Converts a timeline-relative cell index to clock time string (HH:mm).
 * Uses the configured timeline start time as the reference.
 */
export function cellIndexToTimeString(cellIndex: number, dayStartMinutes: number): string {
	const timeMinutes = cellIndexToTime(cellIndex, dayStartMinutes);
	return minutesToTime(timeMinutes);
}

/**
 * Converts a clock time string (HH:mm) to a timeline-relative cell index.
 * Returns -1 if the time is not in the timeline window.
 */
export function timeStringToCellIndex(timeStr: string, dayStartMinutes: number, dayEndMinutes: number): number {
	const [hours, minutes] = timeStr.split(":").map(Number);
	const timeMinutes = hours * 60 + minutes;
	return timeToCellIndex(timeMinutes, dayStartMinutes, dayEndMinutes);
}

export function cellIndexForHour(hour: number, columnIndex: number): number {
	return hour * CELLS_PER_HOUR + columnIndex;
}

/**
 * Calculates the end time string for a cell boundary, handling the special case
 * where the boundary is exactly at the timeline end and the timeline ends at midnight
 * (which should be "24:00" not "00:00").
 */
function cellBoundaryToTimeString(cellIndex: number, dayStartMinutes: number, dayEndMinutes: number): string {
	const boundaryMinutes = dayStartMinutes + cellIndex * CELL_MINUTES;
	const timelineEndMinutes = dayEndMinutes === 0 ? 1440 : dayEndMinutes;
	
	// If this boundary is exactly at the timeline end AND the timeline ends at midnight,
	// return "24:00" instead of "00:00"
	if (boundaryMinutes === timelineEndMinutes && dayEndMinutes === 0) {
		return "24:00";
	}
	
	// Otherwise use normal modulo wrapping
	return minutesToTime(boundaryMinutes % 1440);
}

export function dragRangeToTimes(startIndex: number, endIndex: number, dayStartMinutes: number, dayEndMinutes: number): { start: string; end: string } {
	const firstCell = Math.min(startIndex, endIndex);
	const lastCell = Math.max(startIndex, endIndex);
	return {
		start: cellIndexToTimeString(firstCell, dayStartMinutes),
		end: cellBoundaryToTimeString(lastCell + 1, dayStartMinutes, dayEndMinutes),
	};
}

export function touchTapRangeToTimes(cellIndex: number, dayStartMinutes: number, dayEndMinutes: number): { start: string; end: string } {
	const cellCount = getTimelineCellCount(dayStartMinutes, dayEndMinutes);
	const startIndex = Math.min(Math.max(0, cellIndex), Math.max(0, cellCount - 3));
	const endIndex = Math.min(startIndex + 2, cellCount - 1);
	return dragRangeToTimes(startIndex, endIndex, dayStartMinutes, dayEndMinutes);
}

export function shouldCancelPendingTouchPress(
	pending: PendingTouchPress,
	pointerId: number,
	clientX: number,
	clientY: number
): boolean {
	if (pending.pointerId !== pointerId) return false;
	return Math.hypot(clientX - pending.startX, clientY - pending.startY) > TOUCH_MOVE_CANCEL_THRESHOLD;
}

export function buildTimelineLine(values: TimelineEventLineValues): string {
	const categoryPart = values.category ? `[${values.category}] ` : "";
	return `- ${values.start} - ${values.end} ${categoryPart}${values.description}`.trimEnd();
}

export function timelineBlockGeometry(
	segmentStart: number,
	segmentEnd: number,
	hourStart: number,
	hourEnd: number
): TimelineBlockGeometry | null {
	const overlapStart = Math.max(segmentStart, hourStart);
	const overlapEnd = Math.min(segmentEnd, hourEnd);
	if (overlapStart >= overlapEnd) return null;

	const hourDuration = hourEnd - hourStart;
	const startColumn = ((overlapStart - hourStart) / hourDuration) * CELLS_PER_HOUR;
	const endColumn = ((overlapEnd - hourStart) / hourDuration) * CELLS_PER_HOUR;
	const widthMinutes = overlapEnd - overlapStart;

	return {
		leftPercent: (startColumn / CELLS_PER_HOUR) * 100,
		widthPercent: ((endColumn - startColumn) / CELLS_PER_HOUR) * 100,
		isShort: widthMinutes <= CELL_MINUTES,
	};
}
