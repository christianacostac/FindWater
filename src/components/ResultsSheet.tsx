"use client";

import { formatDistance } from "@/lib/distance";
import type { WaterSpot } from "@/lib/types";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const RADIUS_STEPS = [1000, 2000, 5000, 10000] as const;
export const DEFAULT_RADIUS = RADIUS_STEPS[1];

export type SheetSnap = "peek" | "mid";

type ResultsSheetProps = {
  spots: WaterSpot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  radius: number;
  onRadiusChange: (radius: number) => void;
  radiusDisabled?: boolean;
  summary: string;
  subtitle?: string | null;
  errorMessage?: string | null;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
};

function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

function radiusIndex(radius: number): number {
  const idx = RADIUS_STEPS.indexOf(radius as (typeof RADIUS_STEPS)[number]);
  if (idx !== -1) return idx;
  let best = 0;
  let bestDiff = Math.abs(RADIUS_STEPS[0] - radius);
  for (let i = 1; i < RADIUS_STEPS.length; i++) {
    const diff = Math.abs(RADIUS_STEPS[i] - radius);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return best;
}

function snapHeights(viewportHeight: number, peekHeight: number) {
  const mid = Math.round(viewportHeight * 0.45);
  const peek = Math.min(Math.max(peekHeight, 120), mid);
  return { peek, mid };
}

export default function ResultsSheet({
  spots,
  selectedId,
  onSelect,
  radius,
  onRadiusChange,
  radiusDisabled = false,
  summary,
  subtitle,
  errorMessage,
  snap,
  onSnapChange,
}: ResultsSheetProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [peekHeight, setPeekHeight] = useState(160);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    currentHeight: number;
    pointerId: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const skipClickRef = useRef(false);

  const heights = snapHeights(viewportHeight, peekHeight);
  const targetHeight = heights[snap];
  const height = dragHeight ?? targetHeight;

  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useLayoutEffect(() => {
    if (!headerRef.current) return;
    setPeekHeight(headerRef.current.offsetHeight);
  }, [summary, subtitle, errorMessage, radius]);

  const commitSnap = useCallback(
    (nextHeight: number, velocity: number) => {
      const candidates: SheetSnap[] = ["peek", "mid"];
      let best: SheetSnap = "mid";
      let bestScore = Number.POSITIVE_INFINITY;

      for (const key of candidates) {
        const distance = Math.abs(heights[key] - nextHeight);
        const bias =
          velocity > 400 && heights[key] > nextHeight
            ? -80
            : velocity < -400 && heights[key] < nextHeight
              ? -80
              : 0;
        const score = distance + bias;
        if (score < bestScore) {
          bestScore = score;
          best = key;
        }
      }

      onSnapChange(best);
      setDragHeight(null);
    },
    [heights, onSnapChange],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startHeight: height,
      currentHeight: height,
      pointerId: event.pointerId,
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
    };
    setDragHeight(height);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const now = performance.now();
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) > 4) drag.moved = true;
    const next = Math.min(
      heights.mid,
      Math.max(heights.peek, drag.startHeight - dy),
    );
    const dt = Math.max(now - drag.lastT, 1);
    drag.velocity = ((drag.lastY - event.clientY) / dt) * 1000;
    drag.lastY = event.clientY;
    drag.lastT = now;
    drag.currentHeight = next;
    setDragHeight(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) skipClickRef.current = true;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    commitSnap(drag.currentHeight, drag.velocity);
  };

  const onHandleClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    onSnapChange(snap === "peek" ? "mid" : "peek");
  };

  const sliderIndex = radiusIndex(radius);

  return (
    <section
      className={`absolute inset-x-0 bottom-0 z-[1000] flex justify-center ${
        dragHeight == null ? "transition-[height] duration-300 ease-out" : ""
      }`}
      style={{ height }}
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_-8px_40px_rgba(15,60,70,0.12)]">
        <div ref={headerRef} className="shrink-0">
          <div
            role="button"
            tabIndex={0}
            aria-label={`Results sheet, ${snap}. Drag to resize.`}
            className="touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={onHandleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onHandleClick();
              }
            }}
          >
            <div className="flex flex-col items-center pt-3 pb-2">
              <span className="h-1.5 w-10 rounded-full bg-[var(--line)]" />
            </div>

            <div className="px-4 pb-2">
              <p className="text-sm font-medium text-[var(--ink)]">{summary}</p>
              {subtitle ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>
              ) : null}
              {errorMessage ? (
                <p className="mt-0.5 text-xs text-red-700">{errorMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="px-4 pb-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label
                htmlFor="fw-radius"
                className="text-xs font-medium text-[var(--muted)]"
              >
                Search radius
              </label>
              <span className="text-xs font-medium text-[var(--brand-deep)]">
                {(radius / 1000).toFixed(radius >= 1000 ? 0 : 1)} km
              </span>
            </div>
            <input
              id="fw-radius"
              type="range"
              min={0}
              max={RADIUS_STEPS.length - 1}
              step={1}
              value={sliderIndex}
              disabled={radiusDisabled}
              onChange={(e) =>
                onRadiusChange(RADIUS_STEPS[Number(e.target.value)])
              }
              className="fw-radius-slider w-full"
              aria-valuetext={`${RADIUS_STEPS[sliderIndex] / 1000} kilometers`}
            />
            <div className="mt-1 flex justify-between px-0.5 text-[10px] text-[var(--muted)]">
              {RADIUS_STEPS.map((step) => (
                <span key={step}>{step / 1000} km</span>
              ))}
            </div>
          </div>
        </div>

        <ul className="fw-spot-list min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-4">
          {spots.map((spot) => {
            const active = spot.id === selectedId;
            return (
              <li key={spot.id}>
                <button
                  type="button"
                  onClick={() => onSelect(spot.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    active
                      ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-white hover:border-[var(--brand)]/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--ink)]">
                        {spot.displayName}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {spot.locationHint ?? spot.type}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-[var(--brand-deep)]">
                      {formatDistance(spot.distanceMeters)}
                    </span>
                  </div>
                  {active && (
                    <a
                      href={mapsLink(spot.latitude, spot.longitude)}
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
      </div>
    </section>
  );
}
