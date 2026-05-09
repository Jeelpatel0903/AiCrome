export type ActionRisk = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface PendingConfirmation {
  id: string;
  action: string;
  description: string;
  risk: ActionRisk;
  params?: Record<string, unknown>;
}

interface RiskBadgeProps {
  risk: ActionRisk;
}

function RiskBadge({ risk }: RiskBadgeProps) {
  const colors: Record<ActionRisk, { bg: string; text: string; label: string }> = {
    safe:     { bg: '#064e3b', text: '#10b981', label: 'SAFE' },
    low:      { bg: '#1e3a5f', text: '#60a5fa', label: 'LOW' },
    medium:   { bg: '#451a03', text: '#f59e0b', label: 'MEDIUM' },
    high:     { bg: '#450a0a', text: '#f87171', label: 'HIGH' },
    critical: { bg: '#3b0764', text: '#e879f9', label: 'CRITICAL' },
  };
  const c = colors[risk];
  return (
    <span style={{
      background: c.bg,
      color: c.text,
      borderRadius: '4px',
      padding: '2px 6px',
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '0.5px',
    }}>
      {c.label} RISK
    </span>
  );
}

interface ActionConfirmationProps {
  confirmation: PendingConfirmation;
  onAllow: (id: string) => void;
  onBlock: (id: string) => void;
}

export function ActionConfirmation({ confirmation, onAllow, onBlock }: ActionConfirmationProps) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      left: '12px',
      right: '12px',
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '13px' }}>Confirm Action</span>
        <RiskBadge risk={confirmation.risk} />
      </div>

      <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px', lineHeight: 1.5 }}>
        {confirmation.description}
      </div>

      {confirmation.params && Object.keys(confirmation.params).length > 0 && (
        <div style={{
          background: '#0f172a',
          borderRadius: '6px',
          padding: '8px',
          marginBottom: '12px',
          fontSize: '11px',
          fontFamily: 'monospace',
          color: '#818cf8',
          maxHeight: '80px',
          overflowY: 'auto',
        }}>
          {JSON.stringify(confirmation.params, null, 2)}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onBlock(confirmation.id)}
          style={{
            flex: 1,
            background: '#450a0a',
            color: '#f87171',
            border: '1px solid #7f1d1d',
            borderRadius: '8px',
            padding: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Block
        </button>
        <button
          onClick={() => onAllow(confirmation.id)}
          style={{
            flex: 1,
            background: '#1e3a5f',
            color: '#60a5fa',
            border: '1px solid #1d4ed8',
            borderRadius: '8px',
            padding: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Allow
        </button>
      </div>
    </div>
  );
}
