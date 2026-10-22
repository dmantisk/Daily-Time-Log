/**
 * @vitest-environment happy-dom
 *
 * Sidebar grid drag-to-select behaviour.
 *
 * The bug this guards against: a single mouse release fired TWO handlers —
 * the grid cell's React `onMouseUp` and the window-level `mouseup`
 * listener the component registers to catch a release outside the grid.
 * Both ran within the same event dispatch, before React re-rendered, so
 * the `isDragging` state guard could not suppress the second one and the
 * user ended up with two add-Event modals for one drag.
 *
 * This drives the REAL `TimelineView` component against a real DOM, since
 * the defect is an interaction between React's synthetic event system and
 * a native window listener — a class of bug only a DOM-level test catches.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// The modal is the observable effect of a completed drag, so it is the
// thing we count. It is replaced with a counting stub to keep the test
// independent of the modal's own rendering.
const openModalCalls: unknown[][] = [];
vi.mock("../modals/TimelineModal", () => ({
	TimelineModal: class {
		constructor(...args: unknown[]) {
			openModalCalls.push(args);
		}
		open(): void {}
		close(): void {}
	},
}));
vi.mock("../modals/ConfirmDeleteModal", () => ({
	ConfirmDeleteModal: class {
		open(): void {}
		close(): void {}
	},
}));

import { TimelineView } from "./TimelineView";
import { TFile } from "obsidian";

// React 18 requires this flag for `act()` to work outside a test renderer.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAILY_NOTE_CONTENT = "# Event\n- 09:00 - 10:00 [Work] Existing\n";

/** Builds a plugin stub good enough for the sidebar to render a grid. */
function createPluginStub(
	noteContent: string = DAILY_NOTE_CONTENT,
	notePath = "2026-10-16.md",
	dateFormat = "YYYY-MM-DD",
	dailyNoteFolder = ""
): never {
	const file = new TFile();
	file.path = notePath;
	file.name = notePath.split("/").pop() ?? notePath;
	file.basename = file.name.replace(/\.md$/i, "");
	file.extension = "md";

	return {
		app: {
			workspace: {
				getActiveFile: () => file,
			},
			vault: {
				read: async () => noteContent,
			},
		},
		settings: {
			categories: [{ name: "Work", displayName: "Work", color: "#d0e1fd" }],
			startHour: 0,
			endHour: 24,
		},
		getUiLanguage: () => "en",
		getEventHeadingConfig: () => ({ text: "Event", level: 1 }),
		getDailyNoteFolder: () => dailyNoteFolder,
		getDailyNoteFormat: () => dateFormat,
	} as never;
}

describe("TimelineView — drag-to-select", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		openModalCalls.length = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	/** Renders the sidebar and waits for the async file read to settle. */
	async function renderView(
		noteContent: string = DAILY_NOTE_CONTENT,
		notePath?: string,
		dateFormat?: string,
		dailyNoteFolder?: string
	): Promise<void> {
		await act(async () => {
			root.render(
				React.createElement(TimelineView, {
					plugin: createPluginStub(noteContent, notePath, dateFormat, dailyNoteFolder),
					refreshToken: 0,
				})
			);
		});
	}

	/** The grid cells, in DOM order (6 cells per hour, 24 hours). */
	function cells(): HTMLElement[] {
		return Array.from(container.querySelectorAll<HTMLElement>(".dwl-grid-cell"));
	}

	it("opens exactly ONE add-Event modal for a drag that ends on a grid cell", async () => {
		await renderView();
		const gridCells = cells();
		expect(gridCells.length).toBeGreaterThan(0);

		// Drag across the first three cells of the first hour and release
		// on the last one.
		await act(async () => {
			gridCells[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		await act(async () => {
			gridCells[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		});
		await act(async () => {
			gridCells[2].dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		});

		// The release fires the cell's React onMouseUp AND the window-level
		// mouseup listener. Only one of them may open the modal.
		expect(openModalCalls).toHaveLength(1);
	});

	it("recognizes a nested note path from the core Daily Notes settings", async () => {
		await renderView(DAILY_NOTE_CONTENT, "Log/2026/10/16.md", "YYYY/MM/DD", "Log");

		expect(cells()).toHaveLength(144);
	});

	it("opens exactly ONE add-Event modal for a drag that ends outside the grid", async () => {
		await renderView();
		const gridCells = cells();

		await act(async () => {
			gridCells[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		await act(async () => {
			gridCells[3].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		});
		// Released on the document body — outside the grid, so only the
		// window listener can catch it.
		await act(async () => {
			document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		});

		expect(openModalCalls).toHaveLength(1);
	});

	it("opens a second modal for a NEW drag after the first one completed", async () => {
		await renderView();
		const gridCells = cells();

		await act(async () => {
			gridCells[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		await act(async () => {
			gridCells[2].dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		});
		expect(openModalCalls).toHaveLength(1);

		// A second, separate drag must still work — the latch must be
		// released when a new drag starts, not latched forever.
		await act(async () => {
			gridCells[5].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		await act(async () => {
			gridCells[7].dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		});

		expect(openModalCalls).toHaveLength(2);
	});
});

describe("TimelineView — grid rendering", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	async function renderView(noteContent: string): Promise<void> {
		await act(async () => {
			root.render(React.createElement(TimelineView, { plugin: createPluginStub(noteContent), refreshToken: 0 }));
		});
	}

	/** The rendered Event bars, in document order. */
	function blocks(): HTMLElement[] {
		return Array.from(container.querySelectorAll<HTMLElement>(".dwl-grid-block"));
	}

	it("renders a bar for an in-day Event", async () => {
		await renderView("# Event\n- 09:00 - 10:00 [Work] Morning\n");
		expect(blocks()).toHaveLength(1);
	});

	it("renders the category name without emphasis", async () => {
		// The category name is regular weight on purpose. The weight itself
		// lives in CSS (not observable in a DOM test), but the <strong> tag
		// was the other half of it — a bolded name inside the bar.
		await renderView("# Event\n- 09:00 - 10:00 [Work] Morning\n");

		const rendered = blocks();
		expect(rendered).toHaveLength(1);
		expect(rendered[0].querySelector("strong")).toBeNull();

		// The name is still shown — as a plain text node of the bar.
		expect(rendered[0].textContent).toContain("Work");
	});

	it("does NOT render the time range inside the bar", async () => {
		// The bar's position and width on the grid already convey the
		// time range, so the label shows the category name only. The range
		// stays available in the tooltip.
		await renderView("# Event\n- 09:00 - 10:00 [Work] Morning\n");

		const rendered = blocks();
		expect(rendered).toHaveLength(1);

		const label = rendered[0].textContent ?? "";
		expect(label).toContain("Work");
		expect(label).not.toContain("09:00");
		expect(label).not.toContain("10:00");
		expect(label).not.toContain("-");

		// The range is still exposed via the tooltip.
		expect(rendered[0].getAttribute("title")).toContain("09:00");
	});

	it("marks a bar of one 10-minute cell or less as short", async () => {
		// A bar that is at most one cell wide cannot fit the category name.
		// Such a bar is marked so the CSS can anchor its label to the left
		// edge — centring it would leave only the middle of the word
		// visible.
		await renderView("# Event\n- 09:00 - 09:10 [Work] Short\n");

		const rendered = blocks();
		expect(rendered).toHaveLength(1);
		expect(rendered[0].classList.contains("is-short")).toBe(true);
	});

	it("does NOT mark a longer bar as short", async () => {
		// A bar wider than a single cell has room for its label, so it stays
		// centred as before.
		await renderView("# Event\n- 09:00 - 10:00 [Work] Long\n");

		const rendered = blocks();
		expect(rendered).toHaveLength(1);
		expect(rendered[0].classList.contains("is-short")).toBe(false);
	});

	it("renders the category name inside a dedicated label element", async () => {
		// The label sits in its own box so it can be truncated cleanly.
		// A flex container centres an over-long text node and clips BOTH
		// ends, which cuts the middle out of the word — so the text must be
		// inside an element the CSS can ellipsise on its own.
		await renderView("# Event\n- 09:00 - 09:10 [Work] Short\n");

		const rendered = blocks();
		expect(rendered).toHaveLength(1);

		const label = rendered[0].querySelector(".dwl-grid-block-label");
		expect(label).not.toBeNull();
		expect(label?.textContent).toBe("Work");
	});

	it("renders an overnight Event as a bar in the evening AND in the morning", async () => {
		// An Event crossing midnight occupies two in-day segments. The
		// dashboard already counted its full duration, but the grid used
		// to draw no bar at all, because the raw end time (01:00) is
		// earlier than the start time (23:00).
		await renderView("# Event\n- 23:00 - 01:00 [Work] Night shift\n");

		const rendered = blocks();
		expect(rendered).toHaveLength(2);

		// The grid renders hours in ascending order, so the morning bar
		// (midnight-01:00) comes first and the evening bar (23:00-midnight)
		// second.
		const rows = Array.from(container.querySelectorAll<HTMLElement>(".dwl-grid-row"));
		const rowOf = (block: HTMLElement): number =>
			rows.findIndex((row) => row.contains(block));

		expect(rowOf(rendered[0])).toBe(0);
		expect(rowOf(rendered[1])).toBe(23);
	});

	it("offsets each bar by the shared gap so the horizontal and vertical gutters match", async () => {
		// The gap between bars used to be 4px horizontally (two 2px
		// transparent borders) but 6px vertically (calc(100% - 6px) with
		// top: 3px). The gutters are now geometry driven by the single
		// --dwl-block-gap custom property: the vertical gutter halves the
		// gap above and below each bar, and the horizontal gutter insets
		// each bar by half a gap on either side.
		//
		// The inline style must therefore carry the calc() offsets — a
		// plain percentage would restore the uneven 4px gap.
		await renderView("# Event\n- 09:00 - 10:00 [Work] Morning\n");

		const rendered = blocks();
		expect(rendered).toHaveLength(1);

		const style = rendered[0].style;
		expect(style.left).toContain("var(--dwl-block-gap, 5px) / 2");
		expect(style.width).toContain("var(--dwl-block-gap, 5px)");
		// The bar must still start at the same grid position, just nudged
		// right by half a gap.
		expect(style.left).toMatch(/^calc\([\d.]+% \+ var\(--dwl-block-gap, 5px\) \/ 2\)$/);
		expect(style.width).toMatch(/^calc\([\d.]+% - var\(--dwl-block-gap, 5px\)\)$/);
	});
});
