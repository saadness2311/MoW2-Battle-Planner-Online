console.log("[Auth] Страница регистрации/входа загружена");

const SUPABASE_URL = 'https://qevtrgxjlditqmgqlgnn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFldnRyZ3hqbGRpdHFtZ3FsZ25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDQxNjAsImV4cCI6MjA3NzgyMDE2MH0.1HBbNY8fv-MTQlp6nlzqRYVAKXrHkWAkmEdyKvS-CN4';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const regNick = document.getElementById('reg-nick');
const regPass = document.getElementById('reg-pass');
const loginNick = document.getElementById('login-nick');
const loginPass = document.getElementById('login-pass');
const statusEl = document.getElementById('status');

document.getElementById('btn-register').onclick = registerUser;
document.getElementById('btn-login').onclick = loginUser;

async function registerUser() {
  console.log("[Auth] Попытка регистрации…");
  const nick = regNick.value.trim();
  const pass = regPass.value;

  if (nick.length < 3) return setStatus("Ник слишком короткий");
  if (pass.length < 1) return setStatus("Пароль не может быть пустым");

  try {
    const { data, error } = await supabase.from('users').insert([{ nick, pass }]).select();
    if (error) throw error;
    console.log("[Auth] Пользователь зарегистрирован:", data);
    setStatus("Регистрация успешна! Теперь войдите.");
  } catch (err) {
    console.error("[Auth] Ошибка регистрации:", err.message);
    setStatus("Ошибка регистрации: " + err.message);
  }
}

async function loginUser() {
  console.log("[Auth] Попытка входа…");
  const nick = loginNick.value.trim();
  const pass = loginPass.value;

  try {
    const { data, error } = await supabase.from('users')
      .select('*').eq('nick', nick).eq('pass', pass).maybeSingle();
    if (error) throw error;
    if (!data) return setStatus("Неверный ник или пароль");

    console.log("[Auth] Вход выполнен:", data);
    localStorage.setItem('user', JSON.stringify(data));
    window.location.href = 'lobby.html';
  } catch (err) {
    console.error("[Auth] Ошибка входа:", err.message);
    setStatus("Ошибка входа: " + err.message);
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}
