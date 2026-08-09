"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import { saveSystemWhatsAppSenderConfig } from "@/lib/communication/system-whatsapp-sender";

const managerRoles = new Set(["owner", "admin", "manager"]);

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function redirectWith(status: "success" | "error", message: string): never {
  const params = new URLSearchParams({ tab: "remetente", status, message });
  redirect(`/admin/mensagens?${params.toString()}`);
}

async function requireWhatsAppManager() {
  const admin = await requireCurrentAdmin();
  if (!managerRoles.has(admin.role)) {
    redirectWith("error", "Seu perfil nao pode configurar agentes WhatsApp.");
  }
  return admin;
}

function revalidateWhatsAppSender() {
  revalidatePath("/admin");
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/remetente");
  revalidatePath("/admin/mensagens");
  revalidatePath("/admin/scraper");
}

export async function saveSystemWhatsappSenderAction(formData: FormData) {
  const admin = await requireWhatsAppManager();
  const result = await saveSystemWhatsAppSenderConfig({
    instanceId: field(formData, "instanceId"),
    operatorLabel: admin.name || admin.email || "Admin Betel",
  });

  if (!result.ok) redirectWith("error", result.error || "Nao foi possivel salvar o remetente WhatsApp.");
  revalidateWhatsAppSender();
  redirectWith(
    "success",
    result.data?.instanceId
      ? "Remetente WhatsApp do sistema salvo."
      : "Remetente WhatsApp do sistema voltou para o padrao global."
  );
}
