/**
 * @vitest-environment happy-dom
 *
 * Controller-level coverage for the vanilla sidebar DOM and pointer handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const modalCalls: unknown[][] = [];
const confirmModalCalls: unknown[][] = [];
vi.mock("../modals/TimelineModal", () => ({
	TimelineModal: class {
		constructor(...args: unknown[]) {
			modalCalls.push(args);
		}
		open(): void {}
	},
}));
vi.mock("../modals/ConfirmDeleteModal", () => ({
	ConfirmDeleteModal: class {
		constructor(...args: unknown[]) {
			confirmModalCalls.push(args);
		}
		open(): void {}
	},
}));

import { Notice, TFile } from "obsidian";
import type DailyWorkLogPlugin from "../main";
import type { EventEntryValues } from "../modals/TimelineModal";
import { installObsidianDomHelpers } from "../test/obsidian-dom-mock";
import { TimelineController } from "./TimelineController";

installObsidianDomHelpers();

const DAILY_NOTE_CONTENT = "# Event\n- 09:00 - 10:00 [Work] Existing\n";

interface PluginStub {
	app: {
		workspace: {
			getActiveFile: () => TFile | null;
			getLeaf: (newLeaf?: boolean) => { openFile: (file: TFile) => Promise<void> };
		};
		vault: {
			read: (file: TFile) => Promise<string>;
			cachedRead: (file: TFile) => Promise<string>;
			getAbstractFileByPath: (path: string) => TFile | null;
		};
	};
	settings: {
		categories: Array<{ name: string; displayName: string; color: string }>;
		startHour: number;
		endHour: number;
	};
	getUiLanguage: () => "en";
	getEventHeadingConfig: () => { text: string; level: number };
	getDailyNoteFolder: () => string;
	getDailyNoteFormat: () => string;
	writeFile: (file: TFile, content: string) => Promise<void>;
	processWrite: (file: TFile, fn: (content: string) => string) => Promise<void>;
}

function createFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split("/").pop() ?? path;
	file.basename = file.name.replace(/\.md$/i, "");
	file.extension = "md";
	return file;
}

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, { bubbles: true, isPrimary: true, ...init });
}

interface TouchPoint {
	identifier: number;
	clientX: number;
	clientY: number;
}

function touchEvent(type: string, touches: TouchPoint[], changedTouches: TouchPoint[] = touches): TouchEvent {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		touches: { value: touches },
		changedTouches: { value: changedTouches },
	});
	return event as unknown as TouchEvent;
}

function createPluginStub(
	initialContent = DAILY_NOTE_CONTENT,
	initialPath = "2026-10-16.md",
	dateFormat = "YYYY-MM-DD",
	dailyNoteFolder = ""
): {
	plugin: DailyWorkLogPlugin;
	api: PluginStub;
	file: TFile;
	setActiveFile: (file: TFile | null) => void;
	setContent: (content: string) => void;
	getContent: () => string;
} {
	const file = createFile(initialPath);
	let activeFile: TFile | null = file;
	let content = initialContent;
	const files = new Map<string, TFile>([[file.path, file]]);

	const api: PluginStub = {
		app: {
			workspace: {
				getActiveFile: () => activeFile,
				getLeaf: () => ({ openFile: async () => {} }),
			},
			vault: {
				read: async () => content,
				cachedRead: async () => content,
				getAbstractFileByPath: (path) => files.get(path) ?? null,
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
		writeFile: async (_file, nextContent) => {
			content = nextContent;
		},
		processWrite: async (_file, fn) => {
			content = fn(content);
		},
	};

	return {
		plugin: api as unknown as DailyWorkLogPlugin,
		api,
		file,
		setActiveFile: (nextFile) => {
			activeFile = nextFile;
			if (nextFile) files.set(nextFile.path, nextFile);
		},
		setContent: (nextContent) => {
			content = nextContent;
		},
		getContent: () => content,
	};
}

describe("TimelineController", () => {
	let containers: HTMLDivElement[];
	let controllers: TimelineController[];

	beforeEach(() => {
		modalCalls.length = 0;
		confirmModalCalls.length = 0;
		Notice.reset();
		containers = [];
		controllers = [];
	});

	afterEach(() => {
		for (const controller of controllers) controller.destroy();
		for (const container of containers) container.remove();
	});

	async function renderController(
		fixture = createPluginStub()
	): Promise<{ fixture: ReturnType<typeof createPluginStub>; container: HTMLDivElement; controller: TimelineController }> {
		const container = document.createElement("div");
		document.body.appendChild(container);
		containers.push(container);
		const controller = new TimelineController(fixture.plugin, container);
		controllers.push(controller);
		await new Promise((resolve) => setTimeout(resolve, 0));
		return { fixture, container, controller };
	}

	function cells(container: HTMLElement): HTMLElement[] {
		return Array.from(container.querySelectorAll<HTMLElement>(".dwl-grid-cell"));
	}

	it("renders the configured 10-minute grid and recognizes nested daily note paths", async () => {
		const fixture = createPluginStub(
			DAILY_NOTE_CONTENT,
			"Log/2026/10/16.md",
			"YYYY/MM/DD",
			"Log"
		);
		const { container } = await renderController(fixture);

		expect(cells(container)).toHaveLength(144);
		expect(container.querySelector(".dwl-view-date-title")?.textContent).toContain("2026/10/16");
	});

	it("renders an empty state when no note or a non-daily note is active", async () => {
		const noNote = createPluginStub();
		noNote.setActiveFile(null);
		const emptyView = await renderController(noNote);
		expect(emptyView.container.querySelector(".dwl-empty-state-block h3")?.textContent).toContain("No note");

		const nonDaily = createPluginStub(DAILY_NOTE_CONTENT, "ordinary-note.md");
		const nonDailyView = await renderController(nonDaily);
		expect(nonDailyView.container.querySelector(".dwl-empty-state-block h3")?.textContent).toMatch(/not a daily note/i);
		expect(nonDailyView.container.querySelector(".dwl-empty-state-block p")).toBeNull();
	});

	it("shows the missing Event heading banner while keeping the grid usable", async () => {
		const { container } = await renderController(createPluginStub("# Journal\nSome text\n"));

		expect(container.querySelector(".dwl-missing-heading-banner")).not.toBeNull();
		expect(cells(container)).toHaveLength(144);
	});

	it("renders bar labels, tooltips, short-bar styling, and overnight segments", async () => {
		const { container } = await renderController(
			createPluginStub(
				"# Event\n- 09:00 - 09:10 [Work] Short\n- 23:00 - 01:00 [Work] Overnight\n"
			)
		);
		const blocks = Array.from(container.querySelectorAll<HTMLElement>(".dwl-grid-block"));
		const shortBlock = blocks.find((block) => block.classList.contains("is-short"));

		expect(blocks).toHaveLength(3);
		expect(shortBlock).toBeDefined();
		expect(shortBlock?.querySelector(".dwl-grid-block-label")?.textContent).toBe("Work");
		expect(shortBlock?.textContent).not.toContain("09:00");
		expect(shortBlock?.getAttribute("title")).toContain("09:00");
		expect(shortBlock?.querySelector("strong")).toBeNull();
		const rows = Array.from(container.querySelectorAll<HTMLElement>(".dwl-grid-row"));
		const overnightBlocks = blocks.filter((block) => block !== shortBlock);
		expect(rows.findIndex((row) => row.contains(overnightBlocks[0]))).toBe(0);
		expect(rows.findIndex((row) => row.contains(overnightBlocks[1]))).toBe(23);
		expect(shortBlock?.style.left).toMatch(/^calc\([\d.]+% \+ var\(--dwl-block-gap, 0\.3125rem\) \/ 2\)$/);
		expect(shortBlock?.style.width).toMatch(/^calc\([\d.]+% - var\(--dwl-block-gap, 0\.3125rem\)\)$/);
	});

	it("opens exactly one add modal for a drag released on a cell or outside the grid", async () => {
		const { container } = await renderController();
		const gridCells = cells(container);

		gridCells[0].dispatchEvent(pointerEvent("pointerdown"));
		gridCells[1].dispatchEvent(pointerEvent("pointerover"));
		gridCells[2].dispatchEvent(pointerEvent("pointerover"));
		gridCells[2].dispatchEvent(pointerEvent("pointerup"));
		expect(modalCalls).toHaveLength(1);
		expect(modalCalls[0][4]).toBe("00:00");
		expect(modalCalls[0][5]).toBe("00:30");

		gridCells[5].dispatchEvent(pointerEvent("pointerdown"));
		gridCells[7].dispatchEvent(pointerEvent("pointerover"));
		document.body.dispatchEvent(pointerEvent("pointerup"));
		expect(modalCalls).toHaveLength(2);
		expect(modalCalls[1][4]).toBe("00:50");
		expect(modalCalls[1][5]).toBe("01:20");
	});

	it("normalizes reverse drags, handles pointerleave, and permits a new drag", async () => {
		const { container } = await renderController();
		const gridCells = cells(container);

		gridCells[8].dispatchEvent(pointerEvent("pointerdown"));
		gridCells[6].dispatchEvent(pointerEvent("pointerover"));
		container.querySelector(".dwl-grid-wrap")?.dispatchEvent(pointerEvent("pointerleave"));
		expect(modalCalls).toHaveLength(1);
		expect(modalCalls[0][4]).toBe("01:00");
		expect(modalCalls[0][5]).toBe("01:30");

		gridCells[3].dispatchEvent(pointerEvent("pointerdown"));
		gridCells[4].dispatchEvent(pointerEvent("pointerup"));
		expect(modalCalls).toHaveLength(2);
	});

	it("cancels a drag without opening a modal and releases pointer capture on pointerdown", async () => {
		const { container } = await renderController();
		const firstCell = cells(container)[0];
		const releaseCapture = vi.fn();
		firstCell.hasPointerCapture = () => true;
		firstCell.releasePointerCapture = releaseCapture;

		firstCell.dispatchEvent(pointerEvent("pointerdown", { pointerId: 4 }));
		expect(releaseCapture).toHaveBeenCalledWith(4);
		firstCell.dispatchEvent(pointerEvent("pointerover", { pointerId: 4 }));
		container.querySelector(".dwl-grid-wrap")?.dispatchEvent(pointerEvent("pointercancel", { pointerId: 4 }));

		expect(firstCell.classList.contains("is-selecting")).toBe(false);
		expect(modalCalls).toHaveLength(0);
	});

	it("opens a 30-minute add range for a touch tap before the long-press threshold", async () => {
		const { container } = await renderController();
		const cell = cells(container)[5];
		const activeWindow = container.ownerDocument.defaultView;
		const touch = { identifier: 9, clientX: 10, clientY: 10 };

		cell.dispatchEvent(touchEvent("touchstart", [touch]));
		activeWindow?.dispatchEvent(touchEvent("touchend", [], [touch]));

		expect(modalCalls).toHaveLength(1);
		expect(modalCalls[0][4]).toBe("00:50");
		expect(modalCalls[0][5]).toBe("01:20");
	});

	it("starts touch selection after a long press and drags across multiple cells", async () => {
		vi.useFakeTimers();
		try {
			const fixture = createPluginStub();
			const container = document.createElement("div");
			document.body.appendChild(container);
			containers.push(container);
			const controller = new TimelineController(fixture.plugin, container);
			controllers.push(controller);
			await Promise.resolve();
			const gridCells = cells(container);
			const activeWindow = container.ownerDocument.defaultView;
			const targetCell = gridCells[18];
			Object.defineProperty(container.ownerDocument, "elementFromPoint", {
				configurable: true,
				value: () => targetCell,
			});

			const startTouch = { identifier: 12, clientX: 10, clientY: 10 };
			gridCells[0].dispatchEvent(touchEvent("touchstart", [startTouch]));
			await vi.advanceTimersByTimeAsync(249);
			expect(gridCells[0].classList.contains("is-selecting")).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			expect(gridCells[0].classList.contains("is-selecting")).toBe(true);

			const endTouch = { ...startTouch, clientX: 40, clientY: 10 };
			const moveEvent = touchEvent("touchmove", [endTouch]);
			activeWindow?.dispatchEvent(moveEvent);
			expect(gridCells.slice(0, 19).every((cell) => cell.classList.contains("is-selecting"))).toBe(true);
			expect(moveEvent.defaultPrevented).toBe(true);
			activeWindow?.dispatchEvent(touchEvent("touchend", [], [endTouch]));

			expect(modalCalls).toHaveLength(1);
			expect(modalCalls[0][4]).toBe("00:00");
			expect(modalCalls[0][5]).toBe("03:10");
		} finally {
			vi.useRealTimers();
		}
	});

	it("cancels an unarmed long press when the finger moves to scroll", async () => {
		vi.useFakeTimers();
		try {
			const fixture = createPluginStub();
			const container = document.createElement("div");
			document.body.appendChild(container);
			containers.push(container);
			const controller = new TimelineController(fixture.plugin, container);
			controllers.push(controller);
			await Promise.resolve();
			const cell = cells(container)[0];
			const activeWindow = container.ownerDocument.defaultView;
			const startTouch = { identifier: 15, clientX: 10, clientY: 10 };

			cell.dispatchEvent(touchEvent("touchstart", [startTouch]));
			const scrollMove = touchEvent("touchmove", [{
				...startTouch,
				clientY: 25,
			}]);
			activeWindow?.dispatchEvent(scrollMove);
			await vi.advanceTimersByTimeAsync(250);

			expect(cell.classList.contains("is-selecting")).toBe(false);
			expect(modalCalls).toHaveLength(0);
			expect(scrollMove.defaultPrevented).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("ignores non-primary touch pointers and resets an active touch drag on cancel", async () => {
		vi.useFakeTimers();
		try {
			const fixture = createPluginStub();
			const container = document.createElement("div");
			document.body.appendChild(container);
			containers.push(container);
			const controller = new TimelineController(fixture.plugin, container);
			controllers.push(controller);
			await Promise.resolve();
			const gridCells = cells(container);
			const activeWindow = container.ownerDocument.defaultView;

			gridCells[0].dispatchEvent(pointerEvent("pointerdown", {
				pointerId: 20,
				pointerType: "touch",
				isPrimary: false,
			}));
			gridCells[0].dispatchEvent(pointerEvent("pointerup", {
				pointerId: 20,
				pointerType: "touch",
				isPrimary: false,
			}));
			expect(modalCalls).toHaveLength(0);

			const touch = { identifier: 21, clientX: 10, clientY: 10 };
			gridCells[1].dispatchEvent(touchEvent("touchstart", [touch]));
			await vi.advanceTimersByTimeAsync(250);
			activeWindow?.dispatchEvent(touchEvent("touchcancel", [], [touch]));

			expect(gridCells[1].classList.contains("is-selecting")).toBe(false);
			expect(modalCalls).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears an active touch selection on touchcancel without opening a modal", async () => {
		vi.useFakeTimers();
		try {
			const fixture = createPluginStub();
			const container = document.createElement("div");
			document.body.appendChild(container);
			containers.push(container);
			const controller = new TimelineController(fixture.plugin, container);
			controllers.push(controller);
			await Promise.resolve();
			const cell = cells(container)[0];
			const activeWindow = container.ownerDocument.defaultView;
			const touch = { identifier: 27, clientX: 10, clientY: 10 };

			cell.dispatchEvent(touchEvent("touchstart", [touch]));
			await vi.advanceTimersByTimeAsync(250);
			activeWindow?.dispatchEvent(touchEvent("touchcancel", [], [touch]));

			expect(cell.classList.contains("is-selecting")).toBe(false);
			expect(modalCalls).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("updates selection classes without rebuilding the grid", async () => {
		const { container } = await renderController();
		const grid = container.querySelector(".dwl-grid");
		const initialCells = cells(container);

		initialCells[0].dispatchEvent(pointerEvent("pointerdown"));
		initialCells[2].dispatchEvent(pointerEvent("pointerover"));

		expect(container.querySelector(".dwl-grid")).toBe(grid);
		expect(cells(container)[0]).toBe(initialCells[0]);
		expect(initialCells.slice(0, 3).every((cell) => cell.classList.contains("is-selecting"))).toBe(true);
		expect(initialCells[3].classList.contains("is-selecting")).toBe(false);
	});

	it("writes a new event and reloads the active note", async () => {
		const { container, fixture } = await renderController(createPluginStub("# Event\n"));
		const gridCells = cells(container);
		gridCells[0].dispatchEvent(pointerEvent("pointerdown"));
		gridCells[1].dispatchEvent(pointerEvent("pointerup"));
		const save = modalCalls[0][6] as (values: EventEntryValues) => void;

		save({ start: "00:00", end: "00:20", category: "Work", description: "Created" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fixture.getContent()).toContain("- 00:00 - 00:20 [Work] Created");
		expect(container.querySelector(".dwl-grid-block")).not.toBeNull();
	});

	it("updates and deletes events only when their original line still matches", async () => {
		const fixture = createPluginStub();
		const { container } = await renderController(fixture);
		const block = container.querySelector<HTMLElement>(".dwl-grid-block");
		expect(block).not.toBeNull();
		block?.dispatchEvent(pointerEvent("pointerdown", { pointerId: 25, pointerType: "touch" }));
		block?.dispatchEvent(pointerEvent("pointerup", { pointerId: 25, pointerType: "touch" }));
		block?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		const update = modalCalls[0][6] as (values: EventEntryValues) => void;

		update({ start: "10:00", end: "11:00", category: "Work", description: "Updated" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fixture.getContent()).toContain("- 10:00 - 11:00 [Work] Updated");

		const updatedBlock = container.querySelector<HTMLElement>(".dwl-grid-block");
		updatedBlock?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		const requestDelete = modalCalls[1][7] as () => void;
		requestDelete();
		const confirm = confirmModalCalls[0][5] as () => void;
		confirm();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fixture.getContent()).not.toContain("Updated");
		expect(container.querySelectorAll(".dwl-grid-block")).toHaveLength(0);
	});

	it("does not overwrite a changed event line", async () => {
		const fixture = createPluginStub();
		const { container } = await renderController(fixture);
		const block = container.querySelector<HTMLElement>(".dwl-grid-block");
		block?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		const update = modalCalls[0][6] as (values: EventEntryValues) => void;
		fixture.setContent("# Event\n- 09:00 - 10:00 [Work] Changed elsewhere\n");

		update({ start: "10:00", end: "11:00", category: "Work", description: "Must not win" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fixture.getContent()).toContain("Changed elsewhere");
		expect(fixture.getContent()).not.toContain("Must not win");
	});

	it("renders a newly selected daily note once after its content loads", async () => {
		const fixture = createPluginStub();
		const { container, controller } = await renderController(fixture);
		const nextFile = createFile("2026-10-17.md");
		fixture.api.app.vault.cachedRead = async () =>
			"# Event\n- 11:00 - 12:00 [Work] Next day\n";
		fixture.setActiveFile(nextFile);

		const render = vi.spyOn(controller as unknown as { render: () => void }, "render");
		controller.refresh();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(render).toHaveBeenCalledTimes(1);
		expect(container.querySelector(".dwl-view-date-title")?.textContent).toContain("2026-10-17");
		expect(container.querySelector(".dwl-grid-block")?.getAttribute("title")).toContain("Next day");
	});

	it("ignores stale async note reads and removes the global listener on destroy", async () => {
		const fixture = createPluginStub();
		const firstFile = fixture.file;
		const secondFile = createFile("2026-10-17.md");
		let resolveFirst: ((content: string) => void) | undefined;
		let resolveSecond: ((content: string) => void) | undefined;
		fixture.api.app.vault.cachedRead = (file) =>
			new Promise((resolve) => {
				if (file.path === firstFile.path) resolveFirst = resolve;
				else resolveSecond = resolve;
			});

		const container = document.createElement("div");
		document.body.appendChild(container);
		containers.push(container);
		const controller = new TimelineController(fixture.plugin, container);
		controllers.push(controller);
		fixture.setActiveFile(secondFile);
		controller.refresh();
		resolveSecond?.("# Event\n- 11:00 - 12:00 [Work] New\n");
		await new Promise((resolve) => setTimeout(resolve, 0));
		resolveFirst?.("# Event\n- 09:00 - 10:00 [Work] Old\n");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(container.querySelector(".dwl-view-date-title")?.textContent).toContain("2026-10-17");
		expect(container.querySelector(".dwl-grid-block")?.getAttribute("title")).toContain("New");
		expect(container.textContent).not.toContain("Old");

		cells(container)[0].dispatchEvent(pointerEvent("pointerdown"));
		controller.destroy();
		document.body.dispatchEvent(pointerEvent("pointerup"));
		expect(container.childElementCount).toBe(0);
		expect(modalCalls).toHaveLength(0);
	});

	it("surfaces cached-read failures as a localized notice", async () => {
		const fixture = createPluginStub();
		fixture.api.app.vault.cachedRead = async () => {
			throw new Error("read failure");
		};
		await renderController(fixture);

		expect(Notice.shown).toContain("Failed to load timeline: read failure");
	});
});
