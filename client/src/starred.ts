// Stars are per-browser, stored in localStorage. No sign-in, no server call.
// Matches the "subscription-is-identity" model: a device has its own picks.

import { useCallback, useEffect, useState } from "react";

const KEY = "la28_starred_v1";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function write(s: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify([...s]));
  window.dispatchEvent(new CustomEvent("la28-starred-change"));
}

export function useStarred() {
  const [set, setSet] = useState<Set<string>>(() => read());

  useEffect(() => {
    const onChange = () => setSet(read());
    window.addEventListener("la28-starred-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("la28-starred-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const next = new Set(read());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  }, []);

  const isStarred = useCallback((id: string) => set.has(id), [set]);

  return { starred: set, toggle, isStarred, count: set.size };
}

export function getStarredIdsNow(): string[] {
  return [...read()];
}
