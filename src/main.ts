import { MarkdownView, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab, type Settings } from "./settings";
import { NvimView, VIEW_TYPE } from "./view";

const ICON = "terminal-square";
const HEADER_BUTTON_CLASS = "obsidianvim-action";

export default class ObsidianVimPlugin extends Plugin {
	settings: Settings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerView(VIEW_TYPE, (leaf) => new NvimView(leaf, this.settings));

		this.addCommand({
			id: "toggle",
			name: "Toggle Neovim for current file",
			// A toggle key that works without setup. Obsidian defaults do not use Mod+Shift+E.
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "E" }],
			checkCallback: (checking) => {
				const nvim = this.app.workspace.getActiveViewOfType(NvimView);
				const md = this.activeMarkdown();
				if (!nvim && !md) return false;
				if (!checking) {
					if (nvim) void nvim.quit();
					else if (md) void this.openInNvim(md.file, md.leaf);
				}
				return true;
			},
		});
		this.addCommand({
			id: "open-empty",
			name: "Open Neovim",
			callback: () => void this.openEmpty(),
		});

		this.addRibbonIcon(ICON, "Open current file in Neovim", () => {
			const md = this.activeMarkdown();
			void (md ? this.openInNvim(md.file, md.leaf) : this.openEmpty());
		});

		this.app.workspace.onLayoutReady(() => {
			this.addHeaderButtons();
		});
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.addHeaderButtons();
			}),
		);
		this.register(() => {
			document.querySelectorAll(`.${HEADER_BUTTON_CLASS}`).forEach((el) => {
				el.remove();
			});
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) return;
				menu.addItem((item) =>
					item
						.setTitle("Open in Neovim")
						.setIcon(ICON)
						.onClick(() => void this.openInNvim(file)),
				);
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", () => {
				for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
					if (leaf.view instanceof NvimView) leaf.view.checktime();
				}
			}),
		);
	}

	private activeMarkdown(): { file: TFile; leaf: WorkspaceLeaf } | null {
		const md = this.app.workspace.getActiveViewOfType(MarkdownView);
		return md?.file ? { file: md.file, leaf: md.leaf } : null;
	}

	private addHeaderButtons(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			if (view.containerEl.querySelector(`.${HEADER_BUTTON_CLASS}`)) continue;
			view.addAction(ICON, "Open in Neovim", () => {
				if (view.file) void this.openInNvim(view.file, view.leaf);
			}).addClass(HEADER_BUTTON_CLASS);
		}
	}

	/** `replace` is the Markdown tab of the file: Neovim takes it, so the note is not open in two editors. */
	private async openInNvim(file: TFile, replace?: WorkspaceLeaf): Promise<void> {
		const leaf = replace ?? this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { file: file.path } });
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private async openEmpty(): Promise<void> {
		await this.app.workspace.getLeaf("tab").setViewState({ type: VIEW_TYPE, active: true });
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<Settings> & { appName?: string };
		// 0.0.1 had an NVIM_APPNAME setting.
		if (data.appName && !data.extraArgs) data.extraArgs = `NVIM_APPNAME=${data.appName}`;
		delete data.appName;
		this.settings = { ...DEFAULT_SETTINGS, ...data };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
