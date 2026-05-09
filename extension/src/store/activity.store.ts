import { create } from 'zustand';

export type ActivityType = 'action' | 'snapshot' | 'tool' | 'message' | 'error' | 'confirm' | 'diff';
export type ActivityStatus = 'pending' | 'success' | 'failed' | 'waiting';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  message: string;
  detail?: string;
  timestamp: string;
  sessionId?: string;
  ref?: string;       // element ref like "e3" if applicable
}

interface ActivityState {
  entries: ActivityEntry[];
  maxEntries: number;
  addEntry: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => string;
  updateEntry: (id: string, update: Partial<Pick<ActivityEntry, 'status' | 'detail' | 'message'>>) => void;
  clearEntries: () => void;
  clearOldEntries: (sessionId: string) => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],
  maxEntries: 100,

  addEntry: (entry) => {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newEntry: ActivityEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      entries: [newEntry, ...state.entries].slice(0, state.maxEntries),
    }));
    return id;
  },

  updateEntry: (id, update) => {
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...update } : e)),
    }));
  },

  clearEntries: () => set({ entries: [] }),

  clearOldEntries: (sessionId) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.sessionId !== sessionId),
    }));
  },
}));
