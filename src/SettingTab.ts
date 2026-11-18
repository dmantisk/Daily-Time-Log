import { App, Notice, PluginSettingTab, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";
import { formatTimeLabel, t } from "./i18n";
import type DailyWorkLogPlugin from "./main";
import type { MarkerLanguage } from "./parser";
import { createDefaultCategories, validateCategoryName, type LanguagePreference } from "./settings";

const MAX_CATEGORIES = 10;
const MAX_CATEGORY_NAME_LENGTH = 10;

/**
 * DayTime Tracker-parity settings surface (AGENTS-reference.md, design.md §14):
 * general (hour range / folder / language / Event heading) and category
 * management.
 * Every label goes through i18n.ts (t()) exactly like the sidebar/modal.
 */
export class DailyWorkLogSettingTab extends PluginSettingTab {
	private readonly plugin: DailyWorkLogPlugin;

	constructor(app: App, plugin: DailyWorkLogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const lang = this.plugin.getUiLanguage();
		const settings: SettingDefinitionItem[] = [
			{
				name: t("settingDayStartTimeName", lang),
				desc: t("settingDayStartTimeDesc", lang),
				render: (setting) => {
					const startMinutes = this.plugin.settings.dayStartMinutes;
					setting.addText((text) => {
						text.inputEl.type = "time";
						text.inputEl.step = "600"; // 10 minutes = 600 seconds
						text.inputEl.value = formatTimeLabel(startMinutes, lang);
						text.inputEl.addEventListener("change", () => {
							void (async () => {
								const value = text.inputEl.value;
								if (!value) return;
								const [hours, minutes] = value.split(":").map(Number);
								const totalMinutes = hours * 60 + minutes;
								// Validate: must be multiple of 10, 0-1430
								if (totalMinutes < 0 || totalMinutes > 1430 || totalMinutes % 10 !== 0) {
									new Notice(t("invalidTimeFormat", lang));
									text.inputEl.value = formatTimeLabel(this.plugin.settings.dayStartMinutes, lang);
									return;
								}
								this.plugin.settings.dayStartMinutes = totalMinutes;
								await this.plugin.saveSettings();
								this.plugin.refreshViews();
							})();
						});
					});
				},
			},
			{
				name: t("settingDayEndTimeName", lang),
				desc: t("settingDayEndTimeDesc", lang),
				render: (setting) => {
					const endMinutes = this.plugin.settings.dayEndMinutes;
					setting.addText((text) => {
						text.inputEl.type = "time";
						text.inputEl.step = "600"; // 10 minutes = 600 seconds
						text.inputEl.value = formatTimeLabel(endMinutes, lang);
						text.inputEl.addEventListener("change", () => {
							void (async () => {
								const value = text.inputEl.value;
								if (!value) return;
								const [hours, minutes] = value.split(":").map(Number);
								const totalMinutes = hours * 60 + minutes;
								// Validate: must be multiple of 10, 0-1430
								if (totalMinutes < 0 || totalMinutes > 1430 || totalMinutes % 10 !== 0) {
									new Notice(t("invalidTimeFormat", lang));
									text.inputEl.value = formatTimeLabel(this.plugin.settings.dayEndMinutes, lang);
									return;
								}
								this.plugin.settings.dayEndMinutes = totalMinutes;
								await this.plugin.saveSettings();
								this.plugin.refreshViews();
							})();
						});
					});
				},
			},
			{
				name: t("settingTabularTimeRangesName", lang),
				desc: t("settingTabularTimeRangesDesc", lang),
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.tabularTimeRanges).onChange(async (value) => {
							this.plugin.settings.tabularTimeRanges = value;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						})
					);
				},
			},
			{
				name: t("settingEventHeadingTextName", lang),
				desc: t("settingEventHeadingTextDesc", lang),
				render: (setting) => {
					setting.addText((text) =>
						text.setValue(this.plugin.settings.eventHeadingText).onChange(async (value) => {
							const trimmed = value.trim();
							if (/[\r\n]/.test(value)) {
								new Notice(t("alertInvalidEventHeading", lang));
								text.setValue(this.plugin.settings.eventHeadingText);
								return;
							}
							if (!trimmed) return;
							this.plugin.settings.eventHeadingText = trimmed;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						})
					);
				},
			},
			{
				name: t("settingEventHeadingLevelName", lang),
				desc: t("settingEventHeadingLevelDesc", lang),
				render: (setting) => {
					setting.addDropdown((dropdown) => {
						for (let level = 1; level <= 6; level++) {
							dropdown.addOption(String(level), `${level}`);
						}
						dropdown.setValue(String(this.plugin.settings.eventHeadingLevel)).onChange(async (value) => {
							this.plugin.settings.eventHeadingLevel = Number(value);
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						});
					});
				},
			},
			{
				name: t("settingLanguageName", lang),
				desc: t("settingLanguageDesc", lang),
				render: (setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption("auto", t("languageAuto", lang))
							.addOption("en", t("languageEnglish", lang))
							.addOption("ko", t("languageKorean", lang))
							.setValue(this.plugin.settings.language)
							.onChange(async (value) => {
								this.plugin.settings.language = value as LanguagePreference;
								await this.plugin.saveSettings();
								this.plugin.refreshViews();
								this.update();
							})
					);
				},
			},
			{
				type: "group",
				items: this.getCommandsDefinitions(lang),
			},
			{
				type: "group",
				items: this.getCategoryDefinitions(lang),
			},
		];
		return settings;
	}

	private getCommandsDefinitions(lang: MarkerLanguage): SettingGroupItem[] {
		return [
			{
				name: t("settingCommandsSection", lang),
				desc: t("settingCommandsDesc", lang),
				searchable: false,
				render: (setting) => {
					setting.setHeading();
				},
			},
			{
				name: t("settingCommandOpenSidebarName", lang),
				desc: t("settingCommandOpenSidebarDesc", lang),
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.commandOpenSidebarEnabled).onChange(async (value) => {
							this.plugin.settings.commandOpenSidebarEnabled = value;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
							this.update();
						})
					);
				},
			},
			{
				name: t("settingCommandOpenDashboardName", lang),
				desc: t("settingCommandOpenDashboardDesc", lang),
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.commandOpenDashboardEnabled).onChange(async (value) => {
							this.plugin.settings.commandOpenDashboardEnabled = value;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
							this.update();
						})
					);
				},
			},
			{
				name: t("settingCommandAddLogEntryName", lang),
				desc: t("settingCommandAddLogEntryDesc", lang),
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.commandAddLogEntryEnabled).onChange(async (value) => {
							this.plugin.settings.commandAddLogEntryEnabled = value;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
							this.update();
						})
					);
				},
			},
		];
	}

	private getCategoryDefinitions(lang: MarkerLanguage): SettingGroupItem[] {
		const categories = this.plugin.settings.categories;
		const definitions: SettingGroupItem[] = [
			{
				name: t("settingCategoriesSection", lang),
				desc: t("settingCategoriesDesc", lang),
				searchable: false,
				render: (setting) => {
					setting.setHeading();
				},
			},
		];

		categories.forEach((category, index) => {
			definitions.push({
				name: category.displayName || t("settingCatDisplayNamePlaceholder", lang),
				desc: t("settingCatDisplayNamePlaceholder", lang),
				render: (setting) => {
					setting.setName("").setClass("dwl-category-setting-item");
					setting.addText((text) => {
						text.setPlaceholder(t("settingCatDisplayNamePlaceholder", lang)).setValue(category.displayName);
						const saveName = async () => {
							const trimmed = text.getValue().trim();
							const problem = validateCategoryName(categories, trimmed, index);
							if (problem) {
								new Notice(t(problem === "empty" ? "alertCatNameEmpty" : "alertCatNameExists", lang));
								text.setValue(categories[index].displayName);
								return;
							}
							if (trimmed === categories[index].displayName) return;
							categories[index].displayName = trimmed;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
							this.update();
						};
						text.inputEl.addEventListener("change", () => void saveName());
						text.inputEl.addEventListener("blur", () => void saveName());
						text.inputEl.maxLength = MAX_CATEGORY_NAME_LENGTH;
					});
					setting.addColorPicker((picker) =>
						picker.setValue(category.color).onChange(async (value) => {
							category.color = value;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						})
					);

					if (!category.isDefault) {
						setting.addButton((button) => {
							button
								.setButtonText("✕")
								.setDestructive()
								.setCta()
								.onClick(async () => {
									categories.splice(index, 1);
									await this.plugin.saveSettings();
									this.plugin.refreshViews();
									this.update();
								});
						});
					}
				},
			});
		});

		definitions.push({
			name: t("settingResetCategoriesName", lang),
			desc: t("settingResetCategoriesDesc", lang),
			render: (setting) => {
				setting.addButton((button) => {
					button
						.setButtonText(t("btnReset", lang))
						.setDestructive()
						.setCta()
						.onClick(async () => {
							this.plugin.settings.categories = createDefaultCategories();
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
							new Notice(t("noticeResetCategories", lang));
							this.update();
						});
				});
			},
		});

		if (categories.length < MAX_CATEGORIES) {
			definitions.push(this.getAddCategoryDefinition(lang, categories));
		}

		return definitions;
	}

	private getAddCategoryDefinition(
		lang: MarkerLanguage,
		categories: DailyWorkLogPlugin["settings"]["categories"]
	): SettingGroupItem {
		return {
			name: t("settingAddCategoryName", lang),
			desc: t("settingAddCategoryDesc", lang),
			render: (setting) => {
				let newName = "";
				let newColor = "#95a5a6";
				setting.addText((text) => {
					text.setPlaceholder(t("settingAddCategoryPlaceholder", lang)).onChange((value) => {
						newName = value;
					});
					text.inputEl.maxLength = MAX_CATEGORY_NAME_LENGTH;
				});
				setting.addColorPicker((picker) =>
					picker.setValue(newColor).onChange((value) => {
						newColor = value;
					})
				);
				setting.addButton((button) => {
					button
						.setButtonText(t("btnAdd", lang))
						.setCta()
						.onClick(async () => {
							const trimmed = newName.trim();
							const problem = validateCategoryName(categories, trimmed);
							if (problem) {
								new Notice(t(problem === "empty" ? "alertCatNameEmpty" : "alertCatNameExists", lang));
								return;
							}
							if (categories.length >= MAX_CATEGORIES) {
								new Notice(t("alertCatLimitMax", lang));
								return;
							}
							categories.push({ name: trimmed, displayName: trimmed, color: newColor });
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
							this.update();
						});
				});
			},
		};
	}
}
