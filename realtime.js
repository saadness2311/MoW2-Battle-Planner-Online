
// PeerJS-based realtime (v13) - pure PeerJS signalling, no TogetherJS
(function(){
  'use strict';

  function el(id){ return document.getElementById(id); }

  const ROOMS_KEY = '__mow2_rooms_v3';

  function nowTs(){ return Date.now(); }

  function loadRooms(){
    try{ return JSON.parse(localStorage.getItem(ROOMS_KEY) || '{}'); }catch(e){ return {}; }
  }
  function saveRooms(r){ try{ localStorage.setItem(ROOMS_KEY, JSON.stringify(r)); }catch(e){} }

  function createRoom(name, pass){
    const rooms = loadRooms();
    if(!name || !name.trim()) throw new Error('empty-name');
    if(rooms[name]) throw new Error('name-exists');
    const id = 'r' + Math.random().toString(36).slice(2,10);
    rooms[name] = { id: id, name: name, pass: pass || '', created: nowTs(), count: 0 };
    saveRooms(rooms);
    return rooms[name];
  }

  function renderRooms(){
    const listDiv = el('rooms-list');
    if(!listDiv) return;
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
      row.innerHTML = '<strong>'+escapeHtml(name)+'</strong> — ' + (r.count||0) + ' игроков ' + (r.pass ? '🔒' : '') + ' <button data-join="'+escapeHtml(name)+'">Войти</button>';
      listDiv.appendChild(row);
      row.querySelector('button').addEventListener('click', ()=> promptJoin(name));
    });
  }

  function escapeHtml(s){ return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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

  // Minimal PeerBridge using PeerJS Cloud
  window.PeerBridge = (function(){
    let peer = null;
    let peerId = null;
    let conns = {};
    function ensurePeer(){
      return new Promise(function(resolve, reject){
        if(peer && peerId) return resolve(peer);
        try{
          peer = new Peer(undefined, { debug: 0 });
        }catch(e){ console.error('Peer init failed', e); return reject(e); }
        peer.on('open', function(id){
          peerId = id;
          console.log('[PeerBridge] open id=', id);
          peer.on('connection', function(conn){
            const id = conn.peer;
            console.log('[PeerBridge] incoming conn from', id);
            conns[id] = conn;
            conn.on('data', function(data){
              try{ window.dispatchEvent(new CustomEvent('peerbridge:data', { detail: { from: id, data: data } })); }catch(e){}
            });
            conn.on('close', function(){ delete conns[id]; });
            conn.on('error', function(e){ console.warn('conn error', e); });
          });
          resolve(peer);
        });
        peer.on('error', function(err){ console.warn('[PeerBridge] error', err); reject(err); });
      });
    }
    function myPeerId(){ return peerId; }
    function connectToPeer(otherId){
      return new Promise(function(resolve, reject){
        if(!peer) return reject(new Error('no-peer'));
        if(conns[otherId]) return resolve(conns[otherId]);
        const conn = peer.connect(otherId, { reliable: true });
        conn.on('open', function(){ conns[otherId] = conn; resolve(conn); });
        conn.on('error', function(e){ reject(e); });
        setTimeout(function(){ if(!conn.open) reject(new Error('connect-timeout')); }, 7000);
      });
    }
    function sendToAll(msg){
      Object.keys(conns).forEach(id=>{
        try{ conns[id].send(msg); }catch(e){ console.warn('send failed', e); }
      });
    }
    return { ensurePeer, myPeerId, connectToPeer, sendToAll };
  })()
// --- Map action broadcast API ---
// Call window.broadcastMapAction({type:'marker-add', data:{...}})
window.broadcastMapAction = function(action){
  try{
    // attach timestamp and sender id
    action._ts = Date.now();
    action._from = window.PeerBridge && window.PeerBridge.myPeerId ? window.PeerBridge.myPeerId() : 'local';
    // send via PeerBridge if available
    if(window.PeerBridge && typeof window.PeerBridge.sendToAll === 'function'){
      try{ window.PeerBridge.sendToAll({ type: 'map-action', action: action }); }catch(e){ console.warn('PeerBridge sendToAll failed', e); }
    }
    // also write to localStorage to notify other tabs
    try{ localStorage.setItem('__mow2_map_action', JSON.stringify({action: action, _ts: Date.now()})); }catch(e){}
  }catch(e){ console.error('broadcastMapAction error', e); }
};

// Handler for incoming map-action messages via PeerBridge
window.addEventListener('peerbridge:data', function(ev){
  const data = ev.detail && ev.detail.data;
  try{
    if(data && data.type === 'map-action' && data.action){
      const action = data.action;
      // If this client is host, and action came from a client, rebroadcast to others
      if(window._isRoomHost){
        try{ window.PeerBridge.sendToAll({ type: 'map-action', action: action }); }catch(e){}
      }
      // Dispatch a DOM event so map code can listen: 'peer-map-action'
      try{
        window.dispatchEvent(new CustomEvent('peer-map-action', { detail: action }));
      }catch(e){}
      // Also write to localStorage for any existing local listeners
      try{ localStorage.setItem('__mow2_map_action', JSON.stringify({action: action, _ts: Date.now()})); }catch(e){}
    }
  }catch(e){ console.warn('peerbridge map-action handler error', e); }
});
;

  // Host/join protocol handling
  window.addEventListener('peerbridge:data', function(ev){
    const from = ev.detail.from;
    const data = ev.detail.data;
    try{
      if(data && data.type === 'join-request'){
        console.log('[PeerBridge] join-request from', from, data);
        // Only host should accept and respond with join-accepted for its room
        if(window._isRoomHost && window._hostRoomId && data.roomId === window._hostRoomId){
          // increment count locally
          try{
            const rooms = loadRooms();
            for(const n in rooms){ if(rooms[n].id === data.roomId){ rooms[n].count = (rooms[n].count||0) + 1; saveRooms(rooms); break; } }
          }catch(e){}
          // reply to requester
          const conn = null; // sending via PeerBridge.sendToAll is the simple choice
          window.PeerBridge.sendToAll({ type: 'join-accepted', roomId: data.roomId, fromHost: window.PeerBridge.myPeerId() });
        }
      }
      if(data && data.type === 'join-accepted'){
        console.log('[PeerBridge] join-accepted', data);
        // client received acceptance, can proceed (in real app start syncing)
        alert('Подключение к комнате подтверждено хостом.');
      }
    }catch(e){ console.warn('peerbridge handler error', e); }
  });

  // DOM init
  document.addEventListener('DOMContentLoaded', function(){
    const btnShow = el('btn-show-create');
    const createForm = el('create-form');
    const btnCancel = el('btn-cancel-create');
    const btnCreate = el('btn-create-room');
    const roomLinkDiv = el('room-link');
    const createError = el('create-error');
    const overlay = el('rooms-overlay');

    // toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'rooms-toggle';
    toggleBtn.textContent = 'Комнаты ⤢';
    Object.assign(toggleBtn.style, {
      position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'none',
      padding: '6px 10px', borderRadius: '8px', border: '1px solid #888', background: '#fff', cursor: 'pointer', fontSize: '14px'
    });
    document.body.appendChild(toggleBtn);
    let overlayVisible = true;
    toggleBtn.addEventListener('click', function(){
      overlay.style.display = overlayVisible ? 'none' : 'block';
      overlayVisible = !overlayVisible;
      toggleBtn.style.display = overlayVisible ? 'none' : 'block';
    });

    if(btnShow) btnShow.addEventListener('click', function(){ if(createForm) createForm.style.display='block'; if(btnShow) btnShow.style.display='none'; });
    if(btnCancel) btnCancel.addEventListener('click', function(){ if(createForm) createForm.style.display='none'; if(btnShow) btnShow.style.display='inline-block'; if(roomLinkDiv) roomLinkDiv.style.display='none'; if(createError) createError.innerText=''; });

    if(btnCreate) btnCreate.addEventListener('click', function(){
      if(createError) createError.innerText='';
      const nameEl = el('room-name');
      const passEl = el('room-pass');
      const name = nameEl ? nameEl.value.trim() : '';
      const pass = passEl ? passEl.value : '';
      if(!name){ if(createError) createError.innerText='Название не может быть пустым'; return; }
      if(!pass || !pass.trim()){ if(createError) createError.innerText='Пароль обязателен при создании комнаты'; return; }
      try{
        const roomObj = createRoom(name, pass);
        // ensure Peer ready and become host
        window.PeerBridge.ensurePeer().then(function(peer){
          window._isRoomHost = true;
          window._hostRoomId = roomObj.id;
          const pid = window.PeerBridge.myPeerId();
          const link = location.origin + location.pathname + '#room=' + encodeURIComponent(roomObj.id) + '&host=' + encodeURIComponent(pid);
          if(roomLinkDiv){ roomLinkDiv.innerHTML = '<div>Ссылка: <a href="'+link+'">'+link+'</a></div>'; roomLinkDiv.style.display='block'; }
          if(overlay) overlay.style.display='none';
          toggleBtn.style.display='block';
          overlayVisible = false;
          console.log('[Room] host ready id=', pid, 'roomId=', roomObj.id);
        }).catch(function(err){ console.error('PeerBridge ensure failed', err); alert('Не удалось поднять PeerJS: '+err); });
      }catch(e){
        if(createError){
          if(e.message === 'empty-name') createError.innerText = 'Название не может быть пустым';
          else if(e.message === 'name-exists') createError.innerText = 'Комната с таким названием уже существует';
          else createError.innerText = 'Ошибка: ' + e.message;
        }
      }
    });

    // parse URL hash to auto-join if host specified
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
    if(params.room && params.host){
      // attempt to connect to host
      window.PeerBridge.ensurePeer().then(function(){
        window.PeerBridge.connectToPeer(params.host).then(function(conn){
          console.log('[Client] connected to host', params.host);
          conn.send({ type: 'join-request', roomId: params.room });
        }).catch(function(e){ console.warn('connectToPeer failed', e); alert('Не удалось подключиться к хосту: '+e); });
      }).catch(function(e){ console.warn('ensurePeer failed', e); alert('Не удалось поднять PeerJS: '+e); });
    }

    // initial render
    try{ renderRooms(); }catch(e){ console.warn('renderRooms failed', e); }
    setInterval(function(){ try{ renderRooms(); }catch(e){} }, 5000);
  });
})();
