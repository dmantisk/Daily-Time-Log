import { getLanguage, Plugin, setTooltip, TFile, Notice } from "obsidian";
import {
	buildCategoryBadgeEditorPlugin,
	buildTimeRangeEditorPlugin,
	processCategoryBadgesInReadingView,
} from "./categoryBadges";
import { DailyWorkLogView, VIEW_TYPE_DAILY_WORK_LOG } from "./view";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./DashboardView";
import { resolveLanguage, t } from "./i18n";
import { DailyWorkLogSettingTab } from "./SettingTab";
import { copyCategories, createDefaultCategories, DEFAULT_SETTINGS, resolveEventHeadingLevel, resolveEventHeadingText, resolveMinutes, migrateLegacyHoursToMinutes, isValidMinuteValue, type DailyWorkLogSettings } from "./settings";
import type { EventHeadingConfig, MarkerLanguage } from "./parser";
import { parseDailyNote, appendLineToBlock } from "./parser";
import { buildTimelineLine } from "./timelineLogic";
import { DEFAULT_DAILY_NOTE_FORMAT, parseDateFromDailyNotePath } from "./dailyNote";

interface CoreDailyNotesOptions {
	format?: unknown;
	folder?: unknown;
}

interface CoreDailyNotesPlugin {
	instance?: {
		options?: CoreDailyNotesOptions;
	};
}

interface InternalPluginRegistry {
	getPluginById(id: string): CoreDailyNotesPlugin | null | undefined;
}

export default class DailyWorkLogPlugin extends Plugin {
	settings: DailyWorkLogSettings = DEFAULT_SETTINGS;
	private lastSelfWrite: { path: string; content: string } | null = null;
	private sidebarRibbonEl!: HTMLElement;
	private dashboardRibbonEl!: HTMLElement;
	private refreshTimer: number | null = null;
	private refreshTimelineAfterDebounce = false;
	private badgeKey = "";
	private badgeRefreshTimer: number | null = null;
	/** Holds the currently registered CodeMirror extension for category badges.
	 *  Stored as a mutable array so its contents can be replaced in-place and
	 *  the change applied to open editors via updateOptions() without a reload. */
	private readonly categoryBadgeExtensions: import("@codemirror/state").Extension[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new DailyWorkLogSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_DAILY_WORK_LOG, (leaf) => new DailyWorkLogView(leaf, this));
		this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

		this.dashboardRibbonEl = this.addRibbonIcon("gauge", t("ribbonOpenDashboard", this.getUiLanguage()), () => {
			void this.activateDashboard();
		});

		this.sidebarRibbonEl = this.addRibbonIcon("calendar-clock", t("ribbonOpenSidebar", this.getUiLanguage()), () => {
			void this.activateView();
		});

		// Command names, unlike the ribbon tooltips above, have no supported
		// live-update API (no setTooltip equivalent) — they're set once here
		// at startup language and won't change until Obsidian restarts, even
		// if the user flips the language setting mid-session.
		// Command: Open sidebar
				if (this.settings.commandOpenSidebarEnabled) {
					this.addCommand({
						id: "open-sidebar",
						name: t("commandOpenSidebar", this.getUiLanguage()),
						callback: () => void this.activateView(),
					});
				}

				// Command: Open dashboard
				if (this.settings.commandOpenDashboardEnabled) {
					this.addCommand({
						id: "open-dashboard",
						name: t("commandOpenDashboard", this.getUiLanguage()),
						callback: () => void this.activateDashboard(),
					});
				}

				// Command: Add log entry
				if (this.settings.commandAddLogEntryEnabled) {
					this.addCommand({
						id: "add-log-entry",
						name: t("commandAddLogEntry", this.getUiLanguage()),
						callback: () => void this.addLogEntry(),
					});
				}

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf && leaf.view && leaf.view.containerEl.isConnected) {
					this.refreshBadgesIfNeeded();
					if (leaf.view instanceof DailyWorkLogView) {
						void leaf.view.refresh();
					} else {
						this.refreshDataViews(false);
					}
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.refreshTimelineView();
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				void this.handleVaultModify(file);
			})
		);
		this.registerInterval(
			window.setInterval(() => this.refreshDataViews(), 5 * 60 * 1000)
		);
		this.register(() => {
			if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
			this.refreshTimelineAfterDebounce = false;
			if (this.badgeRefreshTimer !== null) window.clearTimeout(this.badgeRefreshTimer);
		});

		// Category badge rendering — live editor (CodeMirror ViewPlugin) and
		// reading view (markdown post-processor). The editor extension is built
		// into a mutable array registered with Obsidian, which refreshCategoryBadgeExtension()
		// updates in place before calling updateOptions() whenever settings change.
		this.categoryBadgeExtensions.push(
			buildCategoryBadgeEditorPlugin(
				this.settings.categories,
				this.getDailyNoteFolder(),
				this.getEventHeadingConfig(),
				this.getDailyNoteFormat()
			)
		);
		this.badgeKey = `${this.getDailyNoteFolder()}|${this.getDailyNoteFormat()}`;
		this.categoryBadgeExtensions.push(
			buildTimeRangeEditorPlugin(
				this.getDailyNoteFolder(),
				this.getEventHeadingConfig(),
				this.getDailyNoteFormat(),
				this.settings.tabularTimeRanges
			)
		);
		this.registerEditorExtension(this.categoryBadgeExtensions);

		this.registerMarkdownPostProcessor(
			(el: HTMLElement, ctx) => {
				processCategoryBadgesInReadingView(
					el,
					ctx,
					this.settings.categories,
					this.getDailyNoteFolder(),
					this.getEventHeadingConfig(),
					this.getDailyNoteFormat(),
					this.settings.tabularTimeRanges
				);
			}
		);
	}

	async loadSettings(): Promise<void> {
		const loadedData = (await this.loadData()) as
				| (Partial<DailyWorkLogSettings> & { dailyNoteFolder?: unknown; startHour?: number; endHour?: number })
			| null;
		const legacyFolderSettingPresent = loadedData !== null && "dailyNoteFolder" in loadedData;
		const settingsData = Object.fromEntries(
			Object.entries(loadedData ?? {}).filter(([key]) =>
				Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
			)
		);
		this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsData);

		// The settings screen mutates category objects in place, so the
		// category list must be a deep copy. Without this, a fresh install
		// would share the very objects held in DEFAULT_CATEGORIES, and
		// editing a category would permanently alter the defaults.
		if (Array.isArray(this.settings.categories)) {
			this.settings.categories = copyCategories(this.settings.categories);
		} else {
			this.settings.categories = createDefaultCategories();
		}

		let shouldSave = legacyFolderSettingPresent;

		// The Event heading is part of the note FORMAT, not a UI string, so
		// its default never depends on the interface language. Resolving it
		// here (rather than from the i18n table) keeps the settings UI and
		// the parser in agreement for every user, in every language.
		const resolvedText = resolveEventHeadingText(loadedData?.eventHeadingText);
		if (resolvedText !== this.settings.eventHeadingText) {
			this.settings.eventHeadingText = resolvedText;
			shouldSave = true;
		}
		const resolvedLevel = resolveEventHeadingLevel(loadedData?.eventHeadingLevel);
		if (resolvedLevel !== this.settings.eventHeadingLevel) {
			this.settings.eventHeadingLevel = resolvedLevel;
			shouldSave = true;
		}

			// Migrate legacy hour-based settings to minute-based settings
			// Prefer new-format settings if they already exist
			const hasNewFormat = loadedData !== null &&
				typeof loadedData.dayStartMinutes === "number" &&
				typeof loadedData.dayEndMinutes === "number" &&
				isValidMinuteValue(loadedData.dayStartMinutes) &&
				isValidMinuteValue(loadedData.dayEndMinutes);
			if (hasNewFormat) {
				// Use resolveMinutes directly with the loadedData properties
				// The type guard ensures they are valid numbers
				const dayStartMinutes = loadedData.dayStartMinutes as number;
				const dayEndMinutes = loadedData.dayEndMinutes as number;
				const resolvedStart = resolveMinutes(dayStartMinutes, DEFAULT_SETTINGS.dayStartMinutes);
				if (resolvedStart !== this.settings.dayStartMinutes) {
		this.settings.dayStartMinutes = resolvedStart;
		shouldSave = true;
				}
				const resolvedEnd = resolveMinutes(dayEndMinutes, DEFAULT_SETTINGS.dayEndMinutes);
				if (resolvedEnd !== this.settings.dayEndMinutes) {
		this.settings.dayEndMinutes = resolvedEnd;
		shouldSave = true;
				}
			} else {
				// Migrate from legacy hour-based settings
				const legacyStartHour: number | undefined = loadedData !== null && typeof loadedData.startHour === "number" ? loadedData.startHour : undefined;
				const legacyEndHour: number | undefined = loadedData !== null && typeof loadedData.endHour === "number" ? loadedData.endHour : undefined;
				const migrated = migrateLegacyHoursToMinutes(legacyStartHour, legacyEndHour);
				if (migrated.dayStartMinutes !== this.settings.dayStartMinutes) {
		this.settings.dayStartMinutes = migrated.dayStartMinutes;
		shouldSave = true;
				}
				if (migrated.dayEndMinutes !== this.settings.dayEndMinutes) {
		this.settings.dayEndMinutes = migrated.dayEndMinutes;
		shouldSave = true;
				}
			}

		if (typeof loadedData?.tabularTimeRanges !== "boolean") {
			this.settings.tabularTimeRanges = DEFAULT_SETTINGS.tabularTimeRanges;
			shouldSave = true;
		}
		if (shouldSave) await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getDailyNoteFolder(): string {
		const folder = this.getCoreDailyNotesOptions()?.folder;
		return typeof folder === "string" ? folder : "";
	}

	getDailyNoteFormat(): string {
		const format = this.getCoreDailyNotesOptions()?.format;
		return typeof format === "string" && format.length > 0 ? format : DEFAULT_DAILY_NOTE_FORMAT;
	}

	private getCoreDailyNotesOptions(): CoreDailyNotesOptions | undefined {
		const registry = (this.app as typeof this.app & { internalPlugins?: InternalPluginRegistry }).internalPlugins;
		return registry?.getPluginById("daily-notes")?.instance?.options;
	}

	getUiLanguage(): MarkerLanguage {
		return resolveLanguage(this.settings.language, getLanguage());
	}

	getEventHeadingConfig(): EventHeadingConfig {
		return {
			text: this.settings.eventHeadingText,
			level: this.settings.eventHeadingLevel,
		};
	}

	async processWrite(file: TFile, fn: (data: string) => string): Promise<void> {
		await this.app.vault.process(file, (data) => {
			const content = fn(data);
			if (content !== data) {
				this.lastSelfWrite = { path: file.path, content };
			}
			return content;
		});
	}

	private async handleVaultModify(file: unknown): Promise<void> {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		if (
			parseDateFromDailyNotePath(file.path, this.getDailyNoteFormat(), this.getDailyNoteFolder()) === null
		) return;
		if (await this.isSelfTriggeredWrite(file)) {
			this.scheduleRefresh(false);
			return;
		}
		this.scheduleRefresh();
	}

	private async isSelfTriggeredWrite(file: TFile): Promise<boolean> {
		if (!this.lastSelfWrite || this.lastSelfWrite.path !== file.path) return false;
		const content = await this.app.vault.read(file);
		if (content === this.lastSelfWrite.content) {
			this.lastSelfWrite = null;
			return true;
		}
		return false;
	}

	/** Public so SettingTab can force a re-render (e.g. after a language/theme change). */
	refreshViews(): void {
		setTooltip(this.sidebarRibbonEl, t("ribbonOpenSidebar", this.getUiLanguage()));
		setTooltip(this.dashboardRibbonEl, t("ribbonOpenDashboard", this.getUiLanguage()));

		// Rebuild the category badge editor extension with the latest settings
		// so colour/folder changes take effect in open editors immediately.
		this.refreshCategoryBadgeExtension();

		this.refreshDataViews();
	}

	private scheduleRefresh(refreshTimeline = true): void {
		this.refreshTimelineAfterDebounce ||= refreshTimeline;
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			const refreshTimelineAfterDebounce = this.refreshTimelineAfterDebounce;
			this.refreshTimelineAfterDebounce = false;
			this.refreshDataViews(refreshTimelineAfterDebounce);
		}, 300);
	}

	private refreshTimelineView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_WORK_LOG)) {
			if (!leaf.view.containerEl.isConnected) continue;
			if (leaf.view instanceof DailyWorkLogView) {
				void leaf.view.refresh();
			}
		}
	}

	private refreshDataViews(refreshTimeline = true): void {
		if (refreshTimeline) this.refreshTimelineView();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)) {
			if (!leaf.view.containerEl.isConnected) continue;
			if (leaf.view instanceof DashboardView && leaf.view.containerEl.isConnected) {
				void leaf.view.refresh();
			}
		}
	}
	/**
	 * Rebuilds the category badge CodeMirror extension from the current
	 * settings and hot-swaps it into all open editors via `updateOptions`.
	 * Called by refreshViews() so colour and folder changes are applied
	 * immediately without requiring Obsidian to reload the plugin.
	 *
	 * The reading-view post-processor always reads `this.settings` via closure
	 * at call time, so it doesn't need a separate refresh step.
	 */
	private refreshCategoryBadgeExtension(): void {
		this.categoryBadgeExtensions.length = 0;
		this.categoryBadgeExtensions.push(
			buildCategoryBadgeEditorPlugin(
				this.settings.categories,
				this.getDailyNoteFolder(),
				this.getEventHeadingConfig(),
				this.getDailyNoteFormat()
			)
		);
		this.categoryBadgeExtensions.push(
			buildTimeRangeEditorPlugin(
				this.getDailyNoteFolder(),
				this.getEventHeadingConfig(),
				this.getDailyNoteFormat(),
				this.settings.tabularTimeRanges
			)
		);
		// Debounce settings saves and CodeMirror extension rebuilds.
		if (this.badgeRefreshTimer !== null) window.clearTimeout(this.badgeRefreshTimer);
		this.badgeRefreshTimer = window.setTimeout(() => {
			this.app.workspace.updateOptions();
			this.badgeRefreshTimer = null;
		}, 200);
		this.badgeKey = `${this.getDailyNoteFolder()}|${this.getDailyNoteFormat()}`;
	}

	private refreshBadgesIfNeeded(): void {
		const key = `${this.getDailyNoteFolder()}|${this.getDailyNoteFormat()}`;
		if (key === this.badgeKey) return;
		this.refreshCategoryBadgeExtension();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_DAILY_WORK_LOG)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) return;
			leaf = rightLeaf;
			await leaf.setViewState({ type: VIEW_TYPE_DAILY_WORK_LOG, active: true });
		}

		void workspace.revealLeaf(leaf);
	}

	/** Opens the Dashboard as a normal tab in the main workspace area (not the sidebar). */
	async activateDashboard(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0];

		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
		}

		void workspace.revealLeaf(leaf);
	}

			/**
				 * Opens the TimelineModal to add a new log entry with smart default times.
				 * - If the active note is a daily note with existing entries, uses the last entry's end time as start time
				 * - Otherwise uses current time rounded down to nearest 10 minutes
				 * - End time is start time + 10 minutes
				 */
				private async addLogEntry(): Promise<void> {
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile || activeFile.extension !== "md") {
						new Notice(t("emptyStateDescNoNote", this.getUiLanguage()));
						return;
					}

					// Check if it's a daily note
					const date = parseDateFromDailyNotePath(activeFile.path, this.getDailyNoteFormat(), this.getDailyNoteFolder());
					if (date === null) {
						new Notice(t("emptyStateTitleNotDaily", this.getUiLanguage()));
						return;
					}

					// Read the file content and parse existing timeline
					const content = await this.app.vault.read(activeFile);
					const { timeline } = parseDailyNote(content, this.getEventHeadingConfig());

					let defaultStart: string;
					let defaultEnd: string;

					if (timeline.length > 0) {
						// Use the last entry's end time as the new start time
						const lastEntry = timeline[timeline.length - 1];
						defaultStart = lastEntry.end;
						// End time = start time + 10 minutes
						const startMinutes = this.timeToMinutes(defaultStart);
						const endMinutes = (startMinutes + 10) % 1440;
						defaultEnd = this.minutesToTime(endMinutes);
					} else {
						// No existing entries - use current time rounded down to nearest 10 minutes
						const now = new Date();
						const currentMinutes = now.getHours() * 60 + now.getMinutes();
						const roundedMinutes = Math.floor(currentMinutes / 10) * 10;
						defaultStart = this.minutesToTime(roundedMinutes);
						defaultEnd = this.minutesToTime((roundedMinutes + 10) % 1440);
					}

					// Open the modal
					const language = this.getUiLanguage();
					const { TimelineModal } = await import("./modals/TimelineModal");
					new TimelineModal(
						this.app,
						language,
						this.settings.categories,
						null, // initial item (null = new entry)
						defaultStart,
						defaultEnd,
						async (values) => {
							await this.addEventToFile(activeFile, values);
						},
						null // no delete callback for new entries
					).open();
				}

				/**
				 * Adds a new event to the daily note file using the parser's appendLineToBlock.
				 */
				private async addEventToFile(file: TFile, values: { start: string; end: string; category?: string; description: string }): Promise<void> {
					try {
						await this.processWrite(file, (content) => {
							const newLine = buildTimelineLine(values);
							return appendLineToBlock(content, newLine, this.getEventHeadingConfig());
						});

						new Notice("Event saved");
					} catch (error) {
						new Notice(`${t("noticeSaveEventFailed", this.getUiLanguage())}: ${error instanceof Error ? error.message : String(error)}`);
					}
				}

				/**
				 * Converts HH:mm time string to minutes since midnight.
				 */
				private timeToMinutes(timeStr: string): number {
					const [hours, minutes] = timeStr.split(":").map(Number);
					return hours * 60 + minutes;
				}

				/**
				 * Converts minutes since midnight to HH:mm time string.
				 */
				private minutesToTime(minutes: number): string {
					const hours = Math.floor(minutes / 60) % 24;
					const mins = minutes % 60;
					return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
				}
}
