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
function createPluginStub(noteContent: string = DAILY_NOTE_CONTENT): never {
	const file = new TFile();
	file.path = "2026-10-16.md";
	file.name = "2026-10-16.md";
	file.basename = "2026-10-16";
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
	async function renderView(noteContent: string = DAILY_NOTE_CONTENT): Promise<void> {
		await act(async () => {
			root.render(React.createElement(TimelineView, { plugin: createPluginStub(noteContent), refreshToken: 0 }));
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
});
