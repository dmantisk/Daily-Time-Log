import { describe, it, expect } from "vitest";
import { SelfWriteGuard } from "./selfWriteGuard";

describe("SelfWriteGuard", () => {
	it("an unchanged write records nothing", () => {
		const guard = new SelfWriteGuard();
		guard.record("a.md", "same", "same");
		expect(guard.hasPath("a.md")).toBe(false);
	});

	it("a changed write records", () => {
		const guard = new SelfWriteGuard();
		guard.record("a.md", "original", "written");
		expect(guard.hasPath("a.md")).toBe(true);
	});

	it("consume returns true once and then false", () => {
		const guard = new SelfWriteGuard();
		guard.record("a.md", "original", "written");
		expect(guard.consume("a.md", "written")).toBe(true);
		expect(guard.consume("a.md", "written")).toBe(false);
		expect(guard.hasPath("a.md")).toBe(false);
	});

	it("consume for another path returns false and keeps the guard", () => {
		const guard = new SelfWriteGuard();
		guard.record("a.md", "original", "written");
		expect(guard.consume("b.md", "written")).toBe(false);
		expect(guard.hasPath("a.md")).toBe(true);
	});

	it("consume with different content returns false and keeps the guard", () => {
		const guard = new SelfWriteGuard();
		guard.record("a.md", "original", "written");
		expect(guard.consume("a.md", "different")).toBe(false);
		expect(guard.hasPath("a.md")).toBe(true);
	});

	it("a later record replaces an earlier one", () => {
		const guard = new SelfWriteGuard();
		guard.record("a.md", "original", "first");
		guard.record("a.md", "first", "second");
		expect(guard.consume("a.md", "second")).toBe(true);
		expect(guard.hasPath("a.md")).toBe(false);
	});
});
