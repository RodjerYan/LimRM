
import { SearchItem } from "./useSearchEverywhereItems";

const KEY = "search_recent_v1";
const MAX = 10;

export function pushRecent(item: SearchItem) {
  try {
    const list: SearchItem[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    // Filter out existing item with same id to avoid duplicates, then prepend new item
    const next = [item, ...list.filter((i) => i.id !== item.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.error("Failed to save recent search", e);
  }
}

export function getRecent(): SearchItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch (e) {
    return [];
  }
}
