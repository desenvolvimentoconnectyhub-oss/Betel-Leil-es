"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeft } from "lucide-react";
import {
  getAdminModule,
  getCanonicalAdminHref,
} from "@/lib/admin/modules";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AdminSidebarContent } from "./AdminSidebar";
import { CommandSearch } from "./CommandSearch";
import { NotificationButton } from "./NotificationButton";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { UserMenu } from "./UserMenu";
import type { AdminSessionUser } from "@/lib/auth/types";

function getTitle(pathname: string) {
  if (pathname === "/admin") return "Dashboard";
  if (pathname === "/admin/maintenance") return "Manutencao";
  const slug = pathname.split("/").filter(Boolean)[1];
  return (slug && getAdminModule(slug)?.title) || "Admin";
}

export function AdminTopbar({ admin }: { admin: AdminSessionUser }) {
  const pathname = usePathname();
  const activeHref = getCanonicalAdminHref(pathname);
  const title = getTitle(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--admin-border)] bg-[rgba(5,5,5,0.88)] backdrop-blur-xl">
      <div className="flex min-h-16 items-center gap-3 px-4 lg:px-5">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon-lg"
              className="border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white lg:hidden"
            >
              <Menu size={17} />
              <span className="sr-only">Abrir menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[300px] border-[var(--admin-border)] bg-[var(--admin-sidebar)] p-0"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Menu administrativo</SheetTitle>
            </SheetHeader>
            <AdminSidebarContent activeHref={activeHref} />
          </SheetContent>
        </Sheet>

        <div className="hidden items-center gap-3 lg:flex">
          <PanelLeft size={17} className="text-[var(--admin-muted)]" />
          <div className="h-5 w-px bg-[var(--admin-border)]" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">
            <Link href="/admin" className="hover:text-white">
              Betel AI
            </Link>
            <span>/</span>
            <span className="truncate text-[var(--admin-soft)]">{title}</span>
          </div>
          <h1 className="truncate text-base font-semibold text-white">{title}</h1>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <CommandSearch />
          <NotificationButton />
          <ThemeSwitcher />
          <UserMenu admin={admin} />
        </div>
      </div>
    </header>
  );
}
