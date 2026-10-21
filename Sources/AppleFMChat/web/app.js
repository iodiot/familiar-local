const STORAGE_KEY = 'familiar.chats.v1';
const CURRENT_KEY = 'familiar.current.v1';
const THEME_KEY = 'familiar.theme.v1';
const $ = (selector) => document.querySelector(selector);
const list = $('#chat-list');
const messagesEl = $('#messages');
const welcome = $('#welcome');
const input = $('#message-input');
const sendButton = $('#send-button');
let chats = loadChats();
let currentId = localStorage.getItem(CURRENT_KEY);
let pending = false;
let toastTimer;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  const toggle = $('#theme-toggle');
  toggle.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.querySelector('.theme-icon').textContent = dark ? '☀' : '☾';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1e1e21' : '#fafaf9';
}

function loadChats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  if (currentId) localStorage.setItem(CURRENT_KEY, currentId);
}
function currentChat() { return chats.find((chat) => chat.id === currentId); }
function escapeHTML(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
function renderList() {
  list.innerHTML = '';
  chats.forEach((chat) => {
    const button = document.createElement('button');
    button.className = `chat-item${chat.id === currentId ? ' active' : ''}`;
    button.innerHTML = `<span class="chat-item-icon">◌</span><span class="chat-item-title">${escapeHTML(chat.title)}</span>`;
    button.addEventListener('click', () => selectChat(chat.id));
    list.append(button);
  });
}
function renderMessages() {
  const chat = currentChat();
  const messages = chat?.messages || [];
  welcome.hidden = messages.length > 0;
  messagesEl.innerHTML = messages.map((message) => {
    const isUser = message.role === 'user';
    return `<article class="message ${isUser ? 'user' : 'assistant'}">${isUser ? '' : '<div class="message-avatar">✳</div>'}<div class="bubble">${escapeHTML(message.text).replace(/\n/g, '<br>')}</div>${isUser ? '<div class="message-avatar user-mark">◉</div>' : ''}</article>`;
  }).join('');
  scrollBottom();
}
function scrollBottom() { const panel = $('#conversation'); panel.scrollTop = panel.scrollHeight; }
function newChat() {
  currentId = crypto.randomUUID();
  chats.unshift({ id: currentId, title: 'New chat', messages: [], created: Date.now() });
  save(); renderList(); renderMessages(); input.focus(); $('#sidebar').classList.remove('open');
}
function selectChat(id) { currentId = id; save(); renderList(); renderMessages(); $('#sidebar').classList.remove('open'); }
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}
function setBusy(value) { pending = value; sendButton.disabled = value || !input.value.trim(); input.disabled = value; }
function appendThinking() {
  const row = document.createElement('article'); row.className = 'message assistant'; row.id = 'thinking';
  row.innerHTML = '<div class="message-avatar">✳</div><div class="bubble thinking">Thinking<span></span><span></span><span></span></div>';
  messagesEl.append(row); scrollBottom();
}
async function submitMessage(text = input.value.trim()) {
  if (!text || pending) return;
  if (!currentChat()) newChat();
  const chat = currentChat();
  const first = chat.messages.length === 0;
  chat.messages.push({ role: 'user', text });
  if (first) chat.title = text.length > 36 ? `${text.slice(0, 36).trim()}…` : text;
  input.value = ''; resizeInput(); save(); renderList(); renderMessages(); setBusy(true); appendThinking();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: chat.id, message: text })
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error || 'The local assistant did not respond';
      throw new Error(/[\u0400-\u04ff]/.test(message) ? 'The local model is unavailable. Check Apple Intelligence settings.' : message);
    }
    chat.messages.push({ role: 'assistant', text: payload.reply });
  } catch (error) {
    chat.messages.pop();
    if (chat.messages.length === 0) chat.title = 'New chat';
    showToast(error.message || 'Could not connect to the local model');
  } finally {
    $('#thinking')?.remove(); setBusy(false); save(); renderList(); renderMessages(); input.focus();
  }
}
function resizeInput() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 130)}px`; }
async function checkStatus() {
  const dot = $('#model-dot'); const sideDot = $('#status-dot');
  try {
    const response = await fetch('/api/status'); const state = await response.json();
    $('#model-label').textContent = state.status === 'ready' ? 'On this Mac' : 'Model unavailable';
    dot.classList.toggle('offline', state.status !== 'ready'); sideDot.style.background = state.status === 'ready' ? '#67bd91' : '#e49c70';
    if (state.status !== 'ready') {
      const message = state.message || '';
      showToast(/[\u0400-\u04ff]/.test(message) ? 'The on-device model is unavailable. Check Apple Intelligence settings.' : message);
    }
  } catch {
    $('#model-label').textContent = 'Server is not running'; dot.classList.add('offline'); sideDot.style.background = '#e49c70';
  }
}

$('#new-chat').addEventListener('click', newChat);
$('#theme-toggle').addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
});
$('#clear-chat').addEventListener('click', () => {
  const chat = currentChat(); if (!chat?.messages.length) return;
  chat.messages = []; chat.title = 'New chat';
  chat.id = crypto.randomUUID(); currentId = chat.id; save(); renderList(); renderMessages(); input.focus();
});
$('#composer').addEventListener('submit', (event) => { event.preventDefault(); submitMessage(); });
input.addEventListener('input', () => { resizeInput(); sendButton.disabled = pending || !input.value.trim(); });
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitMessage(); }
});
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => {
  input.value = button.dataset.prompt; resizeInput(); input.focus(); sendButton.disabled = false;
}));
$('#open-sidebar').addEventListener('click', () => $('#sidebar').classList.add('open'));
$('#close-sidebar').addEventListener('click', () => $('#sidebar').classList.remove('open'));
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); newChat(); }
  if (event.key === 'Escape') $('#sidebar').classList.remove('open');
});

if (!chats.length) {
  currentId = crypto.randomUUID(); chats.push({ id: currentId, title: 'New chat', messages: [], created: Date.now() }); save();
} else if (!currentChat()) currentId = chats[0].id;
chats.forEach((chat) => { if (chat.title === '\u041d\u043e\u0432\u044b\u0439 \u0447\u0430\u0442') chat.title = 'New chat'; });
applyTheme(localStorage.getItem(THEME_KEY) || 'light');
renderList(); renderMessages(); save(); checkStatus();
