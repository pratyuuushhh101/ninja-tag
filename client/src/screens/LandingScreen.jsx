export default function LandingScreen({ onCreateGame, onJoinGame }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>NINJA TAG</h1>
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button onClick={onCreateGame} style={{ padding: '10px 20px', fontSize: '16px' }}>Create Game</button>
        <button onClick={onJoinGame} style={{ padding: '10px 20px', fontSize: '16px' }}>Join Game</button>
      </div>
    </div>
  );
}
