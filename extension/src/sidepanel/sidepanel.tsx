import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import type { IdentityPublic, Memory, MemoryType } from '../../../shared/src/types';

type Tab = 'agent' | 'memory' | 'vault' | 'flows' | 'schedule' | 'settings';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'agent', label: 'Agent', icon: '🤖' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'vault', label: 'Vault', icon: '🔐' },
  { id: 'flows', label: 'Flows', icon: '📋' },
  { id: 'schedule', label: 'Schedule', icon: '⏰' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
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
      if (typeof chrome === 'undefined' || !chrome.identity?.getAuthToken) {
        throw new Error('Google sign-in is only available inside the Chrome extension.');
      }
      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!token) {
            reject(new Error('No auth token returned by Chrome'));
          } else {
            resolve(token);
          }
        });
      });
      const credential = GoogleAuthProvider.credential(null, token);
      await signInWithCredential(auth, credential);
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

interface SessionEntry {
  sessionId: string;
  command: string;
  messages: ProgressMessage[];
  status: 'running' | 'complete' | 'error';
  startedAt: string;
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
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [showPrevSessions, setShowPrevSessions] = useState(false);
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice input toggle
  const toggleVoice = () => {
    type SpeechRecCtor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onresult: ((event: any) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start(): void;
      stop(): void;
    };
    const winAny = window as Window & {
      SpeechRecognition?: SpeechRecCtor;
      webkitSpeechRecognition?: SpeechRecCtor;
    };
    const SpeechRec = winAny.SpeechRecognition ?? winAny.webkitSpeechRecognition;

    if (!SpeechRec) {
      alert('Voice input not supported in this browser');
      return;
    }

    if (isListening) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const transcript: string = event.results[0][0].transcript;
      setCommand((prev) => (prev ? prev + ' ' + transcript : transcript));
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Active session messages
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) ?? null;
  const activeMessages = activeSession?.messages ?? [];

  // Subscribe to progress updates from background script
  useEffect(() => {
    const listener = (msg: ProgressUpdateMsg) => {
      if (msg.type === 'progress_update') {
        const msgType = msg.type_ || 'message';
        if (msgType === 'bridge_request') return;

        const newMsg: ProgressMessage = {
          type: msgType,
          message: msg.message || '',
          timestamp: msg.timestamp || new Date().toISOString(),
        };

        setSessions((prev) =>
          prev.map((s) => {
            // Match by sessionId from msg, or update the running session
            if (
              (msg.sessionId && s.sessionId === msg.sessionId) ||
              (!msg.sessionId && s.status === 'running')
            ) {
              const newStatus =
                msgType === 'complete' ? 'complete' : msgType === 'error' ? 'error' : s.status;
              return { ...s, messages: [...s.messages, newMsg], status: newStatus };
            }
            return s;
          }),
        );

        if (msgType === 'complete' || msgType === 'error') {
          setIsRunning(false);
          setCurrentSessionId(null);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  const handleSend = async () => {
    if (!command.trim() || isRunning) return;
    const cmd = command.trim();
    setCommand('');
    setRunError(null);
    setIsRunning(true);

    const currentUrl = await getCurrentUrl();

    // Create new session entry
    const tempId = 'session-' + Date.now().toString(36);
    const newSession: SessionEntry = {
      sessionId: tempId,
      command: cmd,
      messages: [{ type: 'user', message: cmd, timestamp: new Date().toISOString() }],
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(tempId);

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
        // Update temp session ID with real session ID
        setSessions((prev) =>
          prev.map((s) => (s.sessionId === tempId ? { ...s, sessionId: json.sessionId! } : s)),
        );
        setActiveSessionId(json.sessionId);
        setCurrentSessionId(json.sessionId);
      } else {
        setCurrentSessionId(tempId);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setRunError(e.message ?? 'Failed to start agent');
      setIsRunning(false);
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === tempId ? { ...s, status: 'error' } : s)),
      );
    }
  };

  const handleCancel = async () => {
    if (!currentSessionId) {
      setIsRunning(false);
      return;
    }
    try {
      await fetch(`${backendUrl}/agent/cancel/${currentSessionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore cancel errors
    } finally {
      setIsRunning(false);
      setCurrentSessionId(null);
    }
  };

  const handleClearCompleted = () => {
    setSessions((prev) => prev.filter((s) => s.status === 'running'));
  };

  const completedSessions = sessions.filter(
    (s) => (s.status === 'complete' || s.status === 'error') && s.sessionId !== activeSessionId,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>

      {/* Header row */}
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
        {sessions.length > 0 && (
          <button
            onClick={() => {
              setSessions([]);
              setActiveSessionId(null);
              setRunError(null);
            }}
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
            Clear All
          </button>
        )}
      </div>

      {/* Sessions tabs (when multiple) */}
      {sessions.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            overflowX: 'auto',
            marginBottom: '8px',
            paddingBottom: '2px',
          }}
        >
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => setActiveSessionId(s.sessionId)}
              style={{
                background: activeSessionId === s.sessionId ? '#1e293b' : 'transparent',
                border: `1px solid ${activeSessionId === s.sessionId ? '#6366f1' : '#334155'}`,
                borderRadius: '6px',
                padding: '3px 8px',
                color: activeSessionId === s.sessionId ? '#e2e8f0' : '#64748b',
                cursor: 'pointer',
                fontSize: '11px',
                whiteSpace: 'nowrap',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 0,
              }}
              title={s.command}
            >
              {s.status === 'running' ? '⏳' : s.status === 'complete' ? '✅' : '❌'}{' '}
              {s.command.length > 15 ? s.command.slice(0, 15) + '…' : s.command}
            </button>
          ))}
        </div>
      )}

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
        {activeMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🤖</div>
            <p style={{ fontSize: '15px', marginBottom: '8px' }}>Welcome to DevFlow AI</p>
            <p style={{ fontSize: '13px', color: '#334155' }}>
              Try: &quot;DSR bhar de&quot; or &quot;Login kardo&quot;
            </p>
          </div>
        ) : (
          activeMessages.map((msg, i) => {
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

      {/* Previous sessions collapsed panel */}
      {completedSessions.length > 0 && (
        <div
          style={{
            marginTop: '8px',
            border: '1px solid #334155',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setShowPrevSessions((v) => !v)}
            style={{
              width: '100%',
              background: '#1e293b',
              border: 'none',
              padding: '6px 10px',
              color: '#94a3b8',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              {showPrevSessions ? '▲' : '▼'} Previous Sessions ({completedSessions.length})
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClearCompleted();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '10px',
                cursor: 'pointer',
                padding: '0',
              }}
            >
              Clear completed
            </button>
          </button>
          {showPrevSessions && (
            <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {completedSessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => setActiveSessionId(s.sessionId)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{s.status === 'complete' ? '✅' : '❌'}</span>
                  <span
                    style={{
                      flex: 1,
                      color: '#94a3b8',
                      fontSize: '12px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.command}
                  </span>
                  <span style={{ color: '#475569', fontSize: '10px', flexShrink: 0 }}>
                    {formatTimeAgo(s.startedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
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
            onClick={toggleVoice}
            title={isListening ? 'Stop listening' : 'Voice input'}
            style={{
              background: isListening ? '#ef4444' : '#1e293b',
              border: '1px solid ' + (isListening ? '#ef4444' : '#334155'),
              borderRadius: '6px',
              padding: '8px 10px',
              cursor: 'pointer',
              fontSize: '16px',
              color: isListening ? 'white' : '#64748b',
              flexShrink: 0,
              animation: isListening ? 'pulse 1s ease-in-out infinite' : 'none',
            }}
          >
            🎙️
          </button>
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

// ==================== FLOWS TAB ====================

interface WorkflowStep {
  id: string;
  command: string;
  condition?: string; // if set, only run step if condition is truthy in agent context
}

interface WorkflowDocument {
  id: string;
  userId: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  runCount: number;
  lastRun?: string;
  createdAt: string;
  updatedAt: string;
}

interface FlowsTabProps {
  token: string;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function FlowsTab({ token }: FlowsTabProps) {
  const [workflows, setWorkflows] = useState<WorkflowDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSteps, setFormSteps] = useState<WorkflowStep[]>([]);
  const [newStepCommand, setNewStepCommand] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runStepIndex, setRunStepIndex] = useState<number>(-1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState<{ workflowId: string; shareUrl: string } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [expandedConditions, setExpandedConditions] = useState<Set<string>>(new Set());
  const importInputRef = useRef<HTMLInputElement>(null);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { success: boolean; data: WorkflowDocument[] };
      if (data.success) setWorkflows(data.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNewForm = () => {
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormSteps([]);
    setNewStepCommand('');
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (wf: WorkflowDocument) => {
    setEditingId(wf.id);
    setFormName(wf.name);
    setFormDescription(wf.description ?? '');
    setFormSteps(wf.steps.map((s) => ({ ...s })));
    setNewStepCommand('');
    setFormError(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const addStep = () => {
    if (!newStepCommand.trim()) return;
    setFormSteps((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), command: newStepCommand.trim() },
    ]);
    setNewStepCommand('');
  };

  const removeStep = (id: string) => {
    setFormSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = async () => {
    setFormError(null);
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    if (formSteps.length === 0) {
      setFormError('Add at least one step');
      return;
    }
    setFormLoading(true);
    try {
      const body = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        steps: formSteps,
      };
      let res: Response;
      if (editingId) {
        res = await fetch(`${backendUrl}/workflows/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${backendUrl}/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      }
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? 'Save failed');
      setShowForm(false);
      setEditingId(null);
      await fetchWorkflows();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFormError(e.message ?? 'Save failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${backendUrl}/workflows/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteConfirmId(null);
      await fetchWorkflows();
    } catch {
      await fetchWorkflows();
    }
  };

  const handleShare = async (id: string) => {
    try {
      const res = await fetch(`${backendUrl}/workflows/${id}/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        success: boolean;
        data: { shareId: string; shareUrl: string };
      };
      if (data.success) {
        setShareModal({ workflowId: id, shareUrl: data.data.shareUrl });
        setShareCopied(false);
      }
    } catch {
      // silently fail
    }
  };

  const handleUnshare = async (id: string) => {
    try {
      await fetch(`${backendUrl}/workflows/${id}/unshare`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setShareModal(null);
    } catch {
      // silently fail
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareModal) return;
    try {
      await navigator.clipboard.writeText(shareModal.shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleExport = () => {
    const json = JSON.stringify(workflows, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devflow-workflows.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as Array<{
        name: string;
        description?: string;
        steps: WorkflowStep[];
      }>;
      for (const wf of imported) {
        await fetch(`${backendUrl}/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: wf.name, description: wf.description, steps: wf.steps }),
        });
      }
      // Reset file input
      if (importInputRef.current) importInputRef.current.value = '';
      await fetchWorkflows();
    } catch {
      // silently fail
    }
  };

  const toggleCondition = (stepId: string) => {
    setExpandedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const updateStepCondition = (stepId: string, condition: string) => {
    setFormSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, condition: condition || undefined } : s)),
    );
  };

  const runWorkflow = async (workflow: WorkflowDocument) => {
    setRunningId(workflow.id);
    setRunStepIndex(0);
    for (let i = 0; i < workflow.steps.length; i++) {
      setRunStepIndex(i);
      try {
        await fetch(`${backendUrl}/agent/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ command: workflow.steps[i].command }),
        });
      } catch {
        // continue
      }
      await new Promise<void>((r) => setTimeout(r, 1500));
    }
    try {
      await fetch(`${backendUrl}/workflows/${workflow.id}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
    setRunningId(null);
    setRunStepIndex(-1);
    await fetchWorkflows();
  };

  const cardStyle: React.CSSProperties = {
    background: '#1e293b',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  };

  const flowsInputStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
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
        <p>Loading workflows...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (showForm) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ color: '#818cf8', margin: 0, fontSize: '15px' }}>
          {editingId ? 'Edit Workflow' : 'New Workflow'}
        </h3>

        <input
          type="text"
          placeholder="Workflow name *"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          style={flowsInputStyle}
        />

        <input
          type="text"
          placeholder="Description (optional)"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          style={flowsInputStyle}
        />

        <div>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 8px 0', fontWeight: 600 }}>
            Steps ({formSteps.length})
          </p>
          {formSteps.map((step, idx) => (
            <div
              key={step.id}
              style={{
                marginBottom: '6px',
                background: '#0f172a',
                borderRadius: '6px',
                padding: '6px 10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '11px', minWidth: '20px' }}>
                  {idx + 1}.
                </span>
                {step.condition && (
                  <span title="Has condition" style={{ fontSize: '12px' }}>🔀</span>
                )}
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: '13px' }}>{step.command}</span>
                <button
                  onClick={() => toggleCondition(step.id)}
                  title="Add/edit condition"
                  style={{
                    background: expandedConditions.has(step.id) ? '#334155' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    fontSize: '11px',
                    padding: '2px 4px',
                    borderRadius: '3px',
                  }}
                >
                  if
                </button>
                <button
                  onClick={() => removeStep(step.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#f87171',
                    fontSize: '14px',
                    padding: '2px',
                  }}
                >
                  ✕
                </button>
              </div>
              {expandedConditions.has(step.id) && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#64748b', fontSize: '11px', flexShrink: 0 }}>Only run if:</span>
                  <input
                    type="text"
                    placeholder="e.g. page contains login form"
                    value={step.condition ?? ''}
                    onChange={(e) => updateStepCondition(step.id, e.target.value)}
                    style={{
                      flex: 1,
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      color: '#e2e8f0',
                      fontSize: '11px',
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <input
              type="text"
              placeholder="Add step command..."
              value={newStepCommand}
              onChange={(e) => setNewStepCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addStep();
                }
              }}
              style={{ ...flowsInputStyle, flex: 1 }}
            />
            <button
              onClick={addStep}
              style={{
                background: '#334155',
                color: '#e2e8f0',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Add
            </button>
          </div>
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
              borderRadius: '6px',
              padding: '8px 16px',
              color: 'white',
              fontSize: '13px',
              cursor: formLoading ? 'not-allowed' : 'pointer',
              opacity: formLoading ? 0.7 : 1,
            }}
          >
            {formLoading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={cancelForm}
            disabled={formLoading}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '8px 16px',
              color: '#94a3b8',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Share Modal */}
      {shareModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '20px',
              width: '100%',
              maxWidth: '320px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '14px', fontWeight: 600 }}>
                Share Workflow
              </h3>
              <button
                onClick={() => setShareModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '2px',
                }}
              >
                ✕
              </button>
            </div>
            <input
              readOnly
              value={shareModal.shareUrl}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#94a3b8',
                fontSize: '12px',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => void handleCopyShareUrl()}
                style={{
                  flex: 1,
                  background: '#6366f1',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {shareCopied ? '✓ Copied!' : 'Copy Link'}
              </button>
              <button
                onClick={() => void handleUnshare(shareModal.workflowId)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#f87171',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Stop Sharing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '15px' }}>Workflows</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleExport}
            title="Export workflows"
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '5px 8px',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            ↓ Export
          </button>
          <label
            title="Import workflows"
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '5px 8px',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            ↑ Import
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={(e) => void handleImport(e)}
              style={{ display: 'none' }}
            />
          </label>
          <button
            onClick={openNewForm}
            style={{
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            + New
          </button>
        </div>
      </div>

      {workflows.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <p style={{ fontSize: '13px' }}>No workflows yet. Create your first one!</p>
        </div>
      ) : (
        workflows.map((wf) => {
          const isRunningWf = runningId === wf.id;
          return (
            <div key={wf.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '14px', flex: 1 }}>
                  {wf.name}
                </span>
                <span
                  style={{
                    background: '#334155',
                    color: '#94a3b8',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '11px',
                  }}
                >
                  {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
                </span>
                {isRunningWf && (
                  <span
                    style={{
                      background: '#f59e0b',
                      color: '#0f172a',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    ⏳ Running step {runStepIndex + 1}/{wf.steps.length}...
                  </span>
                )}
              </div>

              {wf.description && (
                <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 6px 0' }}>
                  {wf.description}
                </p>
              )}

              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                <span>{wf.lastRun ? `Last run: ${formatTimeAgo(wf.lastRun)}` : 'Never run'}</span>
                <span>Runs: {wf.runCount}</span>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => void runWorkflow(wf)}
                  disabled={runningId !== null}
                  style={{
                    background: runningId !== null ? '#334155' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: runningId !== null ? 'not-allowed' : 'pointer',
                    opacity: runningId !== null ? 0.6 : 1,
                  }}
                >
                  ▶ Run
                </button>
                <button
                  onClick={() => void handleShare(wf.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '4px',
                    color: '#94a3b8',
                  }}
                  title="Share workflow"
                >
                  🔗
                </button>
                <button
                  onClick={() => openEditForm(wf)}
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
                  onClick={() => setDeleteConfirmId(wf.id)}
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
                  🗑
                </button>
              </div>

              {deleteConfirmId === wf.id && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '10px',
                    background: '#0f172a',
                    borderRadius: '6px',
                    border: '1px solid #ef4444',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#fca5a5' }}>
                    Delete &quot;{wf.name}&quot;? This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => void handleDelete(wf.id)}
                      style={{
                        background: '#ef4444',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 12px',
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
                        padding: '5px 12px',
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
          );
        })
      )}
    </div>
  );
}

// ==================== SCHEDULE TAB ====================

interface ScheduleDocument {
  id: string;
  userId: string;
  command: string;
  cronExpression: string;
  humanReadable: string;
  isActive: boolean;
  lastRun?: string;
  lastRunStatus?: string;
  createdAt: string;
  updatedAt: string;
}

interface ScheduleTabProps {
  token: string;
}

const CRON_PRESETS = [
  { label: 'Every hour', cron: '0 * * * *', human: 'Every hour' },
  { label: 'Daily at 9 AM', cron: '0 9 * * *', human: 'Daily at 9:00 AM' },
  { label: 'Daily at 6 PM', cron: '0 18 * * *', human: 'Daily at 6:00 PM' },
  { label: 'Every Monday', cron: '0 9 * * 1', human: 'Every Monday at 9:00 AM' },
  { label: 'Custom', cron: '', human: '' },
];

function ScheduleTab({ token }: ScheduleTabProps) {
  const [schedules, setSchedules] = useState<ScheduleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCommand, setFormCommand] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customCron, setCustomCron] = useState('');
  const [customHuman, setCustomHuman] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/schedules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { success: boolean; data: ScheduleDocument[] };
      if (data.success) setSchedules(data.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNewForm = () => {
    setEditingId(null);
    setFormCommand('');
    setSelectedPreset(0);
    setCustomCron('');
    setCustomHuman('');
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (s: ScheduleDocument) => {
    setEditingId(s.id);
    setFormCommand(s.command);
    const presetIdx = CRON_PRESETS.findIndex((p) => p.cron === s.cronExpression);
    if (presetIdx >= 0 && presetIdx < CRON_PRESETS.length - 1) {
      setSelectedPreset(presetIdx);
      setCustomCron('');
      setCustomHuman('');
    } else {
      setSelectedPreset(CRON_PRESETS.length - 1);
      setCustomCron(s.cronExpression);
      setCustomHuman(s.humanReadable);
    }
    setFormError(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = async () => {
    setFormError(null);
    if (!formCommand.trim()) {
      setFormError('Command is required');
      return;
    }
    const isCustom = selectedPreset === CRON_PRESETS.length - 1;
    const cronExpression = isCustom ? customCron.trim() : CRON_PRESETS[selectedPreset].cron;
    const humanReadable = isCustom ? customHuman.trim() : CRON_PRESETS[selectedPreset].human;
    if (!cronExpression) {
      setFormError('Cron expression is required');
      return;
    }
    setFormLoading(true);
    try {
      const body = { command: formCommand.trim(), cronExpression, humanReadable };
      let res: Response;
      if (editingId) {
        res = await fetch(`${backendUrl}/schedules/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${backendUrl}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      }
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? 'Save failed');
      setShowForm(false);
      setEditingId(null);
      await fetchSchedules();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFormError(e.message ?? 'Save failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${backendUrl}/schedules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteConfirmId(null);
      await fetchSchedules();
    } catch {
      await fetchSchedules();
    }
  };

  const handleToggleActive = async (s: ScheduleDocument) => {
    try {
      await fetch(`${backendUrl}/schedules/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      await fetchSchedules();
    } catch {
      // ignore
    }
  };

  const schedInputStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const cardStyle: React.CSSProperties = {
    background: '#1e293b',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
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
        <p>Loading schedules...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (showForm) {
    const isCustom = selectedPreset === CRON_PRESETS.length - 1;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ color: '#818cf8', margin: 0, fontSize: '15px' }}>
          {editingId ? 'Edit Schedule' : 'New Schedule'}
        </h3>

        <div>
          <label style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
            Command *
          </label>
          <textarea
            placeholder="What should the agent do?"
            value={formCommand}
            onChange={(e) => setFormCommand(e.target.value)}
            rows={3}
            style={{
              ...schedInputStyle,
              resize: 'none',
            }}
          />
        </div>

        <div>
          <label style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
            Schedule
          </label>
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(Number(e.target.value))}
            style={{
              ...schedInputStyle,
              cursor: 'pointer',
            }}
          >
            {CRON_PRESETS.map((p, i) => (
              <option key={i} value={i} style={{ background: '#1e293b', color: '#e2e8f0' }}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {isCustom && (
          <>
            <input
              type="text"
              placeholder="Cron expression (e.g. 0 9 * * 1)"
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              style={schedInputStyle}
            />
            <input
              type="text"
              placeholder="Human readable description"
              value={customHuman}
              onChange={(e) => setCustomHuman(e.target.value)}
              style={schedInputStyle}
            />
          </>
        )}

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
              borderRadius: '6px',
              padding: '8px 16px',
              color: 'white',
              fontSize: '13px',
              cursor: formLoading ? 'not-allowed' : 'pointer',
              opacity: formLoading ? 0.7 : 1,
            }}
          >
            {formLoading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={cancelForm}
            disabled={formLoading}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '8px 16px',
              color: '#94a3b8',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '15px' }}>Schedules</span>
        <button
          onClick={openNewForm}
          style={{
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          + New Schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏰</div>
          <p style={{ fontSize: '13px' }}>No schedules set. Automate your routine tasks!</p>
        </div>
      ) : (
        schedules.map((s) => (
          <div key={s.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  flex: 1,
                  color: '#e2e8f0',
                  fontSize: '13px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={s.command}
              >
                {s.command.length > 60 ? s.command.slice(0, 60) + '…' : s.command}
              </span>
              {/* Active toggle */}
              <button
                onClick={() => void handleToggleActive(s)}
                title={s.isActive ? 'Disable' : 'Enable'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '10px',
                    background: s.isActive ? '#6366f1' : '#334155',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: 'white',
                      position: 'absolute',
                      top: '2px',
                      left: s.isActive ? '18px' : '2px',
                      transition: 'left 0.2s',
                    }}
                  />
                </div>
              </button>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 4px 0' }}>
              {s.humanReadable || s.cronExpression}
            </p>

            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
              <span>{s.lastRun ? `Last run: ${formatTimeAgo(s.lastRun)}` : 'Never run'}</span>
              {s.lastRunStatus && (
                <span
                  style={{
                    color: s.lastRunStatus === 'success' ? '#10b981' : '#f87171',
                  }}
                >
                  {s.lastRunStatus}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => openEditForm(s)}
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
                onClick={() => setDeleteConfirmId(s.id)}
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
                🗑
              </button>
            </div>

            {deleteConfirmId === s.id && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  background: '#0f172a',
                  borderRadius: '6px',
                  border: '1px solid #ef4444',
                }}
              >
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#fca5a5' }}>
                  Delete this schedule? This cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => void handleDelete(s.id)}
                    style={{
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '5px 12px',
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
                      padding: '5px 12px',
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

// ==================== SETTINGS TAB ====================

interface UserSettings {
  theme?: string;
  fontSize?: string;
  language?: string;
  autoScreenshot?: boolean;
  askBeforeSubmit?: boolean;
  progressNotifications?: boolean;
}

interface SettingsTabProps {
  token: string;
}

function SettingsTab({ token }: SettingsTabProps) {
  const [settings, setSettings] = useState<UserSettings>({
    theme: 'dark',
    fontSize: 'medium',
    language: 'english',
    autoScreenshot: true,
    askBeforeSubmit: true,
    progressNotifications: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${backendUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          success: boolean;
          data?: { settings?: UserSettings };
          error?: string;
        };
        if (data.success && data.data?.settings) {
          setSettings((prev) => ({ ...prev, ...data.data!.settings }));
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${backendUrl}/auth/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({
    value,
    onChange,
  }: {
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <button
      onClick={() => onChange(!value)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <div
        style={{
          width: '40px',
          height: '22px',
          borderRadius: '11px',
          background: value ? '#6366f1' : '#334155',
          position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'white',
            position: 'absolute',
            top: '2px',
            left: value ? '20px' : '2px',
            transition: 'left 0.2s',
          }}
        />
      </div>
    </button>
  );

  const SegmentedControl = ({
    value,
    options,
    onChange,
  }: {
    value: string;
    options: { label: string; value: string }[];
    onChange: (v: string) => void;
  }) => (
    <div
      style={{
        display: 'flex',
        background: '#0f172a',
        borderRadius: '6px',
        padding: '2px',
        gap: '2px',
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            background: value === opt.value ? '#6366f1' : 'transparent',
            color: value === opt.value ? 'white' : '#64748b',
            border: 'none',
            borderRadius: '4px',
            padding: '5px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const sectionHeaderStyle: React.CSSProperties = {
    color: '#64748b',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '16px 0 8px 0',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #1e293b',
  };

  const labelStyle: React.CSSProperties = {
    color: '#e2e8f0',
    fontSize: '13px',
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
        <p>Loading settings...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Appearance */}
      <p style={sectionHeaderStyle}>Appearance</p>

      <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        <span style={labelStyle}>Theme</span>
        <SegmentedControl
          value={settings.theme ?? 'dark'}
          options={[
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' },
            { label: 'System', value: 'system' },
          ]}
          onChange={(v) => setSettings((s) => ({ ...s, theme: v }))}
        />
      </div>

      <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        <span style={labelStyle}>Font Size</span>
        <SegmentedControl
          value={settings.fontSize ?? 'medium'}
          options={[
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ]}
          onChange={(v) => setSettings((s) => ({ ...s, fontSize: v }))}
        />
      </div>

      <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        <span style={labelStyle}>Language</span>
        <SegmentedControl
          value={settings.language ?? 'english'}
          options={[
            { label: 'English', value: 'english' },
            { label: 'Hinglish', value: 'hinglish' },
            { label: 'Hindi', value: 'hindi' },
          ]}
          onChange={(v) => setSettings((s) => ({ ...s, language: v }))}
        />
      </div>

      {/* Behavior */}
      <p style={sectionHeaderStyle}>Behavior</p>

      <div style={rowStyle}>
        <div>
          <span style={labelStyle}>Auto Screenshot</span>
          <p style={{ color: '#64748b', fontSize: '11px', margin: '2px 0 0 0' }}>
            Capture screenshots during tasks
          </p>
        </div>
        <Toggle
          value={settings.autoScreenshot ?? true}
          onChange={(v) => setSettings((s) => ({ ...s, autoScreenshot: v }))}
        />
      </div>

      <div style={rowStyle}>
        <div>
          <span style={labelStyle}>Ask Before Submit</span>
          <p style={{ color: '#64748b', fontSize: '11px', margin: '2px 0 0 0' }}>
            Confirm before submitting forms
          </p>
        </div>
        <Toggle
          value={settings.askBeforeSubmit ?? true}
          onChange={(v) => setSettings((s) => ({ ...s, askBeforeSubmit: v }))}
        />
      </div>

      <div style={rowStyle}>
        <div>
          <span style={labelStyle}>Progress Notifications</span>
          <p style={{ color: '#64748b', fontSize: '11px', margin: '2px 0 0 0' }}>
            Show task progress updates
          </p>
        </div>
        <Toggle
          value={settings.progressNotifications ?? true}
          onChange={(v) => setSettings((s) => ({ ...s, progressNotifications: v }))}
        />
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={saving}
        style={{
          marginTop: '20px',
          background: '#6366f1',
          border: 'none',
          borderRadius: '8px',
          padding: '10px 16px',
          color: 'white',
          fontSize: '13px',
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1,
          width: '100%',
        }}
      >
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
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
          overflow: ['agent'].includes(activeTab) ? 'hidden' : 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {activeTab === 'agent' && token && <AgentTab token={token} />}
        {activeTab === 'memory' && token && <MemoryTab token={token} />}
        {activeTab === 'vault' && token && <VaultTab token={token} />}
        {activeTab === 'flows' && token && <FlowsTab token={token} />}
        {activeTab === 'schedule' && token && <ScheduleTab token={token} />}
        {activeTab === 'settings' && token && <SettingsTab token={token} />}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<SidePanel />);
