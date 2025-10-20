const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = {};

function makeEmptyState(){
  return { meta: { createdAt: new Date().toISOString(), mapFile: null, echelonCount: 3 },
           echelons: { 1:{markers:[],simple:[],drawings:[]}, 2:{markers:[],simple:[],drawings:[]}, 3:{markers:[],simple:[],drawings:[]} },
           mapState: { center: null, zoom: 0 } };
}

function send(ws, type, payload){
  try{ ws.send(JSON.stringify({type, payload})); }catch(e){}
}

function broadcastRoom(room, type, payload, exceptWs=null){
  const msg = JSON.stringify({ type, payload });
  room.clients.forEach(c => {
    if(c !== exceptWs && c.readyState === WebSocket.OPEN){
      try{ c.send(msg); }catch(e){}
    }
  });
}

wss.on('connection', (ws) => {
  ws._roomId = null;
  ws.on('message', raw => {
    let msg;
    try{ msg = JSON.parse(raw); }catch(e){ return send(ws,'error','invalid_json'); }
    const { type, payload } = msg;
    if(type === 'create_room'){
      const roomId = uuidv4();
      const name = payload?.name || `Комната ${roomId.slice(0,5)}`;
      const password = payload?.password || '';
      rooms[roomId] = { id: roomId, name, password, clients: new Set(), state: makeEmptyState(), maxPlayers: payload.maxPlayers || 0 };
      return send(ws,'room_created',{ roomId, name });
    }
    if(type === 'list_rooms'){
      const list = Object.values(rooms).map(r => ({ id: r.id, name: r.name, hasPassword: !!r.password, clients: r.clients.size, maxPlayers: r.maxPlayers }));
      return send(ws,'room_list', list);
    }
    if(type === 'join_room'){
      const { roomId, password } = payload || {};
      const room = rooms[roomId];
      if(!room) return send(ws,'room_error','not_found');
      if(room.password && room.password !== password) return send(ws,'room_error','wrong_password');
      room.clients.add(ws);
      ws._roomId = roomId;
      send(ws,'room_joined',{ roomId: room.id, name: room.name, state: room.state });
      broadcastRoom(room,'user_joined',{ count: room.clients.size }, ws);
      return;
    }
    if(type === 'leave_room'){
      const rid = ws._roomId; if(!rid) return;
      const room = rooms[rid]; if(room){ room.clients.delete(ws); broadcastRoom(room,'user_left',{ count: room.clients.size }); if(room.clients.size===0){ delete rooms[rid]; } }
      ws._roomId = null; return send(ws,'left', {});
    }
    if(type === 'action'){
      const rid = ws._roomId; if(!rid) return send(ws,'error','not_in_room');
      const room = rooms[rid]; if(!room) return send(ws,'error','room_missing');
      const action = payload;
      try{
        switch(action.actionType){
          case 'load_map':
            room.state.meta.mapFile = action.data.mapFile || null;
            room.state.mapState = { center: action.data.center || null, zoom: action.data.zoom || 0 };
            break;
          case 'set_state':
            room.state = action.data.state || room.state;
            break;
          case 'place_marker':
            if(action.data && action.data.marker){
              const mk = action.data.marker;
              const e = (action.data.echelon||1);
              room.state.echelons[e] = room.state.echelons[e] || {markers:[],simple:[],drawings:[]};
              room.state.echelons[e].markers = room.state.echelons[e].markers.filter(m=>m.id!==mk.id).concat([mk]);
            }
            break;
          case 'remove_marker':
            if(action.data && action.data.id){
              const e = (action.data.echelon||1);
              room.state.echelons[e].markers = (room.state.echelons[e].markers||[]).filter(m=>m.id!==action.data.id);
            }
            break;
          case 'update_marker_pos':
            if(action.data && action.data.id && action.data.latlng){
              const e = (action.data.echelon||1);
              const arr = room.state.echelons[e].markers || [];
              arr.forEach(m=>{ if(m.id === action.data.id) m.latlng = action.data.latlng; });
            }
            break;
          case 'add_drawing':
            {
              const e = (action.data.echelon||1);
              room.state.echelons[e].drawings = room.state.echelons[e].drawings || [];
              room.state.echelons[e].drawings.push(action.data.drawing);
            }
            break;
          case 'clear_all':
            {
              const e = (action.data.echelon||1);
              room.state.echelons[e] = { markers: [], simple: [], drawings: [] };
            }
            break;
          default:
            console.log('unknown action', action.actionType);
        }
      }catch(err){ console.warn('action apply error', err); }
      broadcastRoom(room,'action', action, null);
      return;
    }
    send(ws,'error','unknown_type');
  });

  ws.on('close', () => {
    const rid = ws._roomId;
    if(rid){ const room = rooms[rid]; if(room){ room.clients.delete(ws); broadcastRoom(room,'user_left',{ count: room.clients.size }); if(room.clients.size===0){ delete rooms[rid]; } } ws._roomId = null; }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
