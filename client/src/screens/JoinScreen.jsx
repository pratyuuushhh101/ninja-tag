import { useState } from 'react';
import { ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from '../../../shared/protocol/constants.js';

export default function JoinScreen({ onJoin, onBack, error }) {
  const [code, setCode] = useState('');

  const handleChange = (e) => {
    const val = e.target.value.toUpperCase();
    const filtered = val.split('').filter(c => ROOM_CODE_CHARSET.includes(c)).join('');
    if (filtered.length <= ROOM_CODE_LENGTH) {
      setCode(filtered);
    }
  };

  const isValid = code.length === ROOM_CODE_LENGTH;

  return (
    <div className="landing-container">
      <div className="landing-card" style={{ maxWidth: '440px', padding: '36px 32px' }}>
        <div className="landing-badge">MULTIPLAYER LOBBY</div>

        <h2 style={{
          fontSize: '1.1rem',
          margin: '12px 0 6px 0',
          textShadow: '2px 2px 0px #000',
          color: '#FBD000',
          textAlign: 'center',
          fontFamily: "'Press Start 2P', 'Courier New', monospace"
        }}>
          ENTER ROOM CODE
        </h2>

        <div style={{ width: '100%', margin: '16px 0 20px 0' }}>
          <input
            type="text"
            value={code}
            onChange={handleChange}
            placeholder="XXXXX"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '1.2rem',
              textAlign: 'center',
              textTransform: 'uppercase',
              color: '#FBD000',
              backgroundColor: '#0f172a',
              border: '3px solid #000000',
              borderRadius: '4px',
              boxShadow: '3px 3px 0px #000000',
              outline: 'none',
              letterSpacing: '4px',
              fontFamily: "'Press Start 2P', 'Courier New', monospace"
            }}
          />
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => onJoin(code)}
          disabled={!isValid}
          style={{
            opacity: isValid ? 1 : 0.5,
            cursor: isValid ? 'pointer' : 'not-allowed',
            marginBottom: '12px'
          }}
        >
          JOIN GAME
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={onBack}
        >
          BACK
        </button>

        {error && (
          <div style={{
            color: '#E52521',
            marginTop: '16px',
            fontSize: '0.65rem',
            textAlign: 'center',
            textShadow: '1px 1px 0px #000',
            fontFamily: "'Press Start 2P', 'Courier New', monospace"
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
