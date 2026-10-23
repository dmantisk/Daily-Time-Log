import { ButtonComponent, DropdownComponent, ItemView, setTooltip, TFile, Vault, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import type DailyWorkLogPlugin from "./main";
import { parseDailyNote, type MarkerLanguage, type ParsedDailyNote } from "./parser";
import { formatDateBasename, parseDateFromDailyNotePath } from "./dailyNote";
import { computeDashboardStats, isOnOrBeforeToday, isWithinRecentWindow, type DashboardStats } from "./dashboardCollector";
import { getTextColorForBackground } from "./components/colorUtils";
import { findCategoryByDisplayName } from "./settings";
import { t } from "./i18n";

export const VIEW_TYPE_DASHBOARD = "dwl-dashboard";

interface DailyNoteFile {
	file: TFile;
	date: Date;
}

interface CachedDailyNote {
	mtime: number;
	headingConfigKey: string;
	parsed: ParsedDailyNote;
}

/**
 * Central "Dashboard" panel — a vault-wide summary of daily notes, opened
 * as a normal tab in the main workspace area (not the right sidebar).
 * Follows Obsidian's own theme variables (see AGENTS.md 2. Settings).
 */
export class DashboardView extends ItemView {
	private readonly plugin: DailyWorkLogPlugin;
	// Same re-entrancy guard as DailyWorkLogView.refresh() — see AGENTS.md 3.
	private refreshToken = 0;
	private selectedWindowDays = 30; // 7, 30, 90, 0 (all)
	private readonly parsedNotes = new Map<string, CachedDailyNote>();
	// Cache strict Moment parse results by file path and date format.
	private readonly parseCache = new Map<string, Date | null>();
	private parseCacheConfigKey = "";
	private headerLanguage: MarkerLanguage | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: DailyWorkLogPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}

	getDisplayText(): string {
		return t("dashboardTitle", this.plugin.getUiLanguage());
	}

	getIcon(): string {
		return "gauge";
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	onClose(): Promise<void> {
		return Promise.resolve();
	}

	async refresh(): Promise<void> {
		const token = ++this.refreshToken;
		const language = this.plugin.getUiLanguage();
		const parseCacheConfigKey = JSON.stringify([
			this.plugin.getDailyNoteFolder(),
			this.plugin.getDailyNoteFormat(),
		]);
		if (parseCacheConfigKey !== this.parseCacheConfigKey) {
			this.parseCache.clear();
			this.parseCacheConfigKey = parseCacheConfigKey;
		}

		const container = this.contentEl;
		container.addClass("dwl-dashboard-view");
		const nextContent = document.createElement("div");

		const allNotes = this.collectDailyNoteFiles();
		const activePaths = new Set(allNotes.map(({ file }) => file.path));
		for (const path of this.parsedNotes.keys()) {
			if (!activePaths.has(path)) this.parsedNotes.delete(path);
		}

		// Keep the current controls and data visible until replacement content is ready.
		const existingHeader = container.querySelector(".dwl-dashboard-header");
		const reuseHeader = existingHeader !== null && this.headerLanguage === language;
		if (!reuseHeader) this.renderHeader(nextContent, language);
		const commitContent = () => {
			if (reuseHeader && existingHeader) nextContent.prepend(existingHeader);
			container.replaceChildren(...Array.from(nextContent.childNodes));
			this.headerLanguage = language;
		};

		if (allNotes.length === 0) {
			nextContent.createDiv({ cls: "dwl-dashboard-empty", text: t("dashboardEmptyVault", language) });
			commitContent();
			return;
		}

		const today = new Date();
		const recentNotes = allNotes
			.filter((note) => isWithinRecentWindow(note.date, today, this.selectedWindowDays))
			.sort((a, b) => b.date.getTime() - a.date.getTime());

		// A vault can hold daily notes that are all dated in the future (a
		// pre-created template, a fixed-date template). Those days have not
		// happened yet, so they record no time and are excluded from every
		// figure — but the dashboard is still worth showing, with a notice
		// explaining why it is empty.
		const hasPastOrPresentNotes = allNotes.some((note) => isOnOrBeforeToday(note.date, today));

		// Read in bounded batches (max 10 concurrent) rather than all at
		// once — "All Time" can mean many notes, and unbounded Promise.all
		// creates a burst of reads and high transient memory.
		const recentParsed: Array<{ date: Date; path: string; parsed: ParsedDailyNote }> = [];
		const batchSize = 10;
		for (let i = 0; i < recentNotes.length; i += batchSize) {
			const batch = recentNotes.slice(i, i + batchSize);
			const batchResults = await Promise.all(
				batch.map(async (note) => ({
					date: note.date,
					path: note.file.path,
					parsed: await this.getParsedNote(note.file),
				}))
			);
			recentParsed.push(...batchResults);
		}

		if (token !== this.refreshToken) return; // superseded by a newer refresh() call meanwhile

		if (!hasPastOrPresentNotes) {
			nextContent.createDiv({ cls: "dwl-dashboard-empty", text: t("dashboardFutureOnlyNotice", language) });
			commitContent();
			return;
		}

		const uncategorizedLabel = t("uncategorized", language);
		const stats = computeDashboardStats(
			allNotes.map((note) => note.date),
			recentParsed,
			today,
			this.plugin.settings.categories,
			uncategorizedLabel
		);

		// KPI Grid
		this.renderKpiGrid(nextContent, stats, language);

		// Category Distribution Bar
		this.renderCategoryDistribution(nextContent, stats, language);

		// Bottom 2-Column Layout (Recent Activity + Summary)
		this.renderBottomLayout(nextContent, stats, recentNotes, language);
		if (token !== this.refreshToken) return;
		commitContent();
	}

	private async getParsedNote(file: TFile): Promise<ParsedDailyNote> {
		const headingConfig = this.plugin.getEventHeadingConfig();
		const headingConfigKey = JSON.stringify([headingConfig.level, headingConfig.text]);
		const cached = this.parsedNotes.get(file.path);
		if (cached?.mtime === file.stat.mtime && cached.headingConfigKey === headingConfigKey) {
			return cached.parsed;
		}

		const parsed = parseDailyNote(await this.app.vault.cachedRead(file), headingConfig);
		// Cache strict Moment parse results by path and format when collecting daily-note files.
		this.parsedNotes.set(file.path, { mtime: file.stat.mtime, headingConfigKey, parsed });
		return parsed;
	}

	/**
	 * Collects notes matching the core Daily Notes plugin's folder and date format.
	 */
	private collectDailyNoteFiles(): DailyNoteFile[] {
		const result: DailyNoteFile[] = [];
		const folderSetting = this.plugin.getDailyNoteFolder();
		const dateFormat = this.plugin.getDailyNoteFormat();
		const normalizedFolder = folderSetting.trim().replace(/^\/+|\/+$/g, "");
		const scannedPaths = new Set<string>();

		const consider = (file: TAbstractFile) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			scannedPaths.add(file.path);
			const cacheKey = file.path;
			if (!this.parseCache.has(cacheKey)) {
				this.parseCache.set(cacheKey, parseDateFromDailyNotePath(file.path, dateFormat, folderSetting));
			}
			const date = this.parseCache.get(cacheKey);
			if (date) result.push({ file, date });
		};

		// Scoped to the configured folder when one is set, so large vaults
		// aren't walked in full just to find daily notes in a subfolder. Falls
		// back to a vault-wide scan when unset (fresh install default) or when
		// the configured folder doesn't currently exist.
		const scopedFolder = normalizedFolder ? this.app.vault.getFolderByPath(normalizedFolder) : null;
		if (scopedFolder) {
			Vault.recurseChildren(scopedFolder, consider);
		} else {
			this.app.vault.getMarkdownFiles().forEach(consider);
		}
		for (const key of this.parseCache.keys()) {
			if (!scannedPaths.has(key)) this.parseCache.delete(key);
		}
		return result;
	}

	private renderHeader(container: HTMLElement, language: MarkerLanguage): void {
		const header = container.createDiv({ cls: "dwl-dashboard-header" });
		const titleArea = header.createDiv({ cls: "dwl-dashboard-title-area" });
		titleArea.createEl("h2", { cls: "dwl-dashboard-title", text: t("dashboardTitle", language) });

		const controls = header.createDiv({ cls: "dwl-dashboard-controls" });

		// Window selector dropdown — Obsidian's own `DropdownComponent`, so
		// the control follows the active theme instead of the plugin's
		// hand-rolled imitation of a `<select>`.
		const options: Array<{ label: string; value: number }> = [
			{ label: t("window7Days", language), value: 7 },
			{ label: t("window30Days", language), value: 30 },
			{ label: t("window90Days", language), value: 90 },
			{ label: t("windowAllTime", language), value: 0 },
		];

		const dropdown = new DropdownComponent(controls);
		for (const opt of options) {
			dropdown.addOption(String(opt.value), opt.label);
		}
		dropdown.setValue(String(this.selectedWindowDays));
		dropdown.onChange((value) => {
			this.selectedWindowDays = Number(value);
			void this.refresh();
		});

		// Refresh button — an icon-only native button, matching the icon
		// buttons Obsidian puts in its own toolbars.
		new ButtonComponent(controls)
			.setIcon("refresh-cw")
			.setClass("clickable-icon")
			.setTooltip(t("btnRefresh", language))
			.onClick(() => void this.refresh());
	}

	private renderKpiGrid(container: HTMLElement, stats: DashboardStats, language: MarkerLanguage): void {
		const grid = container.createDiv({ cls: "dwl-dashboard-kpi-grid" });

		// Card 1: Total Notes & Streak
		const streakBadge = stats.currentStreak > 0 ? `${stats.currentStreak}${t("unitDays", language)}` : "";
		this.renderMetricCard(
			grid,
			t("statTotalNotes", language),
			String(stats.totalNotes),
			`${t("statStreak", language)}: ${stats.currentStreak}${t("unitDays", language)}`,
			streakBadge,
			t("tipStatTotalNotes", language),
			t("tipStatStreak", language)
		);

		// Card 2: Event Recording Time & Daily Average
		const timeVal = formatMinutes(stats.recentEventMinutes);
		const avgSub = `${t("statAvgPerDay", language)}: ${formatMinutes(stats.avgEventMinutesPerDay)}`;
		this.renderMetricCard(
			grid,
			this.eventTimeLabel(language),
			timeVal,
			avgSub,
			undefined,
			t("tipStatEventTime", language),
			t("tipStatAvgPerDay", language)
		);

		// Card 3: Top Category
		const topCat = stats.topCategoryName ?? "-";
		const topCatSub =
			stats.categoryBreakdown.length > 0
				? t("statTopCategoryPct", language).replace("%s", String(stats.categoryBreakdown[0].percentage))
				: "-";
		this.renderMetricCard(grid, t("statTopCategory", language), topCat, topCatSub, undefined, t("tipStatTopCategory", language));
	}

	/**
	 * Renders one KPI card.
	 *
	 * `labelTooltip` and `footerTooltip` attach an explanation of the
	 * metric to the label / footer element on hover. A bare label like
	 * "Daily Avg" or "Date Range" does not say how the number is
	 * computed, which makes the figure impossible to interpret on its
	 * own — the tooltip is where that meaning lives.
	 */
	private renderMetricCard(
		container: HTMLElement,
		label: string,
		value: string,
		footerText: string,
		badgeText?: string,
		labelTooltip?: string,
		footerTooltip?: string
	): void {
		const card = container.createDiv({ cls: "dwl-dashboard-kpi-card" });
		const topRow = card.createDiv({ cls: "dwl-kpi-top-row" });
		const labelEl = topRow.createDiv({ cls: "dwl-kpi-label", text: label });
		if (labelTooltip) setTooltip(labelEl, labelTooltip);

		if (badgeText) {
			topRow.createDiv({ cls: "dwl-kpi-badge", text: badgeText });
		}

		card.createDiv({ cls: "dwl-kpi-value", text: value });
		const footerEl = card.createDiv({ cls: "dwl-kpi-footer", text: footerText });
		if (footerTooltip) setTooltip(footerEl, footerTooltip);
	}


	private renderCategoryDistribution(container: HTMLElement, stats: DashboardStats, language: MarkerLanguage): void {
		const card = container.createDiv({ cls: "dwl-dashboard-card dwl-dashboard-distribution-card" });
		card.createDiv({ cls: "dwl-dashboard-card-title", text: t("categoryDistTitle", language) });

		if (stats.categoryBreakdown.length === 0) {
			card.createDiv({ cls: "dwl-dashboard-card-empty", text: "-" });
			return;
		}

		// Multi-segment progress bar
		const bar = card.createDiv({ cls: "dwl-dashboard-multi-progress" });
		for (const item of stats.categoryBreakdown) {
			if (item.percentage <= 0) continue;
			const seg = bar.createDiv({ cls: "dwl-dashboard-progress-segment" });
			seg.setCssStyles({ width: `${item.percentage}%`, backgroundColor: item.color });
			seg.setAttribute("title", `${item.displayName}: ${formatMinutes(item.minutes)} (${item.percentage}%)`);
		}

		// Legend grid
		const legend = card.createDiv({ cls: "dwl-dashboard-legend-grid" });
		for (const item of stats.categoryBreakdown) {
			const itemEl = legend.createDiv({ cls: "dwl-dashboard-legend-item" });
			const labelRow = itemEl.createDiv({ cls: "dwl-legend-label-row" });

			const dot = labelRow.createSpan({ cls: "dwl-legend-dot" });
			dot.setCssStyles({ backgroundColor: item.color });
			labelRow.createSpan({ cls: "dwl-legend-name", text: item.displayName });

			const valRow = itemEl.createDiv({ cls: "dwl-legend-val-row" });
			valRow.createSpan({ cls: "dwl-legend-time", text: formatMinutes(item.minutes) });
			valRow.createSpan({ cls: "dwl-legend-pct", text: `${item.percentage}%` });
		}
	}

	private renderBottomLayout(
		container: HTMLElement,
		stats: DashboardStats,
		recentNotes: DailyNoteFile[],
		language: MarkerLanguage
	): void {
		const layout = container.createDiv({ cls: "dwl-dashboard-bottom-layout" });

		// Left Panel: Recent Note Activities
		const leftPanel = layout.createDiv({ cls: "dwl-dashboard-panel dwl-panel-left" });
		leftPanel.createDiv({ cls: "dwl-dashboard-panel-title", text: t("activityNotesTitle", language) });

		const activityList = leftPanel.createDiv({ cls: "dwl-dashboard-activity-list" });
		const noteSummaries = stats.recentNotesSummary;

		if (noteSummaries.length === 0) {
			activityList.createDiv({ cls: "dwl-dashboard-card-empty", text: t("dashboardEmptyVault", language) });
		} else {
			for (let i = 0; i < Math.min(10, noteSummaries.length); i++) {
				const summary = noteSummaries[i];
				// Associate summary rows with notes by path rather than index.
				const noteFile = recentNotes.find((n) => n.file.path === summary.path);
				if (!noteFile) continue;

				const row = activityList.createDiv({ cls: "dwl-dashboard-activity-row" });

				// Left: Date — use user's Daily Notes date format.
				row.createDiv({ cls: "dwl-activity-date", text: formatDateBasename(summary.date, this.plugin.getDailyNoteFormat()) });

				// Middle: Category Badge
				const mid = row.createDiv({ cls: "dwl-activity-mid" });
				if (summary.topCategory) {
					// Exact match, same as the categoryBreakdown lookup in
					// dashboardCollector.ts — summary.topCategory is always either a
					// configured category's displayName or the uncategorized label.
					const catObj = findCategoryByDisplayName(this.plugin.settings.categories, summary.topCategory);
					const badge = mid.createSpan({ cls: "dwl-activity-cat-badge", text: summary.topCategory });
					if (catObj) {
						badge.setCssStyles({
							backgroundColor: catObj.color,
							color: getTextColorForBackground(catObj.color),
						});
					}
				}

				// Right: Time
				row.createDiv({
					cls: "dwl-activity-time",
					text: summary.eventMinutes > 0 ? formatMinutes(summary.eventMinutes) : "-",
				});

				row.addEventListener("click", () => {
					void this.app.workspace.openLinkText(noteFile.file.path, "", false);
				});
			}
		}

		// Right Panel: Period Summary
		const rightPanel = layout.createDiv({ cls: "dwl-dashboard-panel dwl-panel-right" });
		rightPanel.createDiv({ cls: "dwl-dashboard-panel-title", text: t("periodSummaryTitle", language) });

		const summaryBox = rightPanel.createDiv({ cls: "dwl-dashboard-summary-box" });

		const dateRangeText =
			stats.oldestDate && stats.newestDate
				? `${formatDateBasename(stats.oldestDate)} ~ ${formatDateBasename(stats.newestDate)}`
				: "-";

		this.renderSummaryRow(summaryBox, t("statDateRange", language), dateRangeText, t("tipStatDateRange", language));
		this.renderSummaryRow(
			summaryBox,
			t("statStreak", language),
			`${stats.currentStreak} ${t("unitDays", language)}`,
			t("tipStatStreak", language)
		);
		this.renderSummaryRow(
			summaryBox,
			this.eventTimeLabel(language),
			formatMinutes(stats.recentEventMinutes),
			t("tipStatEventTime", language)
		);
		this.renderSummaryRow(
			summaryBox,
			t("statAvgPerDay", language),
			formatMinutes(stats.avgEventMinutesPerDay),
			t("tipStatAvgPerDay", language)
		);
	}

	/**
	 * The label for the "Event Time" metric, naming the window the figures
	 * actually cover.
	 *
	 * The figures come from the selected window, so a fixed "30d" label was
	 * wrong for every other choice. The "All Time" window has no day count
	 * and uses the plain label.
	 */
	private eventTimeLabel(language: MarkerLanguage): string {
		if (this.selectedWindowDays <= 0) return t("statEventTime", language);
		return t("statEventTimeWindow", language).replace("%s", String(this.selectedWindowDays));
	}

	private renderSummaryRow(container: HTMLElement, label: string, value: string, tooltip?: string): void {
		const row = container.createDiv({ cls: "dwl-summary-row" });
		const labelEl = row.createDiv({ cls: "dwl-summary-label", text: label });
		if (tooltip) setTooltip(labelEl, tooltip);
		row.createDiv({ cls: "dwl-summary-val", text: value });
	}
}

function formatMinutes(totalMinutes: number): string {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}
