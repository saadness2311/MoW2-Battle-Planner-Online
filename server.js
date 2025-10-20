const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let rooms = {};

function broadcast(room, msg, except) {
  for (const client of rooms[room].clients)
    if (client !== except && client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify(msg));
}

wss.on('connection', ws => {
  ws.on('message', message => {
    const data = JSON.parse(message);
    if (data.type === 'list_rooms') {
      ws.send(JSON.stringify({ type: 'rooms_list', rooms: Object.keys(rooms) }));
    }
    if (data.type === 'create_room') {
      rooms[data.roomId] = { clients: new Set(), state: null };
      ws.send(JSON.stringify({ type: 'room_created', roomId: data.roomId }));
    }
    if (data.type === 'join') {
      if (!rooms[data.roomId]) return;
      rooms[data.roomId].clients.add(ws);
      ws.send(JSON.stringify({ type: 'joined', roomId: data.roomId, state: rooms[data.roomId].state }));
    }
    if (data.type === 'map_update') {
      if (!rooms[data.roomId]) return;
      rooms[data.roomId].state = data.payload;
      broadcast(data.roomId, { type: 'map_update', payload: data.payload }, ws);
    }
  });

  ws.on('close', () => {
    for (const room of Object.values(rooms)) room.clients.delete(ws);
  });
});

console.log('WebSocket server running on ws://localhost:8080');
