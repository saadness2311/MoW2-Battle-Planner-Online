/* realtime.js
   Полностью переработанная версия:
   - Без никнеймов вообще
   - Меню комнат можно свернуть и развернуть
   - Сохраняется оригинальный дизайн
*/
(function(){
  function el(id){return document.getElementById(id);}
  function nowTs(){return Date.now();}
  const ROOMS_KEY = 'mow2_rooms_v1';

// --- PeerJS-based multi-device signaling (uses PeerJS Cloud for signaling) ---
window._peerState = window._peerState || {};
(function(){
  const peerState = window._peerState;
  peerState.peers = peerState.peers || {}; // data connections map peerId -> conn
  peerState.myPeerId = peerState.myPeerId || null;
  peerState.peer = peerState.peer || null;
  peerState.hostConnections = peerState.hostConnections || {}; // if this client is host for rooms

  function makePeerId(){
    return 'mow2-' + Math.random().toString(36).slice(2,8);
  }

  // Ensure we have a Peer object (PeerJS Cloud)
  function ensurePeer(){
    if(peerState.peer) return Promise.resolve(peerState.peer);
    return new Promise((resolve, reject)=>{
      try {
        const p = new Peer(); // defaults to PeerJS Cloud
        peerState.peer = p;
        p.on('open', function(id){
          peerState.myPeerId = id;
          console.log('[PeerJS] open id=', id);
          resolve(p);
        });
        p.on('connection', function(conn){
          console.log('[PeerJS] incoming conn from', conn.peer);
          setupConnectionHandlers(conn);
        });
        p.on('error', function(err){ console.warn('[PeerJS] error', err); });
      } catch(e){
        console.warn('PeerJS init failed', e);
        reject(e);
      }
    });
  }

  // Setup handlers for a DataConnection
  function setupConnectionHandlers(conn){
    peerState.peers[conn.peer] = conn;
    conn.on('data', function(data){
      try{
        if(!data || !data.type) return;
        if(data.type === 'get-rooms'){
          // send current rooms
          const rooms = loadRooms();
          conn.send({ type: 'rooms-init', rooms: rooms });
        } else if(data.type === 'rooms-init'){
          // merge rooms
          const rooms = loadRooms();
          for(const nm in data.rooms){
            if(!rooms[nm]){
              rooms[nm] = data.rooms[nm];
            }
          }
          saveRooms(rooms);
          renderRooms();
        } else if(data.type === 'room-created' && data.room){
          const rooms = loadRooms();
          if(!rooms[data.room.name]){
            rooms[data.room.name] = data.room;
            saveRooms(rooms);
            renderRooms();
          }
        } else if(data.type === 'map-action' && data.action){
          const ev2 = new CustomEvent('realtime-map-action', {detail: data.action});
          window.dispatchEvent(ev2);
        }
      }catch(e){ console.error('peer data handler', e); }
    });
    conn.on('open', function(){ console.log('[PeerJS] conn open to', conn.peer); });
    conn.on('close', function(){ delete peerState.peers[conn.peer]; console.log('[PeerJS] conn closed', conn.peer); });
    conn.on('error', function(err){ console.warn('[PeerJS] conn error', err); });
  }

  // Connect to a peerId (used to reach room host)
  function connectToPeer(peerId){
    return ensurePeer().then(p=>{
      if(peerState.peers[peerId]) return peerState.peers[peerId];
      try{
        const conn = p.connect(peerId, { reliable: true });
        setupConnectionHandlers(conn);
        return conn;
      }catch(e){ console.warn('connectToPeer failed', e); throw e; }
    });
  }

  // Expose minimal API
  window.PeerBridge = {
    ensurePeer,
    connectToPeer,
    sendToAll: function(msg){
      // send message to all connected peers
      for(const pid in peerState.peers){
        try{ peerState.peers[pid].send(msg); }catch(e){}
      }
    },
    myPeerId: function(){ return peerState.myPeerId; },
    peerState: peerState
  };
})();
// --- end PeerJS bridge ---

  function loadRooms(){
    try{
      const raw = localStorage.getItem(ROOMS_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){return {};}
  }
  function saveRooms(obj){ localStorage.setItem(ROOMS_KEY, JSON.stringify(obj)); }

  function escapeHtml(s){
    return (s+'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function renderRooms(){
    const listDiv = el('rooms-list');
    const rooms = loadRooms();
    listDiv.innerHTML = '';
    const names = Object.keys(rooms).sort();
    if(names.length===0){
      listDiv.innerHTML = '<div style="color:#666">Комнат пока нет</div>';
      return;
    }
    names.forEach(name=>{
      const r = rooms[name];
      const row = document.createElement('div');
      row.style.padding='6px 0';
      row.style.borderBottom='1px solid #eee';
      row.innerHTML = '<strong>'+escapeHtml(name)+'</strong> — ' + (r.count||0) + ' игроков ' + (r.pass ? '🔒' : '');
      const joinBtn = document.createElement('button');
      joinBtn.textContent = 'Присоединиться';
      joinBtn.style.marginLeft='8px';
      joinBtn.onclick = ()=>{ promptJoin(name); };
      row.appendChild(joinBtn);
      listDiv.appendChild(row);
    });
  }

  function promptJoin(name){
    const rooms = loadRooms();
    const r = rooms[name];
    if(!r){ alert('Комната не найдена'); renderRooms(); return; }
    if(r.pass){
      const p = prompt('Введите пароль для комнаты "'+name+'":');
      if(p===null) return;
      if(p !== r.pass){
        alert('Неверный пароль');
        return;
      }
    }
    const roomLink = location.origin + location.pathname + '#room=' + encodeURIComponent(r.id);
    location.href = roomLink;
  }

  
function createRoom(name, pass){
    const rooms = loadRooms();
    if(!name || !name.trim()) throw new Error('empty-name');
    if(rooms[name]) throw new Error('name-exists');
    const id = 'r' + Math.random().toString(36).slice(2,10);
    rooms[name] = { id: id, name: name, pass: pass || '', created: nowTs(), count: 0 };
    saveRooms(rooms);

    // Broadcast to connected peers via PeerJS DataConnections if available
    try{
      if(window.PeerBridge && window.PeerBridge.peerState){
        // send to all known peers
        window.PeerBridge.sendToAll({ type: 'room-created', room: rooms[name] });
      }
    }catch(e){ console.warn('peer broadcast failed', e); }

    return rooms[name];
  }

  }

  function updateCountForRoomId(roomId, delta){
    const rooms = loadRooms();
    let changed=false;
    for(const name in rooms){
      if(rooms[name].id === roomId){
        rooms[name].count = Math.max(0, (rooms[name].count||0) + delta);
        changed=true;
      }
    }
    if(changed) saveRooms(rooms);
  }

  document.addEventListener('DOMContentLoaded', function(){

    // --- Initialize PeerJS for cross-device P2P signaling ---
    try{
      if(window.PeerBridge){
        window.PeerBridge.ensurePeer().then(function(p){
          console.log('[PeerBridge] peer ready id=', window.PeerBridge.myPeerId());
          // If URL contains host param, connect to host to request rooms
          var h = parseHash();
          if(h.host){
            try{
              window.PeerBridge.connectToPeer(h.host).then(function(conn){
                // request current rooms from host
                conn.send({ type: 'get-rooms' });
              }).catch(function(e){ console.warn('connect to host failed', e); });
            }catch(e){ console.warn('peer connect error', e); }
          }
        }).catch(function(){ console.warn('PeerBridge ensurePeer failed'); });
      }
    }catch(e){ console.warn('PeerBridge init failed', e); }
    // --- end PeerJS init ---
    const btnShow = el('btn-show-create');
    const createForm = el('create-form');
    const btnCancel = el('btn-cancel-create');
    const btnCreate = el('btn-create-room');
    const roomLinkDiv = el('room-link');
    const createError = el('create-error');
    const overlay = el('rooms-overlay');

    // 🧩 Добавляем кнопку сворачивания/разворачивания меню комнат
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'rooms-toggle';
    toggleBtn.textContent = 'Комнаты ⤢';
    Object.assign(toggleBtn.style, {
      position: 'fixed',
      top: '10px',
      left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'none',
      padding: '6px 10px',
      borderRadius: '8px',
      border: '1px solid #888',
      background: '#fff',
      cursor: 'pointer',
      fontSize: '14px'
    });
    document.body.appendChild(toggleBtn);

    let overlayVisible = true;
    toggleBtn.onclick = ()=>{
      overlayVisible = !overlayVisible;
      overlay.style.display = overlayVisible ? 'block' : 'none';
    };

    btnShow.onclick = ()=>{
      createForm.style.display='block';
      btnShow.style.display='none';
    };
    btnCancel.onclick = ()=>{
      createForm.style.display='none';
      btnShow.style.display='inline-block';
      roomLinkDiv.style.display='none';
      createError.innerText='';
    };

    btnCreate.onclick = ()=>{
      createError.innerText = '';
      const name = el('room-name').value.trim();
      const pass = el('room-pass').value;
      if(!pass || !pass.trim()){ createError.innerText = 'Пароль обязателен при создании комнаты'; return; }
      try{
        const roomObj = createRoom(name, pass);
        const link = location.origin + location.pathname + '#room=' + encodeURIComponent(roomObj.id) + ( (window.PeerBridge && window.PeerBridge.myPeerId()) ? '&host=' + encodeURIComponent(window.PeerBridge.myPeerId()) : '' );
        roomLinkDiv.innerHTML = '<div>Ссылка: <a href="'+link+'">'+link+'</a></div>';
        roomLinkDiv.style.display='block';
        startTogether(roomObj.id);
      }catch(e){
        if(e.message === 'empty-name') createError.innerText = 'Название не может быть пустым';
        else if(e.message === 'name-exists') createError.innerText = 'Комната с таким названием уже существует';
        else createError.innerText = 'Ошибка: ' + e.message;
      }
      renderRooms();
    };

    renderRooms();
    setInterval(renderRooms, 5000);

    function parseHash(){
      const h = location.hash.substring(1);
      const params = {};
      h.split('&').forEach(part=>{
        const kv = part.split('=');
        if(kv[0]) params[kv[0]] = decodeURIComponent((kv[1]||''));
      });
      return params;
    }

    const params = parseHash();
    if(params.room){ startTogether(params.room); }

    window.startTogether = function(roomId){
      if(!window.TogetherJS){
        alert('TogetherJS не загружен.');
        return;
      }

      TogetherJS.config_getUserName = () => 'Игрок';
      TogetherJS();

      TogetherJS.on("ready", function () {
        // скрываем панель комнат
        overlay.style.display = 'none';
        toggleBtn.style.display = 'block';
        overlayVisible = false;

        updateCountForRoomId(roomId, 1);
        renderRooms();

        const roomsObj = loadRooms();
        for(const nm in roomsObj){
          TogetherJS.send({type:'announce-room', room: roomsObj[nm]});
        }
        TogetherJS.send({type:'presence','roomId':roomId});
      });

      TogetherJS.on("close", function () {
        overlay.style.display = 'block';
        toggleBtn.style.display = 'none';
        overlayVisible = true;
        const pr = parseHash();
        if(pr.room) updateCountForRoomId(pr.room, -1);
        renderRooms();
      });

      TogetherJS.hub.on("togetherjs.msg", function (msg) {
        try{
          const data = msg.msg;
          if(!data || !data.type) return;
          if(data.type === 'announce-room'){
            const rooms = loadRooms();
            if(!rooms[data.room.name]){
              rooms[data.room.name] = data.room;
              saveRooms(rooms);
              renderRooms();
            }
          }else if(data.type === 'map-action'){
            const ev = new CustomEvent('realtime-map-action', {detail: data});
            window.dispatchEvent(ev);
          }else if(data.type === 'presence'){
            if(data.roomId){
              updateCountForRoomId(data.roomId, 1);
              renderRooms();
            }
          }
        }catch(e){ console.error(e); }
      });

      window.sendMapAction = function(action){
        action._ts = nowTs();
        try{
          if(window.BroadcastChannel){
            window._roomsBC = window._roomsBC || new BroadcastChannel('mow2_rooms_channel');
            window._roomsBC.postMessage({ type: 'map-action', action: action });
          }
          // Fallback: write to storage to notify other tabs
          try{ localStorage.setItem('__mow2_map_action', JSON.stringify({action: action, _ts:Date.now()})); }catch(e){}
        }catch(e){}
      };
    };

    window.addEventListener('storage', function(e){
      if(e.key === ROOMS_KEY) renderRooms();
    });

  });
})();
