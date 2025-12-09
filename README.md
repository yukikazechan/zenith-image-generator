<div align="center">

# Zenith Image Generator

**Modern Text-to-Image Generation Web App**

A sleek, dark-mode AI image generator with multiple providers, <br/>
batch generation, and one-click deployment to Cloudflare Pages.

[中文](./README.zh.md) · [Changelog](./CHANGELOG.md) · [Live Demo](https://zenith-image-generator.pages.dev)

![Dark Mode UI](https://img.shields.io/badge/UI-Dark%20Mode-1a1a1a)
![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Hono](https://img.shields.io/badge/Hono-4-E36002)

</div>

---

## Features

- **Multiple AI Providers** - Gitee AI, HuggingFace Spaces
- **Dark Mode UI** - Gradio-style with frosted glass effects
- **Flexible Sizing** - Multiple aspect ratios (1:1, 16:9, 9:16, 4:3, etc.)
- **4x Upscaling** - RealESRGAN integration
- **Secure Storage** - API keys encrypted with AES-256-GCM
- **Flow Mode** - Visual canvas for batch generation (experimental)

## Quick Start

### Prerequisites

- Node.js 18+ / pnpm 9+
- [Gitee AI API Key](https://ai.gitee.com)

### One-Click Deploy

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare)](https://dash.cloudflare.com)

> Connect your GitHub repo → Set root to `apps/web` → Deploy!

### Local Development

```bash
git clone https://github.com/WuMingDao/zenith-image-generator.git
cd zenith-image-generator
pnpm install

# Terminal 1
pnpm dev:api

# Terminal 2
pnpm dev:web
```

Open `http://localhost:5173`

📖 **[Full Development Guide](./CONTRIBUTING.md)**

## Documentation

| Doc | Description |
|-----|-------------|
| [Contributing](./CONTRIBUTING.md) | Local setup, LAN access, development |
| [Deployment](./docs/DEPLOYMENT.md) | Cloudflare, Vercel, Netlify guides |
| [API Reference](./docs/API.md) | Endpoints, parameters, security |

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui |
| Backend | Hono (TypeScript) |
| Deploy | Cloudflare Pages + Functions |

## License

MIT

## Acknowledgments

- [Gitee AI](https://ai.gitee.com) - z-image-turbo model
- [shadcn/ui](https://ui.shadcn.com) - UI components
- [Hono](https://hono.dev) - Web framework
