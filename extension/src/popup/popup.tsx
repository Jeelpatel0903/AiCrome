import { createRoot } from 'react-dom/client';

function Popup() {
  const openSidePanel = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
    window.close();
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '18px', marginBottom: '8px', color: '#818cf8' }}>DevFlow AI</h1>
      <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
        AI-powered browser automation
      </p>
      <button
        onClick={openSidePanel}
        style={{
          background: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '10px 20px',
          fontSize: '14px',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        Open Side Panel
      </button>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
