const STORAGE_KEY = 'familiar.chats.v1';
const CURRENT_KEY = 'familiar.current.v1';
const THEME_KEY = 'familiar.theme.v1';
const $ = (selector) => document.querySelector(selector);
const list = $('#chat-list');
const messagesEl = $('#messages');
const welcome = $('#welcome');
const input = $('#message-input');
const sendButton = $('#send-button');
const deleteDialog = $('#delete-dialog');
let chats = loadChats();
let currentId = localStorage.getItem(CURRENT_KEY);
let pending = false;
let toastTimer;
let pendingDeleteId = null;
let deleteTrigger = null;

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
function safeLink(destination) {
  try {
    const url = new URL(destination, location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function renderInlineMarkdown(value) {
  const preserved = [];
  const hold = (html) => {
    const marker = `\u0000${preserved.length}\u0000`;
    preserved.push(html);
    return marker;
  };
  let source = value.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHTML(code)}</code>`));
  source = source.replace(/!?\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (match, label, destination, title) => {
    if (match.startsWith('!')) return hold(escapeHTML(match));
    const href = safeLink(destination);
    if (!href) return hold(escapeHTML(label));
    const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
    return hold(`<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${escapeHTML(label)}</a>`);
  });
  source = escapeHTML(source)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  return source.replace(/\u0000(\d+)\u0000/g, (_, index) => preserved[Number(index)] ?? '');
}
function renderMarkdown(value) {
  const lines = value.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  const isBlockStart = (line) => /^ {0,3}(?:#{1,6}\s|```|>|(?:[-*+]\s|\d+\.\s)|(?:---+|\*\*\*+|___+)$)/.test(line);
  const tableCells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
  const isTableDelimiter = (line) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const fence = lines[i].match(/^ {0,3}```\s*([\w+-]*)\s*$/);
    if (fence) {
      i++;
      const code = [];
      while (i < lines.length && !/^ {0,3}```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      const language = fence[1] ? ` class="language-${escapeHTML(fence[1])}"` : '';
      blocks.push(`<pre><code${language}>${escapeHTML(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = lines[i].match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^ {0,3}(?:---+|\*\*\*+|___+)\s*$/.test(lines[i])) {
      blocks.push('<hr>');
      i++;
      continue;
    }
    if (i + 1 < lines.length && lines[i].includes('|') && isTableDelimiter(lines[i + 1])) {
      const header = tableCells(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(tableCells(lines[i++]));
      const headerHTML = header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
      const bodyHTML = rows.map((row) => `<tr>${header.map((_, index) => `<td>${renderInlineMarkdown(row[index] ?? '')}</td>`).join('')}</tr>`).join('');
      blocks.push(`<div class="table-scroll"><table><thead><tr>${headerHTML}</tr></thead><tbody>${bodyHTML}</tbody></table></div>`);
      continue;
    }
    if (/^ {0,3}>/.test(lines[i])) {
      const quote = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      blocks.push(`<blockquote><p>${renderInlineMarkdown(quote.join('\n')).replace(/\n/g, '<br>')}</p></blockquote>`);
      continue;
    }
    const listStart = lines[i].match(/^ {0,3}([-*+]|\d+\.)\s+(.+)$/);
    if (listStart) {
      const ordered = /^\d/.test(listStart[1]);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^ {0,3}([-*+]|\d+\.)\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(`<li>${renderInlineMarkdown(item[2])}</li>`);
        i++;
      }
      blocks.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return blocks.join('');
}
function renderList() {
  list.innerHTML = '';
  chats.forEach((chat) => {
    const row = document.createElement('div');
    row.className = `chat-item${chat.id === currentId ? ' active' : ''}`;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'chat-item-select';
    select.innerHTML = `<span class="chat-item-icon" aria-hidden="true">◌</span><span class="chat-item-title">${escapeHTML(chat.title)}</span>`;
    select.addEventListener('click', () => selectChat(chat.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chat-delete';
    remove.setAttribute('aria-label', `Delete chat: ${chat.title}`);
    remove.title = 'Delete chat';
    remove.textContent = '×';
    remove.addEventListener('click', () => requestDeleteChat(chat.id, remove));
    row.append(select, remove);
    list.append(row);
  });
}
function renderMessages() {
  const chat = currentChat();
  const messages = chat?.messages || [];
  welcome.hidden = messages.length > 0;
  messagesEl.innerHTML = messages.map((message) => {
    const isUser = message.role === 'user';
    return `<article class="message ${isUser ? 'user' : 'assistant'}">${isUser ? '' : '<div class="message-avatar">✳</div>'}<div class="bubble">${renderMarkdown(message.text)}</div>${isUser ? '<div class="message-avatar user-mark">◉</div>' : ''}</article>`;
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
function requestDeleteChat(id, trigger) {
  const chat = chats.find((item) => item.id === id);
  if (!chat) return;
  pendingDeleteId = id;
  deleteTrigger = trigger;
  $('#delete-chat-title').textContent = `Delete “${chat.title}”?`;
  deleteDialog.hidden = false;
  $('#cancel-delete').focus();
}
function closeDeleteDialog() {
  pendingDeleteId = null;
  deleteDialog.hidden = true;
  deleteTrigger?.focus();
  deleteTrigger = null;
}
function deleteChat(id) {
  chats = chats.filter((item) => item.id !== id);
  if (currentId === id) {
    currentId = chats[0]?.id ?? null;
    if (!currentId) {
      currentId = crypto.randomUUID();
      chats.push({ id: currentId, title: 'New chat', messages: [], created: Date.now() });
    }
  }
  save(); renderList(); renderMessages();
  (list.querySelector('.chat-item.active .chat-item-select') ?? input).focus();
}
$('#cancel-delete').addEventListener('click', closeDeleteDialog);
$('#confirm-delete').addEventListener('click', () => {
  const id = pendingDeleteId;
  pendingDeleteId = null;
  deleteDialog.hidden = true;
  deleteTrigger = null;
  if (id) deleteChat(id);
});
deleteDialog.addEventListener('click', (event) => {
  if (event.target === deleteDialog) closeDeleteDialog();
});
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
  if (event.key === 'Escape') {
    if (!deleteDialog.hidden) closeDeleteDialog();
    $('#sidebar').classList.remove('open');
  }
});

if (!chats.length) {
  currentId = crypto.randomUUID(); chats.push({ id: currentId, title: 'New chat', messages: [], created: Date.now() }); save();
} else if (!currentChat()) currentId = chats[0].id;
chats.forEach((chat) => { if (chat.title === '\u041d\u043e\u0432\u044b\u0439 \u0447\u0430\u0442') chat.title = 'New chat'; });
applyTheme(localStorage.getItem(THEME_KEY) || 'light');
renderList(); renderMessages(); save(); checkStatus();
