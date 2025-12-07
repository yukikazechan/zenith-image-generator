import { Square, RectangleVertical, RectangleHorizontal } from "lucide-react";

export const DEFAULT_PROMPT = import.meta.env.VITE_DEFAULT_PROMPT;

export const DEFAULT_NEGATIVE_PROMPT = import.meta.env
  .VITE_DEFAULT_NEGATIVE_PROMPT;

export const ASPECT_RATIOS = [
  {
    label: "1:1",
    icon: Square,
    presets: [
      { w: 1024, h: 1024 },
      { w: 2048, h: 2048 },
    ],
  },
  {
    label: "4:3",
    icon: RectangleHorizontal,
    presets: [
      { w: 1152, h: 896 },
      { w: 2048, h: 1536 },
    ],
  },
  {
    label: "3:4",
    icon: RectangleVertical,
    presets: [
      { w: 768, h: 1024 },
      { w: 1536, h: 2048 },
    ],
  },
  {
    label: "16:9",
    icon: RectangleHorizontal,
    presets: [
      { w: 1024, h: 576 },
      { w: 2048, h: 1152 },
    ],
  },
  {
    label: "9:16",
    icon: RectangleVertical,
    presets: [
      { w: 576, h: 1024 },
      { w: 1152, h: 2048 },
    ],
  },
] as const;

export const STORAGE_KEY = "zenith-settings";

export type ApiProvider = "gitee" | "hf-zimage" | "hf-qwen";

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveSettings(settings: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
