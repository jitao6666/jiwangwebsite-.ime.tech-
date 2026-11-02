'use strict';
const $ = id => document.getElementById(id);
const scope = 'https://www.googleapis.com/auth/gmail.readonly';
let token = '', email = '', nextPage = '', query = '', generation = 0;
const headers = parts => Object.fromEntries((parts || []).map(h => [h.name.toLowerCase(), h.value]));
function showError(message) { $('error').textContent = message; $('error').hidden = !message; }
async function api(path) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {headers: {Authorization: `Bearer ${token}`}, cache: 'no-store'});
  if (!response.ok) {
    if (response.status === 401) { logout(false); throw new Error('登录已过期，请重新连接 Google。'); }
    throw new Error(`Gmail 暂时无法完成请求（${response.status}）。请检查权限和 Google Cloud 配置。`);
  }
  return response.json();
}
function logout(revoke = true) {
  generation++; if (revoke && token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  token = ''; email = ''; nextPage = ''; $('account').textContent = ''; $('list').replaceChildren(); $('body').textContent = ''; $('reader').hidden = true; $('inbox').hidden = true; $('connect').hidden = false; $('logout').hidden = true; $('status').textContent = '';
}
async function loadPage(pageToken = '', append = false) {
  const run = ++generation; showError(''); $('status').textContent = '正在读取邮件…'; $('next').hidden = true;
  if (!append) $('list').replaceChildren();
  try {
    const params = new URLSearchParams({labelIds:'INBOX', maxResults:'20'});
    if (query) params.set('q', query); if (pageToken) params.set('pageToken', pageToken);
    const result = await api('messages?' + params);
    const messages = await Promise.all((result.messages || []).map(item => api(`messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
    if (run !== generation) return;
    for (const message of messages) {
      const h = headers(message.payload?.headers); const row = document.createElement('button'); row.type = 'button'; row.className = 'mail-row';
      const sender = document.createElement('span'); sender.textContent = h.from || '未知发件人';
      const subject = document.createElement('span'); subject.className = 'mail-subject'; subject.textContent = h.subject || '（无主题）';
      const date = document.createElement('time'); const d = new Date(Number(message.internalDate)); date.textContent = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('zh-CN');
      row.append(sender, subject, date); row.addEventListener('click', () => openMessage(message.id)); $('list').append(row);
    }
    nextPage = result.nextPageToken || ''; $('next').hidden = !nextPage;
    $('status').textContent = messages.length ? '选择一封邮件阅读。' : (append ? '没有更多邮件。' : '没有找到邮件。');
  } catch (error) { if (run === generation) { $('status').textContent = ''; showError(error.message); } }
}
function decode(data) {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}
function plainText(part) {
  if (!part || part.filename) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
  for (const child of part.parts || []) { const found = plainText(child); if (found) return found; }
  return '';
}
function hasAttachments(part) { return !!part && (Boolean(part.filename) || (part.parts || []).some(hasAttachments)); }
async function openMessage(id) {
  const run = ++generation; showError(''); $('status').textContent = '正在打开邮件…';
  try {
    const message = await api(`messages/${encodeURIComponent(id)}?format=full`); if (run !== generation) return;
    const h = headers(message.payload?.headers); $('subject').textContent = h.subject || '（无主题）'; $('from').textContent = '发件人：' + (h.from || '未知'); $('to').textContent = '收件人：' + (h.to || '未知'); $('date').textContent = h.date || '';
    $('body').textContent = plainText(message.payload) || '此邮件没有可显示的纯文本正文，请在 Gmail 中打开。';
    $('attachment-note').textContent = hasAttachments(message.payload) ? '此邮件包含附件，请在 Gmail 中查看。' : '';
    $('gmail-link').href = 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(email) + '#all/' + encodeURIComponent(message.threadId);
    document.querySelector('.content').hidden = true; $('reader').hidden = false; $('status').textContent = '';
  } catch (error) { if (run === generation) { $('status').textContent = ''; showError(error.message); } }
}
$('connect-form').addEventListener('submit', event => {
  event.preventDefault(); showError(''); const clientId = $('client-id').value.trim();
  if (!clientId.endsWith('.apps.googleusercontent.com')) { showError('请输入有效的 Google OAuth 客户端 ID。'); return; }
  if (!window.google?.accounts?.oauth2) { showError('Google 登录组件未加载，请检查网络后刷新页面。'); return; }
  localStorage.setItem('jiwang-oauth-client-id', clientId);
  google.accounts.oauth2.initTokenClient({client_id:clientId, scope, callback: async response => {
    if (response.error || !response.access_token) { showError('Google 授权未完成：' + (response.error || '请重试')); return; }
    token = response.access_token;
    try { const profile = await api('profile'); email = profile.emailAddress; $('account').textContent = email; $('connect').hidden = true; $('inbox').hidden = false; $('logout').hidden = false; query = ''; $('search').value = ''; await loadPage(); }
    catch (error) { showError(error.message); }
  }, error_callback: () => showError('Google 登录窗口未完成，请重试。')}).requestAccessToken();
});
$('client-id').value = localStorage.getItem('jiwang-oauth-client-id') || '366246083954-c2bstkt21vgi0mq387asgrndr7oie6ch.apps.googleusercontent.com';
$('logout').addEventListener('click', () => { logout(); showError(''); });
$('refresh').addEventListener('click', () => loadPage());
$('inbox-button').addEventListener('click', () => { document.querySelector('.content').hidden = false; $('reader').hidden = true; query = ''; $('search').value = ''; loadPage(); });
$('search-form').addEventListener('submit', event => { event.preventDefault(); query = $('search').value.trim(); loadPage(); });
$('next').addEventListener('click', () => { if (nextPage) loadPage(nextPage, true); });
$('close-reader').addEventListener('click', () => { $('reader').hidden = true; $('body').textContent = ''; document.querySelector('.content').hidden = false; });
