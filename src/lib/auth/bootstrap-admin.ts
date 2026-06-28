export const bootstrapAdmin = {
  displayName: "Magno Macedo",
  email: "connectyhub01@gmail.com",
  phone: "47988577996",
  organizationName: "Betel Leiloes",
} as const;

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length !== 11) return value;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
