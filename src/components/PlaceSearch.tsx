"use client";

import type { PlaceResult, PlaceSearchResponse } from "@/lib/types";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type PlaceSearchProps = {
  disabled?: boolean;
  onSelectPlace: (place: PlaceResult) => void;
};

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;

export default function PlaceSearch({
  disabled = false,
  onSelectPlace,
}: PlaceSearchProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const selectPlace = useCallback(
    (place: PlaceResult) => {
      setQuery(place.label);
      setResults([]);
      close();
      onSelectPlace(place);
      inputRef.current?.blur();
    },
    [close, onSelectPlace],
  );

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const scheduleSearch = useCallback(
    (trimmed: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();

      if (trimmed.length < MIN_CHARS) {
        setResults([]);
        setError(null);
        setLoading(false);
        close();
        return;
      }

      setLoading(true);
      setError(null);

      debounceRef.current = setTimeout(() => {
        const controller = new AbortController();
        abortRef.current = controller;

        void (async () => {
          try {
            const res = await fetch(
              `/api/places/search?q=${encodeURIComponent(trimmed)}`,
              { signal: controller.signal },
            );
            const data = (await res.json()) as PlaceSearchResponse & {
              error?: string;
            };
            if (!res.ok) {
              throw new Error(data.error ?? "Could not search places.");
            }
            setResults(data.places);
            setOpen(data.places.length > 0);
            setActiveIndex(-1);
          } catch (err) {
            if (controller.signal.aborted) return;
            setResults([]);
            setError(
              err instanceof Error ? err.message : "Could not search places.",
            );
            setOpen(true);
          } finally {
            if (!controller.signal.aborted) setLoading(false);
          }
        })();
      }, DEBOUNCE_MS);
    },
    [close],
  );

  const onQueryChange = (next: string) => {
    setQuery(next);
    scheduleSearch(next.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectPlace(results[activeIndex]);
    } else if (event.key === "Escape") {
      close();
    }
  };

  const showDropdown =
    open && (loading || error != null || results.length > 0);

  return (
    <div ref={rootRef} className="relative w-full">
      <label htmlFor="fw-place-search" className="sr-only">
        Search for a place anywhere in the world
      </label>
      <input
        ref={inputRef}
        id="fw-place-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => {
          if (results.length > 0 || error) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        placeholder="Search any city or place…"
        className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)]/95 px-4 py-3 text-sm text-[var(--ink)] shadow-[var(--shadow)] backdrop-blur-md outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--brand)] disabled:opacity-60"
      />

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-[1100] max-h-64 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] py-1 shadow-[var(--shadow)]"
        >
          {loading && results.length === 0 && !error && (
            <li className="px-4 py-2.5 text-sm text-[var(--muted)]">
              Searching…
            </li>
          )}
          {error && (
            <li className="px-4 py-2.5 text-sm text-red-700">{error}</li>
          )}
          {results.map((place, index) => {
            const active = index === activeIndex;
            return (
              <li key={place.id} role="presentation">
                <button
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectPlace(place)}
                  className={`w-full px-4 py-2.5 text-left transition ${
                    active
                      ? "bg-[var(--brand-soft)]"
                      : "hover:bg-[var(--brand-soft)]/60"
                  }`}
                >
                  <span className="block text-sm font-medium text-[var(--ink)]">
                    {place.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                    {place.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
