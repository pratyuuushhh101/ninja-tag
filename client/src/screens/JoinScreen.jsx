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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h2>Join Game</h2>
      
      <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <input 
          type="text" 
          value={code} 
          onChange={handleChange} 
          placeholder="ENTER CODE"
          style={{ padding: '10px', fontSize: '20px', textAlign: 'center', textTransform: 'uppercase' }}
        />
        <button 
          onClick={() => onJoin(code)} 
          disabled={!isValid}
          style={{ padding: '10px 20px', fontSize: '16px' }}
        >
          Join Game
        </button>
        <button onClick={onBack} style={{ padding: '5px 15px', fontSize: '14px', marginTop: '10px' }}>Back</button>
      </div>

      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
    </div>
  );
}
