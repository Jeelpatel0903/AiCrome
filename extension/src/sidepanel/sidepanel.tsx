import { useState } from 'react';
import { createRoot } from 'react-dom/client';

type Tab = 'agent' | 'memory' | 'vault' | 'flows' | 'schedule';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'agent', label: 'Agent', icon: '🤖' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'vault', label: 'Vault', icon: '🔐' },
  { id: 'flows', label: 'Flows', icon: '📋' },
  { id: 'schedule', label: 'Schedule', icon: '⏰' },
];

function SidePanel() {
  const [activeTab, setActiveTab] = useState<Tab>('agent');
  const [command, setCommand] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  const handleSend = () => {
    if (!command.trim()) return;
    setMessages((prev) => [...prev, command]);
    setCommand('');
  };

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
          }}
        >
          U
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
        {activeTab === 'vault' && (
          <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔐</div>
            <p>No identities saved yet.</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Add your first one!</p>
          </div>
        )}
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
