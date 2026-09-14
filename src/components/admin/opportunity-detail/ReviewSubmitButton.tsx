"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReviewSubmitButton({ children, disabled, value, ...props }: ComponentProps<typeof Button>) {
  const { pending, data } = useFormStatus();
  const selected = data?.get("submitStatus") === value;
  const approving = value === "approved" || value === "approved_with_notes";
  return (
    <Button {...props} disabled={disabled || pending} value={value} aria-busy={pending && selected}>
      {pending && selected ? <><LoaderCircle size={14} className="animate-spin" />{approving ? "Verificando e aprovando..." : "Salvando..."}</> : children}
    </Button>
  );
}

export function ReviewSubmissionProgress() {
  const { pending, data } = useFormStatus();
  if (!pending || !["approved", "approved_with_notes", "human_review", "rejected"].includes(String(data?.get("submitStatus")))) return null;
  return <p role="status" aria-live="polite" className="rounded-lg border border-[var(--admin-border)] bg-white p-3 text-sm text-[var(--admin-muted)]">Processando a revisao. A verificacao dos anuncios pode levar alguns segundos. Aguarde a confirmacao antes de tentar novamente.</p>;
}
