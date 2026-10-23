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
	LONG_PRESS_DURATION_MS,
	shouldCancelPendingTouchPress,
	timelineBlockGeometry,
	touchTapRangeToTimes,
	type PendingTouchPress,
} from "../timelineLogic";

interface DragRange {
	start: number;
	end: number;
	pointerId: number;
	pointerType: string;
}

interface TimelineState {
	activeFile: TFile | null;
	timeline: TimelineItem[];
	hasEventSection: boolean;
	drag: DragRange | null;
	pendingTouch: PendingTouchPress | null;
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
		pendingTouch: null,
	};
	private readonly gridCells: HTMLElement[] = [];
	private gridElement: HTMLElement | null = null;
	private readonly activeWindow: Window;
	private loadToken = 0;
	private destroyed = false;

	private readonly onWindowPointerMove = (event: PointerEvent): void => {
		this.handlePointerMove(event);
	};

	private readonly onWindowPointerUp = (event: PointerEvent): void => {
		this.handlePointerUp(event);
	};

	private readonly onWindowPointerCancel = (event: PointerEvent): void => {
		this.cancelPointer(event);
	};

	constructor(
		private readonly plugin: DailyWorkLogPlugin,
		private readonly container: HTMLElement
	) {
		const activeWindow = container.ownerDocument.defaultView;
		if (!activeWindow) throw new Error("TimelineController requires a document with an active window");
		this.activeWindow = activeWindow;
		activeWindow.addEventListener("pointermove", this.onWindowPointerMove);
		activeWindow.addEventListener("pointerup", this.onWindowPointerUp);
		activeWindow.addEventListener("pointercancel", this.onWindowPointerCancel);
		this.refresh();
	}

	refresh(): void {
		if (this.destroyed) return;
		this.clearPendingTouchPress();
		this.clearDrag();
		this.state.drag = null;
		void this.syncFromActiveFile();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.loadToken++;
		this.clearPendingTouchPress();
		this.clearDrag();
		this.activeWindow.removeEventListener("pointermove", this.onWindowPointerMove);
		this.activeWindow.removeEventListener("pointerup", this.onWindowPointerUp);
		this.activeWindow.removeEventListener("pointercancel", this.onWindowPointerCancel);
		this.container.empty();
		this.gridCells.length = 0;
		this.gridElement = null;
	}

	private async syncFromActiveFile(): Promise<void> {
		const token = ++this.loadToken;
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			this.render();
			return;
		}

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

		this.state.timeline = [];
		this.state.hasEventSection = true;
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
			this.render();
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

	private startPointer(cellIndex: number, event: PointerEvent): void {
		if (!event.isPrimary) return;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture?.(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}

		this.clearPendingTouchPress();
		this.clearDrag();

		if (event.pointerType === "touch") {
			const pending: PendingTouchPress = {
				pointerId: event.pointerId,
				cellIndex,
				startX: event.clientX,
				startY: event.clientY,
				timerId: 0,
			};
			pending.timerId = this.activeWindow.setTimeout(() => {
				if (this.state.pendingTouch?.pointerId !== pending.pointerId) return;
				this.state.pendingTouch = null;
				this.state.drag = {
					start: cellIndex,
					end: cellIndex,
					pointerId: event.pointerId,
					pointerType: event.pointerType,
				};
				this.gridElement?.style.setProperty("touch-action", "none");
				this.updateSelectionClasses(null, this.state.drag);
				this.vibrateForTouchSelection();
			}, LONG_PRESS_DURATION_MS);
			this.state.pendingTouch = pending;
			return;
		}

		this.state.drag = {
			start: cellIndex,
			end: cellIndex,
			pointerId: event.pointerId,
			pointerType: event.pointerType,
		};
		this.updateSelectionClasses(null, this.state.drag);
	}

	private moveDrag(cellIndex: number, pointerId: number): void {
		const previous = this.state.drag;
		if (!previous || previous.pointerId !== pointerId) return;
		this.state.drag = { ...previous, end: cellIndex };
		this.updateSelectionClasses(previous, this.state.drag);
	}

	private handlePointerMove(event: PointerEvent): void {
		if (!event.isPrimary) return;

		const pending = this.state.pendingTouch;
		if (pending) {
			if (
				shouldCancelPendingTouchPress(
					pending,
					event.pointerId,
					event.clientX,
					event.clientY
				)
			) {
				this.clearPendingTouchPress();
			}
			return;
		}

		const drag = this.state.drag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const target = this.container.ownerDocument.elementFromPoint(event.clientX, event.clientY);
		const cell = target?.closest<HTMLElement>(".dwl-grid-cell");
		const cellIndex = cell?.dataset.cellIndex;
		if (!cell || !this.container.contains(cell) || cellIndex === undefined) return;
		this.moveDrag(Number(cellIndex), event.pointerId);
	}

	private handlePointerUp(event: PointerEvent): void {
		if (!event.isPrimary) return;

		const pending = this.state.pendingTouch;
		if (pending?.pointerId === event.pointerId) {
			this.clearPendingTouchPress();
			const { endHour } = this.plugin.settings;
			const range = touchTapRangeToTimes(pending.cellIndex, endHour);
			this.openEventModal(null, range.start, range.end);
			return;
		}

		if (this.state.drag?.pointerId === event.pointerId) this.finishDrag();
	}

	private handlePointerLeave(event: PointerEvent): void {
		if (this.state.pendingTouch?.pointerId === event.pointerId) {
			this.clearPendingTouchPress();
			return;
		}
		const drag = this.state.drag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		if (drag.pointerType === "touch") {
			this.clearDrag();
			return;
		}
		this.finishDrag();
	}

	private finishDrag(): void {
		const drag = this.state.drag;
		if (!drag) return;
		this.state.drag = null;
		this.updateSelectionClasses(drag, null);
		this.clearTouchAction();
		const range = dragRangeToTimes(drag.start, drag.end);
		this.openEventModal(null, range.start, range.end);
	}

	private cancelPointer(event: PointerEvent): void {
		if (!event.isPrimary) return;
		if (this.state.pendingTouch?.pointerId === event.pointerId) {
			this.clearPendingTouchPress();
		}
		if (this.state.drag?.pointerId !== event.pointerId) return;
		this.clearDrag();
	}

	private clearPendingTouchPress(): void {
		const pending = this.state.pendingTouch;
		if (!pending) return;
		this.activeWindow.clearTimeout(pending.timerId);
		this.state.pendingTouch = null;
	}

	private clearDrag(): void {
		const drag = this.state.drag;
		if (!drag) return;
		this.state.drag = null;
		this.updateSelectionClasses(drag, null);
		this.clearTouchAction();
	}

	private clearTouchAction(): void {
		if (this.gridElement) this.gridElement.style.touchAction = "";
	}

	private vibrateForTouchSelection(): void {
		const navigator = this.activeWindow.navigator;
		if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
			navigator.vibrate(10);
		}
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

		const grid = wrap.createDiv({ cls: "dwl-grid" });
		this.gridElement = grid;
		if (this.state.drag?.pointerType === "touch") {
			grid.style.setProperty("touch-action", "none");
		}
		wrap.addEventListener("pointerleave", (event) => this.handlePointerLeave(event));
		wrap.addEventListener("pointercancel", (event) => this.cancelPointer(event));
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
					attr: { "data-cell-index": String(cellIndex) },
				});
				this.gridCells[cellIndex] = cell;
				cell.addEventListener("pointerdown", (event) => this.startPointer(cellIndex, event));
				cell.addEventListener("pointerenter", (event) => this.moveDrag(cellIndex, event.pointerId));
				cell.addEventListener("pointerup", (event) => this.handlePointerUp(event));
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
				block.style.left = `calc(${geometry.leftPercent}% + var(--dwl-block-gap, 0.3125rem) / 2)`;
				block.style.width = `calc(${geometry.widthPercent}% - var(--dwl-block-gap, 0.3125rem))`;
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
