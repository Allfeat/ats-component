# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A vanilla TypeScript Web Component (`<ats-widget>`) for registering, updating, and accessing creative works on the Allfeat blockchain. No framework — just Custom Elements API with Shadow DOM. Single runtime dependency: `zod`.

## Commands

```bash
bun run build          # One-shot production build (rollup)
bun run build:watch    # Watch mode build
bun run dev            # Build + watch + start demo Nuxt app concurrently
bun run dev:musicdash  # Start demo-musicdash Nuxt app
bun run typecheck      # tsc --noEmit (no linter configured)
bun run clean          # Remove dist/
```

There are no tests or linting tools configured. TypeScript strict mode is the primary code-quality mechanism.

## Architecture

### Core Component

`src/allfeat-register.ts` — `AllfeatRegister extends HTMLElement` is the entire component. It manages:
- **Screen state machine**: `FORM → UPLOAD → CONFIRMING → TRACKING → COMPLETE / FAILED`
- **Form sub-steps** vary by mode (`register`, `update`, `access`)
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

The component talks to an ATS API backend (`ats-url` attribute). Demo apps use Nuxt 3 server routes as BFF to obtain JWT tokens from an Organizations Service using a `secret_key` (never exposed to browser). Transaction tracking uses WebSocket with HTTP polling fallback. File upload uses pre-signed S3 PUT URLs via `XMLHttpRequest` for progress.

### Token Refresh Flow

`handleTokenExpired()` pauses the current flow, stores a retry callback, emits `allfeat:token-expired`, then resumes when a new `token` attribute is set.

## Demos

- `demo/` — Simple local dev demo (Nuxt 3, port 3000)
- `demo-musicdash/` — Production-pattern demo with Docker + BFF (Nuxt 3, port 3001)

## CI/CD

- `deploy-component.yml` — Builds and uploads JS bundles to Cloudflare R2 (`master` → versioned + latest, `develop` → `/dev/`)
- `deploy-demo-musicdash.yml` — Docker build + push to GHCR
- Both use self-hosted runners
