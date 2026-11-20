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
import { Setting, Notice, TextComponent, ColorComponent } from "./test/obsidian-mock";

installObsidianDomHelpers();

import { DailyWorkLogSettingTab } from "./SettingTab";

/** Loose view of Obsidian's SettingDefinitionItem union; the tests probe both variants. */
interface TestDefinition {
	type?: string;
	name?: string;
	desc?: string;
	items?: TestDefinition[];
	render?: (setting: Setting, context: never) => void;
}

function definitionsOf(tab: DailyWorkLogSettingTab): TestDefinition[] {
	return tab.getSettingDefinitions() as unknown as TestDefinition[];
}

/** A plugin stub recording the settings mutations it is asked to make. */
function createPluginStub() {
	const settings = {
		language: "auto" as const,
		eventHeadingText: "Event",
		eventHeadingLevel: 1,
		dayStartMinutes: 0,
		dayEndMinutes: 0,
		tabularTimeRanges: true,
		focusEditorAfterSave: false,
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
	};
}

/** The setting whose text input has no placeholder (the Event heading field). */
function settingWithoutPlaceholder(): Setting {
	const match = Setting.created.find(
		(setting) =>
			setting.components.texts.length > 0 &&
			setting.nameEl.textContent === "Event heading text" &&
			setting.components.texts.every((text) => text.inputEl.placeholder === "")
	);
	if (!match) throw new Error("No setting found without a placeholder");
	return match;
}

/**
 * Renders the tab and returns the plugin stub it was rendered with.
 */
function renderTab(): ReturnType<typeof createPluginStub> {
	const plugin = createPluginStub();
	const tab = new DailyWorkLogSettingTab({} as never, plugin as never);
	const container = document.createElement("div");
	for (const definition of definitionsOf(tab)) {
		const items = definition.type === "group" ? (definition.items ?? []) : [definition];
		for (const item of items) {
			if ("render" in item && item.render) {
				const setting = new Setting(container);
				setting.setName(item.name ?? "");
				if (item.desc) setting.setDesc(item.desc);
				item.render(setting, {} as never);
			}
		}
	}
	return plugin;
}

describe("DailyWorkLogSettingTab", () => {
	beforeEach(() => {
		Setting.reset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps searchable setting definitions inline without a page entry", () => {
		const plugin = createPluginStub();
		const tab = new DailyWorkLogSettingTab({} as never, plugin as never);
		const definitions = definitionsOf(tab);

		expect(definitions.some((definition) => definition.type === "page")).toBe(false);
		expect(definitions.some((definition) => definition.name === "Day Start Time")).toBe(true);
		// Find the "Category Management" group (not the "Commands" group)
		const categoryGroup = definitions.find(
			(definition) =>
				definition.type === "group" && definition.items?.some((item) => item.name === "Category Management")
		);
		expect(categoryGroup?.type).toBe("group");
		if (categoryGroup?.type === "group") {
			expect(categoryGroup.items?.some((item) => item.name === "Category Management")).toBe(true);
		}
	});

	it("updates declarative setting labels after changing the language", async () => {
		const plugin = createPluginStub();
		const settings = (
			plugin as unknown as {
				settings: { language: string };
			}
		).settings;
		const getUiLanguage = () => (settings.language === "ko" ? "ko" : "en");
		(plugin as unknown as { getUiLanguage: () => string }).getUiLanguage = getUiLanguage;
		const tab = new DailyWorkLogSettingTab({} as never, plugin as never);
		const update = vi.spyOn(tab, "update");
		const languageDefinition = definitionsOf(tab).find((definition) => definition.name === "Language");
		if (!languageDefinition || !("render" in languageDefinition) || !languageDefinition.render) {
			throw new Error("Language setting definition is missing its renderer");
		}

		let onChange: ((value: string) => Promise<void>) | undefined;
		const dropdown = {
			addOption: () => dropdown,
			setValue: () => dropdown,
			onChange: (callback: (value: string) => Promise<void>) => {
				onChange = callback;
				return dropdown;
			},
		};
		const setting = {
			addDropdown: (callback: (component: typeof dropdown) => void) => {
				callback(dropdown);
				return setting;
			},
		};
		languageDefinition.render(setting as never, {} as never);
		if (!onChange) throw new Error("Language dropdown callback was not registered");
		await onChange("ko");

		expect(update).toHaveBeenCalledOnce();
		expect(definitionsOf(tab).find((definition) => definition.name === "언어")).toBeDefined();
	});

	it("refreshes the views when the Event heading text changes", async () => {
		const plugin = renderTab();
		const headingSetting = settingWithoutPlaceholder();
		const headingInput = headingSetting.components.texts[0];

		await headingInput.setValueFromUser("Activity");

		expect(plugin.settings.eventHeadingText).toBe("Activity");
		expect(plugin.refreshViews).toHaveBeenCalled();
	}, 5000);

	it("persists and refreshes when the monospaced time option changes", async () => {
		const plugin = renderTab();
		const timeSetting = Setting.created.find((setting) => setting.components.toggles.length > 0);
		expect(timeSetting).toBeDefined();
		expect(timeSetting?.components.toggles[0].getValue()).toBe(true);

		await timeSetting?.components.toggles[0].setValueFromUser(false);

		expect(plugin.settings.tabularTimeRanges).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalledOnce();
		expect(plugin.refreshViews).toHaveBeenCalledOnce();
	});

	it("persists and refreshes when editor focus after saving changes", async () => {
		const plugin = renderTab();
		const focusSetting = Setting.created.find(
			(setting) => setting.nameEl.textContent === "Automatically focus editor after saving"
		);
		expect(focusSetting).toBeDefined();
		expect(focusSetting?.components.toggles[0].getValue()).toBe(false);

		await focusSetting?.components.toggles[0].setValueFromUser(true);

		expect(plugin.settings.focusEditorAfterSave).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledOnce();
		expect(plugin.refreshViews).toHaveBeenCalledOnce();
	});

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
		expect(heading?.descEl.textContent).toBe("Customize the categories and colors used in your daily logs.");
	});
});

describe("Category bracket validation", () => {
	beforeEach(() => {
		Setting.reset();
		Notice.reset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	/**
	 * Renders the tab and returns the plugin stub and the "Add New Category" button.
	 */
	function renderTabWithAddCategory(): { plugin: ReturnType<typeof createPluginStub>; addButton: HTMLButtonElement } {
		const plugin = renderTab();
		// Find the "Add" button in the "Add New Category" row
		const addSetting = Setting.created.find((setting) => setting.nameEl.textContent === "Add New Category");
		if (!addSetting) throw new Error("Add New Category setting not found");
		const addButton = addSetting.components.buttons[0].buttonEl;
		if (!addButton) throw new Error("Add button not found");
		return { plugin, addButton };
	}

	/**
	 * Finds the text input component in the "Add New Category" row.
	 */
	function getAddCategoryTextInput(): TextComponent {
		const addSetting = Setting.created.find((setting) => setting.nameEl.textContent === "Add New Category");
		if (!addSetting) throw new Error("Add New Category setting not found");
		const textInput = addSetting.components.texts[0];
		if (!textInput) throw new Error("Add category text input not found");
		return textInput;
	}

	/**
	 * Finds the color picker component in the "Add New Category" row.
	 */
	function getAddCategoryColorPicker(): ColorComponent {
		const addSetting = Setting.created.find((setting) => setting.nameEl.textContent === "Add New Category");
		if (!addSetting) throw new Error("Add New Category setting not found");
		const colorPicker = addSetting.components.colorPickers[0];
		if (!colorPicker) throw new Error("Add category color picker not found");
		return colorPicker;
	}

	/**
	 * Finds the text input component for an existing category row by its display name.
	 */
	function getCategoryTextInput(displayName: string): TextComponent {
		const categorySetting = Setting.created.find(
			(setting) =>
				setting.settingEl.classList.contains("dwl-category-setting-item") &&
				setting.components.texts[0].getValue() === displayName
		);
		if (!categorySetting) throw new Error(`Category setting for "${displayName}" not found`);
		return categorySetting.components.texts[0];
	}

	it("rejects adding a new category with brackets in the name", async () => {
		const { plugin, addButton } = renderTabWithAddCategory();
		const textInput = getAddCategoryTextInput();
		const colorPicker = getAddCategoryColorPicker();

		// Set a name with brackets using the proper method
		await textInput.setValueFromUser("QA[UX]");
		await colorPicker.pickColor("#ff0000");

		// Click the Add button
		addButton.click();

		// Wait for async operations
		await vi.waitFor(() => {});

		// Assert: category was not added
		expect(plugin.settings.categories.length).toBe(2);
		expect(plugin.settings.categories.map((c) => c.displayName)).toEqual(["Work", "Study"]);

		// Assert: saveSettings was not called
		expect(plugin.saveSettings).not.toHaveBeenCalled();

		// Assert: refreshViews was not called
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		// Assert: Notice was shown with the bracket restriction message
		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("rejects adding a new category with opening bracket only", async () => {
		const { plugin, addButton } = renderTabWithAddCategory();
		const textInput = getAddCategoryTextInput();
		const colorPicker = getAddCategoryColorPicker();

		await textInput.setValueFromUser("QA[UX");
		await colorPicker.pickColor("#ff0000");

		addButton.click();
		await vi.waitFor(() => {});

		expect(plugin.settings.categories.length).toBe(2);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("rejects adding a new category with closing bracket only", async () => {
		const { plugin, addButton } = renderTabWithAddCategory();
		const textInput = getAddCategoryTextInput();
		const colorPicker = getAddCategoryColorPicker();

		await textInput.setValueFromUser("QAUX]");
		await colorPicker.pickColor("#ff0000");

		addButton.click();
		await vi.waitFor(() => {});

		expect(plugin.settings.categories.length).toBe(2);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("rejects adding a new category with just an opening bracket", async () => {
		const { plugin, addButton } = renderTabWithAddCategory();
		const textInput = getAddCategoryTextInput();
		const colorPicker = getAddCategoryColorPicker();

		await textInput.setValueFromUser("[");
		await colorPicker.pickColor("#ff0000");

		addButton.click();
		await vi.waitFor(() => {});

		expect(plugin.settings.categories.length).toBe(2);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("rejects adding a new category with just a closing bracket", async () => {
		const { plugin, addButton } = renderTabWithAddCategory();
		const textInput = getAddCategoryTextInput();
		const colorPicker = getAddCategoryColorPicker();

		await textInput.setValueFromUser("]");
		await colorPicker.pickColor("#ff0000");

		addButton.click();
		await vi.waitFor(() => {});

		expect(plugin.settings.categories.length).toBe(2);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("accepts adding a new category with a valid name (no brackets)", async () => {
		const { plugin, addButton } = renderTabWithAddCategory();
		const textInput = getAddCategoryTextInput();
		const colorPicker = getAddCategoryColorPicker();

		await textInput.setValueFromUser("QA-UX");
		await colorPicker.pickColor("#ff0000");

		addButton.click();
		await vi.waitFor(() => {});

		// Assert: category was added
		expect(plugin.settings.categories.length).toBe(3);
		expect(plugin.settings.categories[2].displayName).toBe("QA-UX");
		expect(plugin.settings.categories[2].color).toBe("#ff0000");

		// Assert: saveSettings was called
		expect(plugin.saveSettings).toHaveBeenCalledOnce();

		// Assert: refreshViews was called
		expect(plugin.refreshViews).toHaveBeenCalledOnce();

		// Assert: No error notice
		expect(Notice.shown.length).toBe(0);
	});

	it("accepts adding a new category with a valid Korean name", async () => {
		const { plugin, addButton } = renderTabWithAddCategory();
		const textInput = getAddCategoryTextInput();
		const colorPicker = getAddCategoryColorPicker();

		await textInput.setValueFromUser("업무");
		await colorPicker.pickColor("#ff0000");

		addButton.click();
		await vi.waitFor(() => {});

		expect(plugin.settings.categories.length).toBe(3);
		expect(plugin.settings.categories[2].displayName).toBe("업무");
		expect(plugin.saveSettings).toHaveBeenCalledOnce();
		expect(plugin.refreshViews).toHaveBeenCalledOnce();

		expect(Notice.shown.length).toBe(0);
	});

	it("rejects renaming an existing category to a name with brackets", async () => {
		const plugin = renderTab();
		const textInput = getCategoryTextInput("Work");

		// Change the name to one with brackets
		await textInput.setValueFromUser("QA[UX]");
		textInput.inputEl.dispatchEvent(new Event("blur"));

		await vi.waitFor(() => {});

		// Assert: category was not renamed
		expect(plugin.settings.categories[0].displayName).toBe("Work");

		// Assert: saveSettings was not called
		expect(plugin.saveSettings).not.toHaveBeenCalled();

		// Assert: refreshViews was not called
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		// Assert: Notice was shown
		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("rejects renaming an existing category to a name with opening bracket only", async () => {
		const plugin = renderTab();
		const textInput = getCategoryTextInput("Work");

		await textInput.setValueFromUser("QA[UX");
		textInput.inputEl.dispatchEvent(new Event("blur"));

		await vi.waitFor(() => {});

		expect(plugin.settings.categories[0].displayName).toBe("Work");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("rejects renaming an existing category to a name with closing bracket only", async () => {
		const plugin = renderTab();
		const textInput = getCategoryTextInput("Work");

		await textInput.setValueFromUser("QAUX]");
		textInput.inputEl.dispatchEvent(new Event("blur"));

		await vi.waitFor(() => {});

		expect(plugin.settings.categories[0].displayName).toBe("Work");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.refreshViews).not.toHaveBeenCalled();

		expect(Notice.shown.length).toBeGreaterThan(0);
		expect(Notice.shown[0]).toContain("[");
	});

	it("accepts renaming an existing category to a valid name", async () => {
		const plugin = renderTab();
		const textInput = getCategoryTextInput("Work");

		await textInput.setValueFromUser("Deep Work");
		textInput.inputEl.dispatchEvent(new Event("blur"));

		await vi.waitFor(() => {});

		// Assert: category was renamed
		expect(plugin.settings.categories[0].displayName).toBe("Deep Work");

		// Assert: saveSettings was called
		expect(plugin.saveSettings).toHaveBeenCalledOnce();

		// Assert: refreshViews was called
		expect(plugin.refreshViews).toHaveBeenCalledOnce();

		// Assert: No error notice
		expect(Notice.shown.length).toBe(0);
	});

	it("accepts renaming an existing category to a valid Korean name", async () => {
		const plugin = renderTab();
		const textInput = getCategoryTextInput("Work");

		await textInput.setValueFromUser("개인 프로젝트");
		textInput.inputEl.dispatchEvent(new Event("blur"));

		await vi.waitFor(() => {});

		expect(plugin.settings.categories[0].displayName).toBe("개인 프로젝트");
		expect(plugin.saveSettings).toHaveBeenCalledOnce();
		expect(plugin.refreshViews).toHaveBeenCalledOnce();

		expect(Notice.shown.length).toBe(0);
	});
});
