# PClaude Installer

Desktop MVP for checking local prerequisites, installing Node.js, Git, and Claude Code from online sources, saving Anthropic configuration, and launching Claude Code from PClaude.

## Development

- Source development for this repo requires Node `^20.19.0 || >=22.12.0` because that is the floor enforced by the Vite toolchain used to build the installer.
- `npm install`
- `npm run start` builds the app and launches the local Electron window.
- `npm run dev` starts only the renderer dev server.
- `npm run dev:electron` rebuilds only the Electron main process in watch mode.
- `npm run dev` and `npm run dev:electron` are watch utilities for their respective bundles; they do not replace `npm run start` as the supported way to launch the app locally.
- `npm test`
- `npm run lint`
- `npm run build` generates `dist-renderer/` and `dist-electron/`.
- `npm run package:dir` builds unpacked release assets under `release/`.
- `npm run package` builds the distributable release targets from `electron-builder.yml`.
- The packaged app is the right place to exercise prerequisite checks like a missing `npm`; a source checkout naturally needs `npm install` before the app can be built or launched.

## MVP Scope

- Detect Node.js, npm, Git, and Claude CLI availability.
- Install pinned `Node 22 LTS` from the official release source with Ali mirror fallback.
- Install `Git` automatically on Windows and surface manual macOS guidance for `Xcode Command Line Tools` or `Homebrew`.
- Run the official online Claude Code installer from the desktop app.
- Surface manual-action failures and fallback messages for dependency installs.
- Save Anthropic API settings after a connectivity check.
- Launch the local Claude Code binary with the saved Anthropic environment.
- Produce renderer and Electron bundles for release packaging.
