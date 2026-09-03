import { useState } from 'react';

export default function LandingScreen({ onCreateGame, onJoinGame }) {
  const [selectedDuration, setSelectedDuration] = useState(60);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>NINJA TAG</h1>

      <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Match Duration:</span>
        {[20, 40, 60].map(d => (
          <button
            key={d}
            onClick={() => setSelectedDuration(d)}
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: selectedDuration === d ? 'bold' : 'normal',
              border: selectedDuration === d ? '2px solid #3b82f6' : '1px solid #666',
              backgroundColor: selectedDuration === d ? '#1e293b' : '#0f172a',
              color: '#ffffff',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {d}s
          </button>
        ))}
      </div>

      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => onCreateGame(selectedDuration)}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        >
          Create Game
        </button>
        <button
          onClick={onJoinGame}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        >
          Join Game
        </button>
      </div>
    </div>
  );
}
