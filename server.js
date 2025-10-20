// server.js
// Simple Node server (Express) + WebSocket (ws) for rooms and real-time state sync.
// Run: npm install && node server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname)); // serve files from same folder (no subfolders created by assistant)

// Rooms in memory: { roomId: { id, name, password, players: Set(ws), state: {...} } }
const rooms = {};

function broadcastRoomList() {
  const list = Object.values(rooms).map(r => ({
    id: r.id, name: r.name, hasPassword: !!r.password, playerCount: r.players.size
  }));
  const msg = JSON.stringify({ type: 'rooms_list', rooms: list });
  // broadcast to all connected clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws, req) => {
  ws._joinedRoom = null;

  // send initial rooms list
  safeSend(ws, { type: 'rooms_list', rooms: Object.values(rooms).map(r => ({ id: r.id, name: r.name, hasPassword: !!r.password, playerCount: r.players.size })) });

  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch(e){ return; }

    switch(data.type) {
      case 'create_room': {
        const name = (data.name || '').trim();
        const password = data.password || '';
        if (!name) { safeSend(ws, { type: 'create_room_result', ok:false, error:'empty_name' }); break; }
        // ensure unique name
        const exists = Object.values(rooms).some(r => r.name.toLowerCase() === name.toLowerCase());
        if (exists) { safeSend(ws, { type: 'create_room_result', ok:false, error:'name_exists' }); break; }
        const id = uuidv4();
        rooms[id] = { id, name, password: password || null, players: new Set(), state: { meta:{}, echelons:{}, mapState:{} } };
        safeSend(ws, { type: 'create_room_result', ok:true, room:{ id, name, hasPassword:!!password } });
        broadcastRoomList();
        break;
      }
      case 'join_room': {
        const roomId = data.roomId;
        const password = data.password || '';
        const room = rooms[roomId];
        if (!room) { safeSend(ws, { type: 'join_result', ok:false, error:'no_room' }); break; }
        if (room.password && room.password !== password) { safeSend(ws, { type: 'join_result', ok:false, error:'bad_password' }); break; }
        // add player
        room.players.add(ws);
        ws._joinedRoom = roomId;
        // send success and current state
        safeSend(ws, { type: 'join_result', ok:true, room:{ id: room.id, name: room.name }, state: room.state });
        // notify others in room that player count changed
        broadcastRoomList();
        // notify room members about new participant
        const notice = { type: 'player_joined', roomId: room.id, count: room.players.size };
        room.players.forEach(p => { if (p.readyState === WebSocket.OPEN) p.send(JSON.stringify(notice)); });
        break;
      }
      case 'leave_room': {
        const roomId = ws._joinedRoom;
        if (roomId && rooms[roomId]) {
          rooms[roomId].players.delete(ws);
          ws._joinedRoom = null;
          broadcastRoomList();
        }
        break;
      }
      case 'room_state_update': {
        // full state or patch to be stored and broadcasted to room members
        const roomId = ws._joinedRoom || data.roomId;
        if (!roomId || !rooms[roomId]) { safeSend(ws, { type:'error', error:'no_room_joined' }); break; }
        // store state (overwrite) - this keeps server simple
        rooms[roomId].state = data.state || rooms[roomId].state;
        // broadcast to all in room (except sender optional)
        const payload = JSON.stringify({ type:'room_state', roomId, state: rooms[roomId].state });
        rooms[roomId].players.forEach(p => { if (p.readyState === WebSocket.OPEN) p.send(payload); });
        break;
      }
      case 'get_rooms': {
        broadcastRoomList();
        break;
      }
      default:
        // ignore unknown
        break;
    }
  });

  ws.on('close', () => {
    const roomId = ws._joinedRoom;
    if (roomId && rooms[roomId]) {
      rooms[roomId].players.delete(ws);
      // if room empty, keep it (so players can rejoin) — optional cleanup could be added
      broadcastRoomList();
    }
  });
});

server.listen(PORT, ()=> {
  console.log('Server started on port', PORT);
  console.log('Open http://localhost:' + PORT + '/ in your browser');
});