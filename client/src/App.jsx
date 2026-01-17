import { useState, useEffect } from 'react';
import io from 'socket.io-client';


// Connect to backend (Auto-detect logic)
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(SERVER_URL);

function App() {
  const [screen, setScreen] = useState('HOME'); // HOME, CREATE, JOIN, LOBBY, GAME
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState([]);
  const [playerCount, setPlayerCount] = useState(5);
  const [myRole, setMyRole] = useState(null);
  const [knowledge, setKnowledge] = useState([]);
  const [error, setError] = useState('');
  const [isHost, setIsHost] = useState(false);

  const [hasVoted, setHasVoted] = useState(false);
  const [lastVoteResult, setLastVoteResult] = useState(null);
  const [lastQuestResult, setLastQuestResult] = useState(null);
  const [gameOver, setGameOver] = useState(null);

  const [timeLeft, setTimeLeft] = useState(0);

  const [gameInfo, setGameInfo] = useState({
    phase: '',
    king: null,
    currentQuest: 1,
    questResults: [],
    requiredCount: 2,
    proposedTeam: [], // array of player IDs
    failedVotes: 0,
    votes: {}, // To track who voted (optional)
    timerEnd: null // timestamp
  });
  const [selectedTeam, setSelectedTeam] = useState([]);

  // --- EFFECT: SOCKET LISTENERS ---
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('room_created', ({ roomId, players }) => {
      setRoomId(roomId);
      setPlayers(players);
      setScreen('LOBBY');
      setIsHost(true);
      setError('');
    });

    socket.on('player_joined', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    socket.on('game_started', ({ role, knowledge }) => {
      setMyRole(role);
      setKnowledge(knowledge);
      setScreen('GAME');
    });

    socket.on('update_gamestate', (info) => {
      setGameInfo(prev => ({ ...prev, ...info }));
    });

    socket.on('vote_result', (result) => {
      setLastVoteResult(result);
      setHasVoted(false);
      setTimeout(() => setLastVoteResult(null), 5000);
    });

    socket.on('quest_result', (result) => {
      setLastQuestResult(result);
      setHasVoted(false);
      setTimeout(() => setLastQuestResult(null), 5000);
    });

    socket.on('game_over', ({ winner }) => {
      setGameOver(winner);
    });

    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      socket.off('connect');
      socket.off('room_created');
      socket.off('player_joined');
      socket.off('game_started');
      socket.off('update_gamestate');
      socket.off('vote_result');
      socket.off('quest_result');
      socket.off('game_over');
      socket.off('error');
    };
  }, []);

  // --- EFFECT: TIMER ---
  useEffect(() => {
    const timer = setInterval(() => {
      if (gameInfo.timerEnd) {
        const left = Math.max(0, Math.floor((gameInfo.timerEnd - Date.now()) / 1000));
        setTimeLeft(left);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [gameInfo.timerEnd]);

  // --- EFFECT: CLEAR SELECTION ON PHASE CHANGE ---
  useEffect(() => {
    if (gameInfo.phase === 'TEAM_SELECTION') {
      setSelectedTeam([]);
    }
  }, [gameInfo.phase]);

  // --- ACTIONS ---
  const handleCreateRoom = () => {
    if (!playerName) return setError('Please enter your name');
    socket.emit('create_room', { hostName: playerName, playerCount: parseInt(playerCount) });
  };

  const handleJoinRoom = () => {
    if (!playerName) return setError('Please enter your name');
    if (!roomId) return setError('Please enter Room ID');
    socket.emit('join_room', { roomId: roomId.toUpperCase(), playerName });
    setScreen('LOBBY');
  };

  const handleStartGame = () => {
    socket.emit('start_game', { roomId });
  };

  const togglePlayerSelection = (playerId) => {
    // Only King can select during TEAM_SELECTION
    if (socket.id !== gameInfo.king) return;
    if (gameInfo.phase !== 'TEAM_SELECTION') return;

    if (selectedTeam.includes(playerId)) {
      setSelectedTeam(selectedTeam.filter(id => id !== playerId));
    } else {
      if (selectedTeam.length < gameInfo.requiredCount) {
        setSelectedTeam([...selectedTeam, playerId]);
      }
    }
  };

  const submitTeam = () => {
    if (selectedTeam.length !== gameInfo.requiredCount) return;
    socket.emit('propose_team', { roomId, selectedPlayerIds: selectedTeam });
  };

  const handleVote = (vote) => {
    socket.emit('submit_vote', { roomId, vote });
    setHasVoted(true);
  };

  const handleQuestMove = (success) => {
    socket.emit('submit_quest_move', { roomId, move: success });
    setHasVoted(true);
  };

  const handleAssassinate = (targetId) => {
    socket.emit('assassinate', { roomId, targetId });
  };

  // --- HELPERS ---
  const getRoleDisplayName = (role) => {
    switch (role) {
      case 'MORDRED': return 'Mordred';
      case 'MINION': return 'Minion of Mordred';
      case 'MERLIN': return 'Merlin';
      case 'SERVANT': return 'Servant of Arthur';
      default: return role;
    }
  };

  // Circular Layout Helpers
  const getPlayerPosition = (index, total) => {
    const angleStep = (2 * Math.PI) / total;
    const startAngle = Math.PI / 2; // Bottom start

    const angle = startAngle + (index * angleStep);
    const radius = 320; // px from center
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  const getOrderedPlayers = () => {
    const myIndex = players.findIndex(p => p.id === socket.id);
    if (myIndex === -1) return players;
    return [...players.slice(myIndex), ...players.slice(0, myIndex)];
  };

  // --- RENDER FUNCTIONS ---

  const renderHome = () => (
    <div className="game-container">
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <h1 style={{ fontSize: '4rem', color: 'var(--primary)' }}>AVALON</h1>
        <div style={{ marginBottom: '2rem' }}>
          <input
            type="text"
            placeholder="Enter Your Knight Name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            style={{ fontSize: '1.2rem', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="btn-action" onClick={() => setScreen('CREATE')}>Create</button>
          <button className="btn-action" style={{ background: '#555' }} onClick={() => setScreen('JOIN')}>Join</button>
        </div>
      </div>
    </div>
  );

  const renderCreate = () => (
    <div className="game-container">
      <div className="modal-content">
        <h2>Create Realm</h2>
        <select value={playerCount} onChange={e => setPlayerCount(e.target.value)} style={{ marginBottom: '1rem', fontSize: '1.2rem', padding: '1rem', width: '100%' }}>
          {[5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} Players</option>)}
        </select>
        <br />
        <button className="btn-action" onClick={handleCreateRoom}>Summon</button>
        <button className="btn-action" style={{ background: '#555' }} onClick={() => setScreen('HOME')}>Back</button>
      </div>
    </div>
  );

  const renderJoin = () => (
    <div className="game-container">
      <div className="modal-content">
        <h2>Join Realm</h2>
        <input placeholder="Room Code" value={roomId} onChange={e => setRoomId(e.target.value)} style={{ marginBottom: '1rem', textAlign: 'center', fontSize: '1.5rem', letterSpacing: '2px', textTransform: 'uppercase', width: '100%', boxSizing: 'border-box' }} />
        <br />
        <button className="btn-action" onClick={handleJoinRoom}>Enter</button>
        <button className="btn-action" style={{ background: '#555' }} onClick={() => setScreen('HOME')}>Back</button>
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="game-container">
      <div className="modal-content" style={{ width: '600px', maxWidth: '90%' }}>
        <h2>Room Code: <span style={{ color: 'var(--primary)', fontSize: '2.5rem', letterSpacing: '5px' }}>{roomId}</span></h2>
        <p style={{ color: '#aaa' }}>Waiting for knights... ({players.length}/{playerCount})</p>

        <div style={{ marginTop: '2rem', textAlign: 'left', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
          {players.map(p => (
            <div key={p.id} style={{ background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #444' }}>
              {p.name} {p.isHost && '👑'}
            </div>
          ))}
        </div>

        {isHost && (
          <div style={{ marginTop: '2rem' }}>
            <button className="btn-action" onClick={handleStartGame} disabled={players.length < 3}>Start Adventure</button>
          </div>
        )}
        {!isHost && <p style={{ marginTop: '2rem', fontStyle: 'italic' }}>Wait for the Host to begin...</p>}
      </div>
    </div>
  );

  const renderGame = () => {
    const isKing = socket.id === gameInfo.king;
    const orderedPlayers = getOrderedPlayers();
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    // Determine last vote icon map if available
    const voteMap = {};
    if (lastVoteResult) {
      lastVoteResult.votes.forEach(v => {
        // Need to match by name or ID. Server sends name. Assuming unique names.
        voteMap[v.name] = v.vote === 'APPROVE';
      });
    }

    return (
      <div className="game-container">
        {/* TOP HUD */}
        <div className="top-hud">
          <div className="hud-item">
            <div style={{ fontSize: '0.8rem', color: '#aaa' }}>ROLE</div>
            <strong style={{ color: ['MORDRED', 'MINION', 'EVIL'].includes(myRole) ? '#ef4444' : '#3b82f6', fontSize: '1.2rem' }}>
              {getRoleDisplayName(myRole)}
            </strong>
            {knowledge.length > 0 && (
              <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.2rem' }}>
                Highlighed: {knowledge.join(', ')}
              </div>
            )}
          </div>
          <div className="hud-item">
            <div style={{ fontSize: '0.8rem', color: '#aaa' }}>PHASE</div>
            <strong>{gameInfo.phase}</strong>
            {gameInfo.phase === 'TEAM_SELECTION' && (
              <span style={{ marginLeft: '10px', color: timeLeft < 30 ? 'red' : 'white' }}>{minutes}:{seconds < 10 ? '0' + seconds : seconds}</span>
            )}
          </div>
          <button onClick={() => setScreen('HOME')} className="hud-item" style={{ cursor: 'pointer', background: 'rgba(255,0,0,0.2)', color: 'white' }}>
            Quit
          </button>
        </div>

        {/* TABLE CENTER */}
        <div className="round-table">
          <div className="board-center">
            {/* Quest Track */}
            <div className="quest-track">
              {[1, 2, 3, 4, 5].map(qNum => {
                const result = gameInfo.questResults[qNum - 1];
                const isCurrent = qNum === gameInfo.currentQuest;
                const req = (playerCount === 6 ? [2, 3, 4, 3, 4] : [2, 3, 2, 3, 3])[qNum - 1];

                let className = "quest-token-board";
                if (result === true) className += " success";
                if (result === false) className += " fail";
                if (isCurrent) className += " current";

                return (
                  <div key={qNum} className={className}>
                    <span style={{ fontSize: '1.5rem', zIndex: 2 }}>{result === undefined ? qNum : (result ? '✔' : '✘')}</span>
                    {isCurrent && <span style={{ position: 'absolute', bottom: '-25px', fontSize: '0.8rem', color: '#fbbf24', textShadow: '0 0 5px black' }}>{req} Players</span>}
                  </div>
                )
              })}
            </div>

            {/* Vote Track e.g. 5 Circles for Rejected Votes */}
            <div className="vote-track">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`vote-circle ${i <= (gameInfo.failedVotes || 0) ? 'active' : ''}`}>
                  {i}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '5px' }}>Failed Votes (5 = Evil Win)</div>

            {/* Main Message Area */}
            <div style={{ marginTop: '1.5rem', minHeight: '50px' }}>
              {gameInfo.phase === 'TEAM_SELECTION' &&
                <div style={{ color: '#fbbf24' }}>King is choosing {gameInfo.requiredCount} knights.</div>}
              {gameInfo.phase === 'VOTE' && <div style={{ color: 'white' }}>Vote for the team!</div>}
              {gameInfo.phase === 'QUEST' && <div style={{ color: '#3b82f6' }}>Mission in progress...</div>}
              {gameInfo.phase === 'ASSASSINATION' && <div style={{ color: '#ef4444', animation: 'pulseRed 1s infinite' }}>ASSASSINATION! Find Merlin!</div>}
            </div>
          </div>
        </div>

        {/* PLAYERS - ABSOLUTE POSITIONED */}
        {orderedPlayers.map((p, index) => {
          const pos = getPlayerPosition(index, orderedPlayers.length);

          const isKingOfRound = p.id === gameInfo.king;
          const isSelected = selectedTeam.includes(p.id) || (gameInfo.proposedTeam || []).includes(p.id);
          const canAssassinate = (myRole === 'MORDRED') && gameInfo.phase === 'ASSASSINATION';
          // CHECK KNOWLEDGE
          const isKnownEvil = knowledge.includes(p.name);

          // Vote status
          let statusIcon = null;
          if (lastVoteResult && voteMap[p.name] !== undefined) {
            statusIcon = voteMap[p.name] ? '⚪' : '🔴';
          }

          return (
            <div key={p.id} className={`player-seat ${isKingOfRound ? 'king' : ''} ${isSelected ? 'selected' : ''} ${canAssassinate ? 'assassin-target' : ''} ${isKnownEvil ? 'known-evil' : ''}`}
              style={{ left: `calc(50% + ${pos.x}px)`, top: `calc(50% + ${pos.y}px)` }}
              onClick={() => {
                if (canAssassinate) handleAssassinate(p.id);
                else togglePlayerSelection(p.id);
              }}
            >
              {isKingOfRound && <div style={{ position: 'absolute', top: '-35px', left: '50%', transform: 'translateX(-50%)', color: '#fbbf24', fontSize: '2rem', zIndex: 10 }}>👑</div>}
              {isSelected && <div style={{ position: 'absolute', top: isKingOfRound ? '-70px' : '-45px', left: '50%', transform: 'translateX(-50%)', fontSize: '2.5rem', zIndex: 11, filter: 'drop-shadow(0 0 5px black)' }}>✅</div>}

              {statusIcon && <div className="status-icon" style={{ background: statusIcon === '⚪' ? 'white' : 'red', borderColor: 'black' }}></div>}

              <div className="avatar-frame" style={{
                backgroundImage: `url('https://api.dicebear.com/9.x/adventurer/svg?seed=${p.name}')`
              }}></div>

              <div className="player-name-tag">{p.name} {p.id === socket.id && '(You)'}</div>
            </div>
          )
        })}

        {/* ACTION BAR (BOTTOM) */}
        <div className="action-bar">
          {gameInfo.phase === 'TEAM_SELECTION' && isKing && (
            <button className="btn-action" disabled={selectedTeam.length !== gameInfo.requiredCount} onClick={submitTeam}>
              Propose Team
            </button>
          )}

          {gameInfo.phase === 'VOTE' && !hasVoted && (
            <>
              <button className="btn-action btn-approve" onClick={() => handleVote(true)}>Approve (White)</button>
              <button className="btn-action btn-reject" onClick={() => handleVote(false)}>Reject (Red)</button>
            </>
          )}

          {gameInfo.phase === 'QUEST' && !hasVoted && (gameInfo.proposedTeam || []).includes(socket.id) && (
            <>
              <button className="btn-action" style={{ background: '#3b82f6', borderColor: 'white' }} onClick={() => handleQuestMove(true)}>Success</button>
              {['MORDRED', 'MINION', 'EVIL'].includes(myRole) && (
                <button className="btn-action" style={{ background: '#ef4444', borderColor: 'black' }} onClick={() => handleQuestMove(false)}>Fail</button>
              )}
            </>
          )}

          {['VOTE', 'QUEST'].includes(gameInfo.phase) && hasVoted && (
            <div style={{ color: '#aaa', fontStyle: 'italic' }}>Waiting for others...</div>
          )}
        </div>

        {/* POPUPS */}
        {lastVoteResult && (
          <div className="modal-overlay" onClick={() => setLastVoteResult(null)}>
            <div className="modal-content">
              <h2 style={{ color: lastVoteResult.passed ? '#4ade80' : '#f87171', fontSize: '2.5rem' }}>
                {lastVoteResult.passed ? 'VOTE PASSED' : 'VOTE REJECTED'}
              </h2>
              <p>Tap to close</p>
            </div>
          </div>
        )}

        {lastQuestResult && (
          <div className="modal-overlay" onClick={() => setLastQuestResult(null)}>
            <div className="modal-content">
              <h2 style={{ fontSize: '3rem', color: lastQuestResult.success ? '#4ade80' : '#f87171' }}>
                QUEST {lastQuestResult.success ? 'SUCCEEDED' : 'FAILED'}
              </h2>
              <h3 style={{ color: 'white' }}>{lastQuestResult.failCount} Fails</h3>
              <p>Tap to continue</p>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h1 style={{ fontSize: '4rem', color: ['GOOD', 'MERLIN', 'SERVANT'].includes(gameOver) ? '#3b82f6' : '#ef4444' }}>
                {gameOver === 'GOOD' ? 'GOOD WINS' : 'EVIL WINS'}
              </h1>
              <button className="btn-action" onClick={() => window.location.reload()}>Play Again</button>
            </div>
          </div>
        )}

      </div>
    );
  };




  const isEvil = ['MORDRED', 'MINION', 'EVIL'].includes(myRole);
  const themeClass = isEvil ? 'theme-evil' : 'theme-good';
  const phaseClass = `phase-${gameInfo.phase}`;

  return (
    <div className={`App ${themeClass} ${phaseClass}`}>
      {error && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, background: '#ef4444', color: 'white', padding: '1rem', textAlign: 'center' }}>{error}</div>}

      {screen === 'HOME' && renderHome()}
      {screen === 'CREATE' && renderCreate()}
      {screen === 'JOIN' && renderJoin()}
      {screen === 'LOBBY' && renderLobby()}
      {screen === 'GAME' && renderGame()}
    </div>
  );
}

export default App;
