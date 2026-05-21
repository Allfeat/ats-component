# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A vanilla TypeScript Web Component (`<ats-widget>`) for registering and updating creative works on the Allfeat blockchain. No framework — just Custom Elements API with Shadow DOM. Single runtime dependency: `zod`.

## Commands

```bash
bun run build          # One-shot production build (rollup)
bun run build:watch    # Watch mode build
bun run dev            # Build + watch + start demo Nuxt app concurrently
bun run typecheck      # tsc --noEmit (no linter configured)
bun run clean          # Remove dist/
```

There are no tests or linting tools configured. TypeScript strict mode is the primary code-quality mechanism.

## Architecture

### Core Component

`src/allfeat-register.ts` — `AllfeatRegister extends HTMLElement` is the entire component. It manages:
- **Screen state machine**: `FORM → UPLOAD → CONFIRMING → TRACKING → COMPLETE / FAILED`
- **Form sub-steps** vary by mode (`register`, `update`)
- **Event delegation**: single event listeners on the container route via `data-action` attributes
- **Render-on-state-change**: all UI updates replace `container.innerHTML` with pure HTML strings from renderers

### Key Source Layout

| Path | Role |
|---|---|
| `src/allfeat-register.ts` | Core web component class, state machine, all event handling |
| `src/form/renderer.ts` | Pure functions returning HTML strings (stateless renderers) |
| `src/form/schema.ts` | Zod validation schemas |
| `src/form/types.ts` | Form state, component state, completion data interfaces |
| `src/api/client.ts` | All HTTP/WebSocket/S3 API calls |
| `src/api/types.ts` | API request/response TypeScript types + error classes |
| `src/styles/component.css` | Shadow DOM styles (imported as string by Rollup CSS plugin) |
| `src/utils/events.ts` | Custom event names + typed dispatch helpers (`allfeat:*` events) |
| `src/utils/colors.ts` | Hex/RGB color manipulation |
| `src/utils/helpers.ts` | formatFileSize, escapeHtml |

### Build Output

Rollup produces three bundles in `dist/`:
- `ats-widget.esm.js` (ESM)
- `ats-widget.cjs.js` (CJS)
- `ats-widget.iife.js` (IIFE, global `AtsWidgetComponent` — for CDN/script tag)

Custom Rollup CSS plugin inlines `.css` files as JS string exports.

### API Integration Pattern

The component talks to the ATS API backend directly (`ats-url` attribute) on every call. Demo apps use a single Nuxt 3 mint-only BFF route, `/api/token`, which exchanges the host's widget `secret_key` for a session JWT. The `action_type` field on the mint request selects the surface: `register` / `update_version` / `access` produce a narrow token for the user-scoped routes; `external_user` (with an `external_user_ref`) produces a token that authorizes the org-scoped B2B routes (`/v1/organizations/{org}/...`) for that one end-user. Either kind of token goes on the widget's `token` attribute — the widget treats them identically and never sees the host's long-lived secrets. Transaction tracking uses WebSocket with HTTP polling fallback. File upload uses pre-signed S3 PUT URLs via `XMLHttpRequest` for progress.

### Token Refresh Flow

`handleTokenExpired()` pauses the current flow, stores a retry callback, emits `allfeat:token-expired`, then resumes when a new `token` attribute is set.

## Demo

Single Nuxt 3 app in `demo/` (port 3000) with two pages:
- `/` — Dev console with config UI, event log, and code examples
- `/abbey-road` — Production-pattern integration cloning the Abbey Road Studios site, with the external-user mint flow (`action_type: "external_user"`)

Docker support (`demo/Dockerfile`, `demo/docker-compose.dev.yml`) for containerized deployment.

## Releasing

Releases use [release-it](https://github.com/release-it/release-it) with the [conventional-changelog](https://github.com/release-it/conventional-changelog) plugin. The version bump is inferred from conventional commits (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE` → major).

### Commit convention

All commits should follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature          → minor bump
fix: fix something             → patch bump
feat!: breaking change         → major bump
docs: update readme            → no bump (not included in changelog)
refactor: clean up code        → no bump (not included in changelog)
```

### How to release

```bash
bun run release            # Interactive: recommends bump based on commits
bun run release -- patch   # Force patch bump
bun run release -- minor   # Force minor bump
bun run release -- major   # Force major bump
bun run release -- --dry-run  # Preview without making changes
```

This will:
1. Run typecheck + build
2. Bump version in `package.json`
3. Update `CHANGELOG.md` (grouped by feat/fix/etc.)
4. Commit `release: vX.Y.Z` + tag `vX.Y.Z`
5. Push to origin → triggers CI release workflow

### CI/CD pipeline

The release workflow (`.github/workflows/release.yml`) is triggered by `v*` tags and:
1. Builds + validates tag matches `package.json` version
2. Uploads bundles to Cloudflare R2 (3 channels: `/$VERSION/`, `/v$MAJOR/`, `/latest/`)
3. Creates a GitHub Release with changelog from `CHANGELOG.md` + attached bundles

Other workflows:
- `deploy-component.yml` — Builds and uploads JS bundles to Cloudflare R2 on `develop` push → `/dev/`
- `deploy-demo-musicdash.yml` — Docker build + push to GHCR
- Both use self-hosted runners
