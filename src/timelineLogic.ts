import { minutesToTime } from "./parser";

export const CELL_MINUTES = 10;
export const CELLS_PER_HOUR = 60 / CELL_MINUTES;

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

export function cellIndexForHour(hour: number, columnIndex: number): number {
	return hour * CELLS_PER_HOUR + columnIndex;
}

export function dragRangeToTimes(startIndex: number, endIndex: number): { start: string; end: string } {
	const firstCell = Math.min(startIndex, endIndex);
	const lastCell = Math.max(startIndex, endIndex);
	return {
		start: minutesToTime(firstCell * CELL_MINUTES),
		end: minutesToTime((lastCell + 1) * CELL_MINUTES),
	};
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
