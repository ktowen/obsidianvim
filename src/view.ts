import type { ChildProcess } from "child_process";
import {
	FileSystemAdapter,
	ItemView,
	Modal,
	normalizePath,
	Platform,
	Scope,
	TFile,
	type App,
	type ViewStateResult,
	type WorkspaceLeaf,
} from "obsidian";
import { escapeText, matchesSpec, translateKey } from "./input/keys";
import { spawnNvim } from "./process";
import { RpcClient } from "./rpc";
import type { Settings } from "./settings";
import { Grid } from "./ui/grid";
import { parseGuifont, type FontSpec } from "./ui/metrics";
import { Renderer } from "./ui/renderer";

export const VIEW_TYPE = "obsidianvim";
const MIN_API_LEVEL = 12; // Nvim 0.10
const BUF_ENTER_EVENT = "obsidianvim_buf";

interface ApiInfo {
	version: { api_level: number; major: number; minor: number };
}

interface State {
	file?: string;
}

export class NvimView extends ItemView {
	/** Vault-relative path of the current Nvim buffer. */
	private file: string | undefined;
	private proc: ChildProcess | null = null;
	private rpc: RpcClient | null = null;
	/** Set after nvim_ui_attach. Before that, Nvim has not read its config. */
	private attached = false;
	/** Set when the plugin ends Nvim, so that the exit handler does not show the "exited" overlay. */
	private stopping = false;

	// One grid for the view life: after a restart, the first redraw resets size, colors and highlights.
	private grid = new Grid();
	private renderer!: Renderer;
	private canvas!: HTMLCanvasElement;
	private textarea!: HTMLTextAreaElement;
	private overlay!: HTMLElement;

	private keyScope: Scope;
	private scopePushed = false;
	private resizeTimer = 0;
	private wheelDelta = 0;
	private mouseButton: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private settings: Settings,
	) {
		super(leaf);
		this.navigation = true;
		// Obsidian handles hotkeys before DOM events reach the view, so only a pushed Scope gets them first.
		this.keyScope = new Scope(this.app.scope);
		this.keyScope.register(null, null, (e) => this.onKey(e));
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? `nvim: ${this.file.split("/").pop() ?? ""}` : "Neovim";
	}

	getIcon(): string {
		return "terminal-square";
	}

	getState(): Record<string, unknown> {
		return { file: this.file };
	}

	async setState(state: State, result: ViewStateResult): Promise<void> {
		if (state.file && state.file !== this.file) {
			this.file = state.file;
			if (this.attached) await this.edit(state.file);
		}
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		const el = this.contentEl;
		el.empty();
		el.addClass("obsidianvim-view");
		this.canvas = el.createEl("canvas", { cls: "obsidianvim-canvas" });
		this.textarea = el.createEl("textarea", {
			cls: "obsidianvim-input",
			attr: { autocapitalize: "off", autocomplete: "off", spellcheck: "false", "aria-label": "Neovim input" },
		});
		this.overlay = el.createDiv({ cls: "obsidianvim-overlay" });
		this.overlay.hide();
		this.renderer = new Renderer(this.canvas, this.grid, this.baseFont(), this.settings.lineHeight);
		this.wireGrid();
		this.wireKeyboard();
		this.wireMouse();
		this.addAction("file-text", "Back to Obsidian editor", () => void this.quit());
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf === this.leaf) this.focus();
			}),
		);
		const observer = new ResizeObserver(() => {
			this.scheduleResize();
		});
		observer.observe(el);
		this.register(() => {
			observer.disconnect();
			window.clearTimeout(this.resizeTimer);
		});

		await this.start();
	}

	async onClose(): Promise<void> {
		this.popScope();
		this.renderer.dispose();
		await this.stop();
	}

	/** Like :q, but asks about unsaved buffers first. */
	async quit(): Promise<void> {
		await this.stop();
		await this.showInObsidian();
	}

	checktime(): void {
		this.rpc?.notify("nvim_command", ["silent! checktime"]);
	}

	focus(): void {
		this.textarea.focus({ preventScroll: true });
	}

	// Process

	private async start(): Promise<void> {
		this.overlay.hide();
		this.stopping = false;
		this.attached = false;

		const proc = spawnNvim({
			nvimPath: this.settings.nvimPath,
			loginShell: this.settings.loginShell,
			appName: this.settings.appName,
			cwd: this.vaultPath(),
		});
		this.proc = proc;
		this.watchProcess(proc);

		const rpc = new RpcClient(proc.stdout!, proc.stdin!);
		this.rpc = rpc;
		rpc.onNotification((method, params) => {
			if (method === "redraw") this.grid.applyRedraw(params);
			else if (method === BUF_ENTER_EVENT && typeof params[0] === "string") this.onBufEnter(params[0]);
		});

		try {
			await this.attach(rpc);
			if (this.file) await this.edit(this.file);
			this.focus();
		} catch (e) {
			if (!this.stopping) this.showError(errorMessage(e));
			proc.kill();
		}
	}

	private watchProcess(proc: ChildProcess): void {
		const stderr: string[] = [];
		proc.stderr?.on("data", (d: Buffer) => {
			stderr.push(d.toString());
			console.warn("obsidianvim: nvim stderr:", d.toString());
		});
		proc.on("error", (e) => {
			this.showError(`Cannot start Neovim: ${e.message}. Check "Neovim path" in the settings.`);
		});
		proc.on("exit", (code, signal) => {
			this.rpc?.close();
			this.rpc = null;
			this.proc = null;
			this.attached = false;
			if (this.stopping) return;
			if (code === 0) void this.showInObsidian();
			else this.showError(`Neovim exited (code ${code ?? signal ?? "?"}). ${stderr.join("").slice(-500)}`);
		});
	}

	private async attach(rpc: RpcClient): Promise<void> {
		const [channel, info] = await rpc.request<[number, ApiInfo]>("nvim_get_api_info");
		const { api_level, major, minor } = info.version;
		if (api_level < MIN_API_LEVEL) throw new Error(`Neovim ${major}.${minor} is too old. Use 0.10 or newer.`);

		const { cols, rows } = this.renderer.fit(this.contentEl.clientWidth, this.contentEl.clientHeight);
		await rpc.request("nvim_ui_attach", [cols, rows, { rgb: true, ext_linegrid: true }]);
		this.attached = true;
		await rpc.request("nvim_exec_lua", [
			`vim.api.nvim_create_autocmd("BufEnter", {
				group = vim.api.nvim_create_augroup("obsidianvim", {}),
				callback = function(ev)
					if vim.bo[ev.buf].buftype == "" then
						vim.rpcnotify(${channel}, "${BUF_ENTER_EVENT}", vim.api.nvim_buf_get_name(ev.buf))
					end
				end,
			})`,
			[],
		]);
	}

	/** Asks first if buffers have unsaved changes. */
	private async stop(): Promise<void> {
		const { rpc, proc } = this;
		if (!rpc || !proc) return;
		this.stopping = true;
		try {
			const modified = await withTimeout(
				rpc.request<{ name: string }[]>("nvim_call_function", ["getbufinfo", [{ bufmodified: 1 }]]),
				1000,
			);
			if (
				modified.length &&
				(await new UnsavedModal(
					this.app,
					modified.map((b) => b.name),
				).ask())
			) {
				await withTimeout(rpc.request("nvim_command", ["silent! wall"]), 3000);
			}
		} catch (e) {
			console.warn("obsidianvim: check for unsaved buffers failed", e);
		}
		rpc.close();
		proc.kill();
		this.rpc = null;
		this.proc = null;
	}

	/** Without a vault file, the tab closes. */
	private async showInObsidian(): Promise<void> {
		this.stopping = true;
		const file = this.file ? this.app.vault.getAbstractFileByPath(this.file) : null;
		if (file instanceof TFile) await this.leaf.openFile(file);
		else this.leaf.detach();
	}

	/** Follows :edit inside Nvim, so that the tab title, saved state and quit target stay correct. */
	private onBufEnter(absPath: string): void {
		const base = this.vaultPath();
		if (!base || !absPath.startsWith(base + "/")) return;
		const rel = normalizePath(absPath.slice(base.length + 1));
		if (rel === this.file) return;
		this.file = rel;
		// Not public API, but the built-in views use it to refresh the tab title.
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		this.app.workspace.requestSaveLayout();
	}

	private async edit(path: string): Promise<void> {
		// magic=false: do not expand %, # or | in the file name.
		await this.rpc?.request("nvim_cmd", [{ cmd: "edit", args: [path], magic: { file: false, bar: false } }, {}]);
	}

	private showError(message: string): void {
		this.overlay.empty();
		this.overlay.createEl("p", { text: message });
		this.overlay.createEl("button", { text: "Restart Neovim", cls: "mod-cta" }).onclick = () => void this.start();
		this.overlay.show();
	}

	private vaultPath(): string | undefined {
		const adapter = this.app.vault.adapter;
		return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
	}

	// Screen

	private baseFont(): FontSpec {
		return { family: this.settings.fontFamily, size: this.settings.fontSize };
	}

	private wireGrid(): void {
		this.grid.onFlush = () => {
			this.renderer.schedule();
			this.placeTextarea();
		};
		this.grid.onOption = (name, value) => {
			if (name !== "guifont" || typeof value !== "string") return;
			this.renderer.setFont(parseGuifont(value, this.baseFont()) ?? this.baseFont());
			this.scheduleResize();
		};
	}

	private scheduleResize(): void {
		window.clearTimeout(this.resizeTimer);
		this.resizeTimer = window.setTimeout(() => {
			if (!this.rpc) return;
			const { cols, rows } = this.renderer.fit(this.contentEl.clientWidth, this.contentEl.clientHeight);
			if (cols !== this.grid.cols || rows !== this.grid.rows) {
				// Nvim answers with grid_resize. A failure only means the old size stays.
				this.rpc.request("nvim_ui_try_resize", [cols, rows]).catch(() => undefined);
			} else {
				// Same grid, but the cell size or pixel ratio can be new.
				this.renderer.resizeCanvas();
				this.renderer.schedule();
			}
		}, 50);
	}

	/** The IME candidate window opens at the focused input, so keep it on the cursor. */
	private placeTextarea(): void {
		const { width, height } = this.renderer.cell;
		this.textarea.setCssStyles({
			left: `${this.grid.cursor.col * width}px`,
			top: `${this.grid.cursor.row * height}px`,
		});
	}

	// Keyboard

	private wireKeyboard(): void {
		const ta = this.textarea;
		this.registerDomEvent(ta, "focus", () => {
			this.setFocused(true);
		});
		this.registerDomEvent(ta, "blur", () => {
			this.setFocused(false);
		});
		// Printable text, dead keys and IME arrive here, not as keydown (see translateKey).
		this.registerDomEvent(ta, "input", (e) => {
			if (e instanceof InputEvent && !e.isComposing && e.data) this.input(escapeText(e.data));
			ta.value = "";
		});
		this.registerDomEvent(ta, "compositionend", (e) => {
			if (e.data) this.input(escapeText(e.data));
			ta.value = "";
		});
		// After the click, so that Obsidian does not move the focus back to the leaf.
		this.registerDomEvent(this.contentEl, "mousedown", () => {
			window.setTimeout(() => {
				this.focus();
			});
		});
	}

	private setFocused(focused: boolean): void {
		if (focused) this.pushScope();
		else this.popScope();
		this.rpc?.notify("nvim_ui_set_focus", [focused]);
		this.renderer.focused = focused;
		this.grid.dirty.add(this.grid.cursor.row);
		this.renderer.schedule();
	}

	private pushScope(): void {
		if (this.scopePushed) return;
		this.app.keymap.pushScope(this.keyScope);
		this.scopePushed = true;
	}

	private popScope(): void {
		if (!this.scopePushed) return;
		this.app.keymap.popScope(this.keyScope);
		this.scopePushed = false;
	}

	/** Returning `false` stops Obsidian and calls preventDefault. Returning `true` lets it continue. */
	private onKey(e: KeyboardEvent): boolean {
		if (this.settings.passthrough.some((spec) => matchesSpec(e, spec, Platform.isMacOS))) return true;
		if (e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "v") {
			void this.paste();
			return false;
		}
		const action = translateKey(e, { optionAsMeta: this.settings.optionAsMeta });
		// Let the browser type it into the textarea.
		if (action === "text") return true;
		if (action !== "ignore") this.input(action.send);
		return false;
	}

	private input(keys: string): void {
		this.rpc?.notify("nvim_input", [keys]);
	}

	private async paste(): Promise<void> {
		const text = await navigator.clipboard.readText();
		if (text) await this.rpc?.request("nvim_paste", [text, true, -1]);
	}

	// Mouse

	private wireMouse(): void {
		const canvas = this.canvas;
		const send = (button: string, action: string, e: MouseEvent) => {
			const r = canvas.getBoundingClientRect();
			const { width, height } = this.renderer.cell;
			const row = clamp(Math.floor((e.clientY - r.top) / height), 0, this.grid.rows - 1);
			const col = clamp(Math.floor((e.clientX - r.left) / width), 0, this.grid.cols - 1);
			this.rpc?.notify("nvim_input_mouse", [button, action, mouseModifiers(e), 0, row, col]);
		};

		this.registerDomEvent(canvas, "mousedown", (e) => {
			this.mouseButton = ["left", "middle", "right", "x1", "x2"][e.button] ?? "left";
			send(this.mouseButton, "press", e);
		});
		this.registerDomEvent(canvas, "mousemove", (e) => {
			if (this.mouseButton) send(this.mouseButton, "drag", e);
		});
		// On window, so that a drag that ends outside the canvas still releases.
		this.registerDomEvent(window, "mouseup", (e) => {
			if (!this.mouseButton) return;
			send(this.mouseButton, "release", e);
			this.mouseButton = null;
		});
		this.registerDomEvent(canvas, "contextmenu", (e) => {
			e.preventDefault();
		});
		this.registerDomEvent(
			canvas,
			"wheel",
			(e) => {
				e.preventDefault();
				// Trackpads send many small deltas. Send one scroll step per cell height.
				this.wheelDelta += e.deltaY;
				const step = this.renderer.cell.height;
				while (Math.abs(this.wheelDelta) >= step) {
					send("wheel", this.wheelDelta > 0 ? "down" : "up", e);
					this.wheelDelta -= Math.sign(this.wheelDelta) * step;
				}
			},
			{ passive: false },
		);
	}
}

class UnsavedModal extends Modal {
	private resolve: (save: boolean) => void = () => undefined;

	constructor(
		app: App,
		private names: string[],
	) {
		super(app);
	}

	/** Resolves to true for "Save all". */
	ask(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.titleEl.setText("Neovim has unsaved changes");
		const list = this.contentEl.createEl("ul");
		for (const name of this.names) list.createEl("li", { text: name || "[No Name]" });
		const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
		buttons.createEl("button", { text: "Save all", cls: "mod-cta" }).onclick = () => {
			this.choose(true);
		};
		buttons.createEl("button", { text: "Discard", cls: "mod-warning" }).onclick = () => {
			this.choose(false);
		};
	}

	onClose(): void {
		// Esc or the close button: save, so that no change is lost.
		this.resolve(true);
	}

	private choose(save: boolean): void {
		this.resolve(save);
		this.resolve = () => undefined;
		this.close();
	}
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((_, reject) => {
			window.setTimeout(() => {
				reject(new Error("timeout"));
			}, ms);
		}),
	]);
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}

function mouseModifiers(e: MouseEvent): string {
	return (e.ctrlKey ? "C" : "") + (e.altKey ? "A" : "") + (e.shiftKey ? "S" : "") + (e.metaKey ? "D" : "");
}
