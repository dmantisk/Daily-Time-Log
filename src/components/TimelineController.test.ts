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
}

function createFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split("/").pop() ?? path;
	file.basename = file.name.replace(/\.md$/i, "");
	file.extension = "md";
	return file;
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
		expect(shortBlock?.style.left).toMatch(/^calc\([\d.]+% \+ var\(--dwl-block-gap, 5px\) \/ 2\)$/);
		expect(shortBlock?.style.width).toMatch(/^calc\([\d.]+% - var\(--dwl-block-gap, 5px\)\)$/);
	});

	it("opens exactly one add modal for a drag released on a cell or outside the grid", async () => {
		const { container } = await renderController();
		const gridCells = cells(container);

		gridCells[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		gridCells[1].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
		gridCells[2].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
		gridCells[2].dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
		expect(modalCalls).toHaveLength(1);
		expect(modalCalls[0][4]).toBe("00:00");
		expect(modalCalls[0][5]).toBe("00:30");

		gridCells[5].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		gridCells[7].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
		document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
		expect(modalCalls).toHaveLength(2);
		expect(modalCalls[1][4]).toBe("00:50");
		expect(modalCalls[1][5]).toBe("01:20");
	});

	it("normalizes reverse drags, handles pointerleave, and permits a new drag", async () => {
		const { container } = await renderController();
		const gridCells = cells(container);

		gridCells[8].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		gridCells[6].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
		container.querySelector(".dwl-grid-wrap")?.dispatchEvent(new PointerEvent("pointerleave"));
		expect(modalCalls).toHaveLength(1);
		expect(modalCalls[0][4]).toBe("01:00");
		expect(modalCalls[0][5]).toBe("01:30");

		gridCells[3].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		gridCells[4].dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
		expect(modalCalls).toHaveLength(2);
	});

	it("cancels a drag without opening a modal and releases pointer capture on pointerdown", async () => {
		const { container } = await renderController();
		const firstCell = cells(container)[0];
		const releaseCapture = vi.fn();
		firstCell.hasPointerCapture = () => true;
		firstCell.releasePointerCapture = releaseCapture;

		firstCell.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 4 }));
		expect(releaseCapture).toHaveBeenCalledWith(4);
		firstCell.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
		container.querySelector(".dwl-grid-wrap")?.dispatchEvent(new PointerEvent("pointercancel"));

		expect(firstCell.classList.contains("is-selecting")).toBe(false);
		expect(modalCalls).toHaveLength(0);
	});

	it("updates selection classes without rebuilding the grid", async () => {
		const { container } = await renderController();
		const grid = container.querySelector(".dwl-grid");
		const initialCells = cells(container);

		initialCells[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		initialCells[2].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

		expect(container.querySelector(".dwl-grid")).toBe(grid);
		expect(cells(container)[0]).toBe(initialCells[0]);
		expect(initialCells.slice(0, 3).every((cell) => cell.classList.contains("is-selecting"))).toBe(true);
		expect(initialCells[3].classList.contains("is-selecting")).toBe(false);
	});

	it("writes a new event and reloads the active note", async () => {
		const { container, fixture } = await renderController(createPluginStub("# Event\n"));
		const gridCells = cells(container);
		gridCells[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		gridCells[1].dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
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

		cells(container)[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		controller.destroy();
		document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
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
