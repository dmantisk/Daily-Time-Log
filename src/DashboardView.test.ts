/**
 * @vitest-environment happy-dom
 *
 * Dashboard metric tooltips.
 *
 * A bare label like "Daily Avg" or "Date Range" does not say how the
 * number beside it is computed, so the figure cannot be interpreted on
 * its own — which is exactly why the ambiguity behind the "Daily Avg"
 * denominator defect was invisible to users. The tooltip is where that
 * meaning lives.
 *
 * These tests drive the REAL `DashboardView` against a real DOM and
 * assert that every metric carries an explanation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { installObsidianDomHelpers } from "./test/obsidian-dom-mock";

installObsidianDomHelpers();

import { DashboardView } from "./DashboardView";
import { TFile } from "obsidian";
import type { MarkerLanguage } from "./parser";

/** A plugin stub good enough for the dashboard to render. */
function createPluginStub(): never {
	return {
		settings: {
			categories: [
				{ name: "Work", displayName: "Work", color: "#d0e1fd" },
				{ name: "Study", displayName: "Study", color: "#ebd3f8" },
			],
		},
		getDailyNoteFolder: () => "",
		getDailyNoteFormat: () => "YYYY-MM-DD",
		getUiLanguage: (): MarkerLanguage => "en",
		getEventHeadingConfig: () => ({ text: "Event", level: 1 }),
	} as never;
}

/** A vault holding one daily note, dated today. */
function createAppStub(noteContent: string, cachedRead = async () => noteContent): never {
	const file = new TFile();
	const today = new Date();
	const datePath = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
	file.path = datePath;
	file.name = datePath;
	file.basename = datePath.slice(0, -3);
	file.extension = "md";
	file.stat = { ctime: Date.now(), mtime: Date.now(), size: noteContent.length };

	return {
		workspace: { openLinkText: () => {} },
		vault: {
			getMarkdownFiles: () => [file],
			getFolderByPath: () => null,
			cachedRead,
		},
	} as never;
}

/**
 * Renders the dashboard and returns its container.
 *
 * The view reads "today" from the real clock, so the note is dated today
 * to keep it inside the default 30-day window.
 */
async function renderDashboard(noteContent = "# Event\n- 09:00 - 10:00 [Work] a\n"): Promise<HTMLElement> {
	const view = new DashboardView({} as never, createPluginStub());
	(view as unknown as { app: unknown }).app = createAppStub(noteContent);

	// The view renders into `ItemView.contentEl` — Obsidian's own content
	// area for a view — rather than a hand-picked child of `containerEl`.
	const contentEl = document.createElement("div");
	(view as unknown as { contentEl: HTMLElement }).contentEl = contentEl;

	await view.refresh();
	return contentEl;
}
/** The tooltip text attached to an element, or undefined. */
function tooltipOf(el: Element | null | undefined): string | undefined {
	return el?.getAttribute("aria-label") ?? undefined;
}

describe("DashboardView metric tooltips", () => {
	let container: HTMLElement;

	beforeEach(async () => {
		container = await renderDashboard();
	});

	it("explains every KPI card label", () => {
		const labels = [...container.querySelectorAll(".dwl-kpi-label")];
		expect(labels.length).toBe(3);
		for (const label of labels) {
			expect(tooltipOf(label)).toBeTruthy();
		}
	});

	it("explains the Daily Avg figure", () => {
		// The metric whose meaning was ambiguous enough to be worth a
		// review finding: the tooltip must state that the denominator is
		// the days that RECORDED TIME, not the days in the window.
		const avg = [...container.querySelectorAll(".dwl-kpi-footer")].find((el) =>
			el.textContent?.startsWith("Daily Avg")
		);
		expect(avg).toBeDefined();
		expect(tooltipOf(avg)).toContain("per day that recorded time");
	});

	it("explains every Period Summary row", () => {
		const labels = [...container.querySelectorAll(".dwl-summary-label")];
		expect(labels.length).toBe(4);
		for (const label of labels) {
			expect(tooltipOf(label)).toBeTruthy();
		}
	});

	it("explains that Total Notes excludes future-dated notes", () => {
		const totalNotes = [...container.querySelectorAll(".dwl-kpi-label")].find(
			(el) => el.textContent === "Total Notes"
		);
		expect(tooltipOf(totalNotes)).toContain("future");
	});

	it("attaches no tooltip to the value or the badge", () => {
		// Only the LABEL carries the explanation — the value itself is the
		// number, and a tooltip there would be noise.
		const value = container.querySelector(".dwl-kpi-value");
		expect(tooltipOf(value)).toBeUndefined();
	});

	it("shows the selected window in the dropdown, and matches the metric label", () => {
		// The dropdown's VALUE must carry the window (30), not its label
		// ("Last 30 Days") — a mismatch here would mean the control shows
		// one window while the figures cover another.
		const select = container.querySelector("select") as HTMLSelectElement;
		expect(select.value).toBe("30");
		expect([...select.options].map((o) => o.value)).toEqual(["7", "30", "90", "0"]);

		// The "Event Time" label names the window the figures cover, so it
		// must agree with the dropdown.
		const eventTime = [...container.querySelectorAll(".dwl-kpi-label")].find((el) =>
			el.textContent?.startsWith("Event Time")
		);
		expect(eventTime?.textContent).toContain("30");
	});

	it("builds its controls from Obsidian's own components", () => {
		// The window selector is a `DropdownComponent`, so the `<select>`
		// it creates carries Obsidian's own `dropdown` class — not one
		// of the plugin's.
		const select = container.querySelector("select") as HTMLSelectElement;
		expect(select.classList.contains("dropdown")).toBe(true);
		expect(container.querySelector(".dwl-dashboard-select")).toBeNull();

		// The refresh control is a `ButtonComponent` with the app's own
		// icon-button class and the "Refresh" label as its tooltip.
		const refresh = container.querySelector(".clickable-icon") as HTMLButtonElement;
		expect(refresh).not.toBeNull();
		expect(refresh.getAttribute("aria-label")).toBe("Refresh");
		expect(container.querySelector(".dwl-dashboard-refresh-btn")).toBeNull();
	});

	it("preserves the dashboard header and dropdown on refresh", async () => {
		const noteContent = "# Event\n- 09:00 - 10:00 [Work] a\n";
		const view = new DashboardView({} as never, createPluginStub());
		const container = document.createElement("div");
		(view as unknown as { app: unknown }).app = createAppStub(noteContent);
		(view as unknown as { contentEl: HTMLElement }).contentEl = container;

		await view.refresh();
		const headerBefore = container.querySelector(".dwl-dashboard-header");
		const dropdownBefore = container.querySelector("select");
		expect(headerBefore).not.toBeNull();

		await view.refresh();
		const headerAfter = container.querySelector(".dwl-dashboard-header");
		const dropdownAfter = container.querySelector("select");
		expect(headerAfter).toBe(headerBefore);
		expect(dropdownAfter).toBe(dropdownBefore);
	});

	it("rebuilds the dashboard header when the UI language changes", async () => {
		const plugin = createPluginStub() as { getUiLanguage: () => MarkerLanguage };
		let language: MarkerLanguage = "en";
		plugin.getUiLanguage = () => language;
		const view = new DashboardView({} as never, plugin as never);
		(view as unknown as { app: unknown }).app = createAppStub("# Event\n");
		const container = document.createElement("div");
		(view as unknown as { contentEl: HTMLElement }).contentEl = container;

		await view.refresh();
		const englishHeader = container.querySelector(".dwl-dashboard-header");
		language = "ko";
		await view.refresh();

		expect(container.querySelector(".dwl-dashboard-header")).not.toBe(englishHeader);
		expect(container.querySelector(".dwl-dashboard-title")?.textContent).toBe("일과 인사이트");
	});

	it("reuses parsed note content until the file's modification time changes", async () => {
		const noteContent = "# Event\n- 09:00 - 10:00 [Work] a\n";
		const cachedRead = vi.fn(async () => noteContent);
		const view = new DashboardView({} as never, createPluginStub());
		(view as unknown as { app: unknown }).app = createAppStub(noteContent, cachedRead);
		(view as unknown as { contentEl: HTMLElement }).contentEl = document.createElement("div");

		await view.refresh();
		await view.refresh();

		expect(cachedRead).toHaveBeenCalledTimes(1);
	});
});
