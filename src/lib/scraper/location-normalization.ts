const UF_CODES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const STATE_ALIASES: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  distritofederal: "DF",
  espiritosanto: "ES",
  goias: "GO",
  maranhao: "MA",
  matogrosso: "MT",
  matogrossodosul: "MS",
  minasgerais: "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  riodejaneiro: "RJ",
  riograndedonorte: "RN",
  riograndedosul: "RS",
  rondonia: "RO",
  roraima: "RR",
  santacatarina: "SC",
  saopaulo: "SP",
  sergipe: "SE",
  tocantins: "TO",
};

const EMPTY_LOCATION_KEYS = new Set([
  "",
  "naoinformado",
  "naoinformada",
  "naoidentificado",
  "naoidentificada",
  "n/a",
  "na",
  "-",
]);

const UF_PATTERN = new RegExp(`\\b(${UF_CODES.join("|")})\\b`, "i");

function cleanString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeKey(value: unknown) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/.-]+/g, "");
}

function stateUfFromText(value: unknown) {
  const text = cleanString(value);
  if (!text) return "";
  const ufMatch = text.match(UF_PATTERN);
  if (ufMatch) return ufMatch[1].toUpperCase();
  return STATE_ALIASES[normalizeKey(text).replace(/[^a-z]/g, "")] || "";
}

export function normalizeLocationName(value: unknown) {
  let text = cleanString(value)
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, "");
  if (!text) return "";

  for (let index = 0; index < 4; index += 1) {
    const next = text
      .replace(/^(?:cidade|municipio|município|comarca|bairro|distrito|estado)\s*(?:de|da|do|das|dos|em|na|no|nas|nos)?\s+/i, "")
      .replace(/^(?:em|na|no|nas|nos|de|da|do|das|dos)\s+/i, "")
      .replace(/^[\s,.;:/-]+/, "")
      .trim();
    if (next === text) break;
    text = next;
  }

  const commaParts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length > 1 && stateUfFromText(commaParts[commaParts.length - 1])) {
    text = commaParts.slice(0, -1).join(", ");
  }

  const dashMatch = text.match(/^(.*?)\s+-\s+(.+)$/);
  if (dashMatch && stateUfFromText(dashMatch[2])) {
    text = dashMatch[1].trim();
  }

  text = text
    .replace(new RegExp(`\\s*(?:/|-)\\s*(?:${UF_CODES.join("|")})\\s*$`, "i"), "")
    .replace(new RegExp(`\\s*\\((?:${UF_CODES.join("|")})\\)\\s*$`, "i"), "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, "");

  const key = normalizeKey(text);
  return EMPTY_LOCATION_KEYS.has(key) ? "" : text;
}

export function normalizeStateUf(value: unknown) {
  const normalized = normalizeLocationName(value);
  const uf = stateUfFromText(normalized) || stateUfFromText(value);
  if (uf) return uf;

  const letters = normalized.replace(/[^A-Za-z]/g, "").toUpperCase();
  return /^[A-Z]{2}$/.test(letters) ? letters : "";
}
