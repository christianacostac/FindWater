"use client";

import ResultsSheet, {
  DEFAULT_RADIUS,
  type SheetSnap,
} from "@/components/ResultsSheet";
import type {
  WaterApiResponse,
  WaterHintResponse,
  WaterSpot,
} from "@/lib/types";
import {
  patchWaterCacheHint,
  readWaterSearch,
  rememberWaterSearch,
} from "@/lib/waterCache";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WaterMap = dynamic(() => import("@/components/WaterMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--map-wash)] text-[var(--muted)]">
      Loading map…
    </div>
  ),
});

const MIAMI_CENTER = { latitude: 25.7617, longitude: -80.1918 };

type Status =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "denied" };

export default function FindWaterApp() {
  const [center, setCenter] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [spots, setSpots] = useState<WaterSpot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hintLoadingId, setHintLoadingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("mid");
  const radiusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintResolvedRef = useRef(new Set<string>());
  const hintAbortRef = useRef<AbortController | null>(null);

  const selected = useMemo(
    () => spots.find((s) => s.id === selectedId) ?? null,
    [spots, selectedId],
  );

  const applySpots = useCallback((nextSpots: WaterSpot[], nextRadius: number) => {
    setSpots(nextSpots);
    setRadius(nextRadius);
    setStatus({ kind: "ready" });
    setSelectedId(nextSpots.length > 0 ? nextSpots[0].id : null);
  }, []);

  const fetchWater = useCallback(
    async (latitude: number, longitude: number, searchRadius: number) => {
      setSelectedId(null);
      setHintLoadingId(null);
      hintResolvedRef.current = new Set();
      hintAbortRef.current?.abort();

      // Same cell + same/smaller radius within TTL → skip Overpass.
      const cached = readWaterSearch(latitude, longitude, searchRadius);
      if (cached) {
        applySpots(cached, searchRadius);
        return;
      }

      setStatus({ kind: "loading" });
      try {
        const res = await fetch(
          `/api/water?latitude=${latitude}&longitude=${longitude}&radius=${searchRadius}`,
        );
        const data = (await res.json()) as WaterApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Could not load water spots.");
        }
        rememberWaterSearch(latitude, longitude, data.radius, data.spots);
        applySpots(data.spots, data.radius);
      } catch (err) {
        setSpots([]);
        setStatus({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Could not load water spots.",
        });
      }
    },
    [applySpots],
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
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setCenter(next);
        setRadius(DEFAULT_RADIUS);
        void fetchWater(next.latitude, next.longitude, DEFAULT_RADIUS);
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
    // Defer so geolocation setState is not synchronous inside the effect body.
    const timer = window.setTimeout(() => locate(), 0);
    return () => window.clearTimeout(timer);
  }, [locate]);

  useEffect(() => {
    return () => {
      if (radiusDebounceRef.current) clearTimeout(radiusDebounceRef.current);
      hintAbortRef.current?.abort();
    };
  }, []);

  // Road/park "Near …" hints load only for the selected spot.
  useEffect(() => {
    if (!selected) return;

    // Address tags already on the water element — no extra request.
    if (selected.locationHint) {
      hintResolvedRef.current.add(selected.id);
      return;
    }
    if (hintResolvedRef.current.has(selected.id)) return;

    const spotId = selected.id;
    const { latitude, longitude } = selected;
    const controller = new AbortController();
    hintAbortRef.current?.abort();
    hintAbortRef.current = controller;
    setHintLoadingId(spotId);

    void (async () => {
      try {
        const res = await fetch(
          `/api/water/hint?latitude=${latitude}&longitude=${longitude}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as WaterHintResponse & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "Could not load location hint.");
        }
        hintResolvedRef.current.add(spotId);
        if (data.locationHint) {
          patchWaterCacheHint(spotId, data.locationHint);
          setSpots((prev) =>
            prev.map((s) =>
              s.id === spotId ? { ...s, locationHint: data.locationHint } : s,
            ),
          );
        }
      } catch {
        if (controller.signal.aborted) return;
        // Soft-fail: keep showing the spot type; mark resolved so we don't loop.
        hintResolvedRef.current.add(spotId);
      } finally {
        if (!controller.signal.aborted) {
          setHintLoadingId((current) => (current === spotId ? null : current));
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [selected]);

  const onMapClick = (latitude: number, longitude: number) => {
    setCenter({ latitude, longitude });
    void fetchWater(latitude, longitude, radius);
  };

  const useMiami = () => {
    setCenter(MIAMI_CENTER);
    setRadius(DEFAULT_RADIUS);
    void fetchWater(
      MIAMI_CENTER.latitude,
      MIAMI_CENTER.longitude,
      DEFAULT_RADIUS,
    );
  };

  const onRadiusChange = (nextRadius: number) => {
    setRadius(nextRadius);
    if (!center) return;
    if (radiusDebounceRef.current) clearTimeout(radiusDebounceRef.current);
    radiusDebounceRef.current = setTimeout(() => {
      void fetchWater(center.latitude, center.longitude, nextRadius);
    }, 250);
  };

  const refresh = () => {
    if (!center) {
      locate();
      return;
    }
    void fetchWater(center.latitude, center.longitude, radius);
  };

  const mapCenter: [number, number] = center
    ? [center.latitude, center.longitude]
    : [MIAMI_CENTER.latitude, MIAMI_CENTER.longitude];

  const isBusy = status.kind === "locating" || status.kind === "loading";

  const summary =
    status.kind === "ready" && spots.length === 0
      ? "No free water mapped nearby"
      : `${spots.length} spot${spots.length === 1 ? "" : "s"} within ${(radius / 1000).toFixed(radius % 1000 === 0 ? 0 : 1)} km`;

  const subtitle =
    status.kind === "ready" && spots.length === 0
      ? "OSM coverage varies — empty does not always mean no water."
      : null;

  const errorMessage =
    status.kind === "error" && center ? status.message : null;

  const selectSpot = (id: string) => {
    setSelectedId(id);
  };

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
          hintLoadingId={hintLoadingId}
          onSelect={(id) => {
            selectSpot(id);
            setSheetSnap("mid");
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

      <ResultsSheet
        spots={spots}
        selectedId={selectedId}
        hintLoadingId={hintLoadingId}
        onSelect={selectSpot}
        radius={radius}
        onRadiusChange={onRadiusChange}
        radiusDisabled={isBusy || !center}
        summary={summary}
        subtitle={subtitle}
        errorMessage={errorMessage}
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
      />

      {selected && (
        <p className="sr-only">
          Selected {selected.displayName}
          {selected.locationHint ? `, ${selected.locationHint}` : ""},{" "}
          {selected.distanceMeters} m away
        </p>
      )}
    </div>
  );
}
