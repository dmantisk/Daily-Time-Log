import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * The `obsidian` npm package is TYPES-ONLY — its package.json declares
 * `"main": ""` and ships nothing but `.d.ts` files. Anything that imports
 * `obsidian` at runtime therefore fails to resolve under Vitest
 * ("Failed to resolve entry for package 'obsidian'"), which is why the
 * Obsidian-free modules (parser.ts, dailyNote.ts, dashboardCollector.ts,
 * settings.ts) are the only ones that are unit-tested today.
 *
 * This alias points `obsidian` at a minimal local stub so DOM-dependent
 * modules (categoryBadges.ts and, later, view/setting code) can be
 * imported by tests. The stub only has to provide the runtime values the
 * module actually touches — types still come from the real package.
 */
export default defineConfig({
	test: {
		// Default to a plain Node environment (fast, no DOM). Test files that
		// need a DOM opt in with a `@vitest-environment happy-dom` docblock.
		environment: "node",
		alias: {
			obsidian: path.resolve(import.meta.dirname, "src/test/obsidian-mock.ts"),
		},
	},
});
