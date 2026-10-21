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

import { beforeEach, describe, expect, it } from "vitest";
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
			dailyNoteFolder: "",
		},
		getUiLanguage: (): MarkerLanguage => "en",
		getEventHeadingConfig: () => ({ text: "Event", level: 1 }),
	} as never;
}

/** A vault holding one daily note, dated today. */
function createAppStub(noteContent: string): never {
	const file = new TFile();
	file.path = "2026-07-14.md";
	file.name = "2026-07-14.md";
	file.basename = "2026-07-14";
	file.extension = "md";

	return {
		workspace: { openLinkText: () => {} },
		vault: {
			getFiles: () => [file],
			getFolderByPath: () => null,
			cachedRead: async () => noteContent,
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

	const container = document.createElement("div");
	container.children[1] = document.createElement("div");
	// `container.children[1]` is the view's content area; Obsidian's DOM
	// helpers expect a real child element to render into.
	const viewEl = document.createElement("div");
	viewEl.appendChild(document.createElement("div"));
	viewEl.appendChild(document.createElement("div"));
	(view as unknown as { containerEl: HTMLElement }).containerEl = viewEl;

	await view.refresh();
	return viewEl.children[1] as HTMLElement;
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
});
