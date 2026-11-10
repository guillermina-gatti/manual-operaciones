// The procedures created in this browser session, kept in sessionStorage (spec 006). The API has no
// GET for procedures until HU11, so the screens work from this local copy: each answer of the API
// updates it. It is per user, and it may be out of date if the procedure is changed somewhere else.
import { useMemo, useSyncExternalStore } from 'react';
import type { ProcedureVersionStatus } from '@/lib/api/procedures';

export interface StoredStep {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface StoredProcedure {
  id: string;
  // The version the screens work on: a draft at first. When the history says it is no longer one
  // (it was published), the editor shows it read-only until a new draft is created.
  versionId: string;
  versionNumber: number;
  // The state of that version. A copy saved before this field existed has none: it is a draft.
  status?: ProcedureVersionStatus;
  title: string;
  description: string | null;
  areaIds: string[];
  steps: StoredStep[];
  createdAt: string;
}

const CHANGED = 'procedures:changed';
const keyOf = (userId: string) => `procedures:created:${userId}`;

// Only used when sessionStorage fails (private windows, blocked site data): the list then lasts
// as long as the page does.
const memory = new Map<string, string>();

function readRaw(userId: string): string | null {
  const key = keyOf(userId);
  try {
    const value = window.sessionStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // Falls back to the copy in memory.
  }
  return memory.get(key) ?? null;
}

function writeRaw(userId: string, list: StoredProcedure[]): void {
  const key = keyOf(userId);
  const raw = JSON.stringify(list);
  try {
    window.sessionStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    memory.set(key, raw);
  }
  // Every screen that shows the list hears about it, the storage event only reaches other tabs.
  window.dispatchEvent(new Event(CHANGED));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isStoredStep(value: unknown): value is StoredStep {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.order === 'number' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string'
  );
}

const STATUSES = new Set<unknown>(['DRAFT', 'PUBLISHED', 'SUPERSEDED']);

function isStoredProcedure(value: unknown): value is StoredProcedure {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.versionId === 'string' &&
    typeof value.versionNumber === 'number' &&
    (value.status === undefined || STATUSES.has(value.status)) &&
    typeof value.title === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    Array.isArray(value.areaIds) &&
    value.areaIds.every((id) => typeof id === 'string') &&
    Array.isArray(value.steps) &&
    value.steps.every(isStoredStep) &&
    typeof value.createdAt === 'string'
  );
}

// What is stored is not trusted: text that is not JSON, or entries of another shape, are left out.
export function parseProcedures(raw: string | null): StoredProcedure[] {
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isStoredProcedure) : [];
  } catch {
    return [];
  }
}

export function loadProcedures(userId: string): StoredProcedure[] {
  return parseProcedures(readRaw(userId));
}

export function loadProcedure(userId: string, id: string): StoredProcedure | null {
  return loadProcedures(userId).find((procedure) => procedure.id === id) ?? null;
}

// A new procedure goes first; one that is already there is replaced in the same place.
export function saveProcedure(userId: string, procedure: StoredProcedure): void {
  const list = loadProcedures(userId);
  const index = list.findIndex((item) => item.id === procedure.id);
  if (index >= 0) list[index] = procedure;
  else list.unshift(procedure);
  writeRaw(userId, list);
}

export function removeProcedure(userId: string, id: string): void {
  const list = loadProcedures(userId);
  const next = list.filter((procedure) => procedure.id !== id);
  if (next.length !== list.length) writeRaw(userId, next);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGED, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener('storage', callback);
  };
}

// The list of a user, always up to date. The snapshot is the raw text, so React compares it by
// value; the parsed list only changes when that text does. In the server render it is empty.
export function useStoredProcedures(userId: string | null): StoredProcedure[] {
  const raw = useSyncExternalStore(
    subscribe,
    () => (userId ? readRaw(userId) : null),
    () => null,
  );
  return useMemo(() => parseProcedures(raw), [raw]);
}
