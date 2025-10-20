// network.js - client-side networking using WebSocket to sync rooms and room state
(function(){
  const wsProto = (location.protocol === 'https:') ? 'wss:' : 'ws:';
  const WS_URL = wsProto + '//' + location.host;
  let ws = null;
  let currentRoom = null;

  function $id(id){ return document.getElementById(id); }
  function q(sel){ return document.querySelector(sel); }

  function connect(){
    ws = new WebSocket(WS_URL);
    ws.addEventListener('open', ()=>{
      console.log('WS connected to', WS_URL);
      ws.send(JSON.stringify({ type:'get_rooms' }));
    });
    ws.addEventListener('message', e=>{
      let data;
      try{ data = JSON.parse(e.data); }catch(err){ return; }
      handleServerMsg(data);
    });
    ws.addEventListener('close', ()=>{
      console.log('WS closed, will try reconnect in 2s');
      setTimeout(connect,2000);
    });
  }

  function handleServerMsg(msg){
    if(!msg || !msg.type) return;
    switch(msg.type){
      case 'rooms_list': renderRoomList(msg.rooms || []); break;
      case 'create_room_result': if(msg.ok){ alert('Комната создана: '+msg.room.name); ws.send(JSON.stringify({type:'get_rooms'})); } else { if(msg.error==='empty_name') alert('Ошибка: пустое название'); else if(msg.error==='name_exists') alert('Ошибка: комната с таким названием уже существует'); else alert('Ошибка создания комнаты'); } break;
      case 'join_result': if(msg.ok){ enterRoom(msg.room, msg.state); } else { if(msg.error==='bad_password') alert('Неверный пароль'); else if(msg.error==='no_room') alert('Комната не найдена'); else alert('Ошибка при присоединении'); } break;
      case 'room_state': if(msg.roomId === currentRoom?.id){ // load state into app
          console.log('Room state received, loading...');
          if(msg.state) {
            // try to use existing loadPlanData infrastructure: it expects a plan object; we'll craft a compatible structure
            try{
              const plan = msg.state || {};
              // msg.state may already be in same shape as saved plan; reuse if possible
              if(plan && (plan.echelons || plan.meta)){
                loadPlanData(plan);
              } else {
                // otherwise, craft a plan-like object
                const craft = { meta: plan.meta||{}, echelons: plan.echelons||plan.echelons||{}, mapState: plan.mapState||{} };
                loadPlanData(craft);
              }
            }catch(err){ console.error('Ошибка при загрузке состояния комнаты',err); }
          }
        } break;
      case 'player_joined': console.log('Player joined room update', msg); break;
      default: break;
    }
  }

  // Lobby UI wiring
  function renderRoomList(rooms){
    const list = $id('lobbyRoomsList');
    if(!list) return;
    list.innerHTML = '';
    rooms.forEach(r=>{
      const li = document.createElement('div');
      li.className = 'room-row';
      li.innerHTML = `<strong>${escapeHtml(r.name)}</strong> — ${r.playerCount} игрок(ов) ${r.hasPassword? '🔒':''}
                      <div style="margin-top:6px;">
                        <input type="password" placeholder="Пароль (если требуется)" class="room-pass" data-room="${r.id}" />
                        <button class="join-room" data-room="${r.id}">Войти</button>
                      </div>`;
      list.appendChild(li);
    });

    // attach handlers
    list.querySelectorAll('.join-room').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-room');
        const pw = list.querySelector(`.room-pass[data-room="${id}"]`)?.value || '';
        ws.send(JSON.stringify({ type:'join_room', roomId:id, password: pw }));
      });
    });
  }

  // Escape helper
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // Create room form submit
  function setupCreateRoomForm(){
    const form = $id('createRoomForm');
    if(!form) return;
    form.addEventListener('submit', e=>{
      e.preventDefault();
      const name = $id('roomName').value.trim();
      const pw = $id('roomPassword').value || '';
      ws.send(JSON.stringify({ type:'create_room', name, password: pw }));
    });
  }

  // Enter room: hide lobby, show map UI and request current state if any
  function enterRoom(room, state){
    currentRoom = room;
    $id('lobbyOverlay').style.display = 'none';
    $id('roomHeader').textContent = 'Комната: ' + room.name;
    // request server to push state (server may have sent state in join_result)
    if(ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'room_state_update', roomId: room.id, state: {} })); // no-op request to trigger broadcast from server if needed
    // if state provided in join_result, handleServerMsg already invoked enterRoom with state as part of join_result; but we also handle room_state messages
    // Start broadcasting local changes periodically
    startAutoSync();
  }

  function leaveRoom(){
    if(ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'leave_room' }));
    currentRoom = null;
    $id('lobbyOverlay').style.display = '';
    stopAutoSync();
  }

  // Auto-sync: every 2 seconds send current state via room_state_update
  let syncInterval = null;
  function startAutoSync(){
    if(syncInterval) return;
    syncInterval = setInterval(()=>{
      try{
        if(!currentRoom) return;
        // call existing saveCurrentEchelonState to ensure echelonStates updated
        if(typeof saveCurrentEchelonState === 'function') saveCurrentEchelonState();
        const payload = { meta: { updatedAt: new Date().toISOString() }, echelons: echelonStates, mapState: { center: map.getCenter(), zoom: map.getZoom() } };
        ws.send(JSON.stringify({ type:'room_state_update', roomId: currentRoom.id, state: payload }));
      }catch(err){ console.error('sync error', err); }
    }, 2000);
  }
  function stopAutoSync(){ if(syncInterval){ clearInterval(syncInterval); syncInterval = null; } }

  // Hook some local actions to send immediate updates (e.g., when placing marker)
  function hookLocalEvents(){
    // override placeMarker to emit after placing
    if(typeof placeMarker === 'function'){
      const orig = placeMarker;
      window.placeMarker = function(...args){
        const res = orig.apply(this, args);
        // quick immediate push after small delay
        setTimeout(()=>{
          if(currentRoom && ws && ws.readyState===WebSocket.OPEN){
            try{ if(typeof saveCurrentEchelonState==='function') saveCurrentEchelonState(); }catch(e){}
            const payload = { meta:{updatedAt:new Date().toISOString()}, echelons: echelonStates, mapState:{center:map.getCenter(),zoom:map.getZoom()} };
            ws.send(JSON.stringify({ type:'room_state_update', roomId: currentRoom.id, state: payload }));
          }
        },150);
        return res;
      };
    }

    // when drawings changed (add/edit/delete) we can listen to map draw events if available
    if(window.map){
      map.on('draw:created', ()=>{ immediateSync(); });
      map.on('draw:edited', ()=>{ immediateSync(); });
      map.on('draw:deleted', ()=>{ immediateSync(); });
    }

    function immediateSync(){
      if(currentRoom && ws && ws.readyState===WebSocket.OPEN){
        try{ if(typeof saveCurrentEchelonState==='function') saveCurrentEchelonState(); }catch(e){}
        const payload = { meta:{updatedAt:new Date().toISOString()}, echelons: echelonStates, mapState:{center:map.getCenter(),zoom:map.getZoom()} };
        ws.send(JSON.stringify({ type:'room_state_update', roomId: currentRoom.id, state: payload }));
      }
    }
  }

  // UI init: create lobby overlay elements if not present
  function initLobbyUI(){
    if($id('lobbyOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'lobbyOverlay';
    overlay.style.position = 'absolute';
    overlay.style.inset = '8px';
    overlay.style.zIndex = 2000;
    overlay.style.background = 'rgba(18,18,20,0.95)';
    overlay.style.padding = '18px';
    overlay.style.borderRadius = '8px';
    overlay.style.maxWidth = '560px';
    overlay.style.boxShadow = '0 6px 30px rgba(0,0,0,0.6)';
    overlay.innerHTML = `
      <h2>Список комнат</h2>
      <div id="lobbyRoomsList" style="max-height:240px; overflow:auto; margin-bottom:12px;"></div>
      <form id="createRoomForm" style="display:flex; gap:8px; align-items:center;">
        <input id="roomName" placeholder="Название комнаты" required style="flex:1; padding:6px" />
        <input id="roomPassword" placeholder="Пароль (опционально)" type="password" style="padding:6px" />
        <button type="submit">Создать</button>
      </form>
      <div style="margin-top:8px;"><button id="refreshRooms">Обновить</button> <button id="leaveRoomBtn" style="display:none">Выйти из комнаты</button></div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('refreshRooms').addEventListener('click', ()=> ws && ws.send(JSON.stringify({ type:'get_rooms' })));
    document.getElementById('leaveRoomBtn').addEventListener('click', ()=>{ leaveRoom(); });

    // small room header for in-room view
    const roomHeader = document.createElement('div');
    roomHeader.id = 'roomHeader';
    roomHeader.style.position = 'absolute';
    roomHeader.style.top = '12px';
    roomHeader.style.left = '50%';
    roomHeader.style.transform = 'translateX(-50%)';
    roomHeader.style.padding = '6px 10px';
    roomHeader.style.background = 'rgba(20,20,20,0.7)';
    roomHeader.style.borderRadius = '6px';
    roomHeader.style.zIndex = 1500;
    roomHeader.style.color = '#ddd';
    document.body.appendChild(roomHeader);

    setupCreateRoomForm();
  }

  // Kickoff
  window.addEventListener('load', ()=>{
    initLobbyUI();
    connect();
    hookLocalEvents();
    // expose leave control to show/hide leave button
    setInterval(()=>{
      const btn = $id('leaveRoomBtn');
      if(btn) btn.style.display = currentRoom ? '' : 'none';
    },500);
  });

})();