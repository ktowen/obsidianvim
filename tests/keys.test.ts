import { describe, expect, test } from "vitest";
import { escapeText, matchesSpec, translateKey, type KeyLike } from "../src/input/keys";

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({
	key,
	code: "",
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	metaKey: false,
	isComposing: false,
	...mods,
});
const opts = { optionAsMeta: false };

describe("translateKey", () => {
	test.each([
		[k("Escape"), "<Esc>"],
		[k("Enter"), "<CR>"],
		[k("Backspace"), "<BS>"],
		[k("ArrowUp"), "<Up>"],
		[k("F5"), "<F5>"],
		[k("Tab", { shiftKey: true }), "<S-Tab>"],
		[k("Tab", { ctrlKey: true }), "<C-Tab>"],
		[k("ArrowLeft", { altKey: true }), "<M-Left>"],
		[k("w", { ctrlKey: true }), "<C-w>"],
		[k("V", { ctrlKey: true, shiftKey: true }), "<C-V>"],
		[k("p", { metaKey: true }), "<D-p>"],
		[k("<", { ctrlKey: true }), "<C-lt>"],
		[k("\\", { ctrlKey: true }), "<C-Bslash>"],
		[k(" ", { ctrlKey: true }), "<C-Space>"],
		[k("å", { altKey: true, code: "KeyA" }), "<M-a>"],
	])("%o -> %s", (e, want) => {
		const o = e.key === "å" ? { optionAsMeta: true } : opts;
		expect(translateKey(e, o)).toEqual({ send: want });
	});

	test("plain printable keys go through the textarea", () => {
		expect(translateKey(k("a"), opts)).toBe("text");
		expect(translateKey(k("<"), opts)).toBe("text");
		expect(translateKey(k("ñ"), opts)).toBe("text");
	});

	test("Option chars type text when optionAsMeta is false (Spanish @ is Option+2)", () => {
		expect(translateKey(k("@", { altKey: true, code: "Digit2" }), opts)).toBe("text");
	});

	test("dead keys and composition go through the textarea", () => {
		expect(translateKey(k("Dead"), opts)).toBe("text");
		expect(translateKey(k("Enter", { isComposing: true }), opts)).toBe("text");
	});

	test("modifier keys alone are ignored", () => {
		expect(translateKey(k("Meta", { metaKey: true }), opts)).toBe("ignore");
		expect(translateKey(k("Shift", { shiftKey: true }), opts)).toBe("ignore");
	});
});

test("escapeText", () => {
	expect(escapeText("a<b>")).toBe("a<LT>b>");
});

test("matchesSpec", () => {
	expect(matchesSpec(k("p", { metaKey: true }), "Mod+P", true)).toBe(true);
	expect(matchesSpec(k("p", { ctrlKey: true }), "Mod+P", false)).toBe(true);
	expect(matchesSpec(k("p", { metaKey: true, shiftKey: true }), "Mod+P", true)).toBe(false);
	expect(matchesSpec(k(",", { metaKey: true }), "Mod+,", true)).toBe(true);
});
