/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  Trophy, 
  Play, 
  Users, 
  Check, 
  AlertCircle, 
  X, 
  Copy, 
  Volume2, 
  Crown, 
  RotateCcw, 
  UserPlus, 
  Sparkles,
  Info,
  Flame,
  Clock
} from 'lucide-react';
import { PeerNetworkManager, sounds } from './network';
import { GameState, Player, NetworkMessage } from './types';

// Cute Korean nickname combinations for quick starts
const ADJECTIVES = ['번개같은', '빛의속도', '찌릿찌릿', '광속돌파', '우주 최강', '순발력짱', '날쌘돌이', '신속정확', '바람같은', '빛보다빠른'];
const NOUNS = ['치타', '호랑이', '독수리', '다람쥐', '거북이', '토끼', '살쾡이', '매', '펭귄', '치타짱'];

function generateRandomNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

export default function App() {
  // Connections
  const networkRef = useRef<PeerNetworkManager | null>(null);
  
  // App context and roles
  const [role, setRole] = useState<'none' | 'host' | 'client'>('none');
  const [userName, setUserName] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [myId, setMyId] = useState('');
  const [hostParticipates, setHostParticipates] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // Game states (synced from server-of-truth)
  const [gameState, setGameState] = useState<GameState>({
    status: 'lobby',
    currentRound: 1,
    players: {},
    hostPeerId: '',
    cueTimestamp: 0,
    roundWinnerId: null
  });

  // Client-side local reaction helpers
  const [localCueTime, setLocalCueTime] = useState<number>(0);
  const [clickedThisRound, setClickedThisRound] = useState(false);
  const [foulThisRound, setFoulThisRound] = useState(false);
  const [myReactionTime, setMyReactionTime] = useState<number | null>(null);

  // Status & notifications log
  const [networkStatus, setNetworkStatus] = useState('오프라인');
  const [errorLog, setErrorLog] = useState('');

  // Host auto-countdown timer triggers
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [countdownText, setCountdownText] = useState<string | number>('');

  // Multi-edit: guarantee state update helper
  const isHost = role === 'host';

  // Initialize network manager
  useEffect(() => {
    const manager = new PeerNetworkManager();
    networkRef.current = manager;

    // Set a default random user nickname
    setUserName(generateRandomNickname());

    return () => {
      manager.cleanup();
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Sync state to everyone (HOST ONLY action)
  const broadcastState = (updatedState: GameState) => {
    if (!networkRef.current || role !== 'host') return;
    setGameState(updatedState);
    networkRef.current.send({
      type: 'SYNC_STATE',
      senderId: 'host',
      payload: updatedState
    });
  };

  // Sound cue hook triggered on Game State status change (Client & Host)
  useEffect(() => {
    if (gameState.status === 'cue') {
      sounds.playCue();
    } else if (gameState.status === 'waiting') {
      sounds.playCountdown();
    }
  }, [gameState.status]);

  // Network connection callbacks
  const handleHostStatus = (status: string, details?: string) => {
    switch (status) {
      case 'HOST_OPENED':
        setMyId(details || '');
        setNetworkStatus('선생님 모드: 대기실 개설됨');
        
        // Host initializes authoritative state
        const initialPlayers: Record<string, Player> = {};
        if (hostParticipates) {
          initialPlayers['host'] = {
            id: 'host',
            name: `${userName} (방장)`,
            score: 0,
            isHost: true,
            reactionHistory: []
          };
        }
        
        setGameState({
          status: 'lobby',
          currentRound: 1,
          players: initialPlayers,
          hostPeerId: details || '',
          cueTimestamp: 0,
          roundWinnerId: null
        });
        break;
      
      case 'CLIENT_CONNECTED_PRELIM':
        setNetworkStatus(`학생 접속 시도중: ${details}`);
        break;

      case 'CLIENT_CHANNEL_READY':
        setNetworkStatus(`학생 접속 완료: ${details}`);
        break;

      case 'CLIENT_DISCONNECTED':
        setNetworkStatus(`학생 퇴장: ${details}`);
        // Remove player on disconnection if in lobby
        if (details) {
          setGameState(prev => {
            const nextPlayers = { ...prev.players };
            delete nextPlayers[details];
            const updated = { ...prev, players: nextPlayers };
            // Let everyone know
            setTimeout(() => broadcastState(updated), 100);
            return updated;
          });
        }
        break;

      case 'ERROR':
        setErrorLog(`피어 오류 발생: ${details}`);
        setNetworkStatus('피어 오류');
        break;

      default:
        break;
    }
  };

  const handleClientStatus = (status: string, details?: string) => {
    switch (status) {
      case 'CLIENT_ID_ASSIGNED':
        setMyId(details || '');
        setNetworkStatus('피어 등록 완료. 대기실 입장 완료');
        break;
      
      case 'CONNECTED_TO_HOST':
        setNetworkStatus('대기실 접속 성공! 선생님과 실시간 연결됨');
        // Request host to add this player
        if (networkRef.current) {
          networkRef.current.send({
            type: 'CLIENT_JOIN',
            senderId: details || 'client',
            payload: { name: userName }
          });
        }
        break;

      case 'HOST_DISCONNECTED':
        setNetworkStatus('선생님이 방을 닫으셨습니다.');
        setRole('none');
        break;

      case 'HOST_CONNECTION_ERROR':
        setErrorLog('방이 없거나 연결에 실패했습니다. 코드를 확인하세요.');
        setRole('none');
        break;

      case 'ERROR':
        if (details === 'peer-unavailable') {
          setErrorLog('입력하신 방 코드(Peer ID)를 찾을 수 없습니다.');
        } else {
          setErrorLog(`오류가 발생했습니다: ${details}`);
        }
        setNetworkStatus('연결 실패');
        setRole('none');
        break;
        
      default:
        break;
    }
  };

  // Inbound messages dispatcher
  const handleIncomingMessage = (msg: NetworkMessage) => {
    const { type, senderId, payload } = msg;

    if (role === 'host') {
      // HOST handles messages from clients
      switch (type) {
        case 'CLIENT_JOIN':
          setGameState(prev => {
            const updatedPlayers = { ...prev.players };
            
            // Generate clean player record
            updatedPlayers[senderId] = {
              id: senderId,
              name: payload.name || `학생 #${senderId.substring(0, 4)}`,
              score: 0,
              isHost: false,
              reactionHistory: []
            };

            const nextState = { ...prev, players: updatedPlayers };
            // Broadcast refreshed lobby players
            setTimeout(() => broadcastState(nextState), 50);
            return nextState;
          });
          break;

        case 'CLIENT_RENAME':
          setGameState(prev => {
            if (!prev.players[senderId]) return prev;
            const updatedPlayers = { ...prev.players };
            updatedPlayers[senderId] = {
              ...updatedPlayers[senderId],
              name: payload.name
            };
            const nextState = { ...prev, players: updatedPlayers };
            setTimeout(() => broadcastState(nextState), 50);
            return nextState;
          });
          break;

        case 'CLIENT_CLICK':
          processPlayerClick(senderId, payload.reactionTime);
          break;

        case 'CLIENT_FOUL':
          processPlayerFoul(senderId);
          break;

        case 'GAME_RESTART':
          resetFullLobby();
          break;

        default:
          break;
      }
    } else {
      // CLIENT handles actions/states pushed by the host
      switch (type) {
        case 'SYNC_STATE':
          const syncedState = payload as GameState;
          setGameState(syncedState);
          
          // Clear internal triggers if new round starts
          if (syncedState.status === 'waiting') {
            setClickedThisRound(false);
            setFoulThisRound(false);
            setMyReactionTime(null);
          }
          break;

        case 'CUE_TRIGGERED':
          // High precision start anchor
          setLocalCueTime(performance.now());
          setGameState(prev => ({ ...prev, status: 'cue' }));
          break;

        default:
          break;
      }
    }
  };

  // Host Action: Create room
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;
    setErrorLog('');
    setRole('host');
    
    // Choose clean 6 letter code prefix for easily copyable rooms
    const customCode = `RT-${Math.floor(100000 + Math.random() * 900000)}`;
    if (networkRef.current) {
      networkRef.current.initHost(customCode, handleIncomingMessage, handleHostStatus);
    }
  };

  // Client Action: Join room
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !roomInput.trim()) return;
    setErrorLog('');
    setRole('client');

    const targetRoom = roomInput.trim().toUpperCase();
    if (networkRef.current) {
      networkRef.current.initClient(targetRoom, handleIncomingMessage, handleClientStatus);
    }
  };

  // Toggle host participation dynamically in lobby
  const toggleHostParticipation = () => {
    if (role !== 'host' || gameState.status !== 'lobby') return;
    const participates = !hostParticipates;
    setHostParticipates(participates);

    setGameState(prev => {
      const nextPlayers = { ...prev.players };
      if (participates) {
        nextPlayers['host'] = {
          id: 'host',
          name: `${userName} (방장)`,
          score: 0,
          isHost: true,
          reactionHistory: []
        };
      } else {
        delete nextPlayers['host'];
      }
      const nextState = { ...prev, players: nextPlayers };
      setTimeout(() => broadcastState(nextState), 50);
      return nextState;
    });
  };

  // Copy Room Link easily
  const copyRoomCode = () => {
    navigator.clipboard.writeText(gameState.hostPeerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // RENAME request handler
  const handleRenameMe = (newName: string) => {
    setUserName(newName);
    if (!networkRef.current) return;
    
    if (role === 'host') {
      setGameState(prev => {
        const nextPlayers = { ...prev.players };
        if (nextPlayers['host']) {
          nextPlayers['host'].name = `${newName} (방장)`;
        }
        const nextState = { ...prev, players: nextPlayers };
        setTimeout(() => broadcastState(nextState), 50);
        return nextState;
      });
    } else if (role === 'client') {
      networkRef.current.send({
        type: 'CLIENT_RENAME',
        senderId: myId,
        payload: { name: newName }
      });
    }
  };

  // --- GAME FLOW LOGIC (HOST AUTHORITATIVE) ---

  // Host method to initiate the reaction countdown
  const startNextRound = () => {
    if (role !== 'host') return;
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // Initial setup: Clear player round buffers and mark ready
    const resetPlayers = { ...gameState.players };
    Object.keys(resetPlayers).forEach(id => {
      resetPlayers[id].currentRoundResult = { status: 'ready' };
    });

    const waitingState: GameState = {
      ...gameState,
      status: 'waiting',
      players: resetPlayers,
      roundWinnerId: null
    };
    broadcastState(waitingState);

    // Sounds trigger
    sounds.playCountdown();

    // Random timeout triggers cue show
    const randomLatency = Math.random() * 2500 + 1500; // 1.5s to 4s random wait duration
    
    countdownIntervalRef.current = setTimeout(() => {
      triggerCueEvent();
    }, randomLatency);
  };

  // Host method: Show Cue to everyone
  const triggerCueEvent = () => {
    if (role !== 'host') return;
    
    const triggeredState: GameState = {
      ...gameState,
      status: 'cue',
      cueTimestamp: Date.now()
    };
    
    // Send standard action trigger, then set state locally
    if (networkRef.current) {
      networkRef.current.send({
        type: 'CUE_TRIGGERED',
        senderId: 'host',
        payload: { timestamp: triggeredState.cueTimestamp }
      });
    }
    
    setLocalCueTime(performance.now());
    setGameState(triggeredState);
  };

  // Host: Process Click Timing from a participant
  const processPlayerClick = (playerId: string, reactionTime: number) => {
    if (role !== 'host' || gameState.status !== 'cue') return;

    setGameState(prev => {
      // Safety guards
      if (!prev.players[playerId]) return prev;
      if (prev.players[playerId].currentRoundResult?.status === 'success') return prev; // Avoid duplicate clicks

      const nextPlayers = { ...prev.players };
      nextPlayers[playerId] = {
        ...nextPlayers[playerId],
        currentRoundResult: {
          status: 'success',
          reactionTime: reactionTime
        }
      };

      const newState = { ...prev, players: nextPlayers };
      
      // Determine if round should conclude (all players clicked or fouled)
      checkRoundCompletion(newState);
      return newState;
    });
  };

  // Host: Process Foul / Early Click
  const processPlayerFoul = (playerId: string) => {
    if (role !== 'host' || (gameState.status !== 'waiting' && gameState.status !== 'lobby')) return;

    sounds.playFoul();

    setGameState(prev => {
      if (!prev.players[playerId]) return prev;
      
      const nextPlayers = { ...prev.players };
      nextPlayers[playerId] = {
        ...nextPlayers[playerId],
        currentRoundResult: {
          status: 'foul'
        }
      };

      const newState = { ...prev, players: nextPlayers };
      
      // Check round completion if everyone has fouled (edge case)
      checkRoundCompletion(newState);
      return newState;
    });
  };

  // Host: Test round completion conditions
  const checkRoundCompletion = (currentState: GameState) => {
    const activePlayers = Object.values(currentState.players);
    if (activePlayers.length === 0) return;

    // Check if every active player has either clicked (success) or fouled (foul)
    const allFinished = activePlayers.every(
      p => p.currentRoundResult && (p.currentRoundResult.status === 'success' || p.currentRoundResult.status === 'foul')
    );

    if (allFinished) {
      evaluateRoundRanking(currentState);
    }
  };

  // Host: Calculate results, give scores, history append
  const evaluateRoundRanking = (currentState: GameState) => {
    const playersArr = Object.values(currentState.players);
    
    // Find all successful clicks
    const successes = playersArr
      .filter(p => p.currentRoundResult?.status === 'success' && p.currentRoundResult.reactionTime !== undefined)
      .sort((a, b) => (a.currentRoundResult!.reactionTime || 0) - (b.currentRoundResult!.reactionTime || 0));

    const nextPlayers = { ...currentState.players };
    let winnerId: string | null = null;

    if (successes.length > 0) {
      winnerId = successes[0].id; // Fast clicker wins!
      sounds.playSuccess();
    } else {
      sounds.playFoul(); // No successes, everyone fouled!
    }

    // Score distribution system
    playersArr.forEach(player => {
      const pId = player.id;
      const res = player.currentRoundResult;
      const cachedHistory = [...player.reactionHistory];
      
      let scoreGain = 0;
      let recordTime = -1;

      if (res?.status === 'success' && res.reactionTime !== undefined) {
        recordTime = res.reactionTime;
        cachedHistory.push(recordTime);

        // Give basic points for responding
        scoreGain += 5; 
        
        // Speedy bonus to winner
        if (pId === winnerId) {
          scoreGain += 5; // Extra round victory reward +5 pts
        }
      } else {
        // Foul gets No points, logged as -1 timing
        cachedHistory.push(-1);
      }

      nextPlayers[pId] = {
        ...player,
        score: player.score + scoreGain,
        reactionHistory: cachedHistory
      };
    });

    const isLastRound = currentState.currentRound >= 5;
    const nextGameStatus = isLastRound ? 'end' : 'result';

    if (nextGameStatus === 'end') {
      setTimeout(() => {
        sounds.playVictory();
      }, 500);
    }

    const evaluatedState: GameState = {
      ...currentState,
      status: nextGameStatus,
      players: nextPlayers,
      roundWinnerId: winnerId
    };

    broadcastState(evaluatedState);
  };

  // Host manual bypass to round results (in case somebody went AFK)
  const manualBypassRound = () => {
    if (role !== 'host') return;
    evaluateRoundRanking(gameState);
  };

  // Host action: Advance to subsequent round
  const advanceToNextRound = () => {
    if (role !== 'host') return;
    
    const nextRoundIndex = gameState.currentRound + 1;
    setGameState(prev => {
      const updated = {
        ...prev,
        currentRound: nextRoundIndex,
        status: 'lobby' as const, // Transit back to lobby temporary pre-trigger state
        roundWinnerId: null
      };

      // Reset round outputs in view
      Object.keys(updated.players).forEach(id => {
        updated.players[id].currentRoundResult = { status: 'none' };
      });

      broadcastState(updated);
      return updated;
    });

    // Auto-trigger round countdown immediately
    setTimeout(() => {
      startNextRound();
    }, 1200);
  };

  // Host action: Completely reset the lobby and restart game
  const resetFullLobby = () => {
    if (role !== 'host') return;

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    const clearedPlayers = { ...gameState.players };
    Object.keys(clearedPlayers).forEach(id => {
      clearedPlayers[id].score = 0;
      clearedPlayers[id].reactionHistory = [];
      clearedPlayers[id].currentRoundResult = { status: 'none' };
    });

    const resetState: GameState = {
      status: 'lobby',
      currentRound: 1,
      players: clearedPlayers,
      hostPeerId: gameState.hostPeerId,
      cueTimestamp: 0,
      roundWinnerId: null
    };

    broadcastState(resetState);
  };

  // --- CLIENT CLICK CANVAS HANDLERS ---
  const handleClientInteractiveClick = () => {
    if (clickedThisRound || foulThisRound) return;

    if (gameState.status === 'cue') {
      // Successful snap!
      const elapsed = performance.now() - localCueTime;
      const formattedElapsed = Math.round(elapsed);
      
      sounds.playSuccess();
      setMyReactionTime(formattedElapsed);
      setClickedThisRound(true);

      if (role === 'host') {
        processPlayerClick('host', formattedElapsed);
      } else {
        // Send timing packet immediately
        if (networkRef.current) {
          networkRef.current.send({
            type: 'CLIENT_CLICK',
            senderId: myId,
            payload: { reactionTime: formattedElapsed }
          });
        }
      }
    } else if (gameState.status === 'waiting') {
      // Eager beep foul!
      sounds.playFoul();
      setFoulThisRound(true);

      if (role === 'host') {
        processPlayerFoul('host');
      } else {
        if (networkRef.current) {
          networkRef.current.send({
            type: 'CLIENT_FOUL',
            senderId: myId
          });
        }
      }
    }
  };

  // Leave Session 
  const handleLeaveSession = () => {
    if (networkRef.current) {
      networkRef.current.cleanup();
    }
    setRole('none');
    setGameState({
      status: 'lobby',
      currentRound: 1,
      players: {},
      hostPeerId: '',
      cueTimestamp: 0,
      roundWinnerId: null
    });
    setClickedThisRound(false);
    setFoulThisRound(false);
    setMyReactionTime(null);
  };

  // Helper selectors
  const activePlayersList = Object.values(gameState.players) as Player[];
  const lobbyHost = activePlayersList.find(p => p.isHost);
  const myPlayerInfo = gameState.players[isHost ? 'host' : myId];

  // UI state for countdown timer during Waiting 
  return (
    <div className="min-h-screen flex flex-col justify-between py-6 px-4 md:px-8 max-w-7xl mx-auto">
      
      {/* Header Bar */}
      <header className="flex flex-col md:flex-row justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 mb-6 gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shadow-lg shadow-indigo-500/5 animate-pulse">
            <Zap className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              실시간 반응속도 게임
              <span className="text-xs bg-indigo-500 text-white font-medium px-2 py-0.5 rounded-full uppercase tracking-wider">P2P</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">선생님과 학생들이 실시간 마우스 클릭으로 순발력을 트레이닝하는 게임!</p>
          </div>
        </div>

        {/* Status indicator pill */}
        <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono">
          <div className={`w-2.5 h-2.5 rounded-full ${role !== 'none' ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
          <span>{role === 'host' ? '선생님(방장)' : role === 'client' ? '학생(참가자)' : '오프라인'}</span>
          {role !== 'none' && (
            <button 
              onClick={handleLeaveSession}
              className="ml-2 px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded border border-rose-500/20 transition duration-150 flex items-center gap-1 font-sans cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> 나가기
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        
        {/* LEFT COLUMN: Setup, Room info & Player lists */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Setup / Identity Panel */}
          {role === 'none' ? (
            <div className="bg-slate-900/80 backdrop-blur border border-slate-850 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
              <h2 className="text-md font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                프로필 & 방 설정
              </h2>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">내 닉네임 입력</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    maxLength={15}
                    placeholder="이름을 입력하세요"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                  />
                  <button 
                    onClick={() => setUserName(generateRandomNickname())}
                    title="랜덤 닉네임 생성"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition"
                  >
                    🎲
                  </button>
                </div>
              </div>

              {/* Host Session Form */}
              <form onSubmit={handleCreateRoom} className="mt-2 border-t border-slate-800/60 pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">대결 방 개설 (선생님)</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-indigo-400">
                    <input
                      type="checkbox"
                      checked={hostParticipates}
                      onChange={toggleHostParticipation}
                      className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500"
                    />
                    선생님 직접 참여
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={!userName.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-xl font-bold text-sm tracking-wide transition shadow-lg shadow-indigo-600/10 cursor-pointer disabled:opacity-50"
                >
                  새로운 클래스 방 만들기
                </button>
              </form>

              {/* Client Join Form */}
              <form onSubmit={handleJoinRoom} className="border-t border-slate-800/60 pt-4 flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400">기존 방 참여 (학생)</label>
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  placeholder="방 코드 입력 (ID)"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white text-center font-mono focus:outline-none focus:border-indigo-500 uppercase tracking-widest"
                />
                <button
                  type="submit"
                  disabled={!userName.trim() || !roomInput.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-4 rounded-xl font-bold text-sm tracking-wide transition shadow-lg shadow-emerald-600/10 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" /> 방 번호로 입장하기
                </button>
              </form>

              {errorLog && (
                <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-start gap-2 animate-bounce">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorLog}</span>
                </div>
              )}
            </div>
          ) : (
            // Room Information Card (When inside room)
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
              <div className="flex flex-col gap-1 pb-3 border-b border-slate-800">
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">ROOM ACCESS CODE</span>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="font-mono text-lg font-black text-white tracking-widest bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
                    {gameState.hostPeerId || '생성 중...'}
                  </span>
                  
                  {gameState.hostPeerId && (
                    <button
                      onClick={copyRoomCode}
                      className="p-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 hover:text-white rounded-lg transition duration-200 cursor-pointer"
                      title="방 코드 복사"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {copied && <span className="text-[10px] text-emerald-400 font-semibold mt-1">코드가 클립보드에 복사되었습니다!</span>}
              </div>

              {/* Host Dashboard Instructions / Control Panel */}
              {isHost ? (
                <div className="flex flex-col gap-3">
                  <div className="p-3 bg-indigo-500/5 text-[11px] text-indigo-300 rounded-lg border border-indigo-500/10 flex items-start gap-1.5">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>선생님(Host)은 아래 학생 목록을 확인한 후 대결을 실시간으로 통제합니다.</span>
                  </div>

                  {gameState.status === 'lobby' && (
                    <button
                      onClick={startNextRound}
                      disabled={activePlayersList.length < 1}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold p-3 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      {gameState.currentRound === 1 ? '반응속도 대결 시작' : '다음 라운드 시작'}
                    </button>
                  )}

                  {gameState.status === 'waiting' && (
                    <button
                      onClick={manualBypassRound}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs p-2.5 rounded-lg border border-slate-700 transition cursor-pointer"
                    >
                      기다리지 않고 즉시 강제 Cue 생성
                    </button>
                  )}

                  {gameState.status === 'cue' && (
                    <button
                      onClick={manualBypassRound}
                      className="w-full bg-slate-800 hover:bg-rose-900 text-rose-300 font-medium text-xs p-2.5 rounded-lg border border-slate-700 transition cursor-pointer"
                    >
                      강제 라운드 종료 (Bypass)
                    </button>
                  )}

                  {(gameState.status === 'result' || gameState.status === 'end') && (
                    <div className="flex flex-col gap-2">
                      {gameState.status === 'result' ? (
                        <button
                          onClick={advanceToNextRound}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl transition duration-150 shadow-lg cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Play className="w-4 h-4" /> 다음 라운드로 진행
                        </button>
                      ) : (
                        <button
                          onClick={resetFullLobby}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl transition duration-150 shadow-lg cursor-pointer flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4" /> 게임 초기화 & 다시하기
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="p-3 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded-xl text-xs flex items-start gap-1.5">
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>선생님의 신호 대기 중입니다. 화면 지시사항을 잘 살피세요!</span>
                  </div>
                  
                  {/* Dynamic username edit for client */}
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="text-[10px] text-slate-400 font-bold">내 이름 변경</span>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => handleRenameMe(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Player List in Room */}
          {role !== 'none' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col gap-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  참여 학생/인원 목록 
                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 font-semibold">
                    {activePlayersList.length}
                  </span>
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-none flex flex-col gap-2">
                {activePlayersList.map((player) => {
                  const isMe = isHost ? player.id === 'host' : player.id === myId;
                  const recentResult = player.currentRoundResult;
                  
                  return (
                    <div 
                      key={player.id} 
                      className={`flex justify-between items-center px-3.5 py-3 rounded-xl border transition ${
                        isMe 
                          ? 'bg-indigo-500/10 border-indigo-500/30' 
                          : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {player.isHost ? (
                          <span className="text-xs text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">방장</span>
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                        <span className={`text-sm truncate text-white ${isMe ? 'font-bold text-indigo-200' : 'text-slate-300'}`}>
                          {player.name} {isMe && '(나)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Status feedback icons for the current round */}
                        {gameState.status !== 'lobby' && recentResult && (
                          <div className="text-xs">
                            {recentResult.status === 'success' && (
                              <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                {recentResult.reactionTime}ms
                              </span>
                            )}
                            {recentResult.status === 'foul' && (
                              <span className="text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">
                                부정출발🚨
                              </span>
                            )}
                            {recentResult.status === 'ready' && (
                              <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[10px] animate-pulse">
                                준비됨
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Cumulated Scores */}
                        <div className="flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-xs font-black text-slate-100">{player.score}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (BIG): Interactive Click Board or Multi-stage layout */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Main game board */}
          {role === 'none' ? (
            // Out of Room Splash screen instructions
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-12 flex flex-col justify-center items-center text-center shadow-2xl h-full gap-6 select-none">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 rounded-full blur-3xl opacity-20 w-32 h-32 mx-auto"></div>
                <Zap className="w-20 h-20 text-indigo-400 relative" />
              </div>
              
              <div className="max-w-md">
                <h2 className="text-2xl font-black text-white">클래스 대항 실시간 반응속도 제전!</h2>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  인앱 PeerJS 기술을 활용하여 중앙 서버 없이 완전 무료로 학생들과 경쟁할 수 있습니다. 
                  대결에 참여하려면 좌측에서 닉네임을 생성한 뒤 새로운 방을 만들거나, 선생님이 공유한 코드를 입력하여 입장하세요.
                </p>
              </div>

              {/* Game steps list */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl mt-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left">
                  <div className="text-xs font-bold text-indigo-400">STEP 1</div>
                  <h4 className="text-sm font-bold text-white mt-1">방 개설 또는 입장</h4>
                  <p className="text-xs text-slate-500 mt-1">방장이 만든 고유 6자리 코드로 쉽고 편하게 연결합니다.</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left">
                  <div className="text-xs font-bold text-emerald-400">STEP 2</div>
                  <h4 className="text-sm font-bold text-white mt-1">화면 대기 & 탭 클릭</h4>
                  <p className="text-xs text-slate-500 mt-1">화면이 녹색으로 활성화되는 찰나에 마우스를 먼저 클릭하세요!</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left">
                  <div className="text-xs font-bold text-amber-500">STEP 3</div>
                  <h4 className="text-sm font-bold text-white mt-1">5라운드 정량 분석</h4>
                  <p className="text-xs text-slate-500 mt-1">개인 타임라인 그래프와 스피드 레이팅 순위를 정밀 제공합니다.</p>
                </div>
              </div>
            </div>
          ) : (
            // Active multi-user game container 
            <div className="flex-1 flex flex-col gap-6">
              
              {/* Game Stage banner */}
              <div className="flex justify-between items-center bg-slate-900 border border-slate-850 px-5 py-3 rounded-2xl text-sm shadow">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span className="font-extrabold text-white">라운드 {gameState.currentRound} / 5</span>
                </div>

                <div className="text-xs font-medium text-slate-400">
                  {gameState.status === 'lobby' && <span className="text-indigo-400">다음 대결 대기중</span>}
                  {gameState.status === 'waiting' && <span className="text-amber-400 animate-pulse">호스트의 타이머 시그널 작동 중...</span>}
                  {gameState.status === 'cue' && <span className="text-emerald-400 font-extrabold animate-bounce">클릭하십시오! NOW!</span>}
                  {gameState.status === 'result' && <span className="text-slate-300">라운드 정산완료</span>}
                  {gameState.status === 'end' && <span className="text-yellow-400 font-black">대항전 종료! 명예의 전당</span>}
                </div>
              </div>

              {/* STAGE DISPLAY SWITCHBOARD */}

              {gameState.status === 'lobby' && (
                // LOBBY STATE (Waiting, showing room instructions before click test)
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col justify-center items-center text-center shadow-xl flex-1 gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">
                      <Zap className="w-10 h-10 fill-indigo-500/20" />
                    </div>
                    <h3 className="text-xl font-bold text-white">라운드 {gameState.currentRound} 준비중</h3>
                    <p className="text-sm text-slate-400 max-w-md">
                      {isHost 
                        ? '참여할 학생들이 모두 입장했다면 [반응속도 대결 시작] 버튼을 누르십시오.' 
                        : '선생님이 대결을 시작할 때까지 마우스를 준비하고 기다려주세요!'
                      }
                    </p>
                  </div>

                  {/* Quick summary cards for existing players */}
                  <div className="w-full max-w-lg bg-slate-950 p-4 rounded-2xl border border-slate-850/60">
                    <span className="text-xs text-slate-500 font-bold block mb-2">클래스 현황</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 text-left">
                        <span className="text-[10px] text-slate-500 block">총 라운드</span>
                        <span className="text-sm font-extrabold text-white">5 라운드 매칭</span>
                      </div>
                      <div className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 text-left">
                        <span className="text-[10px] text-slate-500 block">연결 상태</span>
                        <span className="text-sm font-extrabold text-emerald-400">정상 통신중</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(gameState.status === 'waiting' || gameState.status === 'cue') && (
                // ACTIVE CLICKING SCREEN (Dynamic interaction area)
                <div 
                  onClick={handleClientInteractiveClick}
                  className={`relative border-3 rounded-3xl p-6 flex flex-col justify-center items-center text-center shadow-2xl flex-1 select-none transition-all duration-75 min-h-[350px] cursor-pointer ${
                    gameState.status === 'cue'
                      ? 'bg-emerald-500 border-emerald-400 shadow-emerald-500/10'
                      : 'bg-indigo-900/40 border-indigo-800 hover:bg-indigo-900/50'
                  }`}
                >
                  {/* Backdrop glowing decorations */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 pointer-events-none rounded-3xl"></div>

                  <div className="relative flex flex-col items-center gap-4">
                    {/* Pulsing alert circles */}
                    {gameState.status === 'waiting' ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center text-amber-400 animate-pulse">
                          <Flame className="w-8 h-8 fill-amber-500/20" />
                        </div>
                        <h3 className="text-2xl font-black text-white tracking-tight">집중하세요...!</h3>
                        <p className="text-xs text-indigo-300 max-w-sm">
                          화면 컬러가 가슴 시리도록 <strong className="text-emerald-400">초록색</strong>으로 즉각 변신할 때, 빠르게 화면을 터치/클릭하세요!
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 animate-bounce">
                        <div className="w-20 h-20 rounded-full bg-white/20 border-3 border-white/60 flex items-center justify-center text-white">
                          <Zap className="w-12 h-12 fill-current" />
                        </div>
                        <h3 className="text-4xl font-extrabold text-white tracking-widest drop-shadow">지금 누르세요!!!</h3>
                        <p className="text-sm text-emerald-50 font-medium">CLICK NOW!</p>
                      </div>
                    )}
                  </div>

                  {/* Overlay client optimistic feedback (so participant knows their score status) */}
                  {(clickedThisRound || foulThisRound) && (
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur rounded-2xl flex flex-col justify-center items-center p-6 gap-3">
                      {foulThisRound ? (
                        <>
                          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-full flex items-center justify-center">
                            <X className="w-8 h-8" />
                          </div>
                          <h4 className="text-lg font-black text-rose-400">부정출발! 너무 미리 눌렀습니다 🚨</h4>
                          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                            라운드 시작 전에 성급하게 누르면 기회를 박탈당합니다. 다른 사람들의 대결 결과를 경청하세요!
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center animate-bounce">
                            <Check className="w-8 h-8" />
                          </div>
                          <h4 className="text-lg font-black text-emerald-400">기록 송신 완료!</h4>
                          <div className="bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-xl font-mono text-xl font-black text-white">
                            {myReactionTime} ms
                          </div>
                          <p className="text-xs text-slate-400">
                            동시에 진행하는 모든 참가자의 응답이 완료되면 선생님이 다음 스테이지로 정량 배치합니다.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {gameState.status === 'result' && (
                // ROUND RESULTS SUMMARY LIST (Detailed review stage)
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 flex flex-col shadow-xl flex-1 gap-6 min-h-[350px]">
                  
                  {/* Round Winner Banner */}
                  <div className="flex flex-col md:flex-row items-center justify-between bg-indigo-500/10 border border-indigo-500/20 p-5 rounded-2xl gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 flex items-center justify-center shadow-lg shadow-amber-500/5">
                        <Crown className="w-6 h-6 fill-amber-500/10" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-indigo-400 tracking-wider uppercase">ROUND {gameState.currentRound} WINNER</h3>
                        <p className="text-lg font-black text-white mt-0.5">
                          {gameState.roundWinnerId 
                            ? `${gameState.players[gameState.roundWinnerId]?.name || '학생'} (${gameState.players[gameState.roundWinnerId]?.currentRoundResult?.reactionTime}ms)`
                            : '이번 라운드는 모두가 부정출발 처리되었습니다 🚨'
                          }
                        </p>
                      </div>
                    </div>

                    {isHost && (
                      <button
                        onClick={advanceToNextRound}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition shadow-lg shadow-indigo-600/15 cursor-pointer"
                      >
                        다음 라운드 진행하기
                      </button>
                    )}
                  </div>

                  {/* Standing score log block */}
                  <div className="flex-1 flex flex-col gap-3">
                    <h4 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase pl-2">이번 라운드 순위표</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activePlayersList
                        .sort((a, b) => {
                          const aTime = a.currentRoundResult?.status === 'success' ? (a.currentRoundResult.reactionTime || 999999) : 999999;
                          const bTime = b.currentRoundResult?.status === 'success' ? (b.currentRoundResult.reactionTime || 999999) : 999999;
                          return aTime - bTime;
                        })
                        .map((player, rankIdx) => {
                          const result = player.currentRoundResult;
                          const isFoul = result?.status === 'foul';
                          const isWinner = result?.status === 'success' && player.id === gameState.roundWinnerId;

                          return (
                            <div 
                              key={player.id} 
                              className={`flex justify-between items-center px-4 py-3 rounded-xl border ${
                                isWinner 
                                  ? 'bg-amber-500/10 border-amber-500/30' 
                                  : 'bg-slate-950/40 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`text-xs font-black font-mono w-4 ${isWinner ? 'text-amber-400' : 'text-slate-500'}`}>
                                  {isFoul ? 'X' : `${rankIdx + 1}`}
                                </span>
                                <span className="text-xs font-bold text-white truncate max-w-[120px]">{player.name}</span>
                              </div>

                              <div className="text-xs flex items-center gap-1.5 font-mono">
                                {isFoul ? (
                                  <span className="text-rose-400 bg-rose-500/5 border border-rose-500/20 px-2 py-0.5 rounded font-sans text-[10px]">부정출발</span>
                                ) : result?.status === 'success' ? (
                                  <>
                                    <span className="text-emerald-400 font-bold">{result.reactionTime} ms</span>
                                    {isWinner && <span className="text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-bold font-sans">WIN (+10pt)</span>}
                                    {!isWinner && <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans">+5pt</span>}
                                  </>
                                ) : (
                                  <span className="text-slate-500">참여 불가</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {gameState.status === 'end' && (
                // GAME FINAL SUMMARY (PODIUMS + ANALYSIS)
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-10 flex flex-col shadow-xl flex-1 gap-8 min-h-[350px]">
                  
                  {/* Final Podium Card Head */}
                  <div className="text-center flex flex-col items-center gap-2 border-b border-slate-800 pb-6">
                    <Trophy className="w-16 h-16 text-yellow-400 fill-yellow-500/10 animate-bounce" />
                    <h3 className="text-2xl font-black text-white">🏆 최종 대항전 클래스 서바이벌 결과 🏆</h3>
                    <p className="text-xs text-slate-400">총 5라운드를 완벽 수합하여 종합 스피드 챔피언을 공시합니다.</p>
                  </div>

                  {/* 1, 2, 3 podium illustration */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {activePlayersList
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 3)
                      .map((player, index) => {
                        const trophyColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];
                        const ringColor = ['border-yellow-500/30 bg-yellow-500/5', 'border-slate-400/20 bg-slate-400/5', 'border-amber-600/20 bg-amber-600/5'];
                        const crowns = ['🥇', '🥈', '🥉'];
                        
                        // Calculate average speed
                        const successes = player.reactionHistory.filter(t => t > 0);
                        const avgSpeed = successes.length > 0 
                          ? Math.round(successes.reduce((acc, curr) => acc + curr, 0) / successes.length)
                          : '측정치 없음';

                        return (
                          <div 
                            key={player.id} 
                            className={`p-5 rounded-2xl border text-center relative flex flex-col justify-between ${ringColor[index] || 'border-slate-800 bg-slate-950/20'}`}
                          >
                            <div className="absolute top-3 left-3 text-lg">{crowns[index]}</div>
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-md font-black text-white mt-1">{player.name}</span>
                              <span className="text-xs text-slate-400">평균 속도: <strong className="text-indigo-300">{avgSpeed}ms</strong></span>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                              <span className="text-xs text-slate-500 font-bold uppercase">최종 득점</span>
                              <span className="text-lg font-black text-white">{player.score} 점</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Historical charts simulation */}
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">각 라운드별 반응 속도 추이 (ms)</h4>
                    
                    <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3.5">
                      {activePlayersList.map((player) => {
                        return (
                          <div key={player.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                            <span className="text-xs font-extrabold text-slate-300 w-32 truncate">{player.name}</span>
                            
                            {/* SVG / HTML Custom flexible Timeline representation */}
                            <div className="flex-1 flex gap-1 items-end h-8 border-b border-slate-800/80 px-2">
                              {player.reactionHistory.map((rt, roundIdx) => {
                                const isDisqualified = rt <= 0;
                                // Height representation (faster timing is shorter, hence let's reverse range to represent visual progress nicely!)
                                const progressPct = isDisqualified ? 0 : Math.max(10, Math.min(100, (1000 - rt) / 10));

                                return (
                                  <div key={roundIdx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                                    <div 
                                      className={`w-full rounded-t transition-all ${
                                        isDisqualified ? 'bg-rose-500/20 h-1.5' : 'bg-indigo-500 hover:bg-emerald-500'
                                      }`}
                                      style={{ height: isDisqualified ? '6px' : `${progressPct}%` }}
                                    ></div>
                                    
                                    {/* Tooltip on Hover */}
                                    <span className="absolute bottom-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-900 border border-slate-700 text-[10px] text-white px-1.5 py-0.5 rounded font-mono pointer-events-none transition whitespace-nowrap shadow-xl z-20">
                                      {roundIdx + 1}R: {isDisqualified ? '부정출발' : `${rt}ms`}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <span className="text-[11px] font-mono font-bold text-indigo-400 w-24 text-right">
                              최우수: {Math.min(...player.reactionHistory.filter(t => t > 0))}ms
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reset/Restart block */}
                  {isHost && (
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={resetFullLobby}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-2xl shadow-xl transition cursor-pointer flex items-center gap-2"
                      >
                        <RotateCcw className="w-5 h-5" /> 새로운 대결 시작하기 (방 초기화)
                      </button>
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

        </div>
      </main>

      {/* Footer bar */}
      <footer className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center text-xs text-slate-500 flex flex-col md:flex-row justify-between items-center gap-2 shadow-inner">
        <div>
          <span>© 2026 실시간 반응속도 대결 플랫폼. Real-time P2P Network Session provided by PeerJS.</span>
        </div>
        <div className="flex gap-4">
          <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded">서버 불필요</span>
          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">P2P 암호화</span>
        </div>
      </footer>

    </div>
  );
}
