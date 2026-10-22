import { describe, expect, it } from "vitest";
import {
	buildTimelineLine,
	cellIndexForHour,
	dragRangeToTimes,
	shouldCancelPendingTouchPress,
	timelineBlockGeometry,
	touchTapRangeToTimes,
	type PendingTouchPress,
} from "./timelineLogic";

describe("cellIndexForHour", () => {
	it("maps columns to the 10-minute grid index", () => {
		expect(cellIndexForHour(0, 0)).toBe(0);
		expect(cellIndexForHour(1, 2)).toBe(8);
		expect(cellIndexForHour(23, 5)).toBe(143);
	});
});

describe("dragRangeToTimes", () => {
	it("converts a forward selection to an inclusive time range", () => {
		expect(dragRangeToTimes(0, 2)).toEqual({ start: "00:00", end: "00:30" });
	});

	it("normalizes reverse selections", () => {
		expect(dragRangeToTimes(8, 6)).toEqual({ start: "01:00", end: "01:30" });
	});

	it("allows the final grid cell to end at midnight", () => {
		expect(dragRangeToTimes(143, 143)).toEqual({ start: "23:50", end: "24:00" });
	});
});

describe("touchTapRangeToTimes", () => {
	it("uses a 30-minute default range beginning at the tapped cell", () => {
		expect(touchTapRangeToTimes(5, 24)).toEqual({ start: "00:50", end: "01:20" });
	});

	it("shifts the default range earlier so late-day taps still last 30 minutes", () => {
		expect(touchTapRangeToTimes(143, 24)).toEqual({ start: "23:30", end: "24:00" });
	});
});

describe("shouldCancelPendingTouchPress", () => {
	const pending: PendingTouchPress = {
		pointerId: 3,
		cellIndex: 6,
		startX: 10,
		startY: 20,
		timerId: 1,
	};

	it("keeps the press pending for the same pointer within the movement threshold", () => {
		expect(shouldCancelPendingTouchPress(pending, 3, 16, 20)).toBe(false);
		expect(shouldCancelPendingTouchPress(pending, 4, 100, 100)).toBe(false);
	});

	it("cancels the press when the same pointer moves beyond the threshold", () => {
		expect(shouldCancelPendingTouchPress(pending, 3, 19, 20)).toBe(true);
	});
});

describe("buildTimelineLine", () => {
	it("includes the category when present", () => {
		expect(buildTimelineLine({
			start: "09:00",
			end: "10:00",
			category: "Work",
			description: "Planning",
		})).toBe("- 09:00 - 10:00 [Work] Planning");
	});

	it("omits an empty category and trims trailing whitespace", () => {
		expect(buildTimelineLine({
			start: "09:00",
			end: "10:00",
			category: "",
			description: "",
		})).toBe("- 09:00 - 10:00");
	});
});

describe("timelineBlockGeometry", () => {
	it("returns the exact geometry for a full hour", () => {
		expect(timelineBlockGeometry(540, 600, 540, 600)).toEqual({
			leftPercent: 0,
			widthPercent: 100,
			isShort: false,
		});
	});

	it("clips a segment to the current hour and identifies a one-cell bar", () => {
		expect(timelineBlockGeometry(595, 610, 540, 600)).toEqual({
			leftPercent: (55 / 60) * 100,
			widthPercent: (5 / 60) * 100,
			isShort: true,
		});
	});

	it("does not return geometry for a segment outside the hour", () => {
		expect(timelineBlockGeometry(600, 660, 540, 600)).toBeNull();
	});
});
