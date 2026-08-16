import { useEffect, useRef } from 'react';
import GameCanvas from '../components/GameCanvas.jsx';
import { InputManager } from '../game/InputManager.js';

export default function GameScreen({ roomCode, playerId, gameState, arena, onLeave, gameEndReason }) {
  const inputManagerRef = useRef(null);

  useEffect(() => {
    if (!gameEndReason) {
      const im = new InputManager();
      im.start();
      inputManagerRef.current = im;
      return () => {
        im.stop();
        inputManagerRef.current = null;
      };
    }
  }, [gameEndReason]);

  // Determine role
  const isIt = gameState && gameState.itPlayerId === playerId;
  const roleText = isIt ? 'IT' : 'NINJA';

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px' }}>
        <div>
          <span>ROOM: {roomCode}</span>
          <span style={{ marginLeft: '20px' }}>YOU: <strong>{roleText}</strong></span>
        </div>
        <button onClick={onLeave} style={{ padding: '5px 15px' }}>Leave Game</button>
      </div>

      <GameCanvas
        gameState={gameState}
        arena={arena}
        playerId={playerId}
      />

      {gameEndReason && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white'
        }}>
          <h2>Opponent disconnected.</h2>
          <button onClick={onLeave} style={{ padding: '10px 20px', marginTop: '20px', fontSize: '16px' }}>
            Return to Menu
          </button>
        </div>
      )}
    </div>
  );
}
