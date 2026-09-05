import { useState } from 'react';
import { MAX_PLAYERS_PER_ROOM } from '../../../shared/protocol/constants.js';

export default function LobbyScreen({ roomCode, playerCount, statusMessage, onLeave }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-card" style={{ maxWidth: '460px', padding: '36px 32px' }}>
        <div className="landing-badge">WAITING ROOM</div>
        
        <h2 style={{
          fontSize: '1.2rem',
          margin: '16px 0 8px 0',
          textShadow: '2px 2px 0px #000',
          color: '#FBD000',
          textAlign: 'center',
          fontFamily: "'Press Start 2P', 'Courier New', monospace"
        }}>
          CODE: {roomCode}
        </h2>

        <button
          type="button"
          className="btn-primary"
          onClick={handleCopy}
          style={{
            backgroundColor: copied ? '#00A800' : '#E52521',
            margin: '16px 0 20px 0',
            transition: 'background-color 0.2s ease'
          }}
        >
          {copied ? 'COPIED!' : 'COPY CODE'}
        </button>

        <div style={{
          fontSize: '0.75rem',
          color: '#ffffff',
          marginBottom: '12px',
          textShadow: '1px 1px 0px #000',
          fontFamily: "'Press Start 2P', 'Courier New', monospace"
        }}>
          PLAYERS: {playerCount} / {MAX_PLAYERS_PER_ROOM}
        </div>

        <div style={{
          fontSize: '0.65rem',
          color: '#FBD000',
          textShadow: '1px 1px 0px #000',
          textAlign: 'center',
          lineHeight: '1.4',
          marginBottom: '20px',
          fontFamily: "'Press Start 2P', 'Courier New', monospace"
        }}>
          {statusMessage}
        </div>

        {onLeave && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onLeave}
            style={{
              backgroundColor: '#222536',
              borderColor: '#000000'
            }}
          >
            LEAVE ROOM
          </button>
        )}
      </div>
    </div>
  );
}
