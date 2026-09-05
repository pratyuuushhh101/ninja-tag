import { useEffect, useRef } from 'react';
import GameCanvas from '../components/GameCanvas.jsx';
import { InputManager } from '../game/InputManager.js';
import { prediction } from '../game/Prediction.js';

export default function GameScreen({
  roomCode,
  playerId,
  gameState,
  arena,
  onLeave,
  gameEndReason,
  gameEndResult,
  matchEndTime,
  serverTimeRef,
  isBotMode
}) {
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

  const isWinner = gameEndResult && gameEndResult.winnerId === playerId;

  let resultHeading = 'MATCH ENDED';
  let resultSubtext = '';

  if (gameEndReason === 'TIME_EXPIRED') {
    if (isBotMode) {
      resultHeading = isWinner ? 'YOU WON!' : 'BOT WON!';
      resultSubtext = isWinner ? 'YOU OUTRAN THE BOT!' : 'THE BOT CAUGHT YOU!';
    } else {
      resultHeading = isWinner ? 'YOU WIN' : 'YOU LOSE';
      resultSubtext = 'THE PLAYER WHO WAS IT LOST';
    }
  } else if (gameEndReason === 'PLAYER_DISCONNECTED') {
    resultHeading = isBotMode ? 'BOT LEFT' : 'OPPONENT LEFT';
    resultSubtext = isBotMode ? 'Bot match ended.' : 'Opponent left the match.';
  }

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
          matchEndTime={matchEndTime}
          serverTimeRef={serverTimeRef}
        />
      </div>

      {/* Leave button — Mario NES style, top-right corner */}
      <button
        onClick={onLeave}
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          padding: '8px 16px',
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '0.65rem',
          fontWeight: '700',
          color: '#ffffff',
          backgroundColor: '#E52521',
          border: '2px solid #000000',
          boxShadow: '3px 3px 0px #000000',
          cursor: 'pointer',
          zIndex: 10,
          textTransform: 'uppercase'
        }}
      >
        LEAVE
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
          backgroundColor: 'rgba(24, 24, 36, 0.95)',
          color: '#ffffff',
          zIndex: 20,
          fontFamily: "'Press Start 2P', monospace",
          padding: '24px',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2rem',
            lineHeight: 1.4,
            marginBottom: '16px',
            color: gameEndReason === 'TIME_EXPIRED'
              ? (isWinner ? '#4CAF50' : '#E53935')
              : '#FBD000',
            textShadow: '3px 3px 0px #000000'
          }}>
            {gameEndReason === 'TIME_EXPIRED' ? "TIME'S UP!" : 'MATCH OVER'}
          </h2>

          <h3 style={{
            fontSize: '1.3rem',
            lineHeight: 1.4,
            marginBottom: '16px',
            color: isWinner ? '#4CAF50' : '#E53935',
            textShadow: '2px 2px 0px #000000'
          }}>
            {resultHeading}
          </h3>

          <p style={{
            fontSize: '0.7rem',
            lineHeight: 1.6,
            color: '#FBD000',
            marginBottom: '32px',
            textShadow: '1px 1px 0px #000000'
          }}>
            {resultSubtext}
          </p>

          <button
            onClick={onLeave}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              padding: '14px 28px',
              fontSize: '0.75rem',
              fontWeight: '700',
              color: '#ffffff',
              backgroundColor: '#E52521',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000',
              cursor: 'pointer',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}
          >
            RETURN TO MENU
          </button>
        </div>
      )}
    </div>
  );
}
