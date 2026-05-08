import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import type { IdentityPublic } from '../../../shared/src/types';

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
            onClick={handleGoogleSignIn}
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
          onSubmit={handleEmailSignIn}
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
      const json = await res.json() as { success: boolean; data?: IdentityPublic[]; error?: string };
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
      const json = await res.json() as { success: boolean; error?: string };
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
      const json = await res.json() as { success: boolean; error?: string };
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

// ==================== MAIN SIDEPANEL ====================

function SidePanel() {
  const { user, token, isLoading, setUser, setToken, setLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('agent');
  const [command, setCommand] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setUser(firebaseUser);
        setToken(idToken);
      } else {
        setUser(null);
        setToken(null);
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

  const handleSend = () => {
    if (!command.trim()) return;
    setMessages((prev) => [...prev, command]);
    setCommand('');
  };

  const displayName = user.displayName ?? user.email ?? 'U';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
        <div
          style={{
            marginLeft: 'auto',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#6366f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            color: 'white',
          }}
        >
          {initial}
        </div>
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
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {activeTab === 'agent' && (
          <div>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🤖</div>
                <p style={{ fontSize: '15px', marginBottom: '8px' }}>Welcome to DevFlow AI</p>
                <p style={{ fontSize: '13px', color: '#334155' }}>
                  Try: &quot;DSR bhar de&quot; or &quot;Login kardo&quot;
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    background: '#1e293b',
                    borderRadius: '8px',
                    padding: '10px',
                    marginBottom: '8px',
                    fontSize: '14px',
                  }}
                >
                  <span style={{ color: '#818cf8', fontWeight: 'bold', marginRight: '8px' }}>
                    You:
                  </span>
                  {msg}
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'memory' && (
          <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧠</div>
            <p>AI is learning your preferences.</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Start using DevFlow!</p>
          </div>
        )}
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

      {/* Command Input */}
      <div style={{ padding: '12px', background: '#1e293b', borderTop: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a command... (Enter to send, Shift+Enter for new line)"
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
            }}
            rows={1}
          />
          <button
            onClick={handleSend}
            style={{
              background: '#6366f1',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '18px',
              minWidth: '44px',
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<SidePanel />);
