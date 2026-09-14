import { normalizedText } from "./market-quality";

export function confirmedOccupancy(value: unknown) {
  const text = normalizedText(value);
  if (!text || text.length > 240 || /outras oportunidades|proximos leiloes|bens diversos|veiculos|imoveis desocupados/.test(text)) return "";
  if (/\b(?:nao informado|a confirmar|validar|nao confirmad|desconhecid)/.test(text)) return "";
  if (/\b(?:desocupado|desocupada|nao ocupado|nao ocupada)\b/.test(text)) return "Desocupado";
  if (/\b(?:ocupado|ocupada)\b/.test(text)) return "Ocupado";
  return "";
}

export function occupancyFromListingText(value: string) {
  const text = normalizedText(value);
  const match = text.match(/\b(?:ocupacao|situacao de ocupacao|imovel)\s*[:\-]?\s*(desocupad[oa]|ocupad[oa])\b/);
  return match ? confirmedOccupancy(match[1]) : "";
}
