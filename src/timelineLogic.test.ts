import { describe, expect, it } from "vitest";
import {
	buildTimelineLine,
	cellIndexForHour,
	cellIndexToTimeString,
	dragRangeToTimes,
	shouldCancelPendingTouchPress,
	timelineBlockGeometry,
	timeStringToCellIndex,
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

describe("cellIndexToTimeString", () => {
	it("converts cell index to clock time for default timeline (00:00 start)", () => {
		expect(cellIndexToTimeString(0, 0)).toBe("00:00");
		expect(cellIndexToTimeString(6, 0)).toBe("01:00");
		expect(cellIndexToTimeString(143, 0)).toBe("23:50");
	});

	it("converts cell index to clock time for custom timeline start (08:00)", () => {
		const startMinutes = 8 * 60; // 08:00
		expect(cellIndexToTimeString(0, startMinutes)).toBe("08:00");
		expect(cellIndexToTimeString(6, startMinutes)).toBe("09:00");
		expect(cellIndexToTimeString(36, startMinutes)).toBe("14:00");
	});

	it("handles overnight timeline (08:00 to 02:00)", () => {
		const startMinutes = 8 * 60; // 08:00
		// Cell index 54 = 08:00 + 54*10 = 08:00 + 540 = 17:00
		expect(cellIndexToTimeString(54, startMinutes)).toBe("17:00");
		// Cell index 108 = 08:00 + 1080 = 02:00 next day
		expect(cellIndexToTimeString(108, startMinutes)).toBe("02:00");
	});
});

describe("timeStringToCellIndex", () => {
	it("converts clock time to cell index for default timeline", () => {
		expect(timeStringToCellIndex("00:00", 0, 1440)).toBe(0);
		expect(timeStringToCellIndex("01:00", 0, 1440)).toBe(6);
		expect(timeStringToCellIndex("23:50", 0, 1440)).toBe(143);
	});

	it("converts clock time to cell index for custom timeline (08:00 to 14:00)", () => {
		const startMinutes = 8 * 60;
		const endMinutes = 14 * 60;
		expect(timeStringToCellIndex("08:00", startMinutes, endMinutes)).toBe(0);
		expect(timeStringToCellIndex("09:00", startMinutes, endMinutes)).toBe(6);
		expect(timeStringToCellIndex("13:50", startMinutes, endMinutes)).toBe(35);
		expect(timeStringToCellIndex("14:00", startMinutes, endMinutes)).toBe(-1); // Exclusive end
		expect(timeStringToCellIndex("07:50", startMinutes, endMinutes)).toBe(-1); // Before start
	});

	it("handles overnight timeline (08:00 to 02:00)", () => {
		const startMinutes = 8 * 60;
		const endMinutes = 2 * 60;
		expect(timeStringToCellIndex("08:00", startMinutes, endMinutes)).toBe(0);
		expect(timeStringToCellIndex("14:00", startMinutes, endMinutes)).toBe(36);
		expect(timeStringToCellIndex("23:50", startMinutes, endMinutes)).toBe(95);
		expect(timeStringToCellIndex("00:00", startMinutes, endMinutes)).toBe(96);
		expect(timeStringToCellIndex("01:50", startMinutes, endMinutes)).toBe(107);
		expect(timeStringToCellIndex("02:00", startMinutes, endMinutes)).toBe(-1); // Exclusive end
		expect(timeStringToCellIndex("07:50", startMinutes, endMinutes)).toBe(-1); // Outside window
	});

	it("handles full 24-hour timeline (00:00 to 00:00)", () => {
		expect(timeStringToCellIndex("00:00", 0, 0)).toBe(0);
		expect(timeStringToCellIndex("12:00", 0, 0)).toBe(72);
		expect(timeStringToCellIndex("23:50", 0, 0)).toBe(143);
	});
});

describe("dragRangeToTimes", () => {
	it("converts a forward selection to an inclusive time range for default timeline", () => {
		expect(dragRangeToTimes(0, 2, 0, 0)).toEqual({ start: "00:00", end: "00:30" });
	});

	it("normalizes reverse selections for default timeline", () => {
		expect(dragRangeToTimes(8, 6, 0, 0)).toEqual({ start: "01:00", end: "01:30" });
	});

	it("allows the final grid cell to end at midnight for default timeline", () => {
		expect(dragRangeToTimes(143, 143, 0, 0)).toEqual({ start: "23:50", end: "24:00" });
	});

	it("works with custom timeline start (08:00 to 14:00)", () => {
		const startMinutes = 8 * 60;
		const endMinutes = 14 * 60;
		expect(dragRangeToTimes(0, 2, startMinutes, endMinutes)).toEqual({ start: "08:00", end: "08:30" });
		expect(dragRangeToTimes(6, 8, startMinutes, endMinutes)).toEqual({ start: "09:00", end: "09:30" });
	});

	it("handles overnight timeline (08:00 to 02:00)", () => {
		const startMinutes = 8 * 60;
		const endMinutes = 2 * 60;
		// Selection crossing midnight
		expect(dragRangeToTimes(95, 97, startMinutes, endMinutes)).toEqual({ start: "23:50", end: "00:20" });
	});
});

describe("touchTapRangeToTimes", () => {
	it("uses a 30-minute default range beginning at the tapped cell for default timeline", () => {
		expect(touchTapRangeToTimes(5, 0, 0)).toEqual({ start: "00:50", end: "01:20" });
	});

	it("shifts the default range earlier so late-day taps still last 30 minutes for default timeline", () => {
		expect(touchTapRangeToTimes(143, 0, 0)).toEqual({ start: "23:30", end: "24:00" });
	});

	it("works with custom timeline (08:00 to 14:00)", () => {
		const startMinutes = 8 * 60;
		const endMinutes = 14 * 60;
		expect(touchTapRangeToTimes(5, startMinutes, endMinutes)).toEqual({ start: "08:50", end: "09:20" });
		// Near end of timeline
		expect(touchTapRangeToTimes(33, startMinutes, endMinutes)).toEqual({ start: "13:30", end: "14:00" });
	});

	it("handles overnight timeline (08:00 to 02:00)", () => {
		const startMinutes = 8 * 60;
		const endMinutes = 2 * 60;
		expect(touchTapRangeToTimes(0, startMinutes, endMinutes)).toEqual({ start: "08:00", end: "08:30" });
		expect(touchTapRangeToTimes(105, startMinutes, endMinutes)).toEqual({ start: "01:30", end: "02:00" });
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
