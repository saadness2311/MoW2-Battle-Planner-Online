const WS_SERVER_URL = 'ws://localhost:8080';
let ws, map, drawnItems, roomId;

vkBridge.send('VKWebAppInit');

function initWebSocket() {
  ws = new WebSocket(WS_SERVER_URL);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'list_rooms' }));
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'rooms_list') showRooms(data.rooms);
    if (data.type === 'room_created') joinRoom(data.roomId);
    if (data.type === 'joined') {
      roomId = data.roomId;
      document.getElementById('lobby').style.display = 'none';
      document.getElementById('map').style.display = 'block';
      initMap();
      if (data.state) L.geoJSON(data.state).addTo(drawnItems);
    }
    if (data.type === 'map_update' && drawnItems) {
      drawnItems.clearLayers();
      L.geoJSON(data.payload).addTo(drawnItems);
    }
  };
}

function showRooms(rooms) {
  const list = document.getElementById('roomList');
  list.innerHTML = rooms.map(r => `<button onclick="joinRoom('${r}')">${r}</button>`).join('');
}

function joinRoom(id) {
  ws.send(JSON.stringify({ type: 'join', roomId: id }));
}

document.getElementById('createRoom').onclick = () => {
  const name = document.getElementById('roomInput').value.trim();
  if (name) ws.send(JSON.stringify({ type: 'create_room', roomId: name }));
};

function initMap() {
  map = L.map('map').setView([55.75, 37.61], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: { polygon: true, polyline: true, marker: true }
  });
  map.addControl(drawControl);
  map.on(L.Draw.Event.CREATED, e => {
    drawnItems.addLayer(e.layer);
    sendMapState();
  });
  map.on(L.Draw.Event.EDITED, sendMapState);
  map.on(L.Draw.Event.DELETED, sendMapState);
}

function sendMapState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const geojson = drawnItems.toGeoJSON();
  ws.send(JSON.stringify({ type: 'map_update', payload: geojson }));
}

initWebSocket();
