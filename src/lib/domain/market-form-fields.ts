export function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
export function numberField(formData: FormData, name: string, fallback = 0) {
  const raw = field(formData, name);
  if (!raw) return fallback;

  const compact = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(?:\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, "")
      : compact;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : fallback;
}
