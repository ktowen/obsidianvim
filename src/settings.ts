import { PluginSettingTab, Setting, type App } from "obsidian";
import type ObsidianVimPlugin from "./main";

export interface Settings {
	nvimPath: string;
	loginShell: boolean;
	appName: string;
	fontFamily: string;
	fontSize: number;
	lineHeight: number;
	optionAsMeta: boolean;
	/** Hotkey specs that Obsidian keeps while Neovim has focus. */
	passthrough: string[];
}

export const DEFAULT_SETTINGS: Settings = {
	nvimPath: "nvim",
	loginShell: true,
	appName: "",
	fontFamily: '"JetBrainsMono NFM", "Symbols Nerd Font Mono", Menlo, monospace',
	fontSize: 14,
	lineHeight: 1.2,
	optionAsMeta: false,
	// Mod+Shift+E is the toggle hotkey. Without it here, it does not work while Neovim has focus.
	passthrough: ["Mod+P", "Mod+Shift+E"],
};

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ObsidianVimPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const el = this.containerEl;
		el.empty();
		const s = this.plugin.settings;
		const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
			s[key] = value;
			void this.plugin.saveSettings();
		};
		const text = (name: string, desc: string, key: "nvimPath" | "appName" | "fontFamily", fallback = "") =>
			new Setting(el)
				.setName(name)
				.setDesc(desc)
				.addText((t) =>
					t.setValue(s[key]).onChange((v) => {
						set(key, v.trim() || fallback);
					}),
				);
		const toggle = (name: string, desc: string, key: "loginShell" | "optionAsMeta") =>
			new Setting(el)
				.setName(name)
				.setDesc(desc)
				.addToggle((t) =>
					t.setValue(s[key]).onChange((v) => {
						set(key, v);
					}),
				);
		const number = (name: string, key: "fontSize" | "lineHeight", min: number) =>
			new Setting(el).setName(name).addText((t) =>
				t.setValue(String(s[key])).onChange((v) => {
					const n = Number(v);
					if (n >= min) set(key, n);
				}),
			);

		text("Neovim path", "Command name or absolute path. Example: /opt/homebrew/bin/nvim", "nvimPath", "nvim");
		toggle(
			"Start through login shell",
			"Gives Neovim your shell PATH, so that LSP servers and other tools are found.",
			"loginShell",
		);
		text("NVIM_APPNAME", "Optional. Example: nvim-obsidian uses ~/.config/nvim-obsidian.", "appName");
		text(
			"Font family",
			"CSS font-family. Use a Nerd Font for icons. Neovim 'guifont' overrides it.",
			"fontFamily",
			DEFAULT_SETTINGS.fontFamily,
		);
		number("Font size", "fontSize", 1);
		number("Line height", "lineHeight", 1);
		toggle(
			"Option key as Meta",
			"On: Option+x sends <M-x>. Off: Option types special characters (needed for @ [ ] { } on Spanish layouts).",
			"optionAsMeta",
		);
		new Setting(el)
			.setName("Obsidian hotkeys to keep")
			.setDesc("One per line, for example Mod+P. Mod is Cmd on macOS. All other keys go to Neovim.")
			.addTextArea((t) =>
				t.setValue(s.passthrough.join("\n")).onChange((v) => {
					const specs = v.split("\n").map((x) => x.trim());
					set("passthrough", specs.filter(Boolean));
				}),
			);
		el.createEl("p", { text: "Changes apply to Neovim tabs that you open after the change." });
	}
}
