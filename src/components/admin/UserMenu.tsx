"use client";

import { useState } from "react";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminSessionUser } from "@/lib/auth/types";

function initials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean);

  return `${parts[0] || "B"}${parts[1] || "A"}`.toUpperCase();
}

function sectorLabel(admin: AdminSessionUser) {
  const sectors = admin.sectors || [];
  if (!sectors.length) return "Sem setor";
  return sectors.map((sector) => sector.name).join(", ");
}

export function UserMenu({ admin }: { admin: AdminSessionUser }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 border-[var(--admin-border)] bg-white px-2 text-[var(--admin-foreground)] shadow-sm hover:text-[var(--admin-foreground)]"
        >
          <span className="grid size-6 place-items-center rounded-md bg-[var(--admin-cyan)] font-mono text-[10px] font-bold text-black">
            {initials(admin.name)}
          </span>
          <span className="hidden max-w-28 truncate text-xs font-semibold md:inline">{admin.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)] shadow-xl shadow-[rgba(81,60,36,0.12)]">
        <DropdownMenuLabel>
          <div className="text-sm">{admin.name}</div>
          <div className="mt-0.5 text-xs font-normal text-[var(--admin-muted)]">{admin.email}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--admin-cyan)]">{admin.role}</div>
          <div className="mt-1 truncate text-[10px] text-[var(--admin-muted)]">{sectorLabel(admin)}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-[var(--admin-soft)]">
          <User size={14} />
          Perfil
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-[var(--admin-red)]"
          disabled={isSigningOut}
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
        >
          <LogOut size={14} className={isSigningOut ? "animate-pulse" : ""} />
          {isSigningOut ? "Saindo..." : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
