import { useState, useEffect, useRef } from "react";
import { encryptAndStore, decryptFromStore } from "@/lib/crypto";
import { toast } from "sonner";
import {
  type ApiProvider,
  ASPECT_RATIOS,
  DEFAULT_PROMPT,
  DEFAULT_NEGATIVE_PROMPT,
  loadSettings,
  saveSettings,
} from "@/lib/constants";

export function useImageGenerator() {
  const [apiKey, setApiKey] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [apiProvider, setApiProvider] = useState<ApiProvider>(
    () => loadSettings().apiProvider ?? "gitee"
  );
  const [prompt, setPrompt] = useState(
    () => loadSettings().prompt ?? DEFAULT_PROMPT
  );
  const [negativePrompt, setNegativePrompt] = useState(
    () => loadSettings().negativePrompt ?? DEFAULT_NEGATIVE_PROMPT
  );
  const [model] = useState("z-image-turbo");
  const [width, setWidth] = useState(() => loadSettings().width ?? 1024);
  const [height, setHeight] = useState(() => loadSettings().height ?? 1024);
  const [steps, setSteps] = useState(() => loadSettings().steps ?? 9);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    localStorage.getItem("lastImageUrl")
  );
  const [status, setStatus] = useState("Ready.");
  const [elapsed, setElapsed] = useState(0);
  const [selectedRatio, setSelectedRatio] = useState(
    () => loadSettings().selectedRatio ?? "1:1"
  );
  const [uhd, setUhd] = useState(() => loadSettings().uhd ?? false);
  const [upscale8k] = useState(() => loadSettings().upscale8k ?? false);
  const [showInfo, setShowInfo] = useState(false);
  const [isBlurred, setIsBlurred] = useState(
    () => localStorage.getItem("isBlurred") === "true"
  );
  const [isUpscaled, setIsUpscaled] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      decryptFromStore().then(setApiKey);
      const stored = localStorage.getItem("hfToken");
      if (stored) {
        try {
          const { iv, data } = JSON.parse(stored);
          crypto.subtle
            .importKey(
              "raw",
              new TextEncoder().encode(navigator.userAgent),
              "PBKDF2",
              false,
              ["deriveKey"]
            )
            .then((key) =>
              crypto.subtle.deriveKey(
                {
                  name: "PBKDF2",
                  salt: new TextEncoder().encode("hf-salt"),
                  iterations: 100000,
                  hash: "SHA-256",
                },
                key,
                { name: "AES-GCM", length: 256 },
                false,
                ["decrypt"]
              )
            )
            .then((derivedKey) =>
              crypto.subtle.decrypt(
                { name: "AES-GCM", iv: new Uint8Array(iv) },
                derivedKey,
                new Uint8Array(data)
              )
            )
            .then((decrypted) =>
              setHfToken(new TextDecoder().decode(decrypted))
            )
            .catch(() => localStorage.removeItem("hfToken"));
        } catch {
          localStorage.removeItem("hfToken");
        }
      }
    }
  }, []);

  useEffect(() => {
    if (initialized.current) {
      saveSettings({
        prompt,
        negativePrompt,
        width,
        height,
        steps,
        selectedRatio,
        uhd,
        upscale8k,
        apiProvider,
      });
    }
  }, [prompt, negativePrompt, width, height, steps, selectedRatio, uhd, upscale8k, apiProvider]);

  useEffect(() => {
    if (imageUrl) {
      localStorage.setItem("lastImageUrl", imageUrl);
    } else {
      localStorage.removeItem("lastImageUrl");
    }
  }, [imageUrl]);

  useEffect(() => {
    localStorage.setItem("isBlurred", String(isBlurred));
  }, [isBlurred]);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(timer);
  }, [loading]);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    encryptAndStore(key);
    if (key) toast.success("API Key saved");
  };

  const saveHfToken = async (token: string) => {
    setHfToken(token);
    if (token) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(navigator.userAgent),
        "PBKDF2",
        false,
        ["deriveKey"]
      );
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode("hf-salt"),
          iterations: 100000,
          hash: "SHA-256",
        },
        key,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        derivedKey,
        new TextEncoder().encode(token)
      );
      localStorage.setItem(
        "hfToken",
        JSON.stringify({
          iv: Array.from(iv),
          data: Array.from(new Uint8Array(encrypted)),
        })
      );
      toast.success("HF Token saved");
    } else {
      localStorage.removeItem("hfToken");
    }
  };

  const addStatus = (msg: string) => {
    setStatus((prev) => prev + "\n" + msg);
  };

  const handleRatioSelect = (ratio: (typeof ASPECT_RATIOS)[number]) => {
    setSelectedRatio(ratio.label);
    const preset = uhd ? ratio.presets[1] : ratio.presets[0];
    setWidth(preset.w);
    setHeight(preset.h);
  };

  const handleUhdToggle = (enabled: boolean) => {
    setUhd(enabled);
    const ratio = ASPECT_RATIOS.find((r) => r.label === selectedRatio);
    if (ratio) {
      const preset = enabled ? ratio.presets[1] : ratio.presets[0];
      setWidth(preset.w);
      setHeight(preset.h);
    }
  };

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `zenith-${Date.now()}.jpg`;
    a.click();
  };

  const handleUpscale = async () => {
    if (!imageUrl || isUpscaling || isUpscaled) return;
    setIsUpscaling(true);
    addStatus("Upscaling to 4x...");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/upscale`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(hfToken && { "X-HF-Token": hfToken }),
          },
          body: JSON.stringify({ url: imageUrl, scale: 4 }),
        }
      );
      const data = await res.json();
      if (res.ok && data.url) {
        setImageUrl(data.url);
        setIsUpscaled(true);
        addStatus("4x upscale complete!");
        toast.success("Image upscaled to 4x!");
      } else {
        addStatus(`Upscale failed: ${data.error || "Unknown error"}`);
        toast.error("Upscale failed");
      }
    } catch (err) {
      addStatus(
        `Upscale failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      toast.error("Upscale failed");
    } finally {
      setIsUpscaling(false);
    }
  };

  const handleDelete = () => {
    setImageUrl(null);
    setIsUpscaled(false);
    setIsBlurred(false);
    setShowInfo(false);
    toast.success("Image deleted");
  };

  const handleGenerate = async () => {
    if (apiProvider === "gitee" && !apiKey) {
      toast.error("Please configure your API Key first");
      return;
    }

    setLoading(true);
    setImageUrl(null);
    setIsUpscaled(false);
    setIsBlurred(false);
    setShowInfo(false);
    setStatus("Initializing...");

    try {
      let generatedUrl: string | undefined;

      if (apiProvider === "gitee") {
        addStatus("Sending request to Gitee AI...");
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/generate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey,
            },
            body: JSON.stringify({
              prompt,
              negative_prompt: negativePrompt,
              model,
              width,
              height,
              num_inference_steps: steps,
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate image");

        generatedUrl =
          data.url ||
          (data.b64_json
            ? `data:image/png;base64,${data.b64_json}`
            : undefined);
      } else {
        addStatus(`Sending request to HF Spaces (${apiProvider})...`);
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/generate-hf`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(hfToken && { "X-HF-Token": hfToken }),
            },
            body: JSON.stringify({
              prompt,
              width,
              height,
              model: apiProvider === "hf-qwen" ? "qwen" : "zimage",
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate image");
        generatedUrl = data.url;
      }

      if (!generatedUrl) throw new Error("No image returned");
      addStatus("Image generated!");

      if (upscale8k && generatedUrl.startsWith("http")) {
        addStatus("Upscaling to 8K...");
        try {
          const upRes = await fetch(
            `${import.meta.env.VITE_API_URL || ""}/api/upscale`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(hfToken && { "X-HF-Token": hfToken }),
              },
              body: JSON.stringify({ url: generatedUrl, scale: 4 }),
            }
          );

          const upData = await upRes.json();
          if (upRes.ok && upData.url) {
            generatedUrl = upData.url;
            addStatus("8K upscale complete!");
          } else {
            addStatus(`8K upscale failed: ${upData.error || "Unknown error"}`);
            toast.error("8K upscale failed, showing original image");
          }
        } catch (upErr) {
          addStatus(
            `8K upscale failed: ${upErr instanceof Error ? upErr.message : "Unknown error"}`
          );
          toast.error("8K upscale failed, showing original image");
        }
      }

      setImageUrl(generatedUrl ?? null);
      toast.success("Image generated!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      addStatus(`Error: ${msg}`);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return {
    // State
    apiKey,
    hfToken,
    apiProvider,
    prompt,
    negativePrompt,
    width,
    height,
    steps,
    loading,
    imageUrl,
    status,
    elapsed,
    selectedRatio,
    uhd,
    showInfo,
    isBlurred,
    isUpscaled,
    isUpscaling,
    // Setters
    setApiKey,
    setHfToken,
    setApiProvider,
    setPrompt,
    setNegativePrompt,
    setWidth,
    setHeight,
    setSteps,
    setShowInfo,
    setIsBlurred,
    // Handlers
    saveApiKey,
    saveHfToken,
    handleRatioSelect,
    handleUhdToggle,
    handleDownload,
    handleUpscale,
    handleDelete,
    handleGenerate,
  };
}
