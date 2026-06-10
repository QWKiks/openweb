# Changelog

## [1.6.2] - 2026-06-10

### Fixed
- Fixed crash in daemon's graceful shutdown when not running in TTY mode.
- Fixed MCP server log outputs properly routing debug, info, and error messages to `stderr`.
- Synchronized Firefox extension version correctly to match Chrome and package.
- Prevented deliberately failing unit tests from crashing the `npm test` script.
- Fixed `.gitignore` to track `package-lock.json` and `.cursor/mcp.json`.
- Corrected physical mode click syntax in `rules.md`.

### Changed
- Extracted and shared the `validateIncomingMessage` logic.
- Implemented `discover_tools`, `extract_page`, `click_and_verify`, `speech_to_text`, `translate` explicitly to avoid ghost tool errors.
- Registered previously orphaned audit tools (`a11y-audit`, `broken-links`, `form-audit`, `performance-audit`, `seo-audit`).
- Added GitHub Actions CI/CD pipeline for tests and version validation.
