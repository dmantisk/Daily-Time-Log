import { ItemView, WorkspaceLeaf } from "obsidian";
import { TimelineController } from "./components/TimelineController";
import { t } from "./i18n";
import type DailyWorkLogPlugin from "./main";

export const VIEW_TYPE_DAILY_WORK_LOG = "daily-work-log-view";

export class DailyWorkLogView extends ItemView {
	private readonly plugin: DailyWorkLogPlugin;
	private controller: TimelineController | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: DailyWorkLogPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_DAILY_WORK_LOG;
	}

	getDisplayText(): string {
		return t("viewTitle", this.plugin.getUiLanguage());
	}

	getIcon(): string {
		return "calendar-clock";
	}

	onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("dwl-view-container");
		this.controller = new TimelineController(this.plugin, container);
		return Promise.resolve();
	}

	refresh(): void {
		this.controller?.refresh();
	}

	onClose(): Promise<void> {
		this.controller?.destroy();
		this.controller = null;
		return Promise.resolve();
	}
}
