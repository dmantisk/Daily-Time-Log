/**
 * @vitest-environment happy-dom
 *
 * Regression tests for P2-3: command-palette "Add log entry" workflow
 * should refresh an already-open DailyWorkLogView after a successful write.
 *
 * Regression tests for P2-4: configurable commands should be registered/
 * unregistered immediately when their settings change, without requiring
 * a plugin reload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installObsidianDomHelpers } from "./test/obsidian-dom-mock";

installObsidianDomHelpers();

import { Notice } from "./test/obsidian-mock";
import { MarkdownView, TFile, Plugin, WorkspaceLeaf, ItemView } from "obsidian";
import DailyWorkLogPlugin from "./main";
import { DailyWorkLogView, VIEW_TYPE_DAILY_WORK_LOG } from "./view";
import { TimelineController } from "./components/TimelineController";
import { parseDateFromDailyNotePath } from "./dailyNote";
import { parseDailyNote } from "./parser";
import { appendLineToBlock } from "./parser";
import { buildTimelineLine, getDefaultEntryTimes } from "./timelineLogic";
import { DEFAULT_SETTINGS, migrateLoadedSettings, type DailyWorkLogSettings } from "./settings";

const DAILY_NOTE_CONTENT = "# Event\n- 09:00 - 10:00 [Work] Existing\n";

// Minimal PluginManifest for test
const TEST_MANIFEST = {
	id: "daily-time-log",
	name: "Daily Time Log",
	version: "1.0.0",
	minAppVersion: "1.0.0",
	description: "Test manifest",
	author: "Test",
	isDesktopOnly: false,
};

// Mock WorkspaceLeaf that wraps a view
class MockWorkspaceLeaf {
	view: any = null;
	viewType: string = "";
	containerEl: HTMLElement = document.createElement("div");

	constructor(view: DailyWorkLogView | null = null) {
		this.view = view;
		if (view) this.viewType = view.getViewType();
		// Make sure containerEl is connected by appending to body
		document.body.appendChild(this.containerEl);
	}

	setViewState(state: { type: string; active: boolean }): Promise<void> {
		this.viewType = state.type;
		return Promise.resolve();
	}
}

// Mock Workspace
class MockWorkspace {
	private leaves: MockWorkspaceLeaf[] = [];
	private activeFile: TFile | null = null;
	revealedLeaf: MockWorkspaceLeaf | null = null;

	setActiveFile(file: TFile | null) {
		this.activeFile = file;
	}

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	updateOptions(): void {}

	getLeavesOfType(type: string): MockWorkspaceLeaf[] {
		return this.leaves.filter((leaf) => leaf.viewType === type);
	}

	getRightLeaf(_split: boolean): MockWorkspaceLeaf | null {
		return new MockWorkspaceLeaf();
	}

	revealLeaf(leaf: MockWorkspaceLeaf): void {
		this.revealedLeaf = leaf;
	}

	addLeaf(leaf: MockWorkspaceLeaf) {
		this.leaves.push(leaf);
	}

	on(_event: string, _callback: (...args: any[]) => void): { off: () => void } {
		return { off: () => {} };
	}
}

// Mock Vault
class MockVault {
	private files = new Map<string, TFile>();
	private content = "";

	constructor(initialContent: string) {
		this.content = initialContent;
	}

	setContent(content: string) {
		this.content = content;
	}

	getContent(): string {
		return this.content;
	}

	addFile(file: TFile) {
		this.files.set(file.path, file);
	}

	async read(file: TFile): Promise<string> {
		return this.content;
	}

	async cachedRead(file: TFile): Promise<string> {
		return this.content;
	}

	async process(file: TFile, fn: (content: string) => string): Promise<void> {
		this.content = fn(this.content);
	}

	getAbstractFileByPath(path: string): TFile | null {
		return this.files.get(path) ?? null;
	}

	on(_event: string, _callback: (...args: any[]) => void): { off: () => void } {
		return { off: () => {} };
	}
}

// Mock InternalPlugins
class MockInternalPlugins {
	private dailyNotesOptions: { folder?: string; format?: string } = {};

	setDailyNotesOptions(options: { folder?: string; format?: string }) {
		this.dailyNotesOptions = options;
	}

	getPluginById(id: string) {
		if (id === "daily-notes") {
			return {
				instance: {
					options: this.dailyNotesOptions,
				},
			};
		}
		return null;
	}
}

// Test fixture that provides a complete plugin environment
interface TestFixture {
	plugin: DailyWorkLogPlugin;
	workspace: MockWorkspace;
	vault: MockVault;
	internalPlugins: MockInternalPlugins;
	activeFile: TFile;
	view: DailyWorkLogView;
	viewLeaf: MockWorkspaceLeaf;
	viewContainer: HTMLDivElement;
	commands: Array<{ id: string; name: string; callback: () => void }>;
	getContent: () => string;
	setContent: (content: string) => void;
	setActiveFile: (file: TFile | null) => void;
}

function createFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split("/").pop() ?? path;
	file.basename = file.name.replace(/\.md$/i, "");
	file.extension = "md";
	return file;
}

async function createTestFixture(
	initialContent = DAILY_NOTE_CONTENT,
	initialPath = "2026-10-16.md",
	dateFormat = "YYYY-MM-DD",
	dailyNoteFolder = ""
): Promise<TestFixture> {
	const activeFile = createFile(initialPath);
	let content = initialContent;
	const files = new Map<string, TFile>([[activeFile.path, activeFile]]);

	const commands: Array<{ id: string; name: string; callback: () => void }> = [];

	const workspace = new MockWorkspace();
	const vault = new MockVault(content);
	const internalPlugins = new MockInternalPlugins();

	internalPlugins.setDailyNotesOptions({
		folder: dailyNoteFolder || undefined,
		format: dateFormat || undefined,
	});

	vault.addFile(activeFile);
	workspace.setActiveFile(activeFile);

	// Create a mock app object
	const mockApp = {
		workspace,
		vault: {
			read: vault.read.bind(vault),
			cachedRead: vault.cachedRead.bind(vault),
			process: async (file: TFile, fn: (content: string) => string) => {
				console.log("Mock vault process called");
				await vault.process(file, fn);
			},
			on: vault.on.bind(vault),
			getAbstractFileByPath: vault.getAbstractFileByPath.bind(vault),
		},
		internalPlugins,
	};

	// Create plugin with proper settings
	const loadedSettings = migrateLoadedSettings(null);
	const settings = loadedSettings.settings;

	// Create plugin instance
	const plugin = new DailyWorkLogPlugin(mockApp as any, TEST_MANIFEST as any);
	plugin.settings = settings;

	// Override methods to use our mocks
	plugin.getDailyNoteFolder = () => dailyNoteFolder;
	plugin.getDailyNoteFormat = () => dateFormat;
	plugin.getEventHeadingConfig = () => ({ text: "Event", level: 1 });
	plugin.getUiLanguage = () => "en";

	// Capture commands
	const originalAddCommand = plugin.addCommand.bind(plugin);
	plugin.addCommand = (command: any) => {
		commands.push({
			id: command.id,
			name: command.name,
			callback: command.callback,
		});
		return originalAddCommand(command);
	};

	const originalRemoveCommand = plugin.removeCommand.bind(plugin);
	plugin.removeCommand = (commandId: string) => {
		const index = commands.findIndex((c) => c.id === commandId);
		if (index !== -1) {
			commands.splice(index, 1);
		}
		return originalRemoveCommand(commandId);
	};

	// Call onload to register commands
	await plugin.onload();

	// Create view container and view
	const viewContainer = document.createElement("div");
	viewContainer.id = "test-view-container";
	document.body.appendChild(viewContainer);

	const viewLeaf = new MockWorkspaceLeaf();
	const view = new DailyWorkLogView(viewLeaf as any, plugin);
	viewLeaf.view = view;
	viewLeaf.viewType = VIEW_TYPE_DAILY_WORK_LOG;
	workspace.addLeaf(viewLeaf);

	// Ensure the view's containerEl is connected (it's created by ItemView base class)
	// The view's containerEl needs to be in the document for isConnected to be true
	document.body.appendChild(view.containerEl);

	// Verify containerEl is connected
	console.log("view.containerEl.isConnected:", view.containerEl.isConnected);
	console.log("viewLeaf.view:", viewLeaf.view);
	console.log("viewLeaf.viewType:", viewLeaf.viewType);

	// Test getLeavesOfType
	const leaves = workspace.getLeavesOfType(VIEW_TYPE_DAILY_WORK_LOG);
	console.log("getLeavesOfType result:", leaves.length);
	if (leaves.length > 0) {
		console.log("leaf.view:", leaves[0].view);
		console.log("leaf.view.containerEl:", leaves[0].view?.containerEl);
		console.log("leaf.view.containerEl.isConnected:", leaves[0].view?.containerEl?.isConnected);
	}

	// Open the view to initialize the controller
	await view.onOpen();

	// Test getLeavesOfType again after onOpen
	const leaves2 = workspace.getLeavesOfType(VIEW_TYPE_DAILY_WORK_LOG);
	console.log("getLeavesOfType after onOpen:", leaves2.length);
	if (leaves2.length > 0) {
		console.log("leaf.view:", leaves2[0].view);
		console.log("leaf.view.containerEl:", leaves2[0].view?.containerEl);
		console.log("leaf.view.containerEl.isConnected:", leaves2[0].view?.containerEl?.isConnected);
	}

	return {
		plugin,
		workspace,
		vault,
		internalPlugins,
		activeFile,
		view,
		viewLeaf,
		viewContainer,
		commands,
		getContent: () => vault.getContent(),
		setContent: (newContent: string) => {
			vault.setContent(newContent);
		},
		setActiveFile: (file: TFile | null) => {
			workspace.setActiveFile(file);
			if (file) files.set(file.path, file);
		},
	};
}

// Mock TimelineModal
const saveCallbackHolder = { current: null as ((values: any) => void) | null };

vi.mock("./modals/TimelineModal", () => {
	class MockTimelineModal {
		constructor(
			_app: any,
			_language: string,
			_categories: any[],
			_initial: any,
			_defaultStart: string,
			_defaultEnd: string,
			onSave: (values: any) => void,
			_onDelete: any
		) {
			saveCallbackHolder.current = onSave;
		}
		open(): void {}
	}
	return { TimelineModal: MockTimelineModal };
});

describe("focusEditorAtPosition", () => {
	let fixture: TestFixture;

	beforeEach(async () => {
		fixture = await createTestFixture();
	});

	afterEach(() => {
		if (fixture?.view) fixture.view.onClose();
		if (fixture?.viewContainer) fixture.viewContainer.remove();
	});

	it("reveals the matching note and focuses the editor at a clamped position", async () => {
		const markdownView = new MarkdownView();
		markdownView.file = fixture.activeFile;
		markdownView.state = { mode: "preview", source: false };
		markdownView.lines = ["# Event", "- 09:00 - 10:00 [Work] Task"];
		const leaf = new MockWorkspaceLeaf(markdownView as never);
		leaf.viewType = "markdown";
		fixture.workspace.addLeaf(leaf);
		fixture.plugin.settings.focusEditorAfterSave = true;

		await fixture.plugin.focusEditorAtPosition(fixture.activeFile, { line: 1, ch: 999 });

		expect(fixture.workspace.revealedLeaf).toBe(leaf);
		expect(markdownView.getMode()).toBe("source");
		expect(markdownView.cursor).toEqual({ line: 1, ch: markdownView.lines[1].length });
		expect(markdownView.focused).toBe(true);
	});

	it("waits for the Markdown editor buffer to receive the vault write before placing the cursor", async () => {
		const markdownView = new MarkdownView();
		markdownView.file = fixture.activeFile;
		markdownView.lines = ["# Event", "- 09:00 - 10:00 [Work] Existing", "### Notes"];
		const leaf = new MockWorkspaceLeaf(markdownView as never);
		leaf.viewType = "markdown";
		fixture.workspace.addLeaf(leaf);
		fixture.plugin.settings.focusEditorAfterSave = true;

		const updatedContent =
			"# Event\n- 09:00 - 10:00 [Work] Existing\n- 10:00 - 11:00 [Work] New entry\n### Notes";
		const focusPromise = fixture.plugin.focusEditorAtPosition(
			fixture.activeFile,
			{ line: 2, ch: "- 10:00 - 11:00 [Work] New entry".length },
			updatedContent
		);

		// Simulate Obsidian applying the vault modify event after the write call.
		window.setTimeout(() => {
			markdownView.lines = updatedContent.split("\n");
		}, 24);
		await focusPromise;

		expect(markdownView.cursor).toEqual({ line: 2, ch: "- 10:00 - 11:00 [Work] New entry".length });
		expect(markdownView.focused).toBe(true);
	});

	it("does not reveal or focus an editor when the preference is disabled", async () => {
		const markdownView = new MarkdownView();
		markdownView.file = fixture.activeFile;
		const leaf = new MockWorkspaceLeaf(markdownView as never);
		leaf.viewType = "markdown";
		fixture.workspace.addLeaf(leaf);

		await fixture.plugin.focusEditorAtPosition(fixture.activeFile, { line: 0, ch: 0 });

		expect(fixture.workspace.revealedLeaf).toBeNull();
		expect(markdownView.cursor).toBeNull();
		expect(markdownView.focused).toBe(false);
	});
});

describe("P2-3: Add log entry command refreshes open DailyWorkLogView", () => {
	let fixture: TestFixture;
	let refreshSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		Notice.reset();
		saveCallbackHolder.current = null;
		fixture = await createTestFixture();

		// Spy on the view's refresh method
		refreshSpy = vi.spyOn(fixture.view, "refresh");
	});

	afterEach(() => {
		if (refreshSpy) {
			refreshSpy.mockRestore();
		}
		if (fixture?.view) {
			fixture.view.onClose();
		}
		if (fixture?.viewContainer) {
			fixture.viewContainer.remove();
		}
	});

	it("addLogEntry writes event successfully when DailyWorkLogView is open", async () => {
		// Find the add-log-entry command
		const addLogEntryCmd = fixture.commands.find((c) => c.id === "add-log-entry");
		expect(addLogEntryCmd).toBeDefined();

		console.log("Calling addLogEntry command callback...");
		// Call the command callback
		await addLogEntryCmd!.callback();

		// Wait for the async import to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		console.log("saveCallbackHolder.current:", saveCallbackHolder.current);
		// Simulate user saving the modal
		expect(saveCallbackHolder.current).not.toBeNull();
		await saveCallbackHolder.current!({
			start: "10:00",
			end: "11:00",
			category: "Work",
			description: "New task",
		});

		// Verify the event was written
		const fileContent = fixture.getContent();
		console.log("File content after save:", fileContent);
		expect(fileContent).toContain("10:00 - 11:00 [Work] New task");
	});

	it("addLogEntry refreshes open DailyWorkLogView after successful write", async () => {
		// Find the add-log-entry command
		const addLogEntryCmd = fixture.commands.find((c) => c.id === "add-log-entry");
		expect(addLogEntryCmd).toBeDefined();

		// Call the command callback
		await addLogEntryCmd!.callback();

		// Wait for the async import to complete
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Simulate user saving the modal
		expect(saveCallbackHolder.current).not.toBeNull();
		await saveCallbackHolder.current!({
			start: "10:00",
			end: "11:00",
			category: "Work",
			description: "New task",
		});

		// Wait a bit more for the async processWrite to complete
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Verify the view was refreshed
		console.log("refreshSpy call count:", refreshSpy.mock.calls.length);

		// Debug: check what leaves the plugin sees
		const leaves = fixture.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_WORK_LOG);
		console.log("Leaves found by plugin:", leaves.length);
		if (leaves.length > 0) {
			console.log("Leaf view:", leaves[0].view);
			console.log("Leaf view instanceof DailyWorkLogView:", leaves[0].view instanceof DailyWorkLogView);
			console.log("Leaf view.containerEl:", leaves[0].view?.containerEl);
			console.log("Leaf view.containerEl.isConnected:", leaves[0].view?.containerEl?.isConnected);
		}

		expect(refreshSpy).toHaveBeenCalledTimes(1);
	});

	it("addLogEntry does not refresh on failed write", async () => {
		// Find the add-log-entry command
		const addLogEntryCmd = fixture.commands.find((c) => c.id === "add-log-entry");
		expect(addLogEntryCmd).toBeDefined();

		// Make processWrite fail
		const originalProcessWrite = fixture.plugin.processWrite.bind(fixture.plugin);
		fixture.plugin.processWrite = async () => {
			throw new Error("Write failed");
		};

		// Call the command callback
		await addLogEntryCmd!.callback();

		// Wait for the async import to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Simulate user saving the modal
		expect(saveCallbackHolder.current).not.toBeNull();
		await saveCallbackHolder.current!({
			start: "10:00",
			end: "11:00",
			category: "Work",
			description: "New task",
		});

		// Verify the view was NOT refreshed on failure
		expect(refreshSpy).not.toHaveBeenCalled();

		// Verify error notice was shown
		expect(
			Notice.shown.some(
				(n) => n.includes("Save event failed") || n.includes("noticeSaveEventFailed") || n.includes("failed")
			)
		).toBe(true);

		// Restore
		fixture.plugin.processWrite = originalProcessWrite;
	});
});

describe("P2-4: Configurable commands register/unregister on settings change", () => {
	let fixture: TestFixture;

	beforeEach(async () => {
		Notice.reset();
		saveCallbackHolder.current = null;
		fixture = await createTestFixture();
	});

	afterEach(() => {
		if (fixture?.view) {
			fixture.view.onClose();
		}
		if (fixture?.viewContainer) {
			fixture.viewContainer.remove();
		}
	});

	/**
	 * Helper to find a command by ID in the captured commands array.
	 */
	function findCommand(id: string) {
		return fixture.commands.find((c) => c.id === id);
	}

	/**
	 * Helper to check if a command is currently registered.
	 * We check the plugin's internal command registry via the mock.
	 */
	function isCommandRegistered(id: string): boolean {
		return findCommand(id) !== undefined;
	}

	it("initial registration: commands enabled in settings are registered on plugin load", () => {
		// All three commands should be registered by default (DEFAULT_SETTINGS has all enabled)
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);
	});

	it("disable commands: turning a setting OFF unregisters the command immediately", async () => {
		// Verify all commands are initially registered
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		// Disable open-sidebar
		fixture.plugin.settings.commandOpenSidebarEnabled = false;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();

		expect(isCommandRegistered("open-sidebar")).toBe(false);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		// Disable open-dashboard
		fixture.plugin.settings.commandOpenDashboardEnabled = false;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();

		expect(isCommandRegistered("open-sidebar")).toBe(false);
		expect(isCommandRegistered("open-dashboard")).toBe(false);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		// Disable add-log-entry
		fixture.plugin.settings.commandAddLogEntryEnabled = false;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();

		expect(isCommandRegistered("open-sidebar")).toBe(false);
		expect(isCommandRegistered("open-dashboard")).toBe(false);
		expect(isCommandRegistered("add-log-entry")).toBe(false);
	});

	it("enable commands: turning a setting ON registers the command immediately", async () => {
		// Start with all disabled
		fixture.plugin.settings.commandOpenSidebarEnabled = false;
		fixture.plugin.settings.commandOpenDashboardEnabled = false;
		fixture.plugin.settings.commandAddLogEntryEnabled = false;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();

		expect(isCommandRegistered("open-sidebar")).toBe(false);
		expect(isCommandRegistered("open-dashboard")).toBe(false);
		expect(isCommandRegistered("add-log-entry")).toBe(false);

		// Enable open-sidebar
		fixture.plugin.settings.commandOpenSidebarEnabled = true;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();

		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(false);
		expect(isCommandRegistered("add-log-entry")).toBe(false);

		// Enable open-dashboard
		fixture.plugin.settings.commandOpenDashboardEnabled = true;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();

		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(false);

		// Enable add-log-entry
		fixture.plugin.settings.commandAddLogEntryEnabled = true;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();

		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);
	});

	it("independence: changing one command setting does not affect the other two", async () => {
		// All enabled initially
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		// Toggle open-sidebar off and on multiple times
		fixture.plugin.settings.commandOpenSidebarEnabled = false;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();
		expect(isCommandRegistered("open-sidebar")).toBe(false);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		fixture.plugin.settings.commandOpenSidebarEnabled = true;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		// Toggle open-dashboard off and on
		fixture.plugin.settings.commandOpenDashboardEnabled = false;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(false);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		fixture.plugin.settings.commandOpenDashboardEnabled = true;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);

		// Toggle add-log-entry off and on
		fixture.plugin.settings.commandAddLogEntryEnabled = false;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(false);

		fixture.plugin.settings.commandAddLogEntryEnabled = true;
		await fixture.plugin.saveSettings();
		fixture.plugin.refreshViews();
		expect(isCommandRegistered("open-sidebar")).toBe(true);
		expect(isCommandRegistered("open-dashboard")).toBe(true);
		expect(isCommandRegistered("add-log-entry")).toBe(true);
	});

	it("repeated changes: toggling repeatedly produces no duplicate registrations and safe removal", async () => {
		// Toggle each command 5 times
		for (let i = 0; i < 5; i++) {
			// Toggle open-sidebar
			fixture.plugin.settings.commandOpenSidebarEnabled = false;
			await fixture.plugin.saveSettings();
			fixture.plugin.refreshViews();
			expect(isCommandRegistered("open-sidebar")).toBe(false);

			fixture.plugin.settings.commandOpenSidebarEnabled = true;
			await fixture.plugin.saveSettings();
			fixture.plugin.refreshViews();
			expect(isCommandRegistered("open-sidebar")).toBe(true);

			// Toggle open-dashboard
			fixture.plugin.settings.commandOpenDashboardEnabled = false;
			await fixture.plugin.saveSettings();
			fixture.plugin.refreshViews();
			expect(isCommandRegistered("open-dashboard")).toBe(false);

			fixture.plugin.settings.commandOpenDashboardEnabled = true;
			await fixture.plugin.saveSettings();
			fixture.plugin.refreshViews();
			expect(isCommandRegistered("open-dashboard")).toBe(true);

			// Toggle add-log-entry
			fixture.plugin.settings.commandAddLogEntryEnabled = false;
			await fixture.plugin.saveSettings();
			fixture.plugin.refreshViews();
			expect(isCommandRegistered("add-log-entry")).toBe(false);

			fixture.plugin.settings.commandAddLogEntryEnabled = true;
			await fixture.plugin.saveSettings();
			fixture.plugin.refreshViews();
			expect(isCommandRegistered("add-log-entry")).toBe(true);
		}

		// Verify no duplicate commands (each ID appears exactly once)
		const openSidebarCount = fixture.commands.filter((c) => c.id === "open-sidebar").length;
		const openDashboardCount = fixture.commands.filter((c) => c.id === "open-dashboard").length;
		const addLogEntryCount = fixture.commands.filter((c) => c.id === "add-log-entry").length;

		expect(openSidebarCount).toBe(1);
		expect(openDashboardCount).toBe(1);
		expect(addLogEntryCount).toBe(1);
	});

	it("persistence: settings remain correctly saved after toggling", async () => {
		// Toggle all off
		fixture.plugin.settings.commandOpenSidebarEnabled = false;
		fixture.plugin.settings.commandOpenDashboardEnabled = false;
		fixture.plugin.settings.commandAddLogEntryEnabled = false;
		await fixture.plugin.saveSettings();

		// Create a new plugin instance with the saved settings to verify persistence
		const loadedData = await fixture.plugin.loadData();
		const { settings: loadedSettings } = migrateLoadedSettings(loadedData);

		expect(loadedSettings.commandOpenSidebarEnabled).toBe(false);
		expect(loadedSettings.commandOpenDashboardEnabled).toBe(false);
		expect(loadedSettings.commandAddLogEntryEnabled).toBe(false);

		// Toggle all on
		fixture.plugin.settings.commandOpenSidebarEnabled = true;
		fixture.plugin.settings.commandOpenDashboardEnabled = true;
		fixture.plugin.settings.commandAddLogEntryEnabled = true;
		await fixture.plugin.saveSettings();

		const loadedData2 = await fixture.plugin.loadData();
		const { settings: loadedSettings2 } = migrateLoadedSettings(loadedData2);

		expect(loadedSettings2.commandOpenSidebarEnabled).toBe(true);
		expect(loadedSettings2.commandOpenDashboardEnabled).toBe(true);
		expect(loadedSettings2.commandAddLogEntryEnabled).toBe(true);
	});
});
