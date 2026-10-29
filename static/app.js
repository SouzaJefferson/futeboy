const $ = (selector) => document.querySelector(selector);
const matches = $('#matches');
let selectedMatchId = null;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatDate = (date) => new Date(date).toLocaleString('pt-BR', {day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});
async function api(url, options={}) {
  let response = await fetch(url, {...options, headers: {'Content-Type':'application/json'}});
  let data = await response.json();
  if (!response.ok) throw new Error(data.erro || 'Ocorreu um erro.');
  return data;
}
async function loadMatches(){
  try {
    const data = await api('/api/partidas');
    $('#counter').textContent = `${data.length} partida${data.length === 1 ? '' : 's'}`;
    matches.innerHTML = data.length ? data.map((m) => {
      const full = m.vagas_restantes === 0;
      const started = new Date(m.data_hora).getTime() <= Date.now();
      const closed = full || started;
      const percent = Math.round(m.participantes / m.limite * 100);
      return `<article class="match"><div class="match-top"><span class="match-icon">⚽</span><span class="pill ${closed?'full':''}">${started?'Encerrada':full?'Lotada':`${m.vagas_restantes} vagas livres`}</span></div><h3>${escapeHtml(m.titulo)}</h3><p class="detail">📍 ${escapeHtml(m.local)}</p><p class="detail">📅 ${formatDate(m.data_hora)}</p><div class="progress-track"><div class="progress" style="width:${percent}%"></div></div><div class="slots"><span>${m.participantes} confirmados</span><span>${m.limite} jogadores</span></div><button class="button" data-join="${m.id}" ${closed?'disabled':''}>${closed?'Inscrição indisponível':'Quero jogar →'}</button><button class="people" data-people="${m.id}">Ver participantes</button></article>`;
    }).join('') : '<div class="empty"><h3>O campo ainda está vazio ⚽</h3><p>Crie a primeira partida para chamar a galera!</p></div>';
  } catch(error) { matches.innerHTML = `<div class="empty">Não foi possível carregar partidas: ${escapeHtml(error.message)}</div>`; }
}
function openCreate() { $('#create-error').textContent = ''; $('#create-dialog').showModal(); }
$('#show-form').addEventListener('click', openCreate);
$('#hero-create').addEventListener('click', openCreate);
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  try {
    await api('/api/partidas', {method:'POST', body:JSON.stringify(body)});
    form.reset(); $('#create-dialog').close(); $('#feedback').textContent = 'Partida criada com sucesso!'; await loadMatches();
  } catch(error) { $('#create-error').textContent = error.message; }
});
matches.addEventListener('click', async (event) => {
  const join = event.target.closest('[data-join]');
  const people = event.target.closest('[data-people]');
  if (join) {
    selectedMatchId = join.dataset.join;
    $('#join-match-name').textContent = join.closest('.match').querySelector('h3').textContent;
    $('#join-form').reset(); $('#join-error').textContent = ''; $('#join-dialog').showModal();
  }
  if (people) {
    try {
      const list = await api(`/api/partidas/${people.dataset.people}/participantes`);
      alert(list.length ? `Jogadores confirmados:\n\n${list.map((name,i)=>`${i+1}. ${name}`).join('\n')}` : 'Ainda não há jogadores confirmados.');
    } catch(error) { alert(error.message); }
  }
});
$('#join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const nome = new FormData(event.currentTarget).get('nome');
  try {
    const result = await api(`/api/partidas/${selectedMatchId}/participar`, {method:'POST',body:JSON.stringify({nome})});
    $('#join-dialog').close(); $('#feedback').textContent = result.mensagem; await loadMatches();
  } catch(error) { $('#join-error').textContent = error.message; }
});
loadMatches();
