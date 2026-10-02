# obsidianvim

Desktop-only Obsidian plugin. It opens notes in a real Neovim (your config, plugins, LSP) inside an Obsidian tab.

Neovim does all editing. The plugin is only a UI client, like Neovide or nvim-qt:

1. It starts `nvim --embed` as a child process.
2. It attaches as a UI with `nvim_ui_attach`.
3. It paints the screen that Neovim sends on a `<canvas>`.
4. It sends keys and mouse events back to Neovim.

Neovim reads and writes the file on disk. Obsidian sees the change in the file, as with any external editor.

Requirements: Obsidian desktop (macOS tested), Neovim 0.10 or newer. Mobile is not supported.

## Contents

- [Install](#install)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Limits and known issues](#limits-and-known-issues)
- [Manual test checklist](#manual-test-checklist)
- [License](#license)

## Install

The plugin is not in the community plugin list. Install it from source:

```sh
git clone <this repo> obsidianvim
cd obsidianvim
npm install
npm run build                                     # creates main.js
ln -s "$PWD" <vault>/.obsidian/plugins/obsidianvim
```

In Obsidian: Settings → Community plugins → turn off Restricted mode → enable "Neovim View".

Obsidian loads these files from the plugin folder: `manifest.json`, `main.js`, `styles.css`.

## Usage

### Open a note in Neovim

| Method                                          | Result                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `Cmd+Shift+E` in a Markdown tab                 | The same tab changes to Neovim with this note                                    |
| Header button (terminal icon) in a Markdown tab | Same as above                                                                    |
| Ribbon icon (left sidebar, terminal icon)       | Opens the active note in Neovim. If no note is active, opens an empty Neovim tab |
| File explorer → right-click → "Open in Neovim"  | Opens the file in a new Neovim tab                                               |
| Command palette → "Open Neovim"                 | Empty Neovim tab. The working directory is the vault root                        |

When Neovim takes the tab of the Markdown note, the note is not open in two editors at the same time.

### Return to the Obsidian editor

| Method                                  | Result                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `:q`, `:wq`, `:x`                       | The tab shows the last vault file in the Obsidian editor                             |
| `Cmd+Shift+E` in a Neovim tab           | Same. If buffers have unsaved changes, a dialog asks: Save all / Discard             |
| Header button "Back to Obsidian editor" | Same as `Cmd+Shift+E`                                                                |
| Close the tab (`x`)                     | Closes Neovim. The same dialog asks about unsaved changes. `Esc` in the dialog saves |

If you open another vault file inside Neovim (`:e other.md`), the tab title changes. On quit, the Obsidian editor shows that file.
An empty Neovim tab (no vault file) closes on quit.

To change the hotkey: Settings → Hotkeys → "Neovim View: Toggle Neovim for current file". Then also update "Obsidian hotkeys to keep" (see [Settings](#settings)).

### Commands

| Command                                     | Default hotkey |
| ------------------------------------------- | -------------- |
| Neovim View: Toggle Neovim for current file | `Cmd+Shift+E`  |
| Neovim View: Open Neovim                    | none           |

### Keyboard

- While Neovim has focus, it gets **all** keys, including `Cmd+W`, `Cmd+O`, `Ctrl+Tab` and `Esc`.
- Exceptions: the keys in "Obsidian hotkeys to keep". Default: `Mod+P` (command palette) and `Mod+Shift+E` (toggle). `Mod` is Cmd on macOS and Ctrl on other systems.
- `Cmd+<key>` goes to Neovim as `<D-key>`, so you can map it: `vim.keymap.set("n", "<D-s>", "<cmd>w<cr>")`.
- `Cmd+V` pastes the system clipboard with `nvim_paste`. Multi-line text is not auto-indented.
- Dead keys and IME work (`´` + `a` = `á`, Japanese/Chinese input).
- Option key: off by default, so that Option types characters (`@ [ ] { }` on Spanish layouts). Turn on "Option key as Meta" to send `<M-x>`.

### Mouse

Click, drag (visual select), right-click, wheel and trackpad scroll, with modifiers. Neovim must have `mouse` set (default `nvi`).

### Detect Obsidian in your Neovim config

The plugin sets these before Neovim reads `init.lua`, like `vim.g.vscode` in vscode-neovim:

| Name                      | Value               |
| ------------------------- | ------------------- |
| `vim.g.obsidianvim`       | `1`                 |
| `vim.g.obsidianvim_vault` | Absolute vault path |
| `$OBSIDIANVIM_VAULT`      | Absolute vault path |

```lua
if vim.g.obsidianvim then
  vim.opt.wrap = true
  vim.opt.linebreak = true
end

-- lazy.nvim: skip a plugin inside Obsidian
{ "some/plugin", cond = not vim.g.obsidianvim }
```

The plugin also sets `autoread`. When a vault file changes outside Neovim, the plugin runs `:checktime`, so Neovim reloads the file (if the buffer has no unsaved changes).

You can also use a separate config, or any other Neovim argument, with the "Extra arguments" setting (see [Extra arguments](#extra-arguments)).

### Settings

| Setting                   | Default                                                           | Notes                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Neovim path               | `nvim`                                                            | Command name or absolute path                                                                                                 |
| Start through login shell | on                                                                | Starts Neovim through `$SHELL -l -c`, so it gets your shell PATH (LSP, `rg`, `node`)                                          |
| Extra arguments           | empty                                                             | Neovim arguments and env vars. See [Extra arguments](#extra-arguments)                                                        |
| Font family               | `"JetBrainsMono NFM", "Symbols Nerd Font Mono", Menlo, monospace` | CSS `font-family`. Use a Nerd Font for icons. A `guifont` that you set in Neovim comes first, and this font stays as fallback |
| Font size                 | `14`                                                              | px                                                                                                                            |
| Line height               | `1.2`                                                             | Multiplier of the font height                                                                                                 |
| Option key as Meta        | off                                                               | See [Keyboard](#keyboard)                                                                                                     |
| Obsidian hotkeys to keep  | `Mod+P`, `Mod+Shift+E`                                            | One per line. Format: `Mod+Shift+X`, `Ctrl+Tab`, `Alt+X`, `Cmd+X`                                                             |

Settings apply to Neovim tabs that you open after the change. Obsidian saves them in `<vault>/.obsidian/plugins/obsidianvim/data.json`.

### Extra arguments

The text goes to Neovim after the plugin arguments (`--embed` and the `--cmd` lines). The plugin parses it like a shell command line:

- Spaces separate arguments. Use `'...'` or `"..."` for an argument with spaces. `\` escapes one character.
- `NAME=value` words **at the start** are environment variables, not arguments.
- `~/` at the start of a word changes to your home folder. There is no `$VAR` expansion and no globbing.
- Newlines count as spaces, so you can put one argument per line.

| Goal                                      | Extra arguments                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| Separate config `~/.config/nvim-obsidian` | `NVIM_APPNAME=nvim-obsidian`                                                    |
| Config file                               | `-u ~/.config/nvim/obsidian.lua`                                                |
| Add options                               | `--cmd "set wrap linebreak"`                                                    |
| Run Lua after startup                     | `-c "lua require('obsidian_setup')"`                                            |
| No config, no plugins                     | `--clean`                                                                       |
| All together                              | `NVIM_APPNAME=nvim-obsidian --cmd "set wrap" -c "lua vim.opt.conceallevel = 2"` |

Your `--cmd` lines run after the plugin ones, so you can change `autoread` (for example `--cmd "set noautoread"`).
Do not add `--embed`, `--headless`, `--listen` or file names: the plugin controls them.
If the text has an unclosed quote, the Neovim tab shows the error.

When the plugin loads, it moves the old "NVIM_APPNAME" setting to "Extra arguments" as `NVIM_APPNAME=<value>`.

## How it works

### Overview

```
┌──────────────────── Obsidian (Electron renderer) ─────────────────────┐
│ NvimView (ItemView, one per tab)                                      │
│                                                                       │
│   <textarea> (hidden, has focus) ── keys / IME ──┐                    │
│   <canvas>  ◄── Renderer ◄── Grid (screen model)  │                   │
│      │ mouse                       ▲              │                   │
│      └──────────────┐              │ redraw       ▼                   │
│                     ▼              │         RpcClient (msgpack-RPC)  │
└─────────────────────┼──────────────┼──────────────┼───────────────────┘
                      │ nvim_input_mouse      stdin │ ▲ stdout
                      ▼                             ▼ │
                  nvim --embed  (child process, cwd = vault root)
```

The plugin uses two APIs:

- **Obsidian plugin API.** `ItemView` gives a tab with a free DOM area. `Scope` / `Keymap` control hotkeys. `Plugin` gives commands, ribbon icons, the file menu and settings. On desktop, plugins can use Node (`child_process`).
- **Neovim UI protocol** (`:h ui`, `:h api`). msgpack-RPC on stdin/stdout. The client calls `nvim_ui_attach`. Then Neovim sends `redraw` notifications that describe what changed on the screen.

### Startup sequence

1. `src/process.ts` spawns Neovim:
    ```
    $SHELL -l -c "exec nvim --embed --cmd 'let g:obsidianvim = 1' \
                  --cmd 'let g:obsidianvim_vault = $OBSIDIANVIM_VAULT' --cmd 'set autoread'"
    ```
    Then come the "Extra arguments" (`src/args.ts` parses them). `cwd` is the vault root. `OBSIDIANVIM_VAULT` and the extra `NAME=value` variables are in the environment. Without the login-shell setting, the plugin runs `nvim` directly.
2. `--embed` makes Neovim wait. It does not read `init.lua` until a UI attaches. So `--cmd` variables are set before the config runs.
3. The view calls `nvim_get_api_info`. It refuses Neovim older than 0.10 (`api_level` < 12). The response also gives the RPC channel id.
4. The view measures the font cell size and calculates how many columns and rows fit in the tab.
5. It calls `nvim_ui_attach(cols, rows, { rgb = true, ext_linegrid = true })`. Now Neovim reads the config and sends the first `redraw`.
6. It adds a `BufEnter` autocmd (with `nvim_exec_lua`). The autocmd sends `rpcnotify(channel, "obsidianvim_buf", path)`, so the plugin knows the current file.
7. It opens the file with `nvim_cmd({ cmd = "edit", args = { path }, magic = { file = false, bar = false } })`. With `magic = false`, Neovim does not expand `%`, `#` or `|` in the file name.

### RPC client (`src/rpc.ts`)

A small msgpack-RPC client on `@msgpack/msgpack`. The plugin does not use the npm `neovim` package, because that package brings in a logger (`winston`) that the plugin does not need.

| Message      | Format                    | Use                                                                          |
| ------------ | ------------------------- | ---------------------------------------------------------------------------- |
| Request      | `[0, id, method, params]` | `request()` returns a Promise                                                |
| Response     | `[1, id, error, result]`  | Resolves or rejects the Promise                                              |
| Notification | `[2, method, params]`     | `notify()` sends. `onNotification()` receives `redraw` and `obsidianvim_buf` |

`decodeStream` reads the stdout stream, so messages split across chunks, and many messages in one chunk, are handled.
If Neovim sends a request to the plugin, the plugin answers with an error, so that Neovim does not block.
Hot-path calls (`nvim_input`, `nvim_input_mouse`) are notifications: they do not wait for a response.

### Screen model (`src/ui/grid.ts`)

Pure TypeScript, no DOM, so it is tested in Node. It keeps a copy of Neovim grid 1 (the full screen):

- `text[]`: the text of each cell. `""` is the right half of a double-width character.
- `hl[]`: the highlight id of each cell.
- `hlTable`: highlight id → attributes (colors, bold, italic, underline styles, reverse...).
- Cursor position, mode, cursor shapes per mode, default colors, UI options.
- `dirty`: rows that changed since the last paint.

Each `redraw` has a list of events. Each event has a name and **one or more** argument tuples. Events that the plugin uses:

| Event                                  | Effect                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `grid_resize`                          | New size. Keeps old content                                                                             |
| `grid_clear`                           | All cells empty                                                                                         |
| `grid_line`                            | Writes cells `[text, hl_id?, repeat?]` in a row. A missing `hl_id` uses the last one in the same event  |
| `grid_scroll`                          | Copies a region up (`rows > 0`) or down (`rows < 0`). Neovim then redraws the rows that the copy leaves |
| `grid_cursor_goto`                     | Cursor position                                                                                         |
| `default_colors_set`, `hl_attr_define` | Colors and highlights. All rows are repainted                                                           |
| `mode_info_set`, `mode_change`         | Cursor shape (block / vertical / horizontal) and size per mode                                          |
| `busy_start`, `busy_stop`              | Hide / show the cursor                                                                                  |
| `option_set`                           | UI options. `guifont` changes the font                                                                  |
| `flush`                                | End of a batch. The renderer paints now                                                                 |

The plugin ignores other events (`win_viewport`, `hl_group_set`, `mouse_on`...), as `:h ui` allows.

### Renderer (`src/ui/renderer.ts`, `src/ui/metrics.ts`)

- **Cell size:** from `measureText("M")` and the font ascent/descent, multiplied by "Line height". A cell has a fixed size. Neovim decides where each character goes, and the renderer never uses the font advance for layout.
- **Paint:** on `flush`, the renderer asks for one `requestAnimationFrame`. In the frame it repaints only dirty rows:
    1. Backgrounds, in runs of cells with the same highlight.
    2. Glyphs, one per cell, clipped to the row.
    3. Underline, undercurl, double/dotted/dashed underline and strikethrough (color from `special`).
- **Retina:** the canvas backing store is CSS size × `devicePixelRatio`, and the context is scaled. If the ratio changes (window moved to another display), the next frame resizes the canvas.
- **Cursor:** shape and `cell_percentage` from the mode. `attr_id = 0` means "swap the cell colors". Without focus, the cursor is a hollow box.
- **Resize:** a `ResizeObserver` on the tab (debounced 50 ms) calculates the new columns and rows, then calls `nvim_ui_try_resize`. Neovim answers with `grid_resize`.

### Keyboard (`src/input/keys.ts`, `src/view.ts`)

**Hotkeys.** Obsidian handles hotkeys before DOM events reach the view, also in the capture phase. `stopPropagation` does not help. The Phase 0 spike tested this (see [Design decisions](#design-decisions)). The fix:

- The view has its own `Scope` with a catch-all handler (`register(null, null, ...)`).
- When the hidden textarea gets focus, the view pushes the scope (`app.keymap.pushScope`). On blur, the view pops it.
- The handler returns `false` (Obsidian stops and calls `preventDefault`) for keys that go to Neovim.
- For keys in "Obsidian hotkeys to keep", it returns nothing, so Obsidian continues to its normal hotkeys.

**Translation.** `translateKey()` gives one of three results:

| Result     | When                                                                                           | Then                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `{ send }` | Special keys (`<Esc>`, `<CR>`, `<F5>`, arrows...), or a key with Ctrl / Cmd / (Option as Meta) | `nvim_input(send)`                                                                                                                 |
| `"text"`   | Printable key with no modifier, dead key, IME composition                                      | The browser types into the textarea. The `input` / `compositionend` event sends the text with `nvim_input` (`<` escaped as `<LT>`) |
| `"ignore"` | Modifier key alone                                                                             | Nothing                                                                                                                            |

Examples: `Ctrl+W` → `<C-w>`, `Shift+Tab` → `<S-Tab>`, `Cmd+S` → `<D-s>`, `Ctrl+<` → `<C-lt>`, `Ctrl+\` → `<C-Bslash>`.
With Option as Meta, macOS changes `e.key` (Option+A = `å`), so the plugin uses the physical key (`e.code`) to send `<M-a>`.

The hidden textarea moves to the cursor cell, so the IME candidate window opens near the cursor.
The view also sends `nvim_ui_set_focus` on focus and blur, so `FocusGained` / `FocusLost` autocmds work.

### Mouse

The view converts pixel position to row and column, and calls `nvim_input_mouse(button, action, modifiers, 0, row, col)`:

- `press`, `drag`, `release` for left, middle, right.
- Wheel: the view adds up `deltaY`, and sends one `up` / `down` per cell height. This keeps trackpad scroll smooth.
- The browser context menu is blocked on the canvas, so right-click goes to Neovim.

### File tracking and quit

- The view state is `{ file: "<vault-relative path>" }`. Obsidian saves it in the workspace layout, so the tab comes back after a restart.
- The `BufEnter` notification updates `file` when you change buffers in Neovim (only for normal buffers inside the vault). The tab title follows.
- Exit code 0 (`:q`, `:wq`): the leaf opens `file` in the Obsidian editor (`leaf.openFile`). If there is no vault file, the tab closes.
- Other exit code, or spawn error: an overlay shows the message, the last stderr lines and a Restart button.
- Toggle hotkey, header button, tab close, plugin disable: the view asks Neovim for modified buffers (`getbufinfo({'bufmodified': 1})`). If there are any, a dialog asks Save all (`:wall`) / Discard. Then the view stops the process.

### Sync with Obsidian

- Neovim writes the file. Obsidian detects the change and updates its index and other views.
- When any vault file changes (`vault.on("modify")`), every Neovim view runs `:checktime`. With `autoread`, Neovim reloads buffers that have no unsaved changes.
- Both editors can open the same note (for example two tabs). Neovim shows its normal warning if the file changes while the buffer has unsaved changes.

### Design decisions

| Decision                                                 | Reason                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| UI client (`--embed` + canvas), not sync with CodeMirror | You get all of Neovim: config, plugins, LSP, modes. No two-way text sync to keep correct                    |
| `--embed` on stdio, not a socket                         | One process per tab. Neovim exits when the channel closes, so no process stays alive                        |
| Own `Scope` pushed on focus                              | Only method that blocks Obsidian hotkeys (spike S1). `View.scope` is `null` by default since Obsidian 1.5.7 |
| Hidden textarea for text                                 | Dead keys and IME only work with a real text input                                                          |
| Option is not Meta by default                            | Spanish and other layouts need Option for `@ [ ] { } \|`                                                    |
| Login shell by default                                   | Obsidian started from the Dock has `PATH=/usr/bin:/bin:/usr/sbin:/sbin` (spike S2)                          |
| Own RPC client                                           | Small, no logger dependency, full control of the `redraw` hot path                                          |
| Neovim takes the Markdown tab                            | The note is not open in two editors, so no "file changed" conflicts                                         |
| `Cmd+Shift+E` toggle                                     | Not used by Obsidian defaults (checked in `obsidian.asar`: Obsidian uses Mod+Shift+F, G, N, T, W, Z)        |

## Project structure

```
obsidianvim/
├── manifest.json            Obsidian plugin manifest (isDesktopOnly: true)
├── main.js                  Build output (git-ignored)
├── styles.css               Layout of the view, hidden textarea, overlay, settings text area
├── esbuild.config.mjs       From obsidian-sample-plugin. Node built-ins and electron are external
├── eslint.config.mts        ESLint: Obsidian recommended rules (typescript-eslint type-checked) + Prettier
├── .prettierrc.json         Prettier: tabs, 120 columns, double quotes
├── .editorconfig            Tabs for code, 2 spaces for Markdown and YAML
├── package.json             Scripts: dev, build, test, lint, format, check
├── tsconfig.json
├── LICENSE                  MIT
├── src/
│   ├── main.ts              Plugin: settings, view registration, commands, hotkey, ribbon, header buttons, file menu, vault modify → checktime
│   ├── view.ts              NvimView: process lifecycle, attach, BufEnter tracking, keyboard scope, mouse, resize, quit, unsaved-changes dialog
│   ├── process.ts           Spawn nvim: login shell, env, --cmd variables, extra arguments
│   ├── args.ts              Shell-like parser for "Extra arguments"
│   ├── rpc.ts               msgpack-RPC client
│   ├── settings.ts          Settings interface, defaults, settings tab
│   ├── input/keys.ts        KeyboardEvent → Neovim key notation, hotkey spec matching
│   └── ui/
│       ├── grid.ts          Screen model from redraw events (no DOM)
│       ├── renderer.ts      Canvas painter
│       └── metrics.ts       Cell size, CSS font, guifont parsing
└── tests/
    ├── keys.test.ts                  Key translation table, hotkey specs
    ├── grid.test.ts                  grid_line / grid_scroll / resize, plus a real-nvim scroll test
    ├── rpc.integration.test.ts       Real nvim: attach, input, redraw events, error responses
    ├── metrics.test.ts               guifont parsing
    ├── args.test.ts                  "Extra arguments" parser: quotes, escapes, env, ~/
    └── process.integration.test.ts   Real nvim, with and without login shell: g:obsidianvim, vault var, autoread, extra args
```

## Development

```sh
npm install
npm run dev       # esbuild watch → main.js (with inline source maps)
npm run build     # type-check + production build
npm test          # vitest: unit tests + integration tests against real nvim
npm run lint      # ESLint
npm run format    # Prettier, writes the files
npm run check     # format check + lint + type-check + tests (run before a commit)
```

- The integration tests need `nvim` in PATH. Set `NVIM_BIN` to use another binary.
- Test vault: `../obsidianvim-testvault`. This repo is symlinked into its `.obsidian/plugins/obsidianvim`.
- To reload the plugin: disable and enable it in Settings → Community plugins, or install `pjeby/hot-reload`.
- Dev console: `Cmd+Opt+I`. Neovim stderr appears there as warnings (`obsidianvim: nvim stderr:`).

## Troubleshooting

| Problem                                   | Check                                                                                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cannot start Neovim"                     | "Neovim path" setting. Try the absolute path (`which nvim`)                                                                                                                                                                                               |
| LSP or tools not found                    | "Start through login shell" is on. `:echo $PATH` in Neovim. Your PATH must be set in a login shell file (`~/.zprofile` or `~/.zshrc` for zsh)                                                                                                             |
| Icons show as boxes                       | "Font family" must have a Nerd Font that is installed. The font name is the family name, for example `JetBrainsMono NFM`, not the file name. If you set `guifont` in Neovim, the settings font stays as fallback. The Neovim default `guifont` is ignored |
| A key goes to Obsidian, not Neovim        | Is it in "Obsidian hotkeys to keep"? Does the Neovim tab have focus (cursor is a filled block, not a hollow box)? Click the tab                                                                                                                           |
| A key does nothing                        | Is it an Obsidian hotkey that is not in the keep list? Neovim gets it. Check with `:nmap <key> :echo "got"<CR>`                                                                                                                                           |
| `@`, `[`, `]` do not type                 | "Option key as Meta" must be off                                                                                                                                                                                                                          |
| Blurry text                               | Report it with your display scale. The canvas should resize when the window moves to another display                                                                                                                                                      |
| Neovim does not reload a file             | Buffer has unsaved changes, or `autoread` is turned off in your config                                                                                                                                                                                    |
| Neovim process stays after Obsidian quits | `pgrep -fl 'nvim --embed'`. Report it                                                                                                                                                                                                                     |

## Limits and known issues

- Desktop only (Node `child_process`). No mobile.
- No font ligatures: the renderer draws one glyph per cell.
- One Neovim process per tab. Two tabs do not share buffers or registers (except through the system clipboard and shada).
- Neovim draws the cmdline, popup menu and messages in the grid. There is no native Obsidian UI for them (`ext_cmdline`, `ext_popupmenu`, `ext_messages` are not used).
- `grid_scroll` copies cells and repaints rows. It does not copy pixels, so a big scroll repaints all rows.
- Known test flake: about 1 run in 30, a fresh `nvim --embed --clean` shows a hit-enter prompt at startup, and requests block. The grid integration test retries. Cause not found yet. It can also happen in Obsidian, but it is not likely.
- The tab title refresh uses `leaf.updateHeader()`, which is not public API. If Obsidian removes it, the title stops updating after `:e`, but nothing else breaks.

## Manual test checklist

Do these in the test vault. Keep the dev console (`Cmd+Opt+I`) open, and write down errors.

### Open and close

1. [ ] Markdown note → `Cmd+Shift+E` → the same tab shows Neovim with the note. The tab title is `nvim: <file>`.
2. [ ] Header terminal button in a Markdown tab → same result.
3. [ ] Ribbon icon with a note active → same result.
4. [ ] Ribbon icon with no note open → empty Neovim tab.
5. [ ] File explorer right-click → "Open in Neovim" → new tab.
6. [ ] Command palette → "Open Neovim" → empty tab. `:pwd` shows the vault path.
7. [ ] `:q` → the tab shows the note in the Obsidian editor.
8. [ ] `:wq` after an edit → back to the Obsidian editor, and the edit is there.
9. [ ] `Cmd+Shift+E` in Neovim, no changes → back to the Obsidian editor, with no dialog.
10. [ ] `Cmd+Shift+E` in Neovim with unsaved changes → dialog. "Save all" saves. Repeat with "Discard": the change is not saved.
11. [ ] Header "Back to Obsidian editor" button → same as item 9.
12. [ ] Close the Neovim tab (x) with unsaved changes → dialog. `Esc` in the dialog saves.
13. [ ] `:e other.md` inside Neovim → the tab title changes. `:q` → the Obsidian editor shows `other.md`.
14. [ ] Empty Neovim tab → `:q` → the tab closes.
15. [ ] `:cq` (exit code 1) → overlay "Neovim exited (code 1)" with a Restart button. Restart works.
16. [ ] Restart Obsidian with a Neovim tab open → the tab comes back with the same file.
17. [ ] Disable the plugin with a Neovim tab open → no `nvim --embed` process stays (`pgrep -fl 'nvim --embed'`). The header buttons are removed.

### Config and environment

18. [ ] `:echo g:obsidianvim g:obsidianvim_vault $OBSIDIANVIM_VAULT` → `1` and the vault path two times.
19. [ ] Your config loads (theme, statusline, plugins). A plugin with `cond = not vim.g.obsidianvim` does not load.
20. [ ] `:echo $PATH` contains `/opt/homebrew/bin`. LSP works on a file with a server (for example a `.lua` file).
21. [ ] Settings → turn off "Start through login shell", set Neovim path to `/opt/homebrew/bin/nvim`, open a new tab → it starts. `:echo $PATH` is the short system PATH.
22. [ ] Settings → Neovim path `nvim-does-not-exist`, open a new tab → a clear error and a Restart button. Restore the setting.
23. [ ] Extra arguments `NVIM_APPNAME=nvim-test` (a config that does not exist) → Neovim starts with the default config.
24. [ ] Extra arguments `--cmd "let g:hello = 'a b'"` → `:echo g:hello` shows `a b`.
25. [ ] Extra arguments `--cmd "set wrap` (unclosed quote) → the tab shows `Unclosed " in extra arguments`. Clear the setting.

### Keyboard

26. [ ] `Cmd+P` opens the Obsidian command palette while Neovim has focus.
27. [ ] `Cmd+W`, `Cmd+O`, `Ctrl+Tab` do not trigger Obsidian. Check that Neovim gets them: `:nmap <D-o> :echo "got D-o"<CR>`, then `Cmd+O`.
28. [ ] `Esc` leaves insert mode and does not close or blur anything.
29. [ ] Insert mode: type `á é í ó ú ñ ü ¿ ¡ @ # [ ] { } \ | < >`. Every character is correct.
30. [ ] `Ctrl+W`, `Ctrl+O`, `Ctrl+V` (visual block), `Ctrl+R "` work.
31. [ ] Arrows, Home/End, PageUp/PageDown, Backspace, Delete, Tab, Shift+Tab, F1.
32. [ ] `:` cmdline, `/` search, `<C-n>` / LSP completion popup are visible.
33. [ ] "Option key as Meta" on → `:nmap <M-j> :echo "M-j"<CR>`, press Option+J → the message shows. Turn it off again.
34. [ ] Hold a key (for example `j`) → key repeat works and scroll is smooth.

### Clipboard

35. [ ] `Cmd+V` in insert mode pastes multi-line text as is, with no extra indent.
36. [ ] `"+y` in Neovim, then paste in another app → same text.

### Mouse

37. [ ] Click moves the cursor to the clicked cell.
38. [ ] Drag selects in visual mode.
39. [ ] Wheel scrolls in both directions, on a trackpad and on a mouse.
40. [ ] Click another Obsidian pane, then click Neovim → keys go to Neovim again.

### Rendering

41. [ ] Nerd Font icons show (file tree, statusline, diagnostic signs).
42. [ ] Colors match your theme. Bold, italic, underline, undercurl (spelling or diagnostics), strikethrough.
43. [ ] Cursor shape: block in normal mode, bar in insert mode, underline in replace mode (`r`).
44. [ ] Wide chars and emoji: type `日本語 😀` → no overlap, and the cursor moves by 2 cells.
45. [ ] Text is sharp on a retina display. Move the window to a non-retina display (if you have one) → still sharp.
46. [ ] Resize the pane, split it, open the sidebar → Neovim fills the pane with no gap or cut text.
47. [ ] `:set guifont=Menlo:h16` → font and size change, and the grid fits again.
48. [ ] Big file (for example 5000 lines) → `G`, `gg`, `Ctrl+D` are fast and show no artifacts.
49. [ ] Unfocus Neovim → the cursor shows as a hollow box.

### Sync with Obsidian

50. [ ] Same note open in Neovim and in an Obsidian editor (two tabs). Edit in Obsidian → Neovim reloads it (if Neovim has no unsaved changes).
51. [ ] `:w` in Neovim → the Obsidian tab shows the change.
52. [ ] Two Neovim tabs with different notes → each one works on its own. Closing one does not affect the other.

## License

MIT. See [LICENSE](LICENSE).
