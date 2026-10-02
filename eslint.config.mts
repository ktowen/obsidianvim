import obsidianmd from "eslint-plugin-obsidianmd";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig(
	globalIgnores([
		"node_modules",
		"main.js",
		"esbuild.config.mjs",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	]),
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.mts", "vitest.config.ts", "manifest.json"] },
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			"@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
			"obsidianmd/ui/sentence-case": [
				"warn",
				{ brands: ["Neovim", "Nerd Font", "Meta", "Option", "Cmd", "Mod+P", "NVIM_APPNAME", "PATH", "LSP"] },
			],
			// The toggle hotkey is a feature: it must work without setup.
			"obsidianmd/commands/no-default-hotkeys": "off",
			// getSettingDefinitions() needs Obsidian 1.13. manifest.json minAppVersion is lower.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
		},
	},
	{
		files: ["tests/**/*.ts"],
		rules: { "@typescript-eslint/no-non-null-assertion": "off" },
	},
	prettier,
);
