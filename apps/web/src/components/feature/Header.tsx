import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function Header() {
  return (
    <div className="mb-8 text-center relative">
      <h1 className="text-5xl font-bold tracking-wider bg-gradient-to-r from-orange-400 via-orange-300 to-yellow-400 bg-clip-text text-transparent">
        ZENITH
      </h1>
      <p className="text-zinc-500 mt-2 text-sm">
        AI-Powered Image Generation
      </p>
      <Link
        to="/flow"
        className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Try Flow Mode
      </Link>
    </div>
  );
}
