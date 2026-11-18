const $ = (selector) => document.querySelector(selector);
const matches = $('#matches');
const matchCode = document.body.dataset.matchCode;
let selectedMatch = null;
let account = null;
let csrfToken = '';
let registering = false;
let afterLogin = null;
let loadVersion = 0;
let matchData = [];
let adminMatches = [];
let deletion = null;
const confirmedMatches = new Set();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatDate = (date) => new Date(date).toLocaleString('pt-BR', {day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});

async function api(url, options = {}) {
  const response = await fetch(url, {...options, headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken}});
  const data = await response.json().catch(() => ({erro: 'Não foi possível concluir. Tente novamente.'}));
  if (!response.ok) {
    const error = new Error(data.erro || 'Ocorreu um erro.');
    error.status = response.status;
    throw error;
  }
  if (data.csrf_token) csrfToken = data.csrf_token;
  return data;
}

function updateAccount(value) {
  account = value;
  $('#account-name').textContent = account ? `Olá, ${account.nome}` : '';
  $('#login-button').hidden = Boolean(account);
  $('#logout-button').hidden = !account;
  $('#admin-button').hidden = !account?.is_admin;
}

async function loadMatches() {
  const version = ++loadVersion;
  try {
    const params = new URLSearchParams(new FormData($('#filters')));
    const data = matchCode
      ? [await api(`/api/partidas/codigo/${encodeURIComponent(matchCode)}`)]
      : await api(`/api/partidas?${params}`);
    if (version !== loadVersion) return;
    matchData = data;
    matches.setAttribute('aria-busy', 'false');
    updateInviteBar();
    $('#counter').textContent = `${data.length} partida${data.length === 1 ? '' : 's'}`;
    matches.innerHTML = data.length ? data.map((m) => {
      const full = m.vagas_restantes === 0;
      const started = new Date(m.data_hora).getTime() <= Date.now();
      const confirmed = confirmedMatches.has(m.id);
      const closed = full || started || confirmed;
      const percent = Math.round(m.participantes / m.limite * 100);
      return `<article class="match"><div class="match-top"><span class="match-icon" aria-hidden="true">⚽</span><span class="pill ${full || started?'full':''}">${started?'Encerrada':full?'Time completo':`${m.vagas_restantes} vagas livres`}</span></div><h3>${escapeHtml(m.titulo)}</h3><p class="detail"><span class="detail-icon" aria-hidden="true">⌖</span><span class="detail-text">${escapeHtml(m.local)}</span></p><p class="detail"><span class="detail-icon" aria-hidden="true">▦</span><span class="detail-text">${formatDate(m.data_hora)}</span></p><a class="match-code" href="${escapeHtml(m.url)}" aria-label="Acessar partida pelo código ${escapeHtml(m.codigo)}"># ${escapeHtml(m.codigo)}</a><div class="progress-track"><div class="progress" style="width:${percent}%"></div></div><div class="slots"><span><strong>${m.participantes} confirmados</strong></span><span>${m.limite} jogadores</span></div><button class="button" data-join="${m.id}" ${closed?'disabled':''}>${confirmed?'Presença confirmada ✓':closed?'Inscrições encerradas':'Confirmar presença →'}</button><div class="card-actions"><button class="people" data-people="${m.id}">Ver jogadores</button><button class="people" data-share="${m.id}">Convidar a galera ↗</button></div></article>`;
    }).join('') : '<div class="empty"><h3>Nenhuma partida encontrada ⚽</h3><p>Experimente outros filtros ou organize uma nova pelada.</p></div>';
  } catch (error) {
    if (version !== loadVersion) return;
    matches.setAttribute('aria-busy', 'false');
    $('#invite-bar').hidden = true;
    $('#counter').textContent = '';
    matches.innerHTML = `<div class="empty">${escapeHtml(error.message)}${matchCode ? '<p><a href="/">Buscar outra partida</a></p>' : ''}</div>`;
  }
}

function requireLogin(action) {
  if (account) { action(); return; }
  afterLogin = action;
  $('#auth-error').textContent = '';
  $('#auth-dialog').showModal();
}
function openCreate() {
  requireLogin(() => { $('#create-error').textContent = ''; $('#create-dialog').showModal(); });
}
function openJoin(match) {
  if (!match) return;
  selectedMatch = match;
  $('#join-match-name').textContent = `${match.titulo} • ${formatDate(match.data_hora)}`;
  $('#join-name').value = account ? account.nome : '';
  $('#join-name').readOnly = Boolean(account);
  $('#join-login').hidden = Boolean(account);
  $('#join-hint').textContent = account ? 'Sua presença será vinculada à sua conta.' : 'Só isso. Sem cadastro, sem complicação.';
  $('#join-error').textContent = '';
  $('#join-dialog').showModal();
}
function updateInviteBar() {
  const match = matchData[0];
  $('#invite-bar').hidden = !matchCode || !match;
  if (!matchCode || !match) return;
  const confirmed = confirmedMatches.has(match.id);
  const closed = !match.vagas_restantes || new Date(match.data_hora).getTime() <= Date.now();
  $('#invite-join').disabled = closed || confirmed;
  $('#invite-join').textContent = confirmed ? 'Presença confirmada ✓' : closed ? 'Inscrições encerradas' : 'Confirmar presença →';
  $('#invite-bar strong').textContent = confirmed ? 'Tá no time!' : closed ? 'Até o próximo jogo' : 'Bora pro jogo?';
  $('#invite-bar>div>span').textContent = confirmed ? 'Te esperamos em campo.' : 'Confirme só com seu nome';
}
function openShare(match) {
  $('#share-url').value = new URL(match.url, window.location.origin).href;
  $('#share-code').value = match.codigo;
  $('#open-invite').href = match.url;
  $('#share-feedback').textContent = '';
  $('#share-dialog').showModal();
}
async function submitForm(event, errorSelector, action) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  $(errorSelector).textContent = '';
  try { await action(event.currentTarget); }
  catch (error) {
    $(errorSelector).textContent = error.message;
    if (error.status === 401) updateAccount(null);
  } finally { button.disabled = false; }
}

async function loadAdminMatches() {
  $('#admin-list').replaceChildren();
  $('#admin-clean').disabled = true;
  $('#admin-status').textContent = 'Carregando partidas…';
  try {
    adminMatches = await api('/api/admin/partidas');
    $('#admin-status').textContent = `${adminMatches.length} partida(s) cadastrada(s).`;
    $('#admin-clean').disabled = !adminMatches.length;
    $('#admin-list').innerHTML = adminMatches.length ? adminMatches.map(match => `
      <article class="admin-match"><div><h3>${escapeHtml(match.titulo)}</h3><p>${escapeHtml(match.local)} • ${formatDate(match.data_hora)}</p><span>${match.participantes} inscrito(s) • ${escapeHtml(match.codigo)}</span></div><div class="admin-match-actions"><a class="secondary" href="${escapeHtml(match.url)}">Abrir</a><button type="button" class="danger-outline" data-delete="${match.id}" aria-label="Excluir ${escapeHtml(match.titulo)}">Excluir</button></div></article>`).join('') : '<p class="empty">Nenhuma partida para gerenciar.</p>';
  } catch (error) { $('#admin-status').textContent = error.message; }
}

function openDeletion(match = null) {
  deletion = match ? {id:match.id} : {all:true};
  $('#delete-title').textContent = match ? 'Excluir partida?' : 'Limpar todos os jogos?';
  $('#delete-description').textContent = match
    ? `A partida “${match.titulo}” e suas ${match.participantes} inscrição(ões) serão excluídas.`
    : `Todas as partidas e inscrições serão excluídas, incluindo jogos criados depois de abrir esta lista.`;
  $('#delete-confirm-label').hidden = Boolean(match);
  $('#delete-confirm').disabled = Boolean(match);
  $('#delete-confirm').required = !match;
  $('#delete-confirm').value = '';
  $('#delete-submit').textContent = match ? 'Excluir partida' : 'Excluir todos os jogos';
  $('#delete-error').textContent = '';
  $('#delete-dialog').showModal();
}

$('#admin-button').addEventListener('click', () => {
  $('#admin-dialog').showModal();
  loadAdminMatches();
});
$('#admin-list').addEventListener('click', event => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  const match = adminMatches.find(item => item.id === Number(button.dataset.delete));
  if (match) openDeletion(match);
});
$('#admin-clean').addEventListener('click', () => openDeletion());
$('#delete-form').addEventListener('submit', event => submitForm(event, '#delete-error', async () => {
  const result = await api(deletion.all ? '/api/admin/partidas' : `/api/admin/partidas/${deletion.id}`, {
    method:'DELETE', body:JSON.stringify({confirmacao:$('#delete-confirm').value})
  });
  $('#delete-dialog').close();
  confirmedMatches.clear();
  await loadAdminMatches();
  $('#admin-status').textContent = result.mensagem;
  $('#feedback').textContent = result.mensagem;
  await loadMatches();
}));

$('#show-form').addEventListener('click', openCreate);
$('#hero-create').addEventListener('click', openCreate);
$('#invite-join').addEventListener('click', () => openJoin(matchData[0]));
$('#join-login').addEventListener('click', () => {
  const match = selectedMatch;
  $('#join-dialog').close();
  requireLogin(() => openJoin(match));
});
$('#login-button').addEventListener('click', () => requireLogin(() => {}));
$('#logout-button').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', {method: 'POST'});
    updateAccount(null);
    confirmedMatches.clear();
    await loadMatches();
    $('#feedback').textContent = 'Você saiu da conta.';
  } catch (error) { $('#feedback').textContent = error.message; }
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
$('#auth-dialog').addEventListener('close', () => { afterLogin = null; });
$('#auth-toggle').addEventListener('click', () => {
  registering = !registering;
  $('#auth-title').textContent = registering ? 'Seu lugar no time.' : 'Bom te ver por aqui.';
  $('#auth-submit').textContent = registering ? 'Cadastrar e entrar →' : 'Entrar na conta →';
  $('#auth-toggle').textContent = registering ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Cadastre-se';
  $('#register-name').hidden = !registering;
  const name = $('#auth-form [name="nome"]');
  name.disabled = !registering;
  name.required = registering;
  const password = $('#auth-form [name="senha"]');
  password.minLength = registering ? 8 : 1;
  password.autocomplete = registering ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
});
$('#auth-form').addEventListener('submit', (event) => submitForm(event, '#auth-error', async (form) => {
  const result = await api(`/api/auth/${registering ? 'cadastro' : 'login'}`, {method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(form)))});
  updateAccount(result.usuario);
  confirmedMatches.clear();
  updateInviteBar();
  const next = afterLogin;
  afterLogin = null;
  $('#auth-dialog').close();
  form.reset();
  $('#feedback').textContent = `Bem-vindo, ${account.nome}!`;
  await loadMatches();
  if (next) next();
}));
$('#create-form').addEventListener('submit', (event) => submitForm(event, '#create-error', async (form) => {
  if (!$('#create-day').value || !$('#create-hour').value) throw new Error('Escolha o dia e o horário da partida.');
  $('#create-date-time').value = `${$('#create-day').value}T${$('#create-hour').value}`;
  const result = await api('/api/partidas', {method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(form)))});
  form.reset();
  $('#create-dialog').close();
  $('#feedback').textContent = 'Partida criada! Compartilhe o link ou o código com a galera.';
  if (!matchCode) $('#filters').reset();
  openShare(result);
  await loadMatches();
}));
$('#join-form').addEventListener('submit', (event) => submitForm(event, '#join-error', async (form) => {
  const result = await api(`/api/partidas/codigo/${encodeURIComponent(selectedMatch.codigo)}/participar`, {method:'POST', body:JSON.stringify({nome:new FormData(form).get('nome')})});
  confirmedMatches.add(selectedMatch.id);
  $('#join-dialog').close();
  $('#feedback').textContent = result.mensagem;
  await loadMatches();
}));
$('#filters').addEventListener('submit', (event) => { event.preventDefault(); loadMatches(); });
$('#filters').addEventListener('reset', () => { queueMicrotask(loadMatches); });
$('#code-form').addEventListener('submit', (event) => submitForm(event, '#code-error', async (form) => {
  const code = new FormData(form).get('codigo').trim().toUpperCase();
  const match = await api(`/api/partidas/codigo/${encodeURIComponent(code)}`);
  window.location.assign(match.url);
}));
$('#copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#share-url').value);
    $('#share-feedback').textContent = 'Link copiado! Agora é só enviar para a galera.';
  } catch {
    $('#share-url').focus(); $('#share-url').select();
    $('#share-feedback').textContent = 'Selecione e copie o link acima para compartilhar.';
  }
});
matches.addEventListener('click', async (event) => {
  const join = event.target.closest('[data-join]');
  const share = event.target.closest('[data-share]');
  const people = event.target.closest('[data-people]');
  if (join) openJoin(matchData.find(m => m.id === Number(join.dataset.join)));
  if (share) openShare(matchData.find(m => m.id === Number(share.dataset.share)));
  if (people) {
    $('#people-list').replaceChildren();
    $('#people-status').textContent = 'Carregando participantes…';
    $('#people-dialog').showModal();
    try {
      const list = await api(`/api/partidas/${people.dataset.people}/participantes`);
      $('#people-status').textContent = list.length ? `${list.length} jogador(es) confirmado(s)` : 'Ainda não há jogadores confirmados.';
      for (const name of list) {
        const li = document.createElement('li'); li.textContent = name; $('#people-list').append(li);
      }
    } catch (error) { $('#people-status').textContent = error.message; }
  }
});
async function initialize() {
  try {
    const result = await api('/api/auth/sessao');
    updateAccount(result.usuario);
    await loadMatches();
  } catch (error) { $('#feedback').textContent = 'Não foi possível iniciar a sessão. Recarregue a página.'; }
}
initialize();
