import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { TimelineView } from "./components/TimelineView";
import { t } from "./i18n";
import type DailyWorkLogPlugin from "./main";

export const VIEW_TYPE_DAILY_WORK_LOG = "daily-work-log-view";

export class DailyWorkLogView extends ItemView {
	private readonly plugin: DailyWorkLogPlugin;
	private root: Root | null = null;
	/** Bumped on every refresh() call and passed down as a prop — see TimelineView's refreshToken doc. */
	private refreshToken = 0;

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
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("dwl-view-container");
		this.root = createRoot(container);
		this.paint();
		return Promise.resolve();
	}

	refresh(): void {
		this.refreshToken++;
		this.paint();
	}

	/** Renders the React tree. Safe to call repeatedly — React reconciles, it doesn't remount. */
	private paint(): void {
		if (!this.root) return;

		this.root.render(
			<React.StrictMode>
				<TimelineView plugin={this.plugin} refreshToken={this.refreshToken} />
			</React.StrictMode>
		);
	}

	onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		return Promise.resolve();
	}
}
