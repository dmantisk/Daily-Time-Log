/**
 * @vitest-environment happy-dom
 *
 * Regression tests for P2-3: command-palette "Add log entry" workflow
 * should refresh an already-open DailyWorkLogView after a successful write.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installObsidianDomHelpers } from "./test/obsidian-dom-mock";

installObsidianDomHelpers();

import { Notice } from "./test/obsidian-mock";
import { TFile, Plugin, WorkspaceLeaf, ItemView } from "obsidian";
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
	view: DailyWorkLogView | null = null;
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

	setActiveFile(file: TFile | null) {
		this.activeFile = file;
	}

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	getLeavesOfType(type: string): MockWorkspaceLeaf[] {
		return this.leaves.filter((leaf) => leaf.viewType === type);
	}

	getRightLeaf(_split: boolean): MockWorkspaceLeaf | null {
		return new MockWorkspaceLeaf();
	}

	revealLeaf(_leaf: MockWorkspaceLeaf): void {}

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
