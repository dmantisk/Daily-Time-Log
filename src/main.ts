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
import { DEFAULT_SETTINGS, migrateLoadedSettings, type DailyWorkLogSettings } from "./settings";
import type { EventHeadingConfig, MarkerLanguage } from "./parser";
import { parseDailyNote, appendLineToBlock } from "./parser";
import { buildTimelineLine, getDefaultEntryTimes } from "./timelineLogic";
import { DEFAULT_DAILY_NOTE_FORMAT, parseDateFromDailyNotePath } from "./dailyNote";
import { SelfWriteGuard } from "./selfWriteGuard";

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
	private readonly selfWriteGuard = new SelfWriteGuard();
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
	/** Tracks which configurable commands are currently registered. */
	private readonly registeredCommands = new Set<string>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new DailyWorkLogSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_DAILY_WORK_LOG, (leaf) => new DailyWorkLogView(leaf, this));
		this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

		this.dashboardRibbonEl = this.addRibbonIcon("gauge", t("ribbonOpenDashboard", this.getUiLanguage()), () => {
			void this.activateDashboard();
		});

		this.sidebarRibbonEl = this.addRibbonIcon(
			"calendar-clock",
			t("ribbonOpenSidebar", this.getUiLanguage()),
			() => {
				void this.activateView();
			}
		);

		// Synchronize configurable command registration with settings.
		// This is called during onload() and whenever settings change.
		this.syncCommandRegistration();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf && leaf.view && leaf.view.containerEl.isConnected) {
					this.refreshBadgesIfNeeded();
					if (leaf.view instanceof DailyWorkLogView) {
						void leaf.view.refresh();
					} else if (leaf.view instanceof DashboardView) {
						void leaf.view.refresh();
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
		this.registerInterval(window.setInterval(() => this.refreshDataViews(), 5 * 60 * 1000));
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

		this.registerMarkdownPostProcessor((el: HTMLElement, ctx) => {
			processCategoryBadgesInReadingView(
				el,
				ctx,
				this.settings.categories,
				this.getDailyNoteFolder(),
				this.getEventHeadingConfig(),
				this.getDailyNoteFormat(),
				this.settings.tabularTimeRanges
			);
		});
	}

	async loadSettings(): Promise<void> {
		const loadedData: unknown = await this.loadData();
		const { settings, shouldSave } = migrateLoadedSettings(loadedData);
		this.settings = settings;
		if (shouldSave) await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Synchronizes the registration state of the three configurable commands
	 * with the current settings. This method is idempotent and only registers
	 * or unregisters commands whose enabled state has changed.
	 */
	private syncCommandRegistration(): void {
		const commands = [
			{
				id: "open-sidebar",
				enabled: this.settings.commandOpenSidebarEnabled,
				name: t("commandOpenSidebar", this.getUiLanguage()),
				callback: () => void this.activateView(),
			},
			{
				id: "open-dashboard",
				enabled: this.settings.commandOpenDashboardEnabled,
				name: t("commandOpenDashboard", this.getUiLanguage()),
				callback: () => void this.activateDashboard(),
			},
			{
				id: "add-log-entry",
				enabled: this.settings.commandAddLogEntryEnabled,
				name: t("commandAddLogEntry", this.getUiLanguage()),
				callback: () => void this.addLogEntry(),
			},
		];

		for (const cmd of commands) {
			const isRegistered = this.registeredCommands.has(cmd.id);
			if (cmd.enabled && !isRegistered) {
				this.addCommand({
					id: cmd.id,
					name: cmd.name,
					callback: cmd.callback,
				});
				this.registeredCommands.add(cmd.id);
			} else if (!cmd.enabled && isRegistered) {
				this.removeCommand(cmd.id);
				this.registeredCommands.delete(cmd.id);
			}
		}
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
			this.selfWriteGuard.record(file.path, data, content);
			return content;
		});
	}

	private async handleVaultModify(file: unknown): Promise<void> {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		if (parseDateFromDailyNotePath(file.path, this.getDailyNoteFormat(), this.getDailyNoteFolder()) === null)
			return;
		if (await this.isSelfTriggeredWrite(file)) {
			this.scheduleRefresh(false);
			return;
		}
		this.scheduleRefresh();
	}

	private async isSelfTriggeredWrite(file: TFile): Promise<boolean> {
		if (!this.selfWriteGuard.hasPath(file.path)) return false;
		const content = await this.app.vault.read(file);
		return this.selfWriteGuard.consume(file.path, content);
	}

	/** Public so SettingTab can force a re-render (e.g. after a language/theme change). */
	refreshViews(): void {
		setTooltip(this.sidebarRibbonEl, t("ribbonOpenSidebar", this.getUiLanguage()));
		setTooltip(this.dashboardRibbonEl, t("ribbonOpenDashboard", this.getUiLanguage()));

		// Synchronize configurable command registration with settings.
		this.syncCommandRegistration();

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
		// The extensions are rebuilt immediately and only workspace.updateOptions() is debounced (200 ms).
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

		const now = new Date();
		const nowMinutes = now.getHours() * 60 + now.getMinutes();
		const { start: defaultStart, end: defaultEnd } = getDefaultEntryTimes(timeline, nowMinutes);

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
			(values) => {
				void this.addEventToFile(activeFile, values);
			},
			null // no delete callback for new entries
		).open();
	}

	/**
	 * Adds a new event to the daily note file using the parser's appendLineToBlock.
	 */
	private async addEventToFile(
		file: TFile,
		values: { start: string; end: string; category?: string; description: string }
	): Promise<void> {
		try {
			await this.processWrite(file, (content) => {
				const newLine = buildTimelineLine(values);
				return appendLineToBlock(content, newLine, this.getEventHeadingConfig());
			});

			this.refreshTimelineView();
			new Notice(t("noticeEventSaved", this.getUiLanguage()));
		} catch (error) {
			new Notice(
				`${t("noticeSaveEventFailed", this.getUiLanguage())}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}
