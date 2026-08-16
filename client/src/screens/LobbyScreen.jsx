import GameCanvas from '../components/GameCanvas.jsx';
import { MAX_PLAYERS_PER_ROOM } from '../../../shared/protocol/constants.js';

export default function LobbyScreen({ roomCode, playerCount, statusMessage }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px' }}>
      <h2>Room Code: {roomCode}</h2>
      <button onClick={handleCopy} style={{ padding: '5px 15px', margin: '10px 0' }}>Copy Code</button>
      
      <div style={{ marginTop: '10px', fontSize: '18px' }}>
        Players: {playerCount} / {MAX_PLAYERS_PER_ROOM}
      </div>
      
      <div style={{ marginTop: '10px', color: '#555', fontStyle: 'italic' }}>
        {statusMessage}
      </div>

      <GameCanvas />
    </div>
  );
}
