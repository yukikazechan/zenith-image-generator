# API Reference

## `POST /api/generate`

Generate an image from text prompt using Gitee AI.

**Headers:**

```
Content-Type: application/json
X-API-Key: your-gitee-ai-api-key
```

**Request Body:**

```json
{
  "prompt": "A beautiful sunset over mountains",
  "negative_prompt": "low quality, blurry",
  "model": "z-image-turbo",
  "width": 1024,
  "height": 1024,
  "num_inference_steps": 9
}
```

**Response:**

```json
{
  "url": "https://...",
  "b64_json": "base64-encoded-image-data"
}
```

**Parameters:**

| Field                 | Type   | Required | Default         | Description                         |
| --------------------- | ------ | -------- | --------------- | ----------------------------------- |
| `prompt`              | string | Yes      | -               | Image description (max 10000 chars) |
| `negative_prompt`     | string | No       | `""`            | What to avoid in the image          |
| `model`               | string | No       | `z-image-turbo` | Model name                          |
| `width`               | number | No       | `1024`          | Image width (256-2048)              |
| `height`              | number | No       | `1024`          | Image height (256-2048)             |
| `num_inference_steps` | number | No       | `9`             | Generation steps (1-50)             |

## `POST /api/generate-hf`

Generate an image using HuggingFace Spaces.

**Headers:**

```
Content-Type: application/json
X-HF-Token: your-huggingface-token (optional)
```

## `POST /api/upscale`

Upscale an image 4x using RealESRGAN.

## Supported Aspect Ratios

| Ratio | Dimensions                             |
| ----- | -------------------------------------- |
| 1:1   | 256×256, 512×512, 1024×1024, 2048×2048 |
| 4:3   | 1152×896, 2048×1536                    |
| 3:4   | 768×1024, 1536×2048                    |
| 3:2   | 2048×1360                              |
| 2:3   | 1360×2048                              |
| 16:9  | 1024×576, 2048×1152                    |
| 9:16  | 576×1024, 1152×2048                    |

## Security

### API Key Storage

Your Gitee AI API key is stored securely in the browser using **AES-256-GCM encryption**:

- The key is encrypted before being saved to localStorage
- Encryption key is derived using PBKDF2 (100,000 iterations) from browser fingerprint
- Even if localStorage is accessed, the API key cannot be read without the same browser environment
- Changing browsers or clearing browser data will require re-entering the API key

**Implementation details** (`src/lib/crypto.ts`):

- Uses Web Crypto API (native browser cryptography)
- AES-256-GCM for authenticated encryption
- Random IV for each encryption operation
- Browser fingerprint includes: User-Agent, language, screen dimensions

**Note**: While this provides protection against casual access and XSS attacks reading raw values, for maximum security in shared environments, consider:

- Using a private/incognito window
- Clearing browser data after use
- Self-hosting with server-side API key storage

## Troubleshooting

### API Key not saving

- Make sure your browser allows localStorage
- Check if you're in private/incognito mode

### CORS errors

- For Cloudflare Pages: Should work automatically
- For separate deployments: Update `CORS_ORIGINS` in `apps/api/wrangler.toml`

### Build failures

- Ensure Node.js 18+ and pnpm 9+ are installed
- Run `pnpm install` to update dependencies
