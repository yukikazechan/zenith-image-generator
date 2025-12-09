# Deployment Guide

## Option 1: Cloudflare Pages (Recommended)

Deploy both frontend and API together with zero configuration.

### Using Cloudflare Dashboard

1. Push your code to GitHub/GitLab

2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project**

3. Connect your Git repository

4. Configure build settings:
   | Setting | Value |
   |---------|-------|
   | Root directory | `apps/web` |
   | Build command | `pnpm build` |
   | Output directory | `dist` |

5. Click **Save and Deploy**

6. Your app will be available at `https://your-project.pages.dev`

### Using Wrangler CLI

```bash
# Install Wrangler globally
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy from apps/web directory
cd apps/web
pnpm build
wrangler pages deploy dist --project-name z-image
```

## Option 2: Vercel (Frontend) + Cloudflare Workers (API)

### Deploy API to Cloudflare Workers

```bash
cd apps/api

# Update wrangler.toml with your CORS origins
# CORS_ORIGINS = "https://your-app.vercel.app"

wrangler deploy
```

Note your Workers URL: `https://z-image-api.your-account.workers.dev`

### Deploy Frontend to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → **New Project**

2. Import your Git repository

3. Configure:
   | Setting | Value |
   |---------|-------|
   | Root Directory | `apps/web` |
   | Build Command | `pnpm build` |
   | Output Directory | `dist` |

4. Add Environment Variable:
   | Name | Value |
   |------|-------|
   | `VITE_API_URL` | `https://z-image-api.your-account.workers.dev` |

5. Deploy

## Option 3: Netlify (Frontend) + Cloudflare Workers (API)

### Deploy API to Cloudflare Workers

Same as Option 2 above.

### Deploy Frontend to Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com) → **Add new site**

2. Import your Git repository

3. Configure:
   | Setting | Value |
   |---------|-------|
   | Base directory | `apps/web` |
   | Build command | `pnpm build` |
   | Publish directory | `apps/web/dist` |

4. Add Environment Variable in **Site settings** → **Environment variables**:
   | Name | Value |
   |------|-------|
   | `VITE_API_URL` | `https://z-image-api.your-account.workers.dev` |

5. Trigger redeploy

## Environment Variables

### Frontend (`apps/web/.env`)

| Variable       | Description                                               | Default |
| -------------- | --------------------------------------------------------- | ------- |
| `VITE_API_URL` | API base URL. Leave empty for Cloudflare Pages deployment | ``      |

### API (`apps/api/wrangler.toml`)

| Variable       | Description                     | Default                                       |
| -------------- | ------------------------------- | --------------------------------------------- |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173,http://localhost:3000` |
