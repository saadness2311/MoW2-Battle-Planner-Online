
// Minimal PeerBridge using PeerJS Cloud (no registration required)
// Provides ensurePeer(), myPeerId, connectToPeer(peerId), sendToAll(msg)
window.PeerBridge = (function(){
  let peer = null;
  let peerId = null;
  let conns = {}; // map peerId -> DataConnection
  let pendingConnectPromises = {};

  function ensurePeer(){
    return new Promise(function(resolve, reject){
      if(peer && peerId) return resolve(peer);
      try{
        peer = new Peer(); // uses default PeerJS cloud
      }catch(e){
        console.error('PeerJS init error', e);
        return reject(e);
      }
      peer.on('open', function(id){
        peerId = id;
        console.log('[PeerBridge] Peer ready id=', id);
        // handle incoming connections
        peer.on('connection', function(conn){
          const id = conn.peer;
          console.log('[PeerBridge] connection from', id);
          conns[id] = conn;
          conn.on('data', function(data){
            try{ window.dispatchEvent(new CustomEvent('peerbridge:data', { detail: { from:id, data: data } })); }
            catch(e){ console.warn('dispatch error', e); }
          });
          conn.on('close', function(){ delete conns[id]; });
          conn.on('error', function(e){ console.warn('conn error', e); });
        });
        resolve(peer);
      });
      peer.on('error', function(err){
        console.warn('[PeerBridge] peer error', err);
        reject(err);
      });
    });
  }

  function myPeerId(){ return peerId; }

  function connectToPeer(otherId){
    return new Promise(function(resolve, reject){
      if(!peer) return reject(new Error('no-peer'));
      if(conns[otherId]) return resolve(conns[otherId]);
      const conn = peer.connect(otherId, { reliable: true });
      conn.on('open', function(){
        conns[otherId] = conn;
        resolve(conn);
      });
      conn.on('error', function(e){ reject(e); });
      // timeout fallback
      setTimeout(function(){ if(conn.open) return; reject(new Error('connect-timeout')); }, 7000);
    });
  }

  function sendToAll(msg){
    Object.keys(conns).forEach(id=>{
      try{ conns[id].send(msg); }catch(e){ console.warn('send failed', e); }
    });
  }

  return { ensurePeer, myPeerId, connectToPeer, sendToAll };
})();

// Minimal robust realtime handler (safe, self-contained)
// Replaces problematic realtime.js sections to ensure room creation, password handling,
// and TogetherJS start work without breaking the page when CDN is blocked.

(function(){
  'use strict';

  function el(id){ return document.getElementById(id); }

  // Simple in-memory rooms store; still write to localStorage for compatibility but do not depend on it.
  const ROOMS_KEY = '__mow2_rooms_v2';

  function loadRooms(){
    try{
      const s = localStorage.getItem(ROOMS_KEY);
      return s ? JSON.parse(s) : {};
    }catch(e){ return {}; }
  }
  function saveRooms(r){
    try{ localStorage.setItem(ROOMS_KEY, JSON.stringify(r)); }catch(e){}
  }

  function nowTs(){ return Date.now(); }

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

  // Dynamic TogetherJS loader
  window.ensureTogetherJS = function(callback){
    if(window.TogetherJS) return callback();
    var s = document.createElement('script');
    s.src = 'https://togetherjs.com/togetherjs-min.js';
    s.onload = function(){ callback(); };
    s.onerror = function(){ console.error('Failed to load TogetherJS'); alert('Не удалось загрузить TogetherJS. Проверьте подключение к интернету.'); };
    document.head.appendChild(s);
  };

  // Start Together session for given room id
  window.startTogether = function(roomId){
    ensureTogetherJS(function(){
      try{
        if(!window.TogetherJS){
          alert('TogetherJS недоступен после загрузки');
          return;
        }
        TogetherJS.config_getUserName = function(){ return el('nick-name') ? (el('nick-name').value || 'Игрок') : 'Игрок'; };
        // set room via hash so other peers can join via link
        location.hash = 'room=' + encodeURIComponent(roomId);
        TogetherJS();
      }catch(e){
        console.error('startTogether error', e);
        alert('Ошибка при запуске TogetherJS: ' + e);
      }
    });
  };

  // Initialize UI bindings on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function(){

    // Quick references
    const btnShow = el('btn-show-create');
    const createForm = el('create-form');
    const btnCancel = el('btn-cancel-create');
    const btnCreate = el('btn-create-room');
    const roomLinkDiv = el('room-link');
    const createError = el('create-error');
    const overlay = el('rooms-overlay');

    // toggle button (center-top)
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'rooms-toggle';
    toggleBtn.textContent = 'Комнаты ⤢';
    Object.assign(toggleBtn.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
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
    toggleBtn.addEventListener('click', function(){
      overlay.style.display = overlayVisible ? 'none' : 'block';
      overlayVisible = !overlayVisible;
      toggleBtn.style.display = overlayVisible ? 'none' : 'block';
    });

    if(btnShow) btnShow.addEventListener('click', function(){
      if(createForm) createForm.style.display = 'block';
      btnShow.style.display = 'none';
    });
    if(btnCancel) btnCancel.addEventListener('click', function(){
      if(createForm) createForm.style.display = 'none';
      if(btnShow) btnShow.style.display = 'inline-block';
      if(roomLinkDiv) roomLinkDiv.style.display='none';
      if(createError) createError.innerText='';
    });

    if(btnCreate) btnCreate.addEventListener('click', function(){
      if(createError) createError.innerText='';
      const nameEl = el('room-name');
      const passEl = el('room-pass');
      const nickEl = el('nick-name');
      const name = nameEl ? nameEl.value.trim() : '';
      const pass = passEl ? passEl.value : '';
      if(!name){ if(createError) createError.innerText='Название не может быть пустым'; return; }
      if(!pass || !pass.trim()){ if(createError) createError.innerText='Пароль обязателен при создании комнаты'; return; }
      try{
        const roomObj = createRoom(name, pass);
        const link = location.origin + location.pathname + '#room=' + encodeURIComponent(roomObj.id) + (window.PeerBridge && window.PeerBridge.myPeerId ? '&host=' + encodeURIComponent(window.PeerBridge.myPeerId()) : '' );
        if(roomLinkDiv) { roomLinkDiv.innerHTML = '<div>Ссылка: <a href="'+link+'">'+link+'</a></div>'; roomLinkDiv.style.display='block'; }
        // hide panel
        if(overlay) overlay.style.display='none';
        toggleBtn.style.display='block';
        overlayVisible = false;
        // start TogetherJS session
        window.startTogether(roomObj.id);
      }catch(e){
        if(createError){
          if(e.message === 'empty-name') createError.innerText = 'Название не может быть пустым';
          else if(e.message === 'name-exists') createError.innerText = 'Комната с таким названием уже существует';
          else createError.innerText = 'Ошибка: ' + e.message;
        }else console.error(e);
      }
    });

    // initial render
    try{ renderRooms(); }catch(e){ console.warn('renderRooms failed', e); }
    setInterval(function(){ try{ renderRooms(); }catch(e){} }, 5000);
  });
})();


// Handle incoming peer messages (simple protocol)
window.addEventListener('peerbridge:data', function(ev){
  const from = ev.detail.from;
  const data = ev.detail.data;
  try{
    if(data && data.type === 'get-rooms' && window.PeerBridge && window.PeerBridge.myPeerId){
      // reply with rooms list
      const rooms = (typeof loadRooms === 'function') ? loadRooms() : {};
      const conn = null;
    }
    if(data && data.type === 'join-request'){
      // if host, accept and reply with roomId confirmation
      if(typeof window._isRoomHost !== 'undefined' && window._isRoomHost){
        // simply send back 'join-accepted' with roomId
        window.PeerBridge.sendToAll({ type: 'join-accepted', roomId: data.roomId });
      }
    }
  }catch(e){ console.warn('peerbridge:data handler error', e); }
});
