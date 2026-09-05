import { useState } from 'react';

export default function LandingScreen({ onStartBotGame, onCreateGame, onJoinGame }) {
  const [view, setView] = useState('main');
  const [selectedDuration, setSelectedDuration] = useState(60);

  return (
    <div className="landing-container">
      {/* 2D Mario Decorative Background */}
      <div className="landing-bg-decor">
        {/* Prominent Retro Mario Sun with Perpendicular Alternating Rays */}
        <div className="mario-sun-wrapper">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <line x1="90" y1="60" x2="106" y2="60" stroke="#000000" strokeWidth="4" strokeLinecap="square" />
            <line x1="86" y1="75" x2="93" y2="79" stroke="#000000" strokeWidth="3.5" strokeLinecap="square" />
            <line x1="75" y1="86" x2="83" y2="100" stroke="#000000" strokeWidth="4" strokeLinecap="square" />
            <line x1="60" y1="90" x2="60" y2="98" stroke="#000000" strokeWidth="3.5" strokeLinecap="square" />
            <line x1="45" y1="86" x2="37" y2="100" stroke="#000000" strokeWidth="4" strokeLinecap="square" />
            <line x1="34" y1="75" x2="27" y2="79" stroke="#000000" strokeWidth="3.5" strokeLinecap="square" />
            <line x1="30" y1="60" x2="14" y2="60" stroke="#000000" strokeWidth="4" strokeLinecap="square" />
            <line x1="34" y1="45" x2="27" y2="41" stroke="#000000" strokeWidth="3.5" strokeLinecap="square" />
            <line x1="45" y1="34" x2="37" y2="20" stroke="#000000" strokeWidth="4" strokeLinecap="square" />
            <line x1="60" y1="30" x2="60" y2="22" stroke="#000000" strokeWidth="3.5" strokeLinecap="square" />
            <line x1="75" y1="34" x2="83" y2="20" stroke="#000000" strokeWidth="4" strokeLinecap="square" />
            <line x1="86" y1="45" x2="93" y2="41" stroke="#000000" strokeWidth="3.5" strokeLinecap="square" />

            <circle cx="60" cy="60" r="28" fill="#FBD000" stroke="#000000" strokeWidth="4" />
          </svg>
        </div>

        {/* Mario Clouds */}
        <div className="mario-cloud mario-cloud-1" />
        <div className="mario-cloud mario-cloud-2" />
        <div className="mario-cloud mario-cloud-3" />

        {/* 2D Mario Pixel Trees */}
        <div className="mario-trees-container">
          <svg width="60" height="90" viewBox="0 0 60 90">
            <rect x="24" y="50" width="12" height="40" fill="#8B4513" stroke="#000" strokeWidth="3" />
            <circle cx="30" cy="35" r="28" fill="#00A800" stroke="#000" strokeWidth="3" />
            <circle cx="20" cy="25" r="18" fill="#00C800" stroke="#000" strokeWidth="2" />
          </svg>
          <svg width="80" height="110" viewBox="0 0 80 110">
            <rect x="33" y="60" width="14" height="50" fill="#8B4513" stroke="#000" strokeWidth="3" />
            <circle cx="40" cy="40" r="35" fill="#00A800" stroke="#000" strokeWidth="3" />
            <circle cx="26" cy="30" r="22" fill="#00C800" stroke="#000" strokeWidth="2" />
          </svg>
          <svg width="75" height="100" viewBox="0 0 75 100">
            <rect x="30" y="55" width="14" height="45" fill="#8B4513" stroke="#000" strokeWidth="3" />
            <circle cx="37" cy="38" r="32" fill="#00A800" stroke="#000" strokeWidth="3" />
            <circle cx="48" cy="28" r="20" fill="#00C800" stroke="#000" strokeWidth="2" />
          </svg>
          <svg width="60" height="85" viewBox="0 0 60 85">
            <rect x="24" y="45" width="12" height="40" fill="#8B4513" stroke="#000" strokeWidth="3" />
            <circle cx="30" cy="32" r="26" fill="#00A800" stroke="#000" strokeWidth="3" />
            <circle cx="22" cy="22" r="16" fill="#00C800" stroke="#000" strokeWidth="2" />
          </svg>
        </div>

        {/* Mario Grass & Dirt Ground */}
        <div className="ground-strip" />
        <div className="dirt-strip" />
      </div>

      {/* Main Mario Game Menu Card */}
      <div className="landing-card">
        <div className="landing-badge">
          {view === 'bot' ? 'SINGLE PLAYER DEMO' : (view === 'friends' ? 'MULTIPLAYER LOBBY' : '2-PLAYER ONLINE ARCADE')}
        </div>
        <h1 className="landing-title">NINJA TAG</h1>
        <div className="landing-tagline">CHASE. TAG. SURVIVE.</div>

        {view === 'main' && (
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setView('bot')}
            >
              PLAY VS BOT
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setView('friends')}
            >
              PLAY WITH FRIENDS
            </button>
          </>
        )}

        {view === 'bot' && (
          <>
            {/* Match Duration Selector */}
            <div className="duration-group">
              <div className="duration-label">MATCH LENGTH</div>
              <div className="duration-options">
                {[20, 40, 60].map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`duration-btn ${selectedDuration === d ? 'active' : ''}`}
                    onClick={() => setSelectedDuration(d)}
                    aria-pressed={selectedDuration === d}
                  >
                    {d} SEC
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => onStartBotGame(selectedDuration)}
            >
              START GAME
            </button>

            <button
              type="button"
              className="btn-secondary"
              style={{ backgroundColor: '#222536', borderColor: '#000000' }}
              onClick={() => setView('main')}
            >
              BACK
            </button>
          </>
        )}

        {view === 'friends' && (
          <>
            {/* Match Duration Selector */}
            <div className="duration-group">
              <div className="duration-label">MATCH LENGTH</div>
              <div className="duration-options">
                {[20, 40, 60].map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`duration-btn ${selectedDuration === d ? 'active' : ''}`}
                    onClick={() => setSelectedDuration(d)}
                    aria-pressed={selectedDuration === d}
                  >
                    {d} SEC
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => onCreateGame(selectedDuration)}
            >
              CREATE GAME
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={onJoinGame}
              style={{ marginBottom: '10px' }}
            >
              JOIN GAME
            </button>

            <button
              type="button"
              className="btn-secondary"
              style={{ backgroundColor: '#222536', borderColor: '#000000' }}
              onClick={() => setView('main')}
            >
              BACK
            </button>
          </>
        )}
      </div>
    </div>
  );
}
