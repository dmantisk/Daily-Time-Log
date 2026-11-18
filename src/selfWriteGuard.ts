/**
 * SelfWriteGuard tracks a single "self-triggered" write so that the plugin
 * can distinguish its own vault.process() writes from external modifications.
 * It is intentionally pure (no Obsidian imports) and independently testable.
 */
export class SelfWriteGuard {
	private lastWrite: { path: string; content: string } | null = null;

	/**
	 * Records a write only when the written content differs from the original.
	 * If they are equal, the guard remains unchanged (no self-write recorded).
	 */
	record(path: string, original: string, written: string): void {
		if (written !== original) {
			this.lastWrite = { path, content: written };
		}
	}

	/** Returns true if the guard currently holds a recorded write for the given path. */
	hasPath(path: string): boolean {
		return this.lastWrite !== null && this.lastWrite.path === path;
	}

	/**
	 * Consumes the guard if the path matches and the current file content
	 * equals the recorded content. On success the guard is cleared and true
	 * is returned. On mismatch the guard is left intact and false is returned.
	 */
	consume(path: string, currentContent: string): boolean {
		if (!this.hasPath(path)) {
			return false;
		}
		const recorded = this.lastWrite;
		if (recorded && currentContent === recorded.content) {
			this.lastWrite = null;
			return true;
		}
		return false;
	}
}
