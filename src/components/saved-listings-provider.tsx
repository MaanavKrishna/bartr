"use client";

import * as React from "react";

const STORAGE_KEY = "bartr:saved-listings";

interface SavedListingsValue {
  savedIds: string[];
  /** False until localStorage has been read, so SSR and first paint agree. */
  hydrated: boolean;
  isSaved: (id: string) => boolean;
  toggle: (id: string) => boolean;
  clear: () => void;
}

const SavedListingsContext = React.createContext<SavedListingsValue | null>(
  null
);

function readStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    // Private browsing, disabled storage, or corrupt JSON — start empty.
    return [];
  }
}

export function SavedListingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [savedIds, setSavedIds] = React.useState<string[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setSavedIds(readStorage());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedIds));
    } catch {
      // Nothing useful to do if the write fails; saves stay in memory.
    }
  }, [savedIds, hydrated]);

  // Keep multiple tabs in sync.
  React.useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setSavedIds(readStorage());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = React.useMemo<SavedListingsValue>(() => {
    const set = new Set(savedIds);
    return {
      savedIds,
      hydrated,
      isSaved: id => set.has(id),
      toggle: id => {
        const nowSaved = !set.has(id);
        setSavedIds(current =>
          nowSaved ? [id, ...current] : current.filter(entry => entry !== id)
        );
        return nowSaved;
      },
      clear: () => setSavedIds([]),
    };
  }, [savedIds, hydrated]);

  return (
    <SavedListingsContext.Provider value={value}>
      {children}
    </SavedListingsContext.Provider>
  );
}

export function useSavedListings(): SavedListingsValue {
  const context = React.useContext(SavedListingsContext);
  if (!context) {
    throw new Error(
      "useSavedListings must be used inside <SavedListingsProvider>"
    );
  }
  return context;
}
