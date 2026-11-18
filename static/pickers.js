/* Seletores locais, sem bibliotecas ou serviços externos. */
(() => {
  const get = (selector) => document.querySelector(selector);
  const pad = (number) => String(number).padStart(2, '0');
  const dateValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = (value) => new Date(`${value}T12:00:00`);
  const today = () => dateValue(new Date());
  const dateLabel = (value) => parseDate(value).toLocaleDateString('pt-BR', {day:'2-digit',month:'short',year:'numeric'});
  let dateTarget = null;
  let timeTarget = null;
  let view = new Date();
  let selected = '';
  let choosingMonth = false;

  function syncPickerButtons() {
    document.querySelectorAll('[data-date-target], [data-time-target]').forEach(button => {
      const date = button.dataset.dateTarget;
      const input = document.getElementById(date || button.dataset.timeTarget);
      button.querySelector('[data-picker-text]').textContent = input.value
        ? (date ? dateLabel(input.value) : input.value) : button.dataset.placeholder;
    });
  }
  window.syncPickerButtons = syncPickerButtons;

  function commit(input, value, dialog) {
    input.value = value;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    syncPickerButtons();
    dialog.close();
  }

  function renderCalendar() {
    const month = view.toLocaleDateString('pt-BR', {month:'long'});
    get('#calendar-month').textContent = choosingMonth ? `${view.getFullYear()} · Escolher mês` : `${month} ${view.getFullYear()} ▾`;
    get('#calendar-month').setAttribute('aria-expanded', String(choosingMonth));
    get('#calendar-prev').setAttribute('aria-label', choosingMonth ? 'Ano anterior' : 'Mês anterior');
    get('#calendar-next').setAttribute('aria-label', choosingMonth ? 'Próximo ano' : 'Próximo mês');
    get('#calendar-days').hidden = choosingMonth;
    get('#calendar-months').hidden = !choosingMonth;
    get('#date-selection').textContent = selected
      ? parseDate(selected).toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long', year:'numeric'})
      : 'Um bom jogo começa com uma data.';
    get('#date-confirm').disabled = !selected;
    const grid = get('#calendar-grid');
    grid.replaceChildren();
    const start = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < start; i++) {
      const blank = document.createElement('span'); blank.setAttribute('aria-hidden', 'true'); grid.append(blank);
    }
    for (let day = 1; day <= days; day++) {
      const date = new Date(view.getFullYear(), view.getMonth(), day, 12);
      const value = dateValue(date);
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = day; button.className = 'calendar-day';
      button.dataset.date = value;
      button.setAttribute('aria-label', date.toLocaleDateString('pt-BR', {day:'numeric', month:'long', year:'numeric'}));
      button.setAttribute('aria-pressed', String(selected === value));
      if (value === today()) { button.classList.add('today'); button.setAttribute('aria-current', 'date'); }
      button.disabled = dateTarget.dataset.future === 'true' && value < today();
      grid.append(button);
    }
    get('#calendar-months').replaceChildren();
    for (let monthNumber = 0; monthNumber < 12; monthNumber++) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.month = monthNumber;
      button.textContent = new Date(view.getFullYear(), monthNumber, 1).toLocaleDateString('pt-BR', {month:'short'}).replace('.', '');
      button.setAttribute('aria-label', new Date(view.getFullYear(), monthNumber, 1).toLocaleDateString('pt-BR', {month:'long',year:'numeric'}));
      button.setAttribute('aria-pressed', String(view.getMonth() === monthNumber));
      get('#calendar-months').append(button);
    }
  }

  document.querySelectorAll('[data-date-target]').forEach(button => button.addEventListener('click', () => {
    dateTarget = document.getElementById(button.dataset.dateTarget);
    selected = dateTarget.value;
    view = selected ? parseDate(selected) : new Date();
    view = new Date(view.getFullYear(), view.getMonth(), 1, 12);
    choosingMonth = false;
    get('#date-clear').hidden = dateTarget.dataset.future === 'true';
    renderCalendar(); get('#date-dialog').showModal();
  }));
  get('#calendar-month').addEventListener('click', () => { choosingMonth = !choosingMonth; renderCalendar(); });
  for (const [selector, delta] of [['#calendar-prev', -1], ['#calendar-next', 1]]) {
    get(selector).addEventListener('click', () => {
      if (choosingMonth) view.setFullYear(view.getFullYear() + delta);
      else view.setMonth(view.getMonth() + delta);
      renderCalendar();
    });
  }
  get('#calendar-months').addEventListener('click', event => {
    const button = event.target.closest('[data-month]');
    if (!button) return;
    view.setMonth(Number(button.dataset.month)); choosingMonth = false; renderCalendar();
    get('#calendar-month').focus();
  });
  get('#calendar-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-date]');
    if (!button || button.disabled) return;
    selected = button.dataset.date; renderCalendar();
    get(`#calendar-grid [data-date="${selected}"]`).focus();
  });
  get('#calendar-grid').addEventListener('keydown', event => {
    const offsets = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7};
    const button = event.target.closest('[data-date]');
    if (!button || !Object.hasOwn(offsets, event.key)) return;
    event.preventDefault();
    const date = parseDate(button.dataset.date); date.setDate(date.getDate() + offsets[event.key]);
    const value = dateValue(date);
    if (dateTarget.dataset.future === 'true' && value < today()) return;
    selected = value; view = new Date(date.getFullYear(), date.getMonth(), 1, 12); renderCalendar();
    get(`#calendar-grid [data-date="${value}"]`).focus();
  });
  get('#date-confirm').addEventListener('click', () => { if (selected) commit(dateTarget, selected, get('#date-dialog')); });
  get('#date-clear').addEventListener('click', () => commit(dateTarget, '', get('#date-dialog')));

  for (const [selector, count] of [['#time-hour', 24], ['#time-minute', 60]]) {
    for (let value = 0; value < count; value++) {
      const option = document.createElement('option'); option.value = pad(value); option.textContent = pad(value); get(selector).append(option);
    }
  }
  function syncTime() {
    const value = `${get('#time-hour').value}:${get('#time-minute').value}`;
    get('#time-confirm').textContent = `Usar ${value} →`;
    document.querySelectorAll('[data-time]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.time === value)));
  }
  document.querySelectorAll('[data-time-target]').forEach(button => button.addEventListener('click', () => {
    timeTarget = document.getElementById(button.dataset.timeTarget);
    const [hour, minute] = (timeTarget.value || '19:00').split(':');
    get('#time-hour').value = hour; get('#time-minute').value = minute;
    get('#time-clear').hidden = timeTarget.id === 'create-hour'; syncTime(); get('#time-dialog').showModal();
  }));
  get('#time-hour').addEventListener('change', syncTime);
  get('#time-minute').addEventListener('change', syncTime);
  get('#time-presets').addEventListener('click', event => {
    const button = event.target.closest('[data-time]');
    if (!button) return;
    const [hour, minute] = button.dataset.time.split(':');
    get('#time-hour').value = hour; get('#time-minute').value = minute; syncTime();
  });
  get('#time-confirm').addEventListener('click', () => commit(timeTarget, `${get('#time-hour').value}:${get('#time-minute').value}`, get('#time-dialog')));
  get('#time-clear').addEventListener('click', () => commit(timeTarget, '', get('#time-dialog')));
  document.querySelectorAll('form').forEach(form => form.addEventListener('reset', () => {
    // Em inputs hidden, .value também altera o valor padrão do reset nativo.
    form.querySelectorAll('input[type="hidden"]').forEach(input => {
      input.value = input.id === 'create-hour' ? '19:00' : '';
    });
    queueMicrotask(syncPickerButtons);
  }));
  syncPickerButtons();
})();
