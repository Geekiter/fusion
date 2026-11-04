const STORAGE_KEY = "fusion-reading-positions";
const MAX_POSITIONS = 300;
const MIN_SAVED_POSITION = 24;
export const READING_POSITION_EVENT = "fusion-reading-position-change";

interface ReadingPosition {
  top: number;
  progress?: number;
  updatedAt: number;
}

type ReadingPositionMap = Record<string, ReadingPosition>;

function readPositions(): ReadingPositionMap {
  if (typeof window === "undefined") return {};

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return {};

    const parsed = JSON.parse(value) as ReadingPositionMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writePositions(positions: ReadingPositionMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Storage may be unavailable in private browsing or restricted contexts.
  }
}

function notifyPositionChange(itemId: number, progress: number): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(READING_POSITION_EVENT, {
      detail: { itemId, progress },
    }),
  );
}

export function getReadingPosition(itemId: number): number {
  if (itemId <= 0) return 0;

  const position = readPositions()[String(itemId)];
  return position && Number.isFinite(position.top) && position.top >= 0
    ? position.top
    : 0;
}

export function getReadingProgress(itemId: number): number {
  if (itemId <= 0) return 0;

  const progress = readPositions()[String(itemId)]?.progress;
  return progress && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, Math.round(progress)))
    : 0;
}

export function saveReadingPosition(
  itemId: number,
  top: number,
  progress = 0,
): void {
  if (typeof window === "undefined" || itemId <= 0) return;

  const positions = readPositions();
  const key = String(itemId);

  if (!Number.isFinite(top) || top < MIN_SAVED_POSITION) {
    delete positions[key];
    writePositions(positions);
    notifyPositionChange(itemId, 0);
    return;
  }

  positions[key] = {
    top: Math.round(top),
    progress: Math.min(100, Math.max(0, Math.round(progress))),
    updatedAt: Date.now(),
  };

  const recentEntries = Object.entries(positions)
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_POSITIONS);
  writePositions(Object.fromEntries(recentEntries));
  notifyPositionChange(itemId, positions[key].progress ?? 0);
}
