import { App, debounce, Notice, PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest } from "./FolderSuggest";
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
 * Every label goes through i18n.ts (t()) exactly like the sidebar/modal —
 * this tab used to be hardcoded Korean regardless of the language setting,
 * which was an oversight, not a deliberate exception.
 * Still uses the imperative `display()` API rather than the declarative
 * `getSettingDefinitions()` (Obsidian 1.13.0+) — see AGENTS.md §2 for why
 * that trade-off is intentional here.
 */
export class DailyWorkLogSettingTab extends PluginSettingTab {
	private readonly plugin: DailyWorkLogPlugin;

	constructor(app: App, plugin: DailyWorkLogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const lang = this.plugin.getUiLanguage();

		new Setting(containerEl).setName(t("settingsTitle", lang)).setHeading();
		new Setting(containerEl).setName(t("settingGeneralSection", lang)).setHeading();

		new Setting(containerEl)
			.setName(t("settingStartHourName", lang))
			.setDesc(t("settingStartHourDesc", lang))
			.addDropdown((dropdown) => {
				for (let h = 0; h <= 23; h++) {
					dropdown.addOption(String(h), formatHourLabel(h, lang));
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

		new Setting(containerEl)
			.setName(t("settingEndHourName", lang))
			.setDesc(t("settingEndHourDesc", lang))
			.addDropdown((dropdown) => {
				for (let h = 1; h <= 24; h++) {
					dropdown.addOption(String(h), formatHourLabel(h, lang));
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

		new Setting(containerEl)
			.setName(t("settingFolderName", lang))
			.setDesc(t("settingFolderDesc", lang))
			.addText((text) => {
				// The folder filter drives a vault-wide note scan, so the
				// refresh is debounced — otherwise every keystroke would
				// re-scan the vault and rebuild the editor extensions.
				const applyFolder = debounce(
					async (value: string): Promise<void> => {
						this.plugin.settings.dailyNoteFolder = value.trim();
						await this.plugin.saveSettings();
						// The folder filter drives the dashboard's note scan
						// and the category badge scope, so both have to be
						// rebuilt — otherwise the open dashboard keeps
						// showing the previous folder's notes until it is
						// refreshed by hand, and the editor badges keep the
						// old scope until the next reload.
						this.plugin.refreshViews();
					},
					400,
					true
				);

				text
					.setPlaceholder(t("settingFolderPlaceholder", lang))
					.setValue(this.plugin.settings.dailyNoteFolder)
					.onChange((value) => {
						void applyFolder(value);
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName(t("settingEventHeadingLevelName", lang))
			.setDesc(t("settingEventHeadingLevelDesc", lang))
			.addDropdown((dropdown) => {
				for (let level = 1; level <= 6; level++) {
					dropdown.addOption(String(level), `${level}`);
				}
				dropdown.setValue(String(this.plugin.settings.eventHeadingLevel)).onChange(async (value) => {
					this.plugin.settings.eventHeadingLevel = Number(value);
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				});
			});

		new Setting(containerEl)
			.setName(t("settingLanguageName", lang))
			.setDesc(t("settingLanguageDesc", lang))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", t("languageAuto", lang))
					.addOption("en", t("languageEnglish", lang))
					.addOption("ko", t("languageKorean", lang))
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as LanguagePreference;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
						this.display();
					})
			);

		this.renderCategorySection(containerEl, lang);
	}

	private renderCategorySection(containerEl: HTMLElement, lang: MarkerLanguage): void {
		new Setting(containerEl).setName(t("settingCategoriesSection", lang)).setHeading();
		containerEl.createEl("p", {
			text: t("settingCategoriesDesc", lang),
			cls: "dwl-category-section-desc",
		});

		new Setting(containerEl)
			.setName(t("settingResetCategoriesName", lang))
			.setDesc(t("settingResetCategoriesDesc", lang))
			.addButton((btn) => {
				btn
					.setButtonText(t("btnReset", lang))
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.categories = createDefaultCategories();
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
						new Notice(t("noticeResetCategories", lang));
						this.display();
					});
			});

		const categories = this.plugin.settings.categories;
		categories.forEach((cat, idx) => {
			const row = new Setting(containerEl).setName("");
			row.settingEl.addClass("dwl-category-setting-item");

			row.addText((text) => {
				text
					.setPlaceholder(t("settingCatDisplayNamePlaceholder", lang))
					.setValue(cat.displayName)
					.onChange(async (value) => {
						const trimmed = value.trim();
						// A rename is held to the same rules as an add: the
						// name must not be blank (it cannot be written into a
						// note as `[Name]`) and must not collide with another
						// category (the dashboard keys its totals by display
						// name, so a shared name doubles the minutes).
						const problem = validateCategoryName(categories, trimmed, idx);
						if (problem) {
							new Notice(t(problem === "empty" ? "alertCatNameEmpty" : "alertCatNameExists", lang));
							text.setValue(categories[idx].displayName);
							return;
						}
						categories[idx].displayName = trimmed;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					});
				text.inputEl.maxLength = MAX_CATEGORY_NAME_LENGTH;
			});

			row.addColorPicker((picker) => {
				picker.setValue(cat.color).onChange(async (value) => {
					categories[idx].color = value;
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				});
			});

			if (!cat.isDefault) {
				row.addButton((btn) => {
					btn
						.setButtonText("✕")
						.setWarning()
						.onClick(async () => {
							categories.splice(idx, 1);
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
							this.display();
						});
				});
			}
		});

		if (categories.length < MAX_CATEGORIES) {
			let newName = "";
			let newColor = "#95a5a6";

			new Setting(containerEl)
				.setName(t("settingAddCategoryName", lang))
				.setDesc(t("settingAddCategoryDesc", lang))
				.addText((text) => {
					text.setPlaceholder(t("settingAddCategoryPlaceholder", lang)).onChange((value) => {
						newName = value;
					});
					text.inputEl.maxLength = MAX_CATEGORY_NAME_LENGTH;
				})
				.addColorPicker((picker) => {
					picker.setValue(newColor).onChange((value) => {
						newColor = value;
					});
				})
				.addButton((btn) => {
					btn
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
							this.display();
						});
				});
		}
	}
}
