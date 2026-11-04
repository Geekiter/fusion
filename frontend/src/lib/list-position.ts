const STORAGE_KEY = "fusion-list-positions";
const MAX_POSITIONS = 40;
const MIN_SAVED_POSITION = 48;

interface ListPosition {
  top: number;
  updatedAt: number;
}

type ListPositionMap = Record<string, ListPosition>;

function readPositions(): ListPositionMap {
  if (typeof window === "undefined") return {};

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return {};

    const parsed = JSON.parse(value) as ListPositionMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePositions(positions: ListPositionMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Storage may be unavailable in private browsing or restricted contexts.
  }
}

export function getListScrollPosition(viewKey: string): number {
  if (!viewKey) return 0;

  const top = readPositions()[viewKey]?.top;
  return Number.isFinite(top) && top >= 0 ? top : 0;
}

export function saveListScrollPosition(viewKey: string, top: number): void {
  if (typeof window === "undefined" || !viewKey) return;

  const positions = readPositions();
  if (!Number.isFinite(top) || top < MIN_SAVED_POSITION) {
    delete positions[viewKey];
    writePositions(positions);
    return;
  }

  positions[viewKey] = {
    top: Math.round(top),
    updatedAt: Date.now(),
  };

  const recentEntries = Object.entries(positions)
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_POSITIONS);
  writePositions(Object.fromEntries(recentEntries));
}
