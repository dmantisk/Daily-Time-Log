import {
	App,
	Notice,
	PluginSettingTab,
	type SettingDefinitionItem,
	type SettingGroupItem,
} from "obsidian";
import { formatHourLabel, t } from "./i18n";
import type DailyWorkLogPlugin from "./main";
import type { MarkerLanguage } from "./parser";
import { createDefaultCategories, validateCategoryName, type LanguagePreference } from "./settings";

const MAX_CATEGORIES = 10;
const MAX_CATEGORY_NAME_LENGTH = 10;

/**
 * DayTime Tracker-parity settings surface (AGENTS.md §2, design.md §14):
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
				name: t("settingStartHourName", lang),
				desc: t("settingStartHourDesc", lang),
				render: (setting) => {
					setting.setName(t("settingStartHourName", lang)).setDesc(t("settingStartHourDesc", lang));
					setting.addDropdown((dropdown) => {
						for (let hour = 0; hour <= 23; hour++) {
							dropdown.addOption(String(hour), formatHourLabel(hour, lang));
						}
						dropdown.setValue(String(this.plugin.settings.startHour)).onChange(async (value) => {
							const hour = parseInt(value, 10);
							if (hour >= this.plugin.settings.endHour) {
								new Notice(t("alertStartBeforeEnd", lang));
								dropdown.setValue(String(this.plugin.settings.startHour));
								return;
							}
							this.plugin.settings.startHour = hour;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						});
					});
				},
			},
			{
				name: t("settingEndHourName", lang),
				desc: t("settingEndHourDesc", lang),
				render: (setting) => {
					setting.setName(t("settingEndHourName", lang)).setDesc(t("settingEndHourDesc", lang));
					setting.addDropdown((dropdown) => {
						for (let hour = 1; hour <= 24; hour++) {
							dropdown.addOption(String(hour), formatHourLabel(hour, lang));
						}
						dropdown.setValue(String(this.plugin.settings.endHour)).onChange(async (value) => {
							const hour = parseInt(value, 10);
							if (hour <= this.plugin.settings.startHour) {
								new Notice(t("alertEndAfterStart", lang));
								dropdown.setValue(String(this.plugin.settings.endHour));
								return;
							}
							this.plugin.settings.endHour = hour;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						});
					});
				},
			},
			{
				name: t("settingEventHeadingTextName", lang),
				desc: t("settingEventHeadingTextDesc", lang),
				render: (setting) => {
					setting
						.setName(t("settingEventHeadingTextName", lang))
						.setDesc(t("settingEventHeadingTextDesc", lang))
						.addText((text) =>
							text
								.setValue(this.plugin.settings.eventHeadingText)
								.onChange(async (value) => {
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
					setting.setName(t("settingEventHeadingLevelName", lang)).setDesc(t("settingEventHeadingLevelDesc", lang));
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
					setting.setName(t("settingLanguageName", lang)).setDesc(t("settingLanguageDesc", lang));
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
				items: this.getCategoryDefinitions(lang),
			},
		];
		return settings;
	}

	private getCategoryDefinitions(lang: MarkerLanguage): SettingGroupItem[] {
		const categories = this.plugin.settings.categories;
		const definitions: SettingGroupItem[] = [
			{
				name: t("settingCategoriesSection", lang),
				desc: t("settingCategoriesDesc", lang),
				searchable: false,
				render: (setting) => {
					setting
						.setName(t("settingCategoriesSection", lang))
						.setDesc(t("settingCategoriesDesc", lang))
						.setHeading();
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
						text
							.setPlaceholder(t("settingCatDisplayNamePlaceholder", lang))
							.setValue(category.displayName);
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
				setting
					.setName(t("settingResetCategoriesName", lang))
					.setDesc(t("settingResetCategoriesDesc", lang))
					.addButton((button) => {
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
				setting
					.setName(t("settingAddCategoryName", lang))
					.setDesc(t("settingAddCategoryDesc", lang));
				let newName = "";
				let newColor = "#95a5a6";
				setting.addText((text) => {
					text.setPlaceholder(t("settingAddCategoryPlaceholder", lang)).onChange((value) => {
						newName = value;
					});
					text.inputEl.maxLength = MAX_CATEGORY_NAME_LENGTH;
				});
				setting.addColorPicker((picker) => picker.setValue(newColor).onChange((value) => {
					newColor = value;
				}));
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
