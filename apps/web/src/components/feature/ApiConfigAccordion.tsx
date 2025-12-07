import { Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApiProvider } from "@/lib/constants";

interface ApiConfigAccordionProps {
  apiKey: string;
  hfToken: string;
  apiProvider: ApiProvider;
  setApiKey: (key: string) => void;
  setHfToken: (token: string) => void;
  setApiProvider: (provider: ApiProvider) => void;
  saveApiKey: (key: string) => void;
  saveHfToken: (token: string) => void;
}

export function ApiConfigAccordion({
  apiKey,
  hfToken,
  apiProvider,
  setApiKey,
  setHfToken,
  setApiProvider,
  saveApiKey,
  saveHfToken,
}: ApiConfigAccordionProps) {
  return (
    <Accordion
      type="single"
      collapsible
      className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-4"
    >
      <AccordionItem value="api" className="border-none">
        <AccordionTrigger className="text-zinc-300 hover:no-underline">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span>API Configuration</span>
            {apiKey && (
              <span className="text-xs text-green-500">● Configured</span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 pb-2">
            <div>
              <Label className="text-zinc-400 text-xs">API Provider</Label>
              <Select
                value={apiProvider}
                onValueChange={(v) => setApiProvider(v as ApiProvider)}
              >
                <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900/70 backdrop-blur-md border-zinc-700">
                  <SelectItem value="gitee">Gitee AI</SelectItem>
                  <SelectItem value="hf-zimage">HF Z-Image Turbo</SelectItem>
                  <SelectItem value="hf-qwen">HF Qwen Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {apiProvider === "gitee" ? (
              <div>
                <Label className="text-zinc-400 text-xs">Gitee API Key</Label>
                <Input
                  type="password"
                  placeholder="Enter your Gitee AI API Key..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={(e) => saveApiKey(e.target.value)}
                  className="mt-1 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            ) : (
              <div>
                <Label className="text-zinc-400 text-xs">
                  HF Token (Optional)
                </Label>
                <Input
                  type="password"
                  placeholder="For extra quota..."
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  onBlur={(e) => saveHfToken(e.target.value)}
                  className="mt-1 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
