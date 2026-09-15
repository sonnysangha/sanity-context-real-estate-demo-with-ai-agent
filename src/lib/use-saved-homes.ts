"use client";
import { useSyncExternalStore } from "react";
const key = "homematch-saved",
  event = "homematch-saved-change";
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(event, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(event, notify);
  };
}
function getSnapshot() {
  try {
    return localStorage.getItem(key) || "[]";
  } catch {
    return "[]";
  }
}
export function useSavedHomes() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  let saved: string[] = [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) saved = data.filter((x) => typeof x === "string");
  } catch {}
  function toggle(id: string) {
    const next = saved.includes(id)
      ? saved.filter((x) => x !== id)
      : [...saved, id];
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(event));
  }
  return { saved, toggle };
}
