# Release Process

This repository uses a fixed two-week release cadence for minor updates.

## Cadence

- Week 1: feature merge window (small and backward-compatible changes preferred).
- Week 2: stabilization window (bug fixes, docs, and regression checks only).
- Release day: create tag and publish release notes from `.github/release_template.md`.

## Versioning Rules

- `MAJOR`: breaking change.
- `MINOR`: backward-compatible feature.
- `PATCH`: bug fix or docs-only correction.

## Required Gates

- `pnpm test`
- `pnpm --filter @nullbunny/gui test`
- `pnpm typecheck`
- README and examples updated for user-facing behavior changes.
- `CHANGELOG.md` updated under `[Unreleased]`.

## Release Checklist

1. Confirm all CI workflows are green.
2. Move key items from `[Unreleased]` to a new version section in `CHANGELOG.md`.
3. Fill `.github/release_template.md` and publish GitHub Release.
4. Create tag: `vX.Y.Z`.
5. Announce migration notes if any behavior changes exist.
