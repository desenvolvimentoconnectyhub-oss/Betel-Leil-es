"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const scopeByModule: Record<string, string> = {
  "meta-ads": "meta_ads",
  "google-ads": "google_ads",
  "google-analytics": "google_analytics",
  "trafego-organico": "meta_social",
  "caixa-meta": "meta_social",
  criativos: "all",
  "meta-whatsapp-chat": "meta_social",
};

export function TrafficAiSyncButton({ moduleSlug }: { moduleSlug: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const scope = useMemo(() => scopeByModule[moduleSlug] || "all", [moduleSlug]);

  async function handleSync() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/traffic-ai/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, moduleSlug }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Falha ao enviar sync para o Inngest.");
      }
      setMessage("Sync enviado para o Inngest.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        onClick={handleSync}
        disabled={loading}
        variant="outline"
        className="h-9 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Sincronizar
      </Button>
      {message && <span className="max-w-52 text-[11px] leading-4 text-[var(--admin-muted)]">{message}</span>}
    </div>
  );
}
