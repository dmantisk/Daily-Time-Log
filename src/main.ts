import { getLanguage, Plugin, setTooltip, TFile } from "obsidian";
import {
	buildCategoryBadgeEditorPlugin,
	processCategoryBadgesInReadingView,
} from "./categoryBadges";
import { DailyWorkLogView, VIEW_TYPE_DAILY_WORK_LOG } from "./view";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./DashboardView";
import { resolveLanguage, t } from "./i18n";
import { DailyWorkLogSettingTab } from "./SettingTab";
import { copyCategories, createDefaultCategories, DEFAULT_SETTINGS, resolveEventHeadingLevel, resolveEventHeadingText, resolveHour, type DailyWorkLogSettings } from "./settings";
import type { EventHeadingConfig, MarkerLanguage } from "./parser";
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
		this.addCommand({
			id: "open-sidebar",
			name: t("commandOpenSidebar", this.getUiLanguage()),
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-dashboard",
			name: t("commandOpenDashboard", this.getUiLanguage()),
			callback: () => void this.activateDashboard(),
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf && leaf.view && leaf.view.containerEl.isConnected) {
					this.refreshBadgesIfNeeded();
					this.refreshDataViews();
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
		this.registerEditorExtension(this.categoryBadgeExtensions);

		this.registerMarkdownPostProcessor(
			(el: HTMLElement, ctx) => {
				processCategoryBadgesInReadingView(
					el,
					ctx,
					this.settings.categories,
					this.getDailyNoteFolder(),
					this.getEventHeadingConfig(),
					this.getDailyNoteFormat()
				);
			}
		);
	}

	async loadSettings(): Promise<void> {
		const loadedData = (await this.loadData()) as
			| (Partial<DailyWorkLogSettings> & { dailyNoteFolder?: unknown })
			| null;
		const legacyFolderSettingPresent = loadedData !== null && "dailyNoteFolder" in loadedData;
		const settingsData = { ...(loadedData ?? {}) };
		delete settingsData.dailyNoteFolder;
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
		const resolvedStart = resolveHour(loadedData?.startHour, DEFAULT_SETTINGS.startHour);
		if (resolvedStart !== this.settings.startHour) {
			this.settings.startHour = resolvedStart;
			shouldSave = true;
		}
		const resolvedEnd = resolveHour(loadedData?.endHour, DEFAULT_SETTINGS.endHour);
		if (resolvedEnd !== this.settings.endHour) {
			this.settings.endHour = resolvedEnd;
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

	/**
	 * Writes must go through this method (not `vault.modify` directly) so the
	 * resulting `modify` event can be recognized as self-triggered so the
	 * sidebar isn't redundantly re-rendered after every edit.
	 */
	async writeFile(file: TFile, content: string): Promise<void> {
		this.lastSelfWrite = { path: file.path, content };
		await this.app.vault.modify(file, content);
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
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_WORK_LOG)) {
			if (!leaf.view.containerEl.isConnected) continue;
			if (leaf.view instanceof DailyWorkLogView && leaf.view.containerEl.isConnected) {
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
}
