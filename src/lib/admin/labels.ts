const adminRoleLabels: Record<string, string> = {
  owner: "Super admin",
  admin: "Administrador",
  manager: "Gestor",
  analyst: "Analista",
  viewer: "Visualizador",
};

export function adminRoleLabel(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return adminRoleLabels[normalized] || role || "Sem nivel";
}
