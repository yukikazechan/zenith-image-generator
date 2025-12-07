import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ImageIcon,
  Download,
  Info,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import type { ApiProvider } from "@/lib/constants";

interface ImageResultCardProps {
  imageUrl: string | null;
  loading: boolean;
  elapsed: number;
  width: number;
  height: number;
  apiProvider: ApiProvider;
  showInfo: boolean;
  isBlurred: boolean;
  isUpscaled: boolean;
  isUpscaling: boolean;
  setShowInfo: (v: boolean) => void;
  setIsBlurred: (v: boolean) => void;
  handleUpscale: () => void;
  handleDownload: () => void;
  handleDelete: () => void;
}

export function ImageResultCard({
  imageUrl,
  loading,
  elapsed,
  width,
  height,
  apiProvider,
  showInfo,
  isBlurred,
  isUpscaled,
  isUpscaling,
  setShowInfo,
  setIsBlurred,
  handleUpscale,
  handleDownload,
  handleDelete,
}: ImageResultCardProps) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-zinc-500 text-sm font-normal">
          Result
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 group">
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt="Generated"
                className={`w-full transition-all duration-300 ${
                  isBlurred ? "blur-xl" : ""
                }`}
              />
              {/* Floating Toolbar */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl transition-opacity duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                  {/* Info */}
                  <button
                    onClick={() => setShowInfo(!showInfo)}
                    title="Details"
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
                      showInfo
                        ? "bg-orange-600 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Info className="w-5 h-5" />
                  </button>
                  <div className="w-px h-5 bg-white/10" />
                  {/* 4x Upscale */}
                  <button
                    onClick={handleUpscale}
                    disabled={isUpscaling || isUpscaled}
                    title={
                      isUpscaling
                        ? "Upscaling..."
                        : isUpscaled
                        ? "Already upscaled"
                        : "4x Upscale"
                    }
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
                      isUpscaled
                        ? "text-orange-400 bg-orange-500/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    } disabled:cursor-not-allowed`}
                  >
                    {isUpscaling ? (
                      <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                    ) : (
                      <span className="text-xs font-bold">4x</span>
                    )}
                  </button>
                  <div className="w-px h-5 bg-white/10" />
                  {/* Blur Toggle */}
                  <button
                    onClick={() => setIsBlurred(!isBlurred)}
                    title="Toggle Blur"
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
                      isBlurred
                        ? "text-orange-400 bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {isBlurred ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                  <div className="w-px h-5 bg-white/10" />
                  {/* Download */}
                  <button
                    onClick={handleDownload}
                    title="Download"
                    className="flex items-center justify-center w-10 h-10 rounded-xl transition-all text-white/70 hover:text-white hover:bg-white/10"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={handleDelete}
                    title="Delete"
                    className="flex items-center justify-center w-10 h-10 rounded-xl transition-all text-white/70 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* Info Panel */}
              {showInfo && (
                <div className="absolute top-3 left-3 right-3 p-3 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-xs text-zinc-300 space-y-1">
                  <div>
                    <span className="text-zinc-500">Size:</span> {width}×
                    {height}
                  </div>
                  <div>
                    <span className="text-zinc-500">API:</span> {apiProvider}
                  </div>
                  <div>
                    <span className="text-zinc-500">Upscaled:</span>{" "}
                    {isUpscaled ? "Yes (4x)" : "No"}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="aspect-square flex flex-col items-center justify-center text-zinc-600">
              {loading ? (
                <>
                  <div className="w-12 h-12 border-4 border-zinc-800 border-t-orange-500 rounded-full animate-spin mb-3" />
                  <span className="text-zinc-400 font-mono text-lg">
                    {elapsed.toFixed(1)}s
                  </span>
                  <span className="text-zinc-600 text-sm mt-1">
                    Creating your image...
                  </span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-12 h-12 text-zinc-700 mb-2" />
                  <span className="text-zinc-600 text-sm">
                    Your image will appear here
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
