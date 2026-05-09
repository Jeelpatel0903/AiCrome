import { useRef, useEffect } from 'react';
import { useActivityStore } from '../store/activity.store';
import type { ActivityEntry, ActivityStatus, ActivityType } from '../store/activity.store';

function statusIcon(status: ActivityStatus): string {
  switch (status) {
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'pending': return '⏳';
    case 'waiting': return '⌛';
    default: return '•';
  }
}

function typeColor(type: ActivityType): string {
  switch (type) {
    case 'error': return '#f87171';
    case 'action': return '#818cf8';
    case 'snapshot': return '#10b981';
    case 'diff': return '#f59e0b';
    case 'confirm': return '#f97316';
    case 'tool': return '#60a5fa';
    default: return '#94a3b8';
  }
}

interface EntryRowProps {
  entry: ActivityEntry;
}

function EntryRow({ entry }: EntryRowProps) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      padding: '6px 12px',
      borderBottom: '1px solid #1e293b',
      alignItems: 'flex-start',
      fontSize: '12px',
    }}>
      <span style={{ color: '#64748b', flexShrink: 0, minWidth: '60px' }}>{time}</span>
      <span style={{ flexShrink: 0 }}>{statusIcon(entry.status)}</span>
      <span style={{ flexShrink: 0, width: '8px', height: '8px', borderRadius: '50%', background: typeColor(entry.type), marginTop: '3px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e2e8f0', wordBreak: 'break-word' }}>{entry.message}</div>
        {entry.detail && (
          <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px', wordBreak: 'break-word' }}>{entry.detail}</div>
        )}
      </div>
      {entry.ref && (
        <span style={{ color: '#6366f1', fontSize: '11px', flexShrink: 0, fontFamily: 'monospace' }}>@{entry.ref}</span>
      )}
    </div>
  );
}

interface ActivityLogProps {
  sessionId?: string;
  maxHeight?: string;
}

export function ActivityLog({ sessionId, maxHeight = '300px' }: ActivityLogProps) {
  const entries = useActivityStore((s) => s.entries);
  const clearEntries = useActivityStore((s) => s.clearEntries);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = sessionId ? entries.filter((e) => !e.sessionId || e.sessionId === sessionId) : entries;

  // Auto-scroll to top (newest entries are first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
        No activity yet. Start a task to see the agent's actions.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid #334155',
      }}>
        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Activity ({filtered.length})</span>
        <button
          onClick={clearEntries}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '2px 6px',
          }}
        >
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        style={{
          maxHeight,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {filtered.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
      </div>
    </div>
  );
}
