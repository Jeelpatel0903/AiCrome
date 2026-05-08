import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import type { IdentityPublic, Memory, MemoryType } from '../../../shared/src/types';

type Tab = 'agent' | 'memory' | 'vault' | 'flows' | 'schedule';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'agent', label: 'Agent', icon: '🤖' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'vault', label: 'Vault', icon: '🔐' },
  { id: 'flows', label: 'Flows', icon: '📋' },
  { id: 'schedule', label: 'Schedule', icon: '⏰' },
];

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// ==================== LOGIN SCREEN ====================

function LoginScreen() {
  const { setError, error } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Email sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0f172a',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: '64px', marginBottom: '12px' }}>🤖</div>
      <h1
        style={{
          color: '#818cf8',
          fontSize: '22px',
          fontWeight: 'bold',
          margin: '0 0 8px 0',
        }}
      >
        DevFlow AI
      </h1>
      <p
        style={{
          color: '#64748b',
          fontSize: '13px',
          textAlign: 'center',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}
      >
        Your AI-powered browser automation assistant
      </p>

      {!showEmailForm ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          <button
            onClick={() => void handleGoogleSignIn()}
            disabled={loading}
            style={{
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>
          <button
            onClick={() => {
              setShowEmailForm(true);
              setError(null);
            }}
            disabled={loading}
            style={{
              background: 'transparent',
              color: 'white',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Sign in with Email
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleEmailSignIn(e)}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#e2e8f0',
              fontSize: '13px',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#e2e8f0',
              fontSize: '13px',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowEmailForm(false);
              setError(null);
            }}
            disabled={loading}
            style={{
              background: 'transparent',
              color: '#64748b',
              border: 'none',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ← Back
          </button>
        </form>
      )}

      {error && (
        <p
          style={{
            color: '#f87171',
            fontSize: '12px',
            marginTop: '12px',
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ==================== MEMORY TAB ====================

const MEMORY_TYPE_ICONS: Record<MemoryType, string> = {
  preference: '🎯',
  fact: '📌',
  rule: '⚡',
  identity_hint: '👤',
};

const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  preference: 'Preferences',
  fact: 'Facts',
  rule: 'Rules',
  identity_hint: 'Identity Hints',
};

type MemoryFilterType = 'all' | MemoryType;
type AddMode = 'natural' | 'manual';

interface MemoryTabProps {
  token: string;
}

function detectTypeFromContent(content: string): MemoryType {
  const lower = content.toLowerCase();
  if (lower.includes('agar') || lower.includes('if') || lower.includes('jab')) return 'rule';
  if (
    lower.includes('hamesha') ||
    lower.includes('always') ||
    lower.includes('default') ||
    lower.includes('hota hai')
  )
    return 'preference';
  return 'fact';
}

function formatMemoryAge(lastUsed?: string): string {
  if (!lastUsed) return 'Never used';
  const diff = Date.now() - new Date(lastUsed).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

function MemoryTab({ token }: MemoryTabProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MemoryFilterType>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('natural');
  const [naturalContent, setNaturalContent] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [manualType, setManualType] = useState<MemoryType>('fact');
  const [manualSitePattern, setManualSitePattern] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSitePattern, setEditSitePattern] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchMemories = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${backendUrl}/memory/all?pageSize=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: Memory[];
        error?: string;
      };
      if (!json.success) throw new Error(json.error ?? 'Failed to fetch memories');
      setMemories(json.data ?? []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFetchError(e.message ?? 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMemories = memories.filter((m) => {
    const matchesType = filterType === 'all' || m.type === filterType;
    const matchesSearch =
      !searchQuery ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const resetAddForm = () => {
    setNaturalContent('');
    setManualContent('');
    setManualType('fact');
    setManualSitePattern('');
    setFormError(null);
    setShowAddForm(false);
  };

  const handleAddMemory = async () => {
    setFormError(null);
    let content: string;
    let type: MemoryType;
    let sitePattern: string | undefined;

    if (addMode === 'natural') {
      if (!naturalContent.trim()) {
        setFormError('Content is required');
        return;
      }
      content = naturalContent.trim();
      type = detectTypeFromContent(content);
      sitePattern = undefined;
    } else {
      if (!manualContent.trim()) {
        setFormError('Content is required');
        return;
      }
      content = manualContent.trim();
      type = manualType;
      sitePattern = manualSitePattern.trim() || undefined;
    }

    setFormLoading(true);
    try {
      const res = await fetch(`${backendUrl}/memory`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, type, sitePattern }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      resetAddForm();
      await fetchMemories();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFormError(e.message ?? 'Save failed');
    } finally {
      setFormLoading(false);
    }
  };

  const openEdit = (memory: Memory) => {
    setEditingMemory(memory);
    setEditContent(memory.content);
    setEditSitePattern(memory.sitePattern ?? '');
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editingMemory) return;
    if (!editContent.trim()) {
      setEditError('Content is required');
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const body: { content: string; sitePattern?: string } = { content: editContent.trim() };
      if (editSitePattern.trim()) body.sitePattern = editSitePattern.trim();
      const res = await fetch(`${backendUrl}/memory/${editingMemory.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Update failed');
      setEditingMemory(null);
      await fetchMemories();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setEditError(e.message ?? 'Update failed');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${backendUrl}/memory/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Delete failed');
      setDeleteConfirmId(null);
      await fetchMemories();
    } catch {
      // Silently sync
      await fetchMemories();
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', color: '#475569', marginTop: '60px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid #334155',
            borderTop: '3px solid #6366f1',
            borderRadius: '50%',
            margin: '0 auto 12px',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p>Loading memories...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={{ textAlign: 'center', color: '#f87171', marginTop: '40px', padding: '16px' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
        <p style={{ fontSize: '13px' }}>{fetchError}</p>
        <button
          onClick={() => void fetchMemories()}
          style={{
            marginTop: '12px',
            background: '#6366f1',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const filterButtons: { id: MemoryFilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'preference', label: 'Preferences' },
    { id: 'fact', label: 'Facts' },
    { id: 'rule', label: 'Rules' },
    { id: 'identity_hint', label: 'Identity Hints' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Search bar */}
      <input
        type="text"
        placeholder="Search memories..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#e2e8f0',
          fontSize: '13px',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />

      {/* Filter row */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {filterButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => setFilterType(btn.id)}
            style={{
              background: filterType === btn.id ? '#6366f1' : 'transparent',
              border: `1px solid ${filterType === btn.id ? '#6366f1' : '#334155'}`,
              borderRadius: '16px',
              padding: '4px 10px',
              color: filterType === btn.id ? 'white' : '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
              whiteSpace: 'nowrap',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Memory Cards */}
      {filteredMemories.length === 0 && !showAddForm ? (
        <div style={{ textAlign: 'center', color: '#475569', marginTop: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧠</div>
          <p style={{ fontSize: '14px' }}>
            {searchQuery || filterType !== 'all'
              ? 'No memories match your filter.'
              : 'AI is learning your preferences. Start using DevFlow!'}
          </p>
        </div>
      ) : (
        filteredMemories.map((memory) => (
          <div
            key={memory.id}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            {editingMemory?.id === memory.id ? (
              /* Inline edit form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    resize: 'none',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
                <input
                  type="text"
                  placeholder="Site pattern (optional)"
                  value={editSitePattern}
                  onChange={(e) => setEditSitePattern(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
                {editError && (
                  <p style={{ color: '#f87171', fontSize: '11px', margin: 0 }}>{editError}</p>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => void handleEditSave()}
                    disabled={editLoading}
                    style={{
                      flex: 1,
                      background: '#6366f1',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px',
                      color: 'white',
                      cursor: editLoading ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      opacity: editLoading ? 0.7 : 1,
                    }}
                  >
                    {editLoading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingMemory(null)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Memory card view */
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }}>
                    {MEMORY_TYPE_ICONS[memory.type]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        color: '#e2e8f0',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {memory.content}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {memory.sitePattern && (
                        <span
                          style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '10px',
                            padding: '1px 7px',
                            fontSize: '10px',
                            color: '#94a3b8',
                          }}
                        >
                          {memory.sitePattern}
                        </span>
                      )}
                      <span style={{ fontSize: '10px', color: '#475569' }}>
                        {formatMemoryAge(memory.lastUsed)}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '10px',
                          color: '#475569',
                          textTransform: 'capitalize',
                        }}
                      >
                        {MEMORY_TYPE_LABELS[memory.type]}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(memory)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        padding: '3px',
                        color: '#94a3b8',
                      }}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(memory.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        padding: '3px',
                        color: '#94a3b8',
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Delete confirmation */}
                {deleteConfirmId === memory.id && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '10px',
                      background: '#0f172a',
                      borderRadius: '8px',
                      border: '1px solid #ef4444',
                    }}
                  >
                    <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#fca5a5' }}>
                      Delete this memory? This cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => void handleDelete(memory.id)}
                        style={{
                          background: '#ef4444',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))
      )}

      {/* Add Memory button / form */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            background: '#6366f1',
            border: 'none',
            borderRadius: '8px',
            padding: '10px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            width: '100%',
            marginTop: '4px',
          }}
        >
          + Add Memory
        </button>
      ) : (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', fontWeight: '600' }}>
              Add Memory
            </h3>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setAddMode('natural')}
                style={{
                  background: addMode === 'natural' ? '#6366f1' : 'transparent',
                  border: `1px solid ${addMode === 'natural' ? '#6366f1' : '#334155'}`,
                  borderRadius: '6px',
                  padding: '3px 8px',
                  color: addMode === 'natural' ? 'white' : '#64748b',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Natural
              </button>
              <button
                onClick={() => setAddMode('manual')}
                style={{
                  background: addMode === 'manual' ? '#6366f1' : 'transparent',
                  border: `1px solid ${addMode === 'manual' ? '#6366f1' : '#334155'}`,
                  borderRadius: '6px',
                  padding: '3px 8px',
                  color: addMode === 'manual' ? 'white' : '#64748b',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Manual
              </button>
            </div>
          </div>

          {addMode === 'natural' ? (
            <textarea
              value={naturalContent}
              onChange={(e) => setNaturalContent(e.target.value)}
              placeholder="Yaad rakhlo ke..."
              rows={3}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '10px',
                color: '#e2e8f0',
                fontSize: '13px',
                resize: 'none',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <>
              <select
                value={manualType}
                onChange={(e) => setManualType(e.target.value as MemoryType)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <option value="preference">🎯 Preference</option>
                <option value="fact">📌 Fact</option>
                <option value="rule">⚡ Rule</option>
                <option value="identity_hint">👤 Identity Hint</option>
              </select>
              <textarea
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
                placeholder="Memory content..."
                rows={3}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  resize: 'none',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              <input
                type="text"
                placeholder="Site pattern (optional, e.g. hrportal.com)"
                value={manualSitePattern}
                onChange={(e) => setManualSitePattern(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </>
          )}

          {formError && (
            <p style={{ color: '#f87171', fontSize: '12px', margin: 0 }}>{formError}</p>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => void handleAddMemory()}
              disabled={formLoading}
              style={{
                flex: 1,
                background: '#6366f1',
                border: 'none',
                borderRadius: '8px',
                padding: '10px',
                color: 'white',
                cursor: formLoading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                opacity: formLoading ? 0.7 : 1,
              }}
            >
              {formLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={resetAddForm}
              disabled={formLoading}
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '10px',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== VAULT TAB ====================

interface VaultFormData {
  name: string;
  siteUrl: string;
  username: string;
  password: string;
}

interface VaultTabProps {
  token: string;
}

function VaultTab({ token }: VaultTabProps) {
  const [identities, setIdentities] = useState<IdentityPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState<VaultFormData>({
    name: '',
    siteUrl: '',
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchIdentities = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${backendUrl}/vault/identities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: IdentityPublic[];
        error?: string;
      };
      if (!json.success) throw new Error(json.error ?? 'Failed to fetch identities');
      setIdentities(json.data ?? []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFetchError(e.message ?? 'Failed to load identities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchIdentities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredIdentities = identities.filter(
    (id) =>
      id.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      id.siteUrl.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const resetForm = () => {
    setFormData({ name: '', siteUrl: '', username: '', password: '' });
    setFormError(null);
    setShowPassword(false);
    setEditingId(null);
    setShowForm(false);
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (identity: IdentityPublic) => {
    setFormData({
      name: identity.name,
      siteUrl: identity.siteUrl,
      username: identity.username,
      password: '',
    });
    setFormError(null);
    setShowPassword(false);
    setEditingId(identity.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError(null);
    if (!formData.name.trim()) {
      setFormError('Display Name is required');
      return;
    }
    if (!formData.siteUrl.trim()) {
      setFormError('Site URL is required');
      return;
    }
    try {
      new URL(formData.siteUrl);
    } catch {
      setFormError('Site URL must be a valid URL (e.g. https://example.com)');
      return;
    }
    if (!formData.username.trim()) {
      setFormError('Username is required');
      return;
    }
    if (!editingId && !formData.password.trim()) {
      setFormError('Password is required');
      return;
    }

    setFormLoading(true);
    try {
      let res: Response;
      if (editingId) {
        const body: Partial<VaultFormData> = {
          name: formData.name,
          siteUrl: formData.siteUrl,
          username: formData.username,
        };
        if (formData.password.trim()) body.password = formData.password;
        res = await fetch(`${backendUrl}/vault/identity/${editingId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${backendUrl}/vault/identity`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });
      }
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      resetForm();
      await fetchIdentities();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFormError(e.message ?? 'Save failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${backendUrl}/vault/identity/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Delete failed');
      setDeleteConfirmId(null);
      await fetchIdentities();
    } catch {
      // Silently retry or show nothing — fetchIdentities will re-sync
    }
  };

  const formatLastUsed = (lastUsed?: string): string => {
    if (!lastUsed) return 'Never';
    const diff = Date.now() - new Date(lastUsed).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', color: '#475569', marginTop: '60px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid #334155',
            borderTop: '3px solid #6366f1',
            borderRadius: '50%',
            margin: '0 auto 12px',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p>Loading identities...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={{ textAlign: 'center', color: '#f87171', marginTop: '40px', padding: '16px' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
        <p style={{ fontSize: '13px' }}>{fetchError}</p>
        <button
          onClick={() => void fetchIdentities()}
          style={{
            marginTop: '12px',
            background: '#6366f1',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Search and Add */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search identities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#e2e8f0',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          onClick={openAddForm}
          style={{
            background: '#6366f1',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 12px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
            whiteSpace: 'nowrap',
          }}
        >
          + Add
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '14px', fontWeight: '600' }}>
            {editingId ? 'Edit Identity' : 'Add Identity'}
          </h3>

          <input
            type="text"
            placeholder="Display Name *"
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            style={inputStyle}
          />
          <input
            type="url"
            placeholder="Site URL * (e.g. https://example.com)"
            value={formData.siteUrl}
            onChange={(e) => setFormData((p) => ({ ...p, siteUrl: e.target.value }))}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Username *"
            value={formData.username}
            onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
            style={inputStyle}
          />
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={editingId ? 'Password (leave blank to keep)' : 'Password *'}
              value={formData.password}
              onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
              style={{ ...inputStyle, paddingRight: '40px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#64748b',
              }}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {formError && (
            <p style={{ color: '#f87171', fontSize: '12px', margin: 0 }}>{formError}</p>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => void handleSave()}
              disabled={formLoading}
              style={{
                flex: 1,
                background: '#6366f1',
                border: 'none',
                borderRadius: '8px',
                padding: '10px',
                color: 'white',
                cursor: formLoading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                opacity: formLoading ? 0.7 : 1,
              }}
            >
              {formLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={resetForm}
              disabled={formLoading}
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '10px',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Identity List */}
      {filteredIdentities.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔐</div>
          <p style={{ fontSize: '14px' }}>
            {searchQuery
              ? 'No identities match your search.'
              : 'No identities saved yet. Add your first one!'}
          </p>
        </div>
      ) : (
        filteredIdentities.map((identity) => (
          <div
            key={identity.id}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Initial circle */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  color: 'white',
                  flexShrink: 0,
                }}
              >
                {identity.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + site */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 'bold',
                    fontSize: '13px',
                    color: '#e2e8f0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {identity.name}
                </p>
                <p
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '11px',
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {identity.siteUrl}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#475569' }}>
                  Last used: {formatLastUsed(identity.lastUsed)}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={() => openEditForm(identity)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '4px',
                    color: '#94a3b8',
                  }}
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  onClick={() => setDeleteConfirmId(identity.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '4px',
                    color: '#94a3b8',
                  }}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>

            {/* Delete Confirmation */}
            {deleteConfirmId === identity.id && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  background: '#0f172a',
                  borderRadius: '8px',
                  border: '1px solid #ef4444',
                }}
              >
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#fca5a5' }}>
                  Delete &quot;{identity.name}&quot;? Are you sure?
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => void handleDelete(identity.id)}
                    style={{
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '10px 12px',
  color: '#e2e8f0',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

// ==================== AGENT TAB ====================

interface ProgressMessage {
  type: string;
  message: string;
  timestamp: string;
}

interface ProgressUpdateMsg {
  type: string;
  type_?: string;
  sessionId?: string;
  message?: string;
  timestamp?: string;
}

interface AgentTabProps {
  token: string;
}

function getMessageStyle(msgType: string): React.CSSProperties {
  switch (msgType) {
    case 'tool_start':
      return { color: '#94a3b8', fontSize: '12px' };
    case 'tool_success':
      return { color: '#4ade80', fontSize: '12px' };
    case 'tool_error':
      return { color: '#f87171', fontSize: '12px' };
    case 'asking':
      return { color: '#fbbf24', fontSize: '13px' };
    case 'complete':
      return { color: '#4ade80', fontSize: '13px', fontWeight: 'bold' };
    default:
      return { color: '#e2e8f0', fontSize: '13px' };
  }
}

function getMessagePrefix(msgType: string): string {
  switch (msgType) {
    case 'tool_start':
      return '⚙️ ';
    case 'tool_success':
      return '✅ ';
    case 'tool_error':
      return '❌ ';
    case 'asking':
      return '❓ ';
    case 'complete':
      return '🎉 ';
    default:
      return '';
  }
}

function getCurrentUrl(): Promise<string> {
  return new Promise<string>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.url || '');
    });
  });
}

function AgentTab({ token }: AgentTabProps) {
  const [messages, setMessages] = useState<ProgressMessage[]>([]);
  const [command, setCommand] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to progress updates from background script
  useEffect(() => {
    const listener = (msg: ProgressUpdateMsg) => {
      if (msg.type === 'progress_update') {
        // Skip bridge_request messages from the feed
        const msgType = msg.type_ || 'message';
        if (msgType === 'bridge_request') return;

        setMessages((prev) => [
          ...prev,
          {
            type: msgType,
            message: msg.message || '',
            timestamp: msg.timestamp || new Date().toISOString(),
          },
        ]);

        if (msgType === 'complete' || msgType === 'error') {
          setIsRunning(false);
          setSessionId(null);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!command.trim() || isRunning) return;
    const cmd = command.trim();
    setCommand('');
    setRunError(null);
    setIsRunning(true);

    const currentUrl = await getCurrentUrl();

    try {
      const res = await fetch(`${backendUrl}/agent/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command: cmd, currentUrl }),
      });
      const json = (await res.json()) as {
        success: boolean;
        sessionId?: string;
        error?: string;
      };
      if (!json.success) {
        throw new Error(json.error ?? 'Failed to start agent');
      }
      if (json.sessionId) {
        setSessionId(json.sessionId);
      }
      // Add user command to feed
      setMessages((prev) => [
        ...prev,
        {
          type: 'user',
          message: cmd,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setRunError(e.message ?? 'Failed to start agent');
      setIsRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!sessionId) {
      setIsRunning(false);
      return;
    }
    try {
      await fetch(`${backendUrl}/agent/cancel/${sessionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore cancel errors
    } finally {
      setIsRunning(false);
      setSessionId(null);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setRunError(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header row with Clear button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '12px', color: '#475569' }}>
          {isRunning ? 'Agent is running...' : 'Agent ready'}
        </span>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '3px 10px',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          minHeight: 0,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🤖</div>
            <p style={{ fontSize: '15px', marginBottom: '8px' }}>Welcome to DevFlow AI</p>
            <p style={{ fontSize: '13px', color: '#334155' }}>
              Try: &quot;DSR bhar de&quot; or &quot;Login kardo&quot;
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            if (msg.type === 'user') {
              return (
                <div
                  key={i}
                  style={{
                    background: '#1e293b',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '13px',
                    color: '#e2e8f0',
                    borderLeft: '3px solid #6366f1',
                  }}
                >
                  <span style={{ color: '#818cf8', fontWeight: 'bold', marginRight: '6px' }}>
                    You:
                  </span>
                  {msg.message}
                </div>
              );
            }
            return (
              <div
                key={i}
                style={{
                  padding: '4px 6px',
                  borderRadius: '4px',
                  ...getMessageStyle(msg.type),
                }}
              >
                {getMessagePrefix(msg.type)}
                {msg.message}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {runError && (
        <p style={{ color: '#f87171', fontSize: '12px', margin: '6px 0 0 0' }}>{runError}</p>
      )}

      {/* Input + Cancel */}
      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {isRunning && (
          <button
            onClick={() => void handleCancel()}
            style={{
              background: '#ef4444',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              width: '100%',
            }}
          >
            Cancel
          </button>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type a command... (Enter to send, Shift+Enter for new line)"
            disabled={isRunning}
            style={{
              flex: 1,
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px',
              color: '#e2e8f0',
              fontSize: '13px',
              resize: 'none',
              minHeight: '42px',
              maxHeight: '120px',
              outline: 'none',
              opacity: isRunning ? 0.6 : 1,
            }}
            rows={1}
          />
          <button
            onClick={() => void handleSend()}
            disabled={isRunning || !command.trim()}
            style={{
              background: isRunning || !command.trim() ? '#374151' : '#6366f1',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              color: 'white',
              cursor: isRunning || !command.trim() ? 'not-allowed' : 'pointer',
              fontSize: '18px',
              minWidth: '44px',
              opacity: isRunning || !command.trim() ? 0.6 : 1,
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN SIDEPANEL ====================

function SidePanel() {
  const { user, token, isLoading, setUser, setToken, setLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('agent');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setUser(firebaseUser);
        setToken(idToken);
        // Store credentials and notify background script
        chrome.storage.local.set({ userId: firebaseUser.uid, authToken: idToken });
        chrome.runtime
          .sendMessage({ type: 'auth_changed', userId: firebaseUser.uid, token: idToken })
          .catch(() => {
            // Background may not be ready yet
          });
      } else {
        setUser(null);
        setToken(null);
        // Clear stored credentials and notify background script
        chrome.storage.local.remove(['userId', 'authToken']);
        chrome.runtime.sendMessage({ type: 'auth_logout' }).catch(() => {
          // Background may not be ready yet
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0f172a',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '4px solid #334155',
            borderTop: '4px solid #6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (user === null) {
    return <LoginScreen />;
  }

  const handleLogout = async () => {
    chrome.storage.local.remove(['userId', 'authToken']);
    chrome.runtime.sendMessage({ type: 'auth_logout' }).catch(() => {});
    await signOut(auth);
  };

  const displayName = user.displayName ?? user.email ?? 'U';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a' }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '20px' }}>🤖</span>
        <span style={{ fontWeight: 'bold', color: '#818cf8', fontSize: '16px' }}>DevFlow AI</span>
        <button
          onClick={() => void handleLogout()}
          title="Logout"
          style={{
            marginLeft: 'auto',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#6366f1',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          {initial}
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 4px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              color: activeTab === tab.id ? '#818cf8' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid #818cf8' : '2px solid transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <span style={{ fontSize: '16px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: activeTab === 'agent' ? 'hidden' : 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {activeTab === 'agent' && token && <AgentTab token={token} />}
        {activeTab === 'memory' && token && <MemoryTab token={token} />}
        {activeTab === 'vault' && token && <VaultTab token={token} />}
        {activeTab === 'flows' && (
          <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
            <p>No workflows saved yet.</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Record your first workflow!</p>
          </div>
        )}
        {activeTab === 'schedule' && (
          <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⏰</div>
            <p>No schedules set.</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Automate your routine tasks!</p>
          </div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<SidePanel />);
