"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          className="relative border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-[var(--admin-soft)] hover:text-white"
        >
          <Bell size={16} />
          <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[var(--admin-red)] font-mono text-[9px] font-bold text-white">
            7
          </span>
          <span className="sr-only">Notificacoes</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 border-[var(--admin-border)] bg-[#0b0b0b] text-white">
        <DropdownMenuLabel>Alertas recentes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {[
          "7 riscos criticos aguardando acao",
          "19 itens em revisao juridica",
          "Mudanca de edital detectada",
        ].map((item) => (
          <DropdownMenuItem key={item} className="text-xs text-[var(--admin-soft)]">
            {item}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
