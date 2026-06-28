"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const themes = ["Default", "Focus", "Audit"];

export function ThemeSwitcher() {
  const [active, setActive] = useState("Default");

  return (
    <div className="hidden h-9 items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-2 lg:flex">
      <Moon size={15} className="text-[var(--admin-soft)]" />
      <div className="flex gap-1">
        {themes.map((theme) => (
          <button
            key={theme}
            type="button"
            onClick={() => setActive(theme)}
            className={cn(
              "size-4 rounded-full border border-[var(--admin-border)]",
              active === theme ? "bg-white" : "bg-[var(--admin-card-2)]"
            )}
            aria-label={`Tema ${theme}`}
          />
        ))}
      </div>
      <span className="font-mono text-xs font-semibold text-white">{active}</span>
      <Sun size={14} className="sr-only" />
    </div>
  );
}
