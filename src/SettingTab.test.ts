/**
 * @vitest-environment happy-dom
 *
 * Settings tab behaviour.
 *
 * These tests drive the REAL `DailyWorkLogSettingTab` against a real DOM,
 * because the behaviour under test is a chain of UI callbacks: a text
 * field's `onChange` mutating the settings object, saving it, and
 * triggering a view refresh. The Obsidian module is aliased to the local
 * stub, whose `Setting` mock records the components it creates so a test
 * can reach them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installObsidianDomHelpers } from "./test/obsidian-dom-mock";
import { Setting } from "obsidian";

installObsidianDomHelpers();

import { DailyWorkLogSettingTab } from "./SettingTab";

/** A plugin stub recording the settings mutations it is asked to make. */
function createPluginStub() {
	const settings = {
		language: "auto" as const,
		eventHeadingText: "Event",
		eventHeadingLevel: 1,
		startHour: 0,
		endHour: 24,
		dailyNoteFolder: "",
		categories: [
			{ name: "Work", displayName: "Work", color: "#d0e1fd", isDefault: true },
			{ name: "Study", displayName: "Study", color: "#ebd3f8", isDefault: true },
		],
	};

	const refreshViews = vi.fn();
	const saveSettings = vi.fn(async () => {});

	return {
		settings,
		refreshViews,
		saveSettings,
		getUiLanguage: () => "en",
	} as never;
}

/** The settings whose name matches, found among the recorded settings. */
function settingWithPlaceholder(placeholder: string): Setting {
	const match = Setting.created.find((setting) =>
		setting.components.texts.some((text) => text.inputEl.placeholder === placeholder)
	);
	if (!match) throw new Error(`No setting found with placeholder "${placeholder}"`);
	return match;
}

/** The setting whose text input has no placeholder (the Event heading field). */
function settingWithoutPlaceholder(): Setting {
	const match = Setting.created.find(
		(setting) =>
			setting.components.texts.length > 0 &&
			setting.components.texts.every((text) => text.inputEl.placeholder === "")
	);
	if (!match) throw new Error("No setting found without a placeholder");
	return match;
}

describe("DailyWorkLogSettingTab", () => {
	beforeEach(() => {
		Setting.reset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	/**
	 * Renders the tab and returns the plugin stub it was rendered with.
	 */
	function renderTab(): ReturnType<typeof createPluginStub> {
		const plugin = createPluginStub();
		const tab = new DailyWorkLogSettingTab({} as never, plugin);
		tab.display();
		return plugin;
	}

	it("refreshes the views when the daily-note folder changes", async () => {
		const plugin = renderTab();
		const folderSetting = settingWithPlaceholder("Whole vault");
		const folderInput = folderSetting.components.texts[0];

		expect(plugin.refreshViews).not.toHaveBeenCalled();

		await folderInput.setValueFromUser("Daily Notes");

		// The folder change is debounced, because it drives a vault-wide
		// note scan and rebuilding the editor extensions.
		await new Promise((resolve) => setTimeout(resolve, 600));

		// The folder filter drives the dashboard's note scan and the
		// category badge scope, so both must be rebuilt when it changes.
		expect(plugin.settings.dailyNoteFolder).toBe("Daily Notes");
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(plugin.refreshViews).toHaveBeenCalled();
	}, 5000);

	it("refreshes the views when the Event heading text changes", async () => {
		const plugin = renderTab();
		const headingSetting = settingWithoutPlaceholder();
		const headingInput = headingSetting.components.texts[0];

		await headingInput.setValueFromUser("Activity");

		expect(plugin.settings.eventHeadingText).toBe("Activity");
		expect(plugin.refreshViews).toHaveBeenCalled();
	}, 5000);

	it("gives each category row the structure its CSS depends on", () => {
		renderTab();

		// The per-category rows are the ones tagged `dwl-category-setting-item`.
		// They are identified by the class rather than by "has a colour
		// picker", because the "Add New Category" row has a colour picker
		// too but is an ordinary named setting.
		const categoryRows = Setting.created.filter((setting) =>
			setting.settingEl.classList.contains("dwl-category-setting-item")
		);
		expect(categoryRows.length).toBe(2);

		for (const row of categoryRows) {
			// The name element is empty — the text input IS the name.
			expect(row.nameEl.textContent).toBe("");

			// Obsidian's own structure: the name/description live in
			// `.setting-item-info`, the controls in a sibling
			// `.setting-item-control`. The plugin's CSS hides the info
			// block, so the structure has to be exactly this.
			expect(row.infoEl.contains(row.nameEl)).toBe(true);
			expect(row.infoEl.contains(row.descEl)).toBe(true);
			expect(row.settingEl.contains(row.infoEl)).toBe(true);
			expect(row.settingEl.contains(row.controlEl)).toBe(true);
			expect(row.controlEl.contains(row.infoEl)).toBe(false);

			// The controls live in the control block, not in the info one.
			expect(row.controlEl.querySelector("input[type='text']")).not.toBeNull();
		}
	});

	it("gives the category section's description to the heading row", () => {
		renderTab();

		// The section description rides on the heading row's own
		// `.setting-item-description`, rather than on a hand-rolled
		// `<p>` between two setting rows.
		const heading = Setting.created.find(
			(setting) =>
				setting.settingEl.classList.contains("setting-item-heading") &&
				setting.nameEl.textContent === "Category Management"
		);
		expect(heading).toBeDefined();
		expect(heading?.descEl.textContent).toBe(
			"Customize the categories and colors used in your daily logs."
		);
	});
});
