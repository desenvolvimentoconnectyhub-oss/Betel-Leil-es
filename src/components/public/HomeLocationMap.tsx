"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { LocateFixed, MapPin, Navigation, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type GeoPoint = {
  label: string;
  detail: string;
  lat: number;
  lng: number;
  radiusKm: number;
};

type MapPoint = GeoPoint & {
  x: number;
  y: number;
};

const officeLocation: GeoPoint = {
  label: "Base Betel",
  detail: "Rua Jose Eugenio Muller, 1173 - Itajai/SC",
  lat: -26.9078,
  lng: -48.6619,
  radiusKm: 0,
};

const knownLocations: GeoPoint[] = [
  { label: "Itajai/SC", detail: "Regiao da sede", lat: -26.9078, lng: -48.6619, radiusKm: 8 },
  { label: "Balneario Camboriu/SC", detail: "Litoral Norte SC", lat: -26.9906, lng: -48.6347, radiusKm: 9 },
  { label: "Navegantes/SC", detail: "Entorno portuario", lat: -26.8943, lng: -48.6546, radiusKm: 7 },
  { label: "Porto Belo/SC", detail: "Costa Esmeralda", lat: -27.1578, lng: -48.5537, radiusKm: 10 },
  { label: "Florianopolis/SC", detail: "Grande Florianopolis", lat: -27.5949, lng: -48.5482, radiusKm: 18 },
  { label: "Joinville/SC", detail: "Norte catarinense", lat: -26.3044, lng: -48.8487, radiusKm: 16 },
  { label: "Curitiba/PR", detail: "Parana", lat: -25.4284, lng: -49.2733, radiusKm: 20 },
  { label: "Sao Paulo/SP", detail: "Capital paulista", lat: -23.5558, lng: -46.6396, radiusKm: 24 },
];

const opportunityDots = [
  { x: 35, y: 34, tone: "cyan" },
  { x: 67, y: 27, tone: "green" },
  { x: 61, y: 58, tone: "yellow" },
  { x: 42, y: 70, tone: "green" },
  { x: 78, y: 66, tone: "cyan" },
  { x: 25, y: 55, tone: "yellow" },
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function projectPoint(point: GeoPoint, focus: GeoPoint): MapPoint {
  const lngDelta = point.lng - focus.lng;
  const latDelta = point.lat - focus.lat;

  return {
    ...point,
    x: Math.min(88, Math.max(12, 50 + lngDelta * 420)),
    y: Math.min(82, Math.max(18, 50 - latDelta * 340)),
  };
}

function fallbackLocation(query: string): GeoPoint {
  const normalized = normalizeText(query) || "itajai";
  const seed = Array.from(normalized).reduce((total, char) => total + char.charCodeAt(0), 0);
  const latOffset = ((seed % 17) - 8) / 100;
  const lngOffset = (((seed * 7) % 19) - 9) / 100;

  return {
    label: query.trim(),
    detail: "Regiao pesquisada",
    lat: officeLocation.lat + latOffset,
    lng: officeLocation.lng + lngOffset,
    radiusKm: 10,
  };
}

function findLocation(query: string) {
  const normalized = normalizeText(query);
  if (!normalized) return null;

  return (
    knownLocations.find((item) => {
      const label = normalizeText(item.label);
      return label.includes(normalized) || normalized.includes(label.split("/")[0]);
    }) || fallbackLocation(query)
  );
}

function Marker({
  point,
  variant,
}: {
  point: MapPoint;
  variant: "office" | "search";
}) {
  return (
    <div
      className={cn(
        "absolute z-[1] -translate-x-1/2 -translate-y-1/2",
        variant === "office" ? "text-[var(--gold)]" : "text-[var(--cyan)]"
      )}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      <div
        className={cn(
          "grid size-9 place-items-center rounded-full border bg-[#08090b]/90 shadow-[0_0_30px_rgba(216,173,88,0.22)]",
          variant === "office" ? "border-[rgba(216,173,88,0.52)]" : "border-[rgba(110,199,214,0.58)]"
        )}
      >
        {variant === "office" ? <LocateFixed size={17} /> : <MapPin size={17} />}
      </div>
      <div className="mt-2 hidden min-w-36 rounded-md border border-[var(--line)] bg-[#08090b]/86 px-2 py-1 text-xs text-white shadow-xl backdrop-blur sm:block">
        <div className="font-semibold">{point.label}</div>
        <div className="truncate text-[10px] text-[var(--muted)]">{point.detail}</div>
      </div>
    </div>
  );
}

export function HomeLocationMap({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [searchedLocation, setSearchedLocation] = useState<GeoPoint | null>(null);
  const focus = searchedLocation || officeLocation;
  const officePoint = useMemo(() => projectPoint(officeLocation, focus), [focus]);
  const searchPoint = useMemo(
    () => (searchedLocation ? projectPoint(searchedLocation, focus) : null),
    [focus, searchedLocation]
  );
  const circleStyle: CSSProperties | undefined = searchPoint && searchedLocation
    ? {
        left: `${searchPoint.x}%`,
        top: `${searchPoint.y}%`,
        width: `${Math.min(38, Math.max(22, searchedLocation.radiusKm * 1.7))}%`,
        aspectRatio: "1 / 1",
      }
    : undefined;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const location = findLocation(query);
    setSearchedLocation(location);
  }

  function resetToOffice() {
    setQuery("");
    setSearchedLocation(null);
  }

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[#071014]" />
      <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(110,199,214,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(110,199,214,0.1)_1px,transparent_1px)] [background-size:54px_54px]" />
      <div className="absolute -left-[10%] top-[18%] h-[34%] w-[118%] rotate-[-9deg] rounded-full border border-[rgba(110,199,214,0.16)] bg-[rgba(110,199,214,0.05)] blur-[0.2px]" />
      <div className="absolute left-[6%] top-[64%] h-[18%] w-[86%] rotate-[4deg] rounded-full border border-[rgba(216,173,88,0.13)]" />
      <div className="absolute inset-y-0 right-0 w-[34%] bg-[linear-gradient(90deg,transparent,rgba(13,56,62,0.45))]" />

      <svg className="absolute inset-0 h-full w-full opacity-70" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M4 57 C18 48 26 62 41 53 C56 44 63 55 77 45 C86 39 94 42 99 36" fill="none" stroke="rgba(216,173,88,0.24)" strokeWidth="0.45" />
        <path d="M18 4 C24 20 20 37 31 49 C43 63 39 79 48 98" fill="none" stroke="rgba(110,199,214,0.25)" strokeWidth="0.4" />
        <path d="M72 0 C68 18 74 34 66 50 C58 66 65 82 61 100" fill="none" stroke="rgba(248,241,223,0.13)" strokeWidth="0.35" />
        <path d="M0 28 C20 25 35 31 53 24 C72 17 83 24 100 16" fill="none" stroke="rgba(248,241,223,0.11)" strokeWidth="0.32" />
        <path d="M6 82 C22 73 34 78 47 70 C64 59 76 65 94 54" fill="none" stroke="rgba(248,241,223,0.12)" strokeWidth="0.32" />
      </svg>

      {opportunityDots.map((dot, index) => (
        <span
          key={`${dot.x}-${dot.y}-${index}`}
          className={cn(
            "absolute z-[1] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_20px_currentColor]",
            dot.tone === "green" && "bg-[var(--green)] text-[var(--green)]",
            dot.tone === "yellow" && "bg-[var(--gold)] text-[var(--gold)]",
            dot.tone === "cyan" && "bg-[var(--cyan)] text-[var(--cyan)]"
          )}
          style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
        />
      ))}

      {searchPoint && (
        <div
          className="absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(110,199,214,0.62)] bg-[rgba(110,199,214,0.12)] shadow-[0_0_70px_rgba(110,199,214,0.28)]"
          style={circleStyle}
        >
          <div className="absolute inset-0 rounded-full border border-[rgba(110,199,214,0.42)] animate-ping" />
        </div>
      )}

      <Marker point={officePoint} variant="office" />
      {searchPoint && <Marker point={searchPoint} variant="search" />}

      <form
        onSubmit={handleSearch}
        className="absolute bottom-5 right-5 z-30 flex w-[min(92vw,430px)] items-center gap-2 rounded-lg border border-[var(--line)] bg-[#08090b]/86 p-2 shadow-2xl backdrop-blur-md"
      >
        <Search size={16} className="ml-2 shrink-0 text-[var(--gold)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cidade, bairro ou regiao"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[var(--muted)]"
        />
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-[var(--gold)] px-3 text-xs font-bold text-[#141007] transition hover:bg-[var(--betel-gold-soft)]"
        >
          <Navigation size={14} />
          Buscar
        </button>
        {searchedLocation && (
          <button
            type="button"
            onClick={resetToOffice}
            className="hidden h-9 shrink-0 rounded-md border border-[var(--line)] px-3 text-xs font-semibold text-white transition hover:border-[var(--gold)] sm:inline-flex sm:items-center"
          >
            Sede
          </button>
        )}
      </form>

      <div className="absolute left-5 top-24 z-20 hidden rounded-lg border border-[var(--line)] bg-[#08090b]/76 px-3 py-2 text-xs text-[var(--muted)] backdrop-blur md:block">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          {searchedLocation ? "Regiao ativa" : "Inicio"}
        </div>
        <div className="mt-1 font-semibold text-white">{searchedLocation?.label || officeLocation.label}</div>
      </div>
    </div>
  );
}
