"use client";

import { formatDistance } from "@/lib/distance";
import type { WaterApiResponse, WaterSpot } from "@/lib/types";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

const WaterMap = dynamic(() => import("@/components/WaterMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--map-wash)] text-[var(--muted)]">
      Loading map…
    </div>
  ),
});

const RADIUS_STEPS = [1500, 3000, 5000, 10000] as const;
const MIAMI_CENTER = { lat: 25.7617, lon: -80.1918 };

type Status =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "denied" };

function mapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

function nextRadius(current: number): number | null {
  const idx = RADIUS_STEPS.indexOf(current as (typeof RADIUS_STEPS)[number]);
  if (idx === -1) {
    const larger = RADIUS_STEPS.find((r) => r > current);
    return larger ?? null;
  }
  return RADIUS_STEPS[idx + 1] ?? null;
}

export default function FindWaterApp() {
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [radius, setRadius] = useState<number>(RADIUS_STEPS[0]);
  const [spots, setSpots] = useState<WaterSpot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [sheetOpen, setSheetOpen] = useState(true);

  const selected = useMemo(
    () => spots.find((s) => s.id === selectedId) ?? null,
    [spots, selectedId],
  );

  const fetchWater = useCallback(
    async (lat: number, lon: number, searchRadius: number) => {
      setStatus({ kind: "loading" });
      setSelectedId(null);
      try {
        const res = await fetch(
          `/api/water?lat=${lat}&lon=${lon}&radius=${searchRadius}`,
        );
        const data = (await res.json()) as WaterApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Could not load water spots.");
        }
        setSpots(data.spots);
        setRadius(data.radius);
        setStatus({ kind: "ready" });
        if (data.spots.length > 0) {
          setSelectedId(data.spots[0].id);
        }
      } catch (err) {
        setSpots([]);
        setStatus({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Could not load water spots.",
        });
      }
    },
    [],
  );

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus({
        kind: "error",
        message: "Geolocation is not supported in this browser.",
      });
      return;
    }

    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        setCenter(next);
        setRadius(RADIUS_STEPS[0]);
        void fetchWater(next.lat, next.lon, RADIUS_STEPS[0]);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus({ kind: "denied" });
        } else {
          setStatus({
            kind: "error",
            message: "Could not get your location. Tap the map to pin a spot.",
          });
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, [fetchWater]);

  useEffect(() => {
    locate();
  }, [locate]);

  const onMapClick = (lat: number, lon: number) => {
    setCenter({ lat, lon });
    setRadius(RADIUS_STEPS[0]);
    void fetchWater(lat, lon, RADIUS_STEPS[0]);
  };

  const useMiami = () => {
    setCenter(MIAMI_CENTER);
    setRadius(RADIUS_STEPS[0]);
    void fetchWater(MIAMI_CENTER.lat, MIAMI_CENTER.lon, RADIUS_STEPS[0]);
  };

  const expandRadius = () => {
    if (!center) return;
    const larger = nextRadius(radius);
    if (larger == null) return;
    setRadius(larger);
    void fetchWater(center.lat, center.lon, larger);
  };

  const refresh = () => {
    if (!center) {
      locate();
      return;
    }
    void fetchWater(center.lat, center.lon, radius);
  };

  const mapCenter: [number, number] = center
    ? [center.lat, center.lon]
    : [MIAMI_CENTER.lat, MIAMI_CENTER.lon];

  const largerRadius = nextRadius(radius);
  const isBusy = status.kind === "locating" || status.kind === "loading";

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-3 p-4 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl bg-[var(--panel)]/95 px-4 py-3 shadow-[var(--shadow)] backdrop-blur-md">
          <p className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--brand)]">
            FindWater
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Nearest free drinking water
          </p>
        </div>
        <div className="pointer-events-auto flex flex-col gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={isBusy}
            className="rounded-full bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow)] transition hover:bg-[var(--brand-deep)] disabled:opacity-60"
          >
            Use my location
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={isBusy || !center}
            className="rounded-full bg-[var(--panel)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[var(--shadow)] transition hover:bg-white disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <WaterMap
          center={mapCenter}
          radius={radius}
          spots={spots}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setSheetOpen(true);
          }}
          onMapClick={onMapClick}
        />

        {(status.kind === "locating" || status.kind === "loading") && (
          <div className="absolute inset-x-0 top-24 z-[900] flex justify-center px-4">
            <p className="rounded-full bg-[var(--panel)]/95 px-4 py-2 text-sm text-[var(--ink)] shadow-[var(--shadow)] backdrop-blur-md">
              {status.kind === "locating"
                ? "Getting your location…"
                : "Searching OpenStreetMap…"}
            </p>
          </div>
        )}

        {(status.kind === "denied" || status.kind === "error") && !center && (
          <div className="absolute inset-x-4 top-28 z-[900] mx-auto max-w-md rounded-2xl bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
            <p className="font-medium text-[var(--ink)]">
              {status.kind === "denied"
                ? "Location permission needed"
                : status.message}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Tap anywhere on the map to pin a search point, or try downtown
              Miami.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={locate}
                className="rounded-full bg-[var(--brand)] px-3 py-2 text-sm text-white"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={useMiami}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
              >
                Use downtown Miami
              </button>
            </div>
          </div>
        )}
      </div>

      <section
        className={`absolute inset-x-0 bottom-0 z-[1000] transition-transform duration-300 ease-out ${
          sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
        }`}
      >
        <div className="mx-auto max-w-lg rounded-t-3xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_-8px_40px_rgba(15,60,70,0.12)]">
          <button
            type="button"
            aria-label={sheetOpen ? "Collapse list" : "Expand list"}
            onClick={() => setSheetOpen((v) => !v)}
            className="flex w-full flex-col items-center pt-3 pb-2"
          >
            <span className="h-1.5 w-10 rounded-full bg-[var(--line)]" />
          </button>

          <div className="flex items-center justify-between gap-3 px-4 pb-3">
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">
                {status.kind === "ready" && spots.length === 0
                  ? "No free water mapped nearby"
                  : `${spots.length} spot${spots.length === 1 ? "" : "s"} within ${(radius / 1000).toFixed(1)} km`}
              </p>
              {status.kind === "ready" && spots.length === 0 && (
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  OSM coverage varies — empty does not always mean no water.
                </p>
              )}
              {status.kind === "error" && center && (
                <p className="mt-0.5 text-xs text-red-700">{status.message}</p>
              )}
            </div>
            {largerRadius != null && (
              <button
                type="button"
                onClick={expandRadius}
                disabled={isBusy}
                className="shrink-0 rounded-full border border-[var(--brand)] px-3 py-1.5 text-xs font-medium text-[var(--brand-deep)] disabled:opacity-60"
              >
                Expand to {(largerRadius / 1000).toFixed(1)} km
              </button>
            )}
          </div>

          <ul className="max-h-[42vh] space-y-2 overflow-y-auto px-4 pb-4">
            {spots.map((spot) => {
              const active = spot.id === selectedId;
              return (
                <li key={spot.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(spot.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                        : "border-[var(--line)] bg-white hover:border-[var(--brand)]/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--ink)]">
                          {spot.name ?? spot.type}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {spot.name ? spot.type : "OpenStreetMap point"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-[var(--brand-deep)]">
                        {formatDistance(spot.distanceMeters)}
                      </span>
                    </div>
                    {active && (
                      <a
                        href={mapsLink(spot.lat, spot.lon)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open in maps
                      </a>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <p className="sr-only">
              Selected {selected.name ?? selected.type},{" "}
              {formatDistance(selected.distanceMeters)} away
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
