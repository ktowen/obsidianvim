import { spawn, type ChildProcess } from "child_process";
import { parseExtraArgs } from "./args";

export interface SpawnOptions {
	nvimPath: string;
	/** Obsidian started from the Dock has PATH=/usr/bin:/bin:/usr/sbin:/sbin, so nvim would not find LSP servers. */
	loginShell: boolean;
	/** See parseExtraArgs. Throws on a parse error. */
	extraArgs: string;
	cwd?: string;
}

export function spawnNvim(o: SpawnOptions): ChildProcess {
	const extra = parseExtraArgs(o.extraArgs);
	const args = [
		"--embed",
		// Like g:vscode in vscode-neovim: lets the user config detect Obsidian.
		"--cmd",
		"let g:obsidianvim = 1",
		"--cmd",
		"let g:obsidianvim_vault = $OBSIDIANVIM_VAULT",
		"--cmd",
		"set autoread",
		// Last, so that user --cmd lines can override ours.
		...extra.args,
	];
	const env = { ...process.env, OBSIDIANVIM_VAULT: o.cwd ?? "", ...extra.env };

	if (o.loginShell && process.platform !== "win32") {
		const shell = process.env.SHELL ?? "/bin/zsh";
		const cmd = ["exec", ...[o.nvimPath, ...args].map(shellQuote)].join(" ");
		return spawn(shell, ["-l", "-c", cmd], { cwd: o.cwd, env });
	}
	return spawn(o.nvimPath, args, { cwd: o.cwd, env });
}

function shellQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}
