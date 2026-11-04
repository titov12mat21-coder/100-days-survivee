/**
 * MULTIPLAYER ARCHITECTURE (stub for future implementation)
 *
 * The game currently plays offline. To add real multiplayer later:
 *
 * 1. Signaling / relay: WebSocket server (Node.js + ws) OR PeerJS (WebRTC).
 *    Deploy server on Fly.io / Render / Railway (NOT GitHub Pages - it's static).
 *
 * 2. Client: implement `connect(roomId)`, `send(state)`, `on('update', cb)`.
 *
 * 3. Sync model (authoritative host):
 *    - One peer is host. Every tick host sends:
 *        { players: [...], monsters: [...], events: [...], day, timeOfDay }
 *    - Guests send their input (position, yaw, action) to host.
 *    - Host applies damage/monster AI centrally.
 *
 * 4. State broadcast rate: 10-20 Hz. Interpolation on guests.
 *
 * 5. This module's interface is intentionally stable so game.js can
 *    be wired to call `mp.sync(state)` every tick.
 */

export class MultiplayerClient {
  constructor(opts={}){
    this.connected = false;
    this.roomId = null;
    this.peers = new Map();
    this.opts = opts;
  }
  connect(roomId){ this.roomId = roomId; /* TODO: WebSocket/WebRTC */ }
  disconnect(){ /* TODO */ }
  sync(state){ /* TODO: send state to peers */ }
  on(event, cb){ /* TODO */ }
}

export function isMultiplayerEnabled(){ return false; }