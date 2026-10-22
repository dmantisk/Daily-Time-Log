import { TFile, Notice, setIcon } from "obsidian";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
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
	minutesToTime,
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

export interface TimelineViewProps {
	plugin: DailyWorkLogPlugin;
	/**
	 * Bumped by DailyWorkLogView.refresh() whenever main.ts's existing
	 * vault-modify / active-leaf-change / settings-change plumbing
	 * (AGENTS.md §3) decides this view needs to re-sync — this component
	 * does not subscribe to Obsidian events itself, it just reacts to this.
	 */
	refreshToken: number;
}

const CELL_MINUTES = 10;
const CELLS_PER_HOUR = 60 / CELL_MINUTES;

function buildTimelineLine(values: EventEntryValues): string {
	const categoryPart = values.category ? `[${values.category}] ` : "";
	return `- ${values.start} - ${values.end} ${categoryPart}${values.description}`.trimEnd();
}

function formatDateHeader(date: Date, language: MarkerLanguage, dateFormat: string): string {
	const basename = formatDateBasename(date, dateFormat);
	if (isSameDate(date, new Date())) {
		return `${basename} ${t("todayDateSuffix", language)}`;
	}
	return `${basename} (${WEEKDAYS[language][date.getDay()]})`;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ plugin, refreshToken }) => {
	const [activeFile, setActiveFile] = useState<TFile | null>(null);
	const [timeline, setTimeline] = useState<TimelineItem[]>([]);
	/** True when the active note has no Event block under the configured heading. */
	const [hasEventSection, setHasEventSection] = useState(true);

	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState<number | null>(null);
	const [dragEnd, setDragEnd] = useState<number | null>(null);
	/**
	 * Latch that guarantees a single drag is turned into a single Event.
	 *
	 * A release fires TWO handlers: the grid cell's React `onMouseUp` and
	 * the window-level `mouseup` listener (the native event bubbles from
	 * the cell up to `window`). Both run within the same event dispatch,
	 * so no re-render happens in between and `isDragging` is still true
	 * for both calls — the state-based guard cannot suppress the second
	 * one. Without this latch a single drag opens two add-Event modals.
	 */
	const dragHandledRef = useRef(false);

	const language = plugin.getUiLanguage();
	const categories = plugin.settings.categories;
	const { startHour, endHour } = plugin.settings;

	const reloadFile = async (file: TFile): Promise<void> => {
		const content = await plugin.app.vault.read(file);
		const parsed = parseDailyNote(content, plugin.getEventHeadingConfig());
		setTimeline(parsed.timeline);
		setHasEventSection(hasEventBlock(content, plugin.getEventHeadingConfig()));
	};

	// Re-syncs from the active file whenever refreshToken changes (see the
	// prop doc above). Only a real active file updates the tracked
	// `activeFile` — no active file at all (e.g. the sidebar itself has
	// focus) intentionally leaves it as-is (AGENTS.md §3).
	useEffect(() => {
		let cancelled = false;
		setIsDragging(false);
		setDragStart(null);
		setDragEnd(null);
		dragHandledRef.current = false;

		const run = async (): Promise<void> => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return;
			const resolved =
				parseDateFromDailyNotePath(
					file.path,
					plugin.getDailyNoteFormat(),
					plugin.getDailyNoteFolder()
				) !== null
					? file
					: null;
			if (cancelled) return;
			setActiveFile(resolved);
			if (!resolved) {
				setTimeline([]);
				setHasEventSection(true);
				return;
			}
			const content = await plugin.app.vault.read(resolved);
			if (cancelled) return;
			const parsed = parseDailyNote(content, plugin.getEventHeadingConfig());
			setTimeline(parsed.timeline);
			setHasEventSection(hasEventBlock(content, plugin.getEventHeadingConfig()));
		};
		void run();

		return () => {
			cancelled = true;
		};
	}, [refreshToken, plugin]);

	// Catches drag-release outside the grid (design parity with the mouse-leave handler on the grid itself).
	useEffect(() => {
		const onWindowMouseUp = (): void => {
			if (isDragging) handleMouseUp();
		};
		window.addEventListener("mouseup", onWindowMouseUp);
		return () => window.removeEventListener("mouseup", onWindowMouseUp);
	}, [isDragging, dragStart, dragEnd]);

	// ── Event (Timeline) ──────────────────────────────────────────────

	const addEvent = async (values: EventEntryValues): Promise<void> => {
		if (!activeFile) return;
		const content = await plugin.app.vault.read(activeFile);
		await plugin.writeFile(
			activeFile,
			appendLineToBlock(content, buildTimelineLine(values), plugin.getEventHeadingConfig())
		);
		await reloadFile(activeFile);
	};

	const updateEvent = async (item: TimelineItem, values: EventEntryValues): Promise<void> => {
		if (!activeFile) return;
		const content = await plugin.app.vault.read(activeFile);
		const lines = splitContentLines(content);
		if (!timelineRangeMatches(lines, item)) {
			await reloadFile(activeFile);
			return;
		}
		await plugin.writeFile(activeFile, replaceLineRangeAt(content, item.line, item.lineCount, buildTimelineLine(values)));
		await reloadFile(activeFile);
	};

	const deleteEvent = async (item: TimelineItem): Promise<void> => {
		if (!activeFile) return;
		const content = await plugin.app.vault.read(activeFile);
		const lines = splitContentLines(content);
		if (!timelineRangeMatches(lines, item)) {
			await reloadFile(activeFile);
			return;
		}
		await plugin.writeFile(activeFile, removeLineRangeAt(content, item.line, item.lineCount));
		await reloadFile(activeFile);
	};

	const openEventModal = (item: TimelineItem | null, defaultStart: string, defaultEnd: string): void => {
		new TimelineModal(
			plugin.app,
			language,
			categories,
			item,
			defaultStart,
			defaultEnd,
			(values) => {
				if (item) {
					void updateEvent(item, values);
				} else {
					void addEvent(values);
				}
			},
			item
				? () => {
						new ConfirmDeleteModal(
							plugin.app,
							t("confirmTitle", language),
							t("confirmDeleteEvent", language),
							t("btnCancel", language),
							t("confirmOk", language),
							() => void deleteEvent(item)
						).open();
					}
				: null
		).open();
	};

	// ── Drag-to-select ────────────────────────────────────────────────

	const handleMouseDown = (cellIndex: number): void => {
		dragHandledRef.current = false;
		setIsDragging(true);
		setDragStart(cellIndex);
		setDragEnd(cellIndex);
	};

	const handleMouseEnter = (cellIndex: number): void => {
		if (isDragging) setDragEnd(cellIndex);
	};

	const handleMouseUp = (): void => {
		if (!isDragging || dragStart === null || dragEnd === null) return;
		// The window listener runs right after the cell's own handler for
		// the same release — only the first one may create the Event.
		if (dragHandledRef.current) return;
		dragHandledRef.current = true;
		setIsDragging(false);

		const startIdx = Math.min(dragStart, dragEnd);
		const endIdx = Math.max(dragStart, dragEnd);
		openEventModal(null, minutesToTime(startIdx * CELL_MINUTES), minutesToTime((endIdx + 1) * CELL_MINUTES));

		setDragStart(null);
		setDragEnd(null);
	};

	// ── Render ────────────────────────────────────────────────────────

	if (!activeFile) {
		const currentFile = plugin.app.workspace.getActiveFile();
		const isNotDailyNote = !!currentFile;
		return (
			<div className="dwl-view">
				<div className="dwl-empty-state-block">
					<h3>{t(isNotDailyNote ? "emptyStateTitleNotDaily" : "emptyStateTitleNoNote", language)}</h3>
					{/* The "not a daily note" case skips the description entirely — the title alone is enough. */}
					{!isNotDailyNote && <p>{t("emptyStateDescNoNote", language)}</p>}
				</div>
			</div>
		);
	}

	const dateForFile = parseDateFromDailyNotePath(
		activeFile.path,
		plugin.getDailyNoteFormat(),
		plugin.getDailyNoteFolder()
	);
	if (!dateForFile) return null;

	const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

	return (
		<div className="dwl-view">
			<div className="dwl-view-header">
				<h2 className="dwl-view-date-title">
					{formatDateHeader(dateForFile, language, plugin.getDailyNoteFormat())}
				</h2>
				<div className="dwl-nav-buttons">
					<button
						ref={(el) => { if (el) setIcon(el, "chevron-left"); }}
						aria-label={t("prev", language)}
						className="dwl-nav-btn"
						onClick={() => {
							const prev = new Date(dateForFile);
							prev.setDate(prev.getDate() - 1);
							const prevFileName = formatDailyNotePath(
								prev,
								plugin.getDailyNoteFormat(),
								plugin.getDailyNoteFolder()
							);
							const prevFile = plugin.app.vault.getAbstractFileByPath(prevFileName);
							if (prevFile && prevFile instanceof TFile) {
								plugin.app.workspace.getLeaf(false).openFile(prevFile);
							} else {
								new Notice(`Previous daily note not found: ${prevFileName}`);
							}
						}}
					>
					</button>
					<button
						ref={(el) => { if (el) setIcon(el, "chevron-right"); }}
						aria-label={t("next", language)}
						className="dwl-nav-btn"
						onClick={() => {
							const next = new Date(dateForFile);
							next.setDate(next.getDate() + 1);
							const nextFileName = formatDailyNotePath(
								next,
								plugin.getDailyNoteFormat(),
								plugin.getDailyNoteFolder()
							);
							const nextFile = plugin.app.vault.getAbstractFileByPath(nextFileName);
							if (nextFile && nextFile instanceof TFile) {
								plugin.app.workspace.getLeaf(false).openFile(nextFile);
							} else {
								new Notice(`Next daily note not found: ${nextFileName}`);
							}
						}}
					>
					</button>
				</div>
			</div>

			{/* Strict scoping: Events are read only from under the configured
			    heading. The grid stays usable — creating the first Event adds
			    the heading to the note (see appendLineToBlock). */}
			{!hasEventSection && (
				<div className="dwl-missing-heading-banner">
					<strong>{t("emptyStateTitleNoEventHeading", language)}</strong>
					<span>{t("emptyStateDescNoEventHeading", language)}</span>
				</div>
			)}

			<div
				className="dwl-grid-wrap"
				onMouseLeave={() => {
					if (isDragging) handleMouseUp();
				}}
			>
				<div className="dwl-grid">
					{hours.map((hour) => {
						const hourStartMin = hour * 60;
						const hourEndMin = (hour + 1) * 60;
						// An Event that crosses midnight occupies two in-day
						// segments, so it is drawn as a bar in the evening hours
						// AND a bar in the early-morning hours.
						const overlapping = timeline
							.map((item, index) => ({ item, index }))
							.flatMap(({ item, index }) =>
								timelineDaySegments(item).map((segment, segmentIndex) => ({
									item,
									segment,
									key: `${index}-${segmentIndex}`,
								}))
							)
							.filter(({ segment }) => {
								return Math.max(segment.start, hourStartMin) < Math.min(segment.end, hourEndMin);
							});

						const isPm = hour >= 12;
						const displayHour = hour === 0 || hour === 24 ? 12 : hour > 12 ? hour - 12 : hour;
						const ampm = t(hour === 24 || !isPm ? "hourMarkerAm" : "hourMarkerPm", language);

						return (
							<div key={hour} className="dwl-grid-row">
								<div className="dwl-grid-hour-label">
									<span className="dwl-grid-hour-num">{displayHour}</span>
									<span className="dwl-grid-hour-ampm">{ampm}</span>
								</div>
								<div className="dwl-grid-cells">
									{Array.from({ length: CELLS_PER_HOUR }).map((_, colIndex) => {
										const cellIndex = hour * CELLS_PER_HOUR + colIndex;
										let isSelecting = false;
										if (isDragging && dragStart !== null && dragEnd !== null) {
											const min = Math.min(dragStart, dragEnd);
											const max = Math.max(dragStart, dragEnd);
											isSelecting = cellIndex >= min && cellIndex <= max;
										}
										return (
											<div
												key={colIndex}
												className={`dwl-grid-cell${isSelecting ? " is-selecting" : ""}`}
												onMouseDown={() => handleMouseDown(cellIndex)}
												onMouseEnter={() => handleMouseEnter(cellIndex)}
												onMouseUp={handleMouseUp}
											/>
										);
									})}

									{overlapping.map(({ item, segment, key }) => {
										const overlapStart = Math.max(segment.start, hourStartMin);
										const overlapEnd = Math.min(segment.end, hourEndMin);
										const startCol = (overlapStart - hourStartMin) / CELL_MINUTES;
										const endCol = (overlapEnd - hourStartMin) / CELL_MINUTES;
										const leftPercent = (startCol / CELLS_PER_HOUR) * 100;
										const widthPercent = ((endCol - startCol) / CELLS_PER_HOUR) * 100;

										const catObj = findCategoryByDisplayName(categories, item.category);
										const bgColor = catObj?.color ?? "var(--background-modifier-hover)";
										const textColor = catObj ? getTextColorForBackground(catObj.color) : "var(--text-normal)";
										const label = item.category ?? t("uncategorized", language);
										/* A bar at most one 10-minute cell wide cannot fit the category
										   name. Centring the text would cut it in the MIDDLE — the
										   visible slice would be the middle of the word — so a short
										   bar anchors its label to the left edge instead, and the label
										   is allowed to run past the bar's right edge so it still reads
										   from its first letter. */
										const isShort = overlapEnd - overlapStart <= CELL_MINUTES;

										return (
											<div
												key={key}
												className={`dwl-grid-block${isShort ? " is-short" : ""}`}
												style={{
										/* The gutter between neighbouring bars is applied here, as
										   geometry rather than as a border: Chrome floors fractional
										   border widths to whole pixels, so a border-based gutter
										   could not be matched exactly against the vertical gutter
										   in styles.css. Both read the same --dwl-block-gap. */
										left: `calc(${leftPercent}% + var(--dwl-block-gap, 5px) / 2)`,
										width: `calc(${widthPercent}% - var(--dwl-block-gap, 5px))`,
										backgroundColor: bgColor,
										color: textColor,
									}}
												title={`${item.start} ~ ${item.end} | ${label}${item.description ? `\n${stripHtml(item.description)}` : ""}`}
												onClick={(evt) => {
													evt.stopPropagation();
													openEventModal(item, item.start, item.end);
												}}
												onMouseDown={(evt) => evt.stopPropagation()}
											>
												{/* The bar shows the category name only — the time range is
								    already conveyed by the block's position and width on
								    the grid, and it stays available in the tooltip.

								    The label sits in its own box so it can be truncated
								    cleanly: a flex container centres an over-long text
								    node and clips BOTH ends, which cuts the middle out
								    of the word. */}
												<span className="dwl-grid-block-label">{label}</span>
											</div>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</div>

		</div>
	);
};
