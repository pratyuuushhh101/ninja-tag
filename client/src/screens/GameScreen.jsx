import { useEffect, useRef } from 'react';
import GameCanvas from '../components/GameCanvas.jsx';
import { InputManager } from '../game/InputManager.js';
import { prediction } from '../game/Prediction.js';

export default function GameScreen({ roomCode, playerId, gameState, arena, onLeave, gameEndReason }) {
  const inputManagerRef = useRef(null);
  const containerRef = useRef(null);

  // InputManager & Prediction lifecycle — identical to Phase 4.7
  // Ensures window and container gain focus when game starts so keyboard events register immediately.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.focus();
    }
    if (containerRef.current) {
      containerRef.current.focus();
    }

    if (!gameEndReason) {
      const im = new InputManager();
      im.start();
      prediction.start(im);
      inputManagerRef.current = im;

      return () => {
        prediction.stop();
        im.stop();
        inputManagerRef.current = null;
      };
    } else {
      prediction.stop();
    }
  }, [gameEndReason]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onClick={() => { if (typeof window !== 'undefined') window.focus(); }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#1a1a2e',
        overflow: 'hidden',
        outline: 'none'
      }}
    >
      {/* Full-viewport canvas container */}
      <div style={{
        width: '100%',
        height: '100%',
        position: 'relative'
      }}>
        <GameCanvas
          gameState={gameState}
          arena={arena}
          playerId={playerId}
          roomCode={roomCode}
        />
      </div>

      {/* Leave button — small, top-right corner */}
      <button
        onClick={onLeave}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '6px 14px',
          fontSize: '12px',
          fontWeight: '700',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 10,
          letterSpacing: '1px',
          textTransform: 'uppercase'
        }}
      >
        Leave
      </button>

      {/* Game Over overlay */}
      {gameEndReason && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(26, 26, 46, 0.92)',
          color: '#ffffff',
          zIndex: 20
        }}>
          <h2 style={{
            fontSize: '2.4rem',
            fontWeight: '900',
            letterSpacing: '4px',
            marginBottom: '12px',
            color: '#FF8C00'
          }}>
            MATCH OVER
          </h2>
          <p style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: '#aaa',
            marginBottom: '24px'
          }}>
            {gameEndReason === 'PLAYER_DISCONNECTED'
              ? 'Opponent disconnected.'
              : 'The match has ended.'}
          </p>
          <button
            onClick={onLeave}
            style={{
              padding: '12px 28px',
              fontSize: '14px',
              fontWeight: '700',
              color: '#ffffff',
              backgroundColor: '#E65100',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}
          >
            Return to Menu
          </button>
        </div>
      )}
    </div>
  );
}
