# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Development (all apps)
pnpm dev

# Development (specific apps)
pnpm dev:web          # Frontend only (port 5173)
pnpm dev:api          # API only (port 8787)

# Local development (recommended: run in two terminals)
# Terminal 1: pnpm dev:api
# Terminal 2: pnpm dev:web
# Note: Set VITE_API_URL=http://localhost:8787 in apps/web/.env

# Build
pnpm build
pnpm build:web
pnpm build:api

# Lint
pnpm lint

# Deploy API to Cloudflare Workers
cd apps/api && wrangler deploy --minify src/index.ts
```

## Architecture

This is a pnpm monorepo using Turborepo with two apps:

- `apps/web` - React 19 frontend (Vite, Tailwind CSS, shadcn/ui)
- `apps/api` - Hono API for Cloudflare Workers

### API Integration

The API (`apps/api/src/index.ts`) is shared between:
1. Standalone Cloudflare Workers deployment
2. Cloudflare Pages Functions via `apps/web/functions/api/[[route]].ts`

The Pages Functions handler imports the Hono app directly, enabling single-deployment full-stack hosting.

### Key Endpoints

- `POST /api/generate` - Gitee AI image generation (requires `X-API-Key` header)
- `POST /api/generate-hf` - HuggingFace Spaces generation (optional `X-HF-Token`)
- `POST /api/upscale` - RealESRGAN 4x upscaling

### Frontend Structure

- `src/pages/ImageGenerator.tsx` - Main page component
- `src/components/ui/` - shadcn/ui components
- `src/lib/crypto.ts` - AES-256-GCM encryption for API key storage
