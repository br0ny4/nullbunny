# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Web Vuln Scan: add `prompt-injection` vulnerability type with 7 attack vectors (direct injection, DAN jailbreak, separator injection, indirect injection via RAG poisoning, system override, role-playing jailbreak, translation override).
- Web Vuln Scan: add `detectPromptInjection()` with multi-level detection logic based on jailbreak keyword matching and dangerous content heuristics.
- Tests: add prompt injection integration test against mock LLM endpoint (new `tests/web.test.mjs` test).
- GUI Settings: wire Settings page to `GET /api/settings` and `PUT /api/settings` for real configuration persistence.
- GUI Settings: add 4 frontend tests (load, save, placeholder fallback, error display).
- GUI Dashboard: replace hardcoded mock activity cards with real task data from `/api/tasks`.
- GUI Dashboard: add `cleanup()` to test teardown for reliable DOM cleanup.

### Changed
- GUI Dashboard: real-time task list now fetched in parallel with system stats every 2 seconds.
- README: update feature descriptions, capability snapshot, and test coverage numbers (65 backend + 9 GUI).

## [0.1.0] - 2026-04-22

### Added
- Initial public baseline for NullBunny core engine, GUI, and CI integration.
