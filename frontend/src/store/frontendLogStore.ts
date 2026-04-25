import { create } from 'zustand';

export type FrontendLogLevel = 'log' | 'info' | 'warn' | 'error';

export interface FrontendLogEntry {
  id: string;
  ts: number;
  level: FrontendLogLevel;
  msg: string;
  source?: string;
}

const MAX = 1000;

interface FrontendLogState {
  entries: FrontendLogEntry[];
  push: (e: Omit<FrontendLogEntry, 'id' | 'ts'>) => void;
  clear: () => void;
}

export const useFrontendLogStore = create<FrontendLogState>()((set) => ({
  entries: [],
  push: (e) =>
    set((s) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const next = [{ ...e, id, ts: Date.now() }, ...s.entries];
      if (next.length > MAX) next.length = MAX;
      return { entries: next };
    }),
  clear: () => set({ entries: [] }),
}));
