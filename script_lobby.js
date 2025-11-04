console.log("[Lobby] Страница лобби загружена");

const SUPABASE_URL = 'https://qevtrgxjlditqmgqlgnn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFldnRyZ3hqbGRpdHFtZ3FsZ25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDQxNjAsImV4cCI6MjA3NzgyMDE2MH0.1HBbNY8fv-MTQlp6nlzqRYVAKXrHkWAkmEdyKvS-CN4';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const user = JSON.parse(localStorage.getItem('user'));
if (!user) {
  alert("Необходимо войти!");
  window.location.href = 'index.html';
}

document.getElementById('user-info').innerHTML = `Вы вошли как: <strong>${user.nick}</strong>`;
document.getElementById('btn-logout').onclick = () => {
  localStorage.removeItem('user');
  window.location.href = 'index.html';
};

document.getElementById('btn-create').onclick = createRoom;
const listEl = document.getElementById('room-list');

async function createRoom() {
  const name = document.getElementById('room-name').value.trim();
  const pass = document.getElementById('room-pass').value.trim();

  if (!name) return alert("Введите название комнаты");
  console.log("[Lobby] Создание комнаты:", name);

  await supabase.from('rooms').insert([{ name, pass, creator: user.id }]);
}

async function loadRooms() {
  const { data, error } = await supabase.from('rooms').select('*');
  if (error) return console.error("[Lobby] Ошибка загрузки комнат:", error);

  renderRooms(data);
}

function renderRooms(rooms) {
  listEl.innerHTML = '';
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${r.name}</strong> 
      ${r.pass ? '(🔒)' : ''} 
      <button data-id="${r.id}" class="join">Войти</button>
      ${r.creator === user.id ? '<button data-id="' + r.id + '" class="delete">Удалить</button>' : ''}
    `;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.join').forEach(b => b.onclick = joinRoom);
  listEl.querySelectorAll('.delete').forEach(b => b.onclick = deleteRoom);
}

async function joinRoom(e) {
  const id = e.target.dataset.id;
  console.log("[Lobby] Вход в комнату:", id);

  localStorage.setItem('roomId', id);
  window.location.href = 'game.html';
}

async function deleteRoom(e) {
  const id = e.target.dataset.id;
  console.log("[Lobby] Удаление комнаты:", id);
  await supabase.from('rooms').delete().eq('id', id);
}

loadRooms();

// realtime обновления
supabase.channel('rooms-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, payload => {
    console.log("[Lobby] Изменения в комнатах:", payload);
    loadRooms();
  })
  .subscribe();
