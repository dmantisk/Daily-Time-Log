import type { MarkerLanguage } from "./parser";
import type { LanguagePreference } from "./settings";

/**
 * UI display strings. This table governs the plugin interface ONLY — it has
 * no influence on parsing. The parser recognizes exactly ONE heading, the
 * one configured in Settings (see `parser.ts` / `settings.ts`); there is no
 * per-language list of Event headings, and the default heading is not
 * localized.
 *
 * Values are kept in exact parity with DayTime Tracker's own locale/en.ts
 * and locale/ko.ts wherever a directly corresponding string exists — the
 * user wants the two plugins to look identical apart from the storage
 * mechanism (frontmatter vs. body text), so wording here isn't ours to
 * improvise on.
 */
export type UIStringKey =
	| "ribbonOpenSidebar"
	| "ribbonOpenDashboard"
	| "commandOpenSidebar"
	| "commandOpenDashboard"
	| "viewTitle"
	| "modalAddTitle"
	| "modalEditTitle"
	| "lblTimeSet"
	| "lblContent"
	| "fieldCategory"
	| "uncategorized"
	| "descPlaceholder"
	| "btnSave"
	| "btnCancel"
	| "btnDelete"
	| "confirmTitle"
	| "confirmDeleteEvent"
	| "confirmOk"
	| "emptyStateTitleNoNote"
	| "emptyStateDescNoNote"
	| "emptyStateTitleNotDaily"
	| "emptyStateTitleNoEventHeading"
	| "emptyStateDescNoEventHeading"
	| "invalidTimeFormat"
	| "multilineContinuationError"
	| "dashboardTitle"
	| "btnRefresh"
	| "statTotalNotes"
	| "statStreak"
	| "statDateRange"
	| "statEventTime"
	| "statEventTimeWindow"
	| "unitDays"
	| "dashboardEmptyVault"
	| "dashboardFutureOnlyNotice"
	| "settingStartHourName"
	| "settingStartHourDesc"
	| "settingEndHourName"
	| "settingEndHourDesc"
	| "settingEventHeadingTextName"
	| "settingEventHeadingTextDesc"
	| "settingEventHeadingLevelName"
	| "settingEventHeadingLevelDesc"
	| "alertInvalidEventHeading"
	| "settingLanguageName"
	| "settingLanguageDesc"
	| "alertStartBeforeEnd"
	| "alertEndAfterStart"
	| "settingCategoriesSection"
	| "settingCategoriesDesc"
	| "settingResetCategoriesName"
	| "settingResetCategoriesDesc"
	| "btnReset"
	| "noticeResetCategories"
	| "settingCatDisplayNamePlaceholder"
	| "settingAddCategoryName"
	| "settingAddCategoryDesc"
	| "settingAddCategoryPlaceholder"
	| "btnAdd"
	| "alertCatNameEmpty"
	| "alertCatLimitMax"
	| "alertCatNameExists"
	| "window7Days"
	| "window30Days"
	| "window90Days"
	| "windowAllTime"
	| "statAvgPerDay"
	| "statTopCategory"
	| "statTopCategoryPct"
	| "tipStatTotalNotes"
	| "tipStatStreak"
	| "tipStatDateRange"
	| "tipStatEventTime"
	| "tipStatAvgPerDay"
	| "tipStatTopCategory"
	| "categoryDistTitle"
	| "periodSummaryTitle"
	| "activityNotesTitle"
	| "todayDateSuffix"
	| "languageAuto"
	| "languageEnglish"
	| "languageKorean"
	| "prev"
	| "next"
	| "hourMidnight"
	| "hourMidnightAm"
	| "hourMidnightPm"
	| "hourAm"
	| "hourPm"
	| "hourMarkerAm"
	| "hourMarkerPm";

export const STRINGS: Record<MarkerLanguage, Record<UIStringKey, string>> = {
	en: {
		todayDateSuffix: "(Today)",
		languageAuto: "Auto",
		languageEnglish: "English",
		languageKorean: "한국어",
		hourMidnight: "Midnight (24:00)",
		prev: "Previous",
		next: "Next",
		hourMidnightAm: "12 AM (00:00)",
		hourMidnightPm: "12 PM (12:00)",
		hourAm: "%s AM",
		hourPm: "%s PM",
		hourMarkerAm: "AM",
		hourMarkerPm: "PM",
		ribbonOpenSidebar: "Open Daily Time Log",
		ribbonOpenDashboard: "Open Work Insights",
		commandOpenSidebar: "Open sidebar",
		commandOpenDashboard: "Open Work Insights",
		viewTitle: "Daily time log",
		modalAddTitle: "What did you do?",
		modalEditTitle: "Edit Daily Activity",
		lblTimeSet: "Time Setting",
		lblContent: "Content",
		fieldCategory: "Category",
		uncategorized: "Uncategorized",
		descPlaceholder: "Enter detailed content.",
		btnSave: "Save",
		btnCancel: "Cancel",
		btnDelete: "Delete",
		confirmTitle: "Notice",
		confirmDeleteEvent: "Delete this event?",
		confirmOk: "Confirm",
		emptyStateTitleNoNote: "No note open",
		emptyStateDescNoNote: "Please select an active note to view or edit logs.",
		emptyStateTitleNotDaily: "Not a daily note",
		emptyStateTitleNoEventHeading: "No Event section",
		emptyStateDescNoEventHeading:
			"Events are only read from under the configured Event heading. Adding an Event here will create it in the note.",
		invalidTimeFormat: "Invalid time format. (e.g. 09:00)",
		multilineContinuationError:
			"Line 2 onward can't start like a time range (e.g. 09:00 - 10:00), checkbox, or heading — please rephrase.",
		dashboardTitle: "Work Insights",

		btnRefresh: "Refresh",
		statTotalNotes: "Total Notes",
		statStreak: "Current Streak",
		statDateRange: "Date Range",
		statEventTime: "Event Time",
		statEventTimeWindow: "Event Time (%s)",
		unitDays: " days",
		dashboardEmptyVault: "No daily notes yet.",
		dashboardFutureOnlyNotice:
			"Only future-dated notes were found. They record no time yet, so nothing is counted until their date arrives.",
		settingStartHourName: "Day Start Hour",
		settingStartHourDesc: "Set the start hour to display on the timeline.",
		settingEndHourName: "Day End Hour",
		settingEndHourDesc: "Set the end hour to display on the timeline. (Supports up to midnight 24:00)",
		settingLanguageName: "Language",
		settingEventHeadingTextName: "Event heading text",
		settingEventHeadingTextDesc: "Heading label that marks the start of the Event section in daily notes.",
		settingEventHeadingLevelName: "Event heading level",
		settingEventHeadingLevelDesc: "Markdown heading depth used for the Event section (1-6).",
		alertInvalidEventHeading: "The Event heading must be a single line.",
		settingLanguageDesc: "Follow Obsidian's language, or choose English or Korean.",
		alertStartBeforeEnd: "Start hour must be earlier than end hour.",
		alertEndAfterStart: "End hour must be later than start hour.",
		settingCategoriesSection: "Category Management",
		settingCategoriesDesc: "Customize the categories and colors used in your daily logs.",
		settingResetCategoriesName: "Reset Default Categories",
		settingResetCategoriesDesc: "Reset all categories and colors to the default pastel values.",
		btnReset: "Reset",
		noticeResetCategories: "Categories reset to default values.",
		settingCatDisplayNamePlaceholder: "Display Name",
		settingAddCategoryName: "Add New Category",
		settingAddCategoryDesc: "Enter a name (max 10 chars) and pick a color to add a new category.",
		settingAddCategoryPlaceholder: "Category Name",
		btnAdd: "Add",
		alertCatNameEmpty: "Please enter a category name.",
		alertCatLimitMax: "You cannot have more than 10 categories.",
		alertCatNameExists: "This category name already exists.",
		window7Days: "Last 7 Days",
		window30Days: "Last 30 Days",
		window90Days: "Last 90 Days",
		windowAllTime: "All Time",
		statAvgPerDay: "Daily Avg",
		statTopCategory: "Top Category",
		statTopCategoryPct: "%s% of recorded time",
		tipStatTotalNotes:
			"The number of daily notes in the vault, dated on or before today. Notes dated in the future are not counted.",
		tipStatStreak: "The number of consecutive days with a daily note, counting back from today. 0 if today has no note.",
		tipStatDateRange: "The date of the oldest and the newest daily note in the vault.",
		tipStatEventTime: "The total time recorded across all Events in the selected time window.",
		tipStatAvgPerDay:
			"The average time recorded per day that recorded time. Days whose note recorded nothing are not counted.",
		tipStatTopCategory: "The category with the most recorded time in the selected time window.",
		categoryDistTitle: "Time Distribution by Category",
		periodSummaryTitle: "Period Summary",
		activityNotesTitle: "Recent Note Activities",
	},

	ko: {
		todayDateSuffix: "(오늘)",
		languageAuto: "자동",
		languageEnglish: "English",
		languageKorean: "한국어",
		hourMidnight: "자정 (24:00)",
		prev: "이전",
		next: "다음",
		hourMidnightAm: "오전 12시 (00:00)",
		hourMidnightPm: "오후 12시 (12:00)",
		hourAm: "오전 %s시",
		hourPm: "오후 %s시",
		hourMarkerAm: "오전",
		hourMarkerPm: "오후",
		ribbonOpenSidebar: "Daily Time Log 열기",
		ribbonOpenDashboard: "Daily Time Log 일과 인사이트 열기",
		commandOpenSidebar: "사이드바 열기",
		commandOpenDashboard: "일과 인사이트 열기",
		viewTitle: "일과 기록",
		modalAddTitle: "무엇을 했나요?",
		modalEditTitle: "일과 수정",
		lblTimeSet: "시간 설정",
		lblContent: "내용",
		fieldCategory: "카테고리",
		uncategorized: "미분류",
		descPlaceholder: "상세 내용을 입력해 주세요.",
		btnSave: "저장",
		btnCancel: "취소",
		btnDelete: "삭제",
		confirmTitle: "알림",
		confirmDeleteEvent: "이 이벤트를 삭제하시겠습니까?",
		confirmOk: "확인",
		emptyStateTitleNoNote: "선택된 노트가 없습니다",
		emptyStateDescNoNote: "일과를 기록하고 조회하려면 활성화된 노트를 선택해 주세요.",
		emptyStateTitleNotDaily: "날짜 노트가 아닙니다",
		emptyStateTitleNoEventHeading: "Event 섹션이 없습니다",
		emptyStateDescNoEventHeading:
			"일과는 설정된 Event 제목 아래에서만 읽힙니다. 여기서 일과를 추가하면 노트에 해당 제목이 생성됩니다.",
		invalidTimeFormat: "시간 형식이 올바르지 않습니다. (예: 09:00)",
		multilineContinuationError:
			"2번째 줄부터는 시간 범위(예: 09:00 - 10:00), 체크박스 또는 제목 형식으로 시작할 수 없습니다. 문구를 조금 바꿔주세요.",
		dashboardTitle: "일과 인사이트",

		btnRefresh: "새로고침",
		statTotalNotes: "총 노트 수",
		statStreak: "연속 작성일",
		statDateRange: "기록 기간",
		statEventTime: "기록 시간",
		statEventTimeWindow: "기록 시간 (%s)",
		unitDays: "일",
		dashboardEmptyVault: "아직 작성된 일일 노트가 없습니다.",
		dashboardFutureOnlyNotice:
			"미래 날짜의 노트만 있습니다. 아직 기록된 시간이 없으므로 해당 날짜가 될 때까지 집계되지 않습니다.",
		settingStartHourName: "하루 시작 시간",
		settingStartHourDesc: "타임라인에 표시할 시작 시간(시)을 설정합니다.",
		settingEndHourName: "하루 종료 시간",
		settingEndHourDesc: "타임라인에 표시할 종료 시간(시)을 설정합니다. (자정 24:00까지 지원)",
		settingLanguageName: "언어",
		settingEventHeadingTextName: "이벤트 제목 문구",
		settingEventHeadingTextDesc: "일일 노트에서 Event 섹션의 시작을 표시하는 제목 문구입니다.",
		settingEventHeadingLevelName: "이벤트 제목 수준",
		settingEventHeadingLevelDesc: "Event 섹션에 사용할 마크다운 제목 수준입니다 (1-6).",
		alertInvalidEventHeading: "Event 제목은 한 줄이어야 합니다.",
		settingLanguageDesc: "Obsidian 언어를 따르거나 영어 또는 한국어를 선택합니다.",
		alertStartBeforeEnd: "시작 시간은 종료 시간보다 빨라야 합니다.",
		alertEndAfterStart: "종료 시간은 시작 시간보다 늦어야 합니다.",
		settingCategoriesSection: "카테고리 설정",
		settingCategoriesDesc: "일과 기록에 사용할 카테고리와 색상을 관리합니다.",
		settingResetCategoriesName: "기본 카테고리 색상 재설정",
		settingResetCategoriesDesc: "카테고리와 색상을 원래의 파스텔톤 기본값으로 재설정합니다.",
		btnReset: "재설정",
		noticeResetCategories: "카테고리가 기본값으로 재설정되었습니다.",
		settingCatDisplayNamePlaceholder: "표시 이름",
		settingAddCategoryName: "새 카테고리 추가",
		settingAddCategoryDesc: "새 카테고리 이름(최대 10자)과 색상을 지정하여 추가합니다.",
		settingAddCategoryPlaceholder: "카테고리 이름 입력...",
		btnAdd: "추가",
		alertCatNameEmpty: "카테고리 이름을 입력해 주세요.",
		alertCatLimitMax: "카테고리는 최대 10개까지 등록할 수 있습니다.",
		alertCatNameExists: "이미 존재하는 카테고리 이름입니다.",
		window7Days: "최근 7일",
		window30Days: "최근 30일",
		window90Days: "최근 90일",
		windowAllTime: "전체 기간",
		statAvgPerDay: "일평균 기록",
		statTopCategory: "최다 활동 카테고리",
		statTopCategoryPct: "전체 기록 시간의 %s%",
		tipStatTotalNotes: "오늘 날짜까지의 일일 노트 수입니다. 미래 날짜의 노트는 집계되지 않습니다.",
		tipStatStreak: "오늘부터 역순으로 노트가 연속으로 작성된 일수입니다. 오늘 노트가 없으면 0입니다.",
		tipStatDateRange: "볼트에 있는 가장 오래된 노트와 가장 최근 노트의 날짜입니다.",
		tipStatEventTime: "선택한 기간 동안 기록된 전체 Event 시간입니다.",
		tipStatAvgPerDay: "시간이 기록된 날짜당 평균 기록 시간입니다. 아무것도 기록하지 않은 날은 제외됩니다.",
		tipStatTopCategory: "선택한 기간 동안 기록된 시간이 가장 많은 카테고리입니다.",
		categoryDistTitle: "카테고리별 기록 시간 분포",
		periodSummaryTitle: "기간 요약",
		activityNotesTitle: "최근 일간 노트 작업 내역",
	},
};

/** Weekday header labels, per language (Sun-first, index by Date#getDay()). */
export const WEEKDAYS: Record<MarkerLanguage, string[]> = {
	en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
	ko: ["일", "월", "화", "수", "목", "금", "토"],
};

export function resolveLanguage(
	preference: LanguagePreference,
	obsidianLanguage: string
): MarkerLanguage {
	if (preference === "en" || preference === "ko") return preference;
	return obsidianLanguage === "ko" ? "ko" : "en";
}

export function t(key: UIStringKey, language: MarkerLanguage): string {
	return STRINGS[language][key];
}

/**
 * The hour label shown in the Day Start / Day End hour dropdowns.
 *
 * The three special hours (00:00, 12:00 and 24:00) each get their own
 * string rather than being assembled from the AM/PM templates — "Midnight"
 * and "12 AM" are not the same word in every language.
 */
export function formatHourLabel(hour: number, language: MarkerLanguage): string {
	if (hour === 0) return t("hourMidnightAm", language);
	if (hour === 24) return t("hourMidnight", language);
	if (hour === 12) return t("hourMidnightPm", language);
	if (hour < 12) return t("hourAm", language).replace("%s", String(hour));
	return t("hourPm", language).replace("%s", String(hour - 12));
}
