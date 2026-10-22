import { Notice, setIcon, TFile } from "obsidian";
import {
	formatDailyNotePath,
	formatDateBasename,
	isSameDate,
	parseDateFromDailyNotePath,
} from "../dailyNote";
import { t, WEEKDAYS } from "../i18n";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
import { TimelineModal, type EventEntryValues } from "../modals/TimelineModal";
import type DailyWorkLogPlugin from "../main";
import {
	appendLineToBlock,
	hasEventBlock,
	parseDailyNote,
	removeLineRangeAt,
	replaceLineRangeAt,
	splitContentLines,
	stripHtml,
	timelineDaySegments,
	timelineRangeMatches,
	type MarkerLanguage,
	type TimelineItem,
} from "../parser";
import { getTextColorForBackground } from "./colorUtils";
import { findCategoryByDisplayName } from "../settings";
import {
	buildTimelineLine,
	cellIndexForHour,
	CELLS_PER_HOUR,
	dragRangeToTimes,
	timelineBlockGeometry,
} from "../timelineLogic";

interface DragRange {
	start: number;
	end: number;
}

interface TimelineState {
	activeFile: TFile | null;
	timeline: TimelineItem[];
	hasEventSection: boolean;
	drag: DragRange | null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function formatDateHeader(date: Date, language: MarkerLanguage, dateFormat: string): string {
	const basename = formatDateBasename(date, dateFormat);
	if (isSameDate(date, new Date())) {
		return `${basename} ${t("todayDateSuffix", language)}`;
	}
	return `${basename} (${WEEKDAYS[language][date.getDay()]})`;
}

export class TimelineController {
	private readonly state: TimelineState = {
		activeFile: null,
		timeline: [],
		hasEventSection: true,
		drag: null,
	};
	private readonly gridCells: HTMLElement[] = [];
	private loadToken = 0;
	private destroyed = false;

	private readonly onWindowPointerUp = (): void => {
		this.finishDrag();
	};

	constructor(
		private readonly plugin: DailyWorkLogPlugin,
		private readonly container: HTMLElement
	) {
		window.addEventListener("pointerup", this.onWindowPointerUp);
		this.refresh();
	}

	refresh(): void {
		if (this.destroyed) return;
		this.state.drag = null;
		this.render();
		void this.syncFromActiveFile();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.loadToken++;
		window.removeEventListener("pointerup", this.onWindowPointerUp);
		this.container.empty();
		this.gridCells.length = 0;
	}

	private async syncFromActiveFile(): Promise<void> {
		const token = ++this.loadToken;
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) return;

		const resolved =
			parseDateFromDailyNotePath(
				file.path,
				this.plugin.getDailyNoteFormat(),
				this.plugin.getDailyNoteFolder()
			) !== null
				? file
				: null;
		this.state.activeFile = resolved;
		if (!resolved) {
			this.state.timeline = [];
			this.state.hasEventSection = true;
			this.render();
			return;
		}

		this.render();
		await this.loadFile(resolved, token);
	}

	private async loadFile(file: TFile, token: number): Promise<void> {
		try {
			const content = await this.plugin.app.vault.cachedRead(file);
			if (
				this.destroyed ||
				token !== this.loadToken ||
				this.state.activeFile?.path !== file.path
			) return;

			const parsed = parseDailyNote(content, this.plugin.getEventHeadingConfig());
			this.state.timeline = parsed.timeline;
			this.state.hasEventSection = hasEventBlock(content, this.plugin.getEventHeadingConfig());
			this.render();
		} catch (error) {
			if (this.destroyed || token !== this.loadToken) return;
			new Notice(`${t("noticeLoadTimelineFailed", this.plugin.getUiLanguage())}: ${errorMessage(error)}`);
		}
	}

	private async reloadFile(file: TFile): Promise<void> {
		if (this.state.activeFile?.path !== file.path) return;
		const token = ++this.loadToken;
		await this.loadFile(file, token);
	}

	private async addEvent(file: TFile, values: EventEntryValues): Promise<void> {
		try {
			const content = await this.plugin.app.vault.read(file);
			await this.plugin.writeFile(
				file,
				appendLineToBlock(content, buildTimelineLine(values), this.plugin.getEventHeadingConfig())
			);
			await this.reloadFile(file);
		} catch (error) {
			new Notice(`${t("noticeSaveEventFailed", this.plugin.getUiLanguage())}: ${errorMessage(error)}`);
		}
	}

	private async updateEvent(file: TFile, item: TimelineItem, values: EventEntryValues): Promise<void> {
		try {
			const content = await this.plugin.app.vault.read(file);
			const lines = splitContentLines(content);
			if (!timelineRangeMatches(lines, item)) {
				await this.reloadFile(file);
				return;
			}
			await this.plugin.writeFile(
				file,
				replaceLineRangeAt(content, item.line, item.lineCount, buildTimelineLine(values))
			);
			await this.reloadFile(file);
		} catch (error) {
			new Notice(`${t("noticeUpdateEventFailed", this.plugin.getUiLanguage())}: ${errorMessage(error)}`);
		}
	}

	private async deleteEvent(file: TFile, item: TimelineItem): Promise<void> {
		try {
			const content = await this.plugin.app.vault.read(file);
			const lines = splitContentLines(content);
			if (!timelineRangeMatches(lines, item)) {
				await this.reloadFile(file);
				return;
			}
			await this.plugin.writeFile(file, removeLineRangeAt(content, item.line, item.lineCount));
			await this.reloadFile(file);
		} catch (error) {
			new Notice(`${t("noticeDeleteEventFailed", this.plugin.getUiLanguage())}: ${errorMessage(error)}`);
		}
	}

	private openEventModal(item: TimelineItem | null, defaultStart: string, defaultEnd: string): void {
		const file = this.state.activeFile;
		if (!file) return;

		const language = this.plugin.getUiLanguage();
		new TimelineModal(
			this.plugin.app,
			language,
			this.plugin.settings.categories,
			item,
			defaultStart,
			defaultEnd,
			(values) => {
				if (item) void this.updateEvent(file, item, values);
				else void this.addEvent(file, values);
			},
			item
				? () => {
						new ConfirmDeleteModal(
							this.plugin.app,
							t("confirmTitle", language),
							t("confirmDeleteEvent", language),
							t("btnCancel", language),
							t("confirmOk", language),
							() => void this.deleteEvent(file, item)
						).open();
					}
				: null
		).open();
	}

	private startDrag(cellIndex: number): void {
		const previous = this.state.drag;
		this.state.drag = { start: cellIndex, end: cellIndex };
		this.updateSelectionClasses(previous, this.state.drag);
	}

	private moveDrag(cellIndex: number): void {
		const previous = this.state.drag;
		if (!previous) return;
		this.state.drag = { start: previous.start, end: cellIndex };
		this.updateSelectionClasses(previous, this.state.drag);
	}

	private finishDrag(): void {
		const drag = this.state.drag;
		if (!drag) return;
		this.state.drag = null;
		this.updateSelectionClasses(drag, null);
		const range = dragRangeToTimes(drag.start, drag.end);
		this.openEventModal(null, range.start, range.end);
	}

	private cancelDrag(): void {
		const drag = this.state.drag;
		if (!drag) return;
		this.state.drag = null;
		this.updateSelectionClasses(drag, null);
	}

	private updateSelectionClasses(previous: DragRange | null, next: DragRange | null): void {
		const previousStart = previous ? Math.min(previous.start, previous.end) : Number.POSITIVE_INFINITY;
		const previousEnd = previous ? Math.max(previous.start, previous.end) : Number.NEGATIVE_INFINITY;
		const nextStart = next ? Math.min(next.start, next.end) : Number.POSITIVE_INFINITY;
		const nextEnd = next ? Math.max(next.start, next.end) : Number.NEGATIVE_INFINITY;
		const first = Math.min(previousStart, nextStart);
		const last = Math.max(previousEnd, nextEnd);

		for (let index = first; index <= last; index++) {
			const wasSelected = index >= previousStart && index <= previousEnd;
			const isSelected = index >= nextStart && index <= nextEnd;
			if (wasSelected === isSelected) continue;
			this.gridCells[index]?.classList.toggle("is-selecting", isSelected);
		}
	}

	private render(): void {
		if (this.destroyed) return;
		this.container.empty();
		this.gridCells.length = 0;
		const root = this.container.createDiv({ cls: "dwl-view" });
		const language = this.plugin.getUiLanguage();

		if (!this.state.activeFile) {
			const currentFile = this.plugin.app.workspace.getActiveFile();
			const empty = root.createDiv({ cls: "dwl-empty-state-block" });
			empty.createEl("h3", {
				text: t(currentFile ? "emptyStateTitleNotDaily" : "emptyStateTitleNoNote", language),
			});
			if (!currentFile) {
				empty.createEl("p", { text: t("emptyStateDescNoNote", language) });
			}
			return;
		}

		const dateForFile = parseDateFromDailyNotePath(
			this.state.activeFile.path,
			this.plugin.getDailyNoteFormat(),
			this.plugin.getDailyNoteFolder()
		);
		if (!dateForFile) return;

		this.renderHeader(root, dateForFile, language);
		if (!this.state.hasEventSection) {
			const banner = root.createDiv({ cls: "dwl-missing-heading-banner" });
			banner.createEl("strong", { text: t("emptyStateTitleNoEventHeading", language) });
			banner.createEl("span", { text: t("emptyStateDescNoEventHeading", language) });
		}
		this.renderGrid(root, language);
	}

	private renderHeader(root: HTMLElement, date: Date, language: MarkerLanguage): void {
		const header = root.createDiv({ cls: "dwl-view-header" });
		header.createEl("h2", {
			cls: "dwl-view-date-title",
			text: formatDateHeader(date, language, this.plugin.getDailyNoteFormat()),
		});
		const buttons = header.createDiv({ cls: "dwl-nav-buttons" });
		this.renderNavigationButton(buttons, date, -1, language);
		this.renderNavigationButton(buttons, date, 1, language);
	}

	private renderNavigationButton(
		container: HTMLElement,
		date: Date,
		offset: -1 | 1,
		language: MarkerLanguage
	): void {
		const previous = offset < 0;
		const button = container.createEl("button", {
			cls: "dwl-nav-btn",
			attr: { "aria-label": t(previous ? "prev" : "next", language) },
		});
		setIcon(button, previous ? "chevron-left" : "chevron-right");
		button.addEventListener("click", () => {
			const target = new Date(date);
			target.setDate(target.getDate() + offset);
			const path = formatDailyNotePath(
				target,
				this.plugin.getDailyNoteFormat(),
				this.plugin.getDailyNoteFolder()
			);
			const file = this.plugin.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				void this.plugin.app.workspace.getLeaf(false).openFile(file);
			} else {
				new Notice(t("noticeDailyNoteNotFound", language).replace("%s", path));
			}
		});
	}

	private renderGrid(root: HTMLElement, language: MarkerLanguage): void {
		const { startHour, endHour } = this.plugin.settings;
		const wrap = root.createDiv({ cls: "dwl-grid-wrap" });
		wrap.addEventListener("pointerleave", () => this.finishDrag());
		wrap.addEventListener("pointercancel", () => this.cancelDrag());

		const grid = wrap.createDiv({ cls: "dwl-grid" });
		for (let hour = startHour; hour < endHour; hour++) {
			const hourStartMin = hour * 60;
			const hourEndMin = (hour + 1) * 60;
			const row = grid.createDiv({ cls: "dwl-grid-row" });
			const hourLabel = row.createDiv({ cls: "dwl-grid-hour-label" });
			const isPm = hour >= 12;
			const displayHour = hour === 0 || hour === 24 ? 12 : hour > 12 ? hour - 12 : hour;
			const ampm = t(hour === 24 || !isPm ? "hourMarkerAm" : "hourMarkerPm", language);
			hourLabel.createEl("span", { cls: "dwl-grid-hour-num", text: String(displayHour) });
			hourLabel.createEl("span", { cls: "dwl-grid-hour-ampm", text: ampm });

			const cells = row.createDiv({ cls: "dwl-grid-cells" });
			for (let column = 0; column < CELLS_PER_HOUR; column++) {
				const cellIndex = cellIndexForHour(hour, column);
				const selected = this.isSelected(cellIndex);
				const cell = cells.createDiv({
					cls: `dwl-grid-cell${selected ? " is-selecting" : ""}`,
				});
				this.gridCells[cellIndex] = cell;
				cell.addEventListener("pointerdown", (event) => {
					const target = event.currentTarget as HTMLElement;
					if (target.hasPointerCapture?.(event.pointerId)) {
						target.releasePointerCapture(event.pointerId);
					}
					this.startDrag(cellIndex);
				});
				cell.addEventListener("pointerenter", () => this.moveDrag(cellIndex));
				cell.addEventListener("pointerup", () => this.finishDrag());
			}

			this.renderBlocks(cells, hourStartMin, hourEndMin, language);
		}
	}

	private isSelected(cellIndex: number): boolean {
		const drag = this.state.drag;
		if (!drag) return false;
		return cellIndex >= Math.min(drag.start, drag.end) && cellIndex <= Math.max(drag.start, drag.end);
	}

	private renderBlocks(
		container: HTMLElement,
		hourStartMin: number,
		hourEndMin: number,
		language: MarkerLanguage
	): void {
		const categories = this.plugin.settings.categories;
		this.state.timeline.forEach((item) => {
			timelineDaySegments(item).forEach((segment) => {
				const geometry = timelineBlockGeometry(
					segment.start,
					segment.end,
					hourStartMin,
					hourEndMin
				);
				if (!geometry) return;

				const category = findCategoryByDisplayName(categories, item.category);
				const label = item.category ?? t("uncategorized", language);
				const block = container.createDiv({
					cls: `dwl-grid-block${geometry.isShort ? " is-short" : ""}`,
					title: `${item.start} ~ ${item.end} | ${label}${item.description ? `\n${stripHtml(item.description)}` : ""}`,
				});
				block.style.left = `calc(${geometry.leftPercent}% + var(--dwl-block-gap, 5px) / 2)`;
				block.style.width = `calc(${geometry.widthPercent}% - var(--dwl-block-gap, 5px))`;
				block.style.backgroundColor = category?.color ?? "var(--background-modifier-hover)";
				block.style.color = category ? getTextColorForBackground(category.color) : "var(--text-normal)";
				block.addEventListener("click", (event) => {
					event.stopPropagation();
					this.openEventModal(item, item.start, item.end);
				});
				block.addEventListener("pointerdown", (event) => event.stopPropagation());
				block.createEl("span", { cls: "dwl-grid-block-label", text: label });
			});
		});
	}
}
