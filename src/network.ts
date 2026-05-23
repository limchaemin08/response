/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Peer, type DataConnection } from 'peerjs';
import { GameState, NetworkMessage, Player } from './types';

// Arcade sound generator using HTML5 Web Audio API
export class SoundController {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playCountdown() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime); // Standard middle-beeps
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {
      console.warn('Web Audio failure', e);
    }
  }

  playCue() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1000, this.ctx.currentTime); // High alarm click start!
      osc.frequency.exponentialRampToValueAtTime(1500, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (e) {
      console.warn('Web Audio failure', e);
    }
  }

  playFoul() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime); // Low disappointment buzzer
      osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.45);
    } catch (e) {
      console.warn('Web Audio failure', e);
    }
  }

  playSuccess() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Arpeggio beep-beep-beep!
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.08, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.12);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.12);
      });
    } catch (e) {
      console.warn('Web Audio failure', e);
    }
  }

  playVictory() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Beautiful triumph sound
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.1, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.3);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.35);
      });
    } catch (e) {
      console.warn('Web Audio failure', e);
    }
  }
}

export const sounds = new SoundController();

/**
 * P2P Real-Time Session Manager utilizing PeerJS
 */
export class PeerNetworkManager {
  public peer: Peer | null = null;
  public connections: Record<string, DataConnection> = {};
  private onMessageCallback: (msg: NetworkMessage) => void = () => {};
  private onStatusCallback: (status: string, details?: string) => void = () => {};
  private isHostMode = false;
  
  constructor() {}

  /**
   * Start a Host room session
   */
  public initHost(
    customRoomCode: string,
    onMessage: (msg: NetworkMessage) => void,
    onStatus: (status: string, details?: string) => void
  ) {
    this.cleanup();
    this.isHostMode = true;
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;

    // Initialize Peer with standard options
    this.peer = new Peer(customRoomCode);

    this.peer.on('open', (id) => {
      this.onStatusCallback('HOST_OPENED', id);
    });

    this.peer.on('connection', (conn) => {
      this.onStatusCallback('CLIENT_CONNECTED_PRELIM', conn.peer);
      
      this.connections[conn.peer] = conn;

      conn.on('open', () => {
        this.onStatusCallback('CLIENT_CHANNEL_READY', conn.peer);
      });

      conn.on('data', (raw) => {
        try {
          const msg = raw as NetworkMessage;
          this.onMessageCallback(msg);
        } catch (e) {
          console.error('Failed to parse incoming peer packet:', e);
        }
      });

      conn.on('close', () => {
        this.handleClientDisconnect(conn.peer);
      });

      conn.on('error', (err) => {
        console.error(`Connection error for client ${conn.peer}:`, err);
        this.handleClientDisconnect(conn.peer);
      });
    });

    this.peer.on('error', (err) => {
      console.error('Host Peer Exception occurred:', err);
      onStatus('ERROR', err.type || err.message);
    });

    this.peer.on('disconnected', () => {
      this.onStatusCallback('DISCONNECTED');
    });
  }

  /**
   * Join an existing Host room session
   */
  public initClient(
    hostRoomId: string,
    onMessage: (msg: NetworkMessage) => void,
    onStatus: (status: string, details?: string) => void
  ) {
    this.cleanup();
    this.isHostMode = false;
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;

    this.peer = new Peer(); // Let server assign a random ID for us

    this.peer.on('open', (clientId) => {
      this.onStatusCallback('CLIENT_ID_ASSIGNED', clientId);

      // Establish target handshake
      const conn = this.peer!.connect(hostRoomId);
      this.connections[hostRoomId] = conn;

      conn.on('open', () => {
        this.onStatusCallback('CONNECTED_TO_HOST', hostRoomId);
      });

      conn.on('data', (raw) => {
        try {
          const msg = raw as NetworkMessage;
          this.onMessageCallback(msg);
        } catch (e) {
          console.error('Failed parsing client socket payload:', e);
        }
      });

      conn.on('close', () => {
        this.onStatusCallback('HOST_DISCONNECTED', hostRoomId);
      });

      conn.on('error', (err) => {
        console.error('Handshake pipe error:', err);
        this.onStatusCallback('HOST_CONNECTION_ERROR', err.message);
      });
    });

    this.peer.on('error', (err) => {
      console.error('Client Peer Exception occurred:', err);
      onStatus('ERROR', err.type || err.message);
    });
  }

  /**
   * Broadcast message (Host -> All Clients, or Client -> Host)
   */
  public send(msg: NetworkMessage) {
    if (this.isHostMode) {
      // Broadcast to all clients
      Object.values(this.connections).forEach((conn) => {
        if (conn.open) {
          conn.send(msg);
        }
      });
    } else {
      // Send directly to the host
      Object.values(this.connections).forEach((conn) => {
        if (conn.open) {
          conn.send(msg);
        }
      });
    }
  }

  private handleClientDisconnect(clientPeerId: string) {
    delete this.connections[clientPeerId];
    this.onStatusCallback('CLIENT_DISCONNECTED', clientPeerId);
  }

  /**
   * Graceful cleanup
   */
  public cleanup() {
    Object.values(this.connections).forEach((conn) => {
      try {
        conn.close();
      } catch (e) {}
    });
    this.connections = {};

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
  }
}
