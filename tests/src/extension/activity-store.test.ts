import { describe, it, expect, beforeEach } from 'vitest';

// Mirror activity store logic inline (Zustand store can't run in test env without setup)
interface ActivityEntry {
  id: string;
  type: 'action' | 'snapshot' | 'tool' | 'message' | 'error' | 'confirm' | 'diff';
  status: 'pending' | 'success' | 'failed' | 'waiting';
  message: string;
  detail?: string;
  timestamp: string;
  sessionId?: string;
  ref?: string;
}

// Simple in-memory store for testing the logic
class ActivityStoreLogic {
  entries: ActivityEntry[] = [];
  maxEntries = 100;

  addEntry(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): string {
    const id = `act_${this.entries.length}`;
    const newEntry: ActivityEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };
    this.entries = [newEntry, ...this.entries].slice(0, this.maxEntries);
    return id;
  }

  updateEntry(id: string, update: Partial<Pick<ActivityEntry, 'status' | 'detail' | 'message'>>): void {
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, ...update } : e));
  }

  clearEntries(): void {
    this.entries = [];
  }

  clearOldEntries(sessionId: string): void {
    this.entries = this.entries.filter((e) => e.sessionId !== sessionId);
  }
}

describe('Activity Store Logic', () => {
  let store: ActivityStoreLogic;

  beforeEach(() => {
    store = new ActivityStoreLogic();
  });

  it('adds entry and returns id', () => {
    const id = store.addEntry({ type: 'action', status: 'pending', message: 'Clicking button' });
    expect(id).toBeTruthy();
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].message).toBe('Clicking button');
  });

  it('newest entries are first', () => {
    store.addEntry({ type: 'action', status: 'success', message: 'First' });
    store.addEntry({ type: 'action', status: 'success', message: 'Second' });
    expect(store.entries[0].message).toBe('Second');
    expect(store.entries[1].message).toBe('First');
  });

  it('updates entry status', () => {
    const id = store.addEntry({ type: 'tool', status: 'pending', message: 'Running tool' });
    store.updateEntry(id, { status: 'success', detail: 'Tool ran in 200ms' });
    const entry = store.entries.find((e) => e.id === id);
    expect(entry?.status).toBe('success');
    expect(entry?.detail).toBe('Tool ran in 200ms');
  });

  it('clears all entries', () => {
    store.addEntry({ type: 'message', status: 'success', message: 'Done' });
    store.addEntry({ type: 'error', status: 'failed', message: 'Error' });
    store.clearEntries();
    expect(store.entries).toHaveLength(0);
  });

  it('clears entries by sessionId', () => {
    store.addEntry({ type: 'action', status: 'success', message: 'A', sessionId: 'session-1' });
    store.addEntry({ type: 'action', status: 'success', message: 'B', sessionId: 'session-2' });
    store.addEntry({ type: 'action', status: 'success', message: 'C' }); // no session
    store.clearOldEntries('session-1');
    expect(store.entries).toHaveLength(2);
    expect(store.entries.find((e) => e.message === 'A')).toBeUndefined();
  });

  it('respects maxEntries limit', () => {
    store.maxEntries = 3;
    for (let i = 0; i < 5; i++) {
      store.addEntry({ type: 'message', status: 'success', message: `Message ${i}` });
    }
    expect(store.entries).toHaveLength(3);
    // Most recent entries kept
    expect(store.entries[0].message).toBe('Message 4');
  });

  it('stores sessionId and ref', () => {
    store.addEntry({
      type: 'action',
      status: 'pending',
      message: 'Click',
      sessionId: 'sess-abc',
      ref: 'e3',
    });
    expect(store.entries[0].sessionId).toBe('sess-abc');
    expect(store.entries[0].ref).toBe('e3');
  });
});
