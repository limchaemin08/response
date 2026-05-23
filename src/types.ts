/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Player {
  id: string; // Peer ID or random string (for host, let's use 'host')
  name: string;
  score: number;
  isHost: boolean;
  reactionHistory: number[]; // Reaction times for each completed round (in ms, or -1 for fouls/misses)
  currentRoundResult?: {
    status: 'none' | 'success' | 'foul' | 'ready';
    reactionTime?: number; // millisecond timing
  };
}

export type GameStatus = 'lobby' | 'waiting' | 'cue' | 'result' | 'end';

export interface GameState {
  status: GameStatus;
  currentRound: number; // 1 to 5
  players: Record<string, Player>;
  hostPeerId: string;
  cueTimestamp: number; // Node/Client high-precision timestamp when cue triggered
  roundWinnerId?: string | null;
}

// Peer Message Types
export type NetworkMessageType =
  | 'SYNC_STATE'     // Host -> Client: Full Game state broadcast
  | 'CLIENT_JOIN'    // Client -> Host: Request join with client info
  | 'CLIENT_CLICK'   // Client -> Host: User clicked target successfully
  | 'CLIENT_FOUL'    // Client -> Host: User clicked too early
  | 'CLIENT_RENAME'  // Client -> Host: Request name change
  | 'GAME_START'     // Client(or Host) -> Host: Request game start
  | 'GAME_RESTART'   // Request lobby reset
  | 'CUE_TRIGGERED'  // Host -> Client: Show standard flash target now
  | 'ROUND_SKIP';    // Host -> Client: Bypass round if everyone fouls/disconnects

export interface NetworkMessage {
  type: NetworkMessageType;
  senderId: string;
  payload?: any;
}
