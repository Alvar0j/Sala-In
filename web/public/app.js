// Interfaz web de Sala-In. Sin dependencias: DOM + fetch + EventSource.

// --- utilidades ---------------------------------------------------------------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v); else el.style[prop] = v;
      }
    }
    else if (key in el && !key.includes('-') && key !== 'list') el[key] = value === true ? true : value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

async function api(method, path, body) {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/api/login') { store.user = null; render(); }
  if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
  return data;
}

function toast(message, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, message);
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2500);
}

async function run(action, success) {
  try {
    const result = await action();
    if (success) toast(success);
    return result;
  } catch (error) {
    toast(error.message, 'error');
    return undefined;
  }
}

function modal(build) {
  const root = document.getElementById('modal-root');
  return new Promise((resolve) => {
    const close = (value) => { root.innerHTML = ''; resolve(value); };
    const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(false); } }, h('div', { class: 'modal' }, build(close)));
    root.innerHTML = '';
    root.append(backdrop);
  });
}

function confirmDialog(title, message, { ok = 'Aceptar', danger = false } = {}) {
  return modal((close) => [
    h('h2', {}, title),
    message ? h('p', { class: 'muted' }, message) : null,
    h('div', { class: 'actions' },
      h('button', { onclick: () => close(false) }, 'Cancelar'),
      h('button', { class: danger ? 'danger' : 'primary', onclick: () => close(true) }, ok)),
  ]);
}

const appendAll = (parent, ...children) => parent.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
const clone = (value) => JSON.parse(JSON.stringify(value));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
})).toUpperCase();

// Iconos: se guardan con el nombre de SF Symbols (compatibles con la app iOS) y se muestran como emoji.
const ICONS = {
  'sparkles.rectangle.stack': '✨', 'play.fill': '▶️', 'pause.fill': '⏸️', 'stop.fill': '⏹️', 'forward.fill': '⏩',
  'backward.fill': '⏪', 'speaker.wave.3.fill': '🔊', 'speaker.slash.fill': '🔇', 'music.note': '🎵', 'waveform': '〰️',
  'film': '🎬', 'video.fill': '🎥', 'photo': '🖼️', 'lightbulb.fill': '💡', 'sun.max.fill': '☀️', 'moon.fill': '🌙',
  'star.fill': '⭐', 'globe': '🌍', 'person.3.fill': '👥', 'theatermasks.fill': '🎭', 'cube.fill': '🧊', 'flame.fill': '🔥',
  'drop.fill': '💧', 'leaf.fill': '🍃', 'gearshape.fill': '⚙️', 'power': '⏻', 'exclamationmark.octagon.fill': '🛑',
  'arrow.counterclockwise': '🔄', 'rectangle.on.rectangle': '🖥️', 'point.3.connected.trianglepath.dotted': '✳️',
};
const icon = (symbol) => ICONS[symbol] ?? '●';
const COLORS = ['#3478F6', '#2EB872', '#E5484D', '#F0A020', '#8E5CF7', '#E54CA0', '#18B4C9', '#6B7280', '#A16207', '#111827'];

const STATE_LABELS = {
  idle: 'Sin lanzar', configuring: 'Configurando sala', launching: 'Lanzando', running: 'En curso',
  finishing: 'Finalizando', completed: 'Finalizada', cancelled: 'Cancelada', failed: 'Error',
};
const STEP_KINDS = {
  osc: 'Comando OSC (QLab)', watchoutPlay: 'WATCHOUT: reproducir timeline', watchoutPause: 'WATCHOUT: pausar timeline',
  watchoutStop: 'WATCHOUT: parar timeline', presentationStart: 'Presentación: abrir y empezar', presentationStop: 'Presentación: cerrar',
  wait: 'Espera', confirmation: 'Confirmación', instruction: 'Instrucción',
};
const CONTROL_KINDS = { osc: 'Comando OSC (QLab)', watchoutPlay: 'WATCHOUT: reproducir', watchoutPause: 'WATCHOUT: pausar', watchoutStop: 'WATCHOUT: parar' };
const PHASES = { preparation: 'Preparación', launch: 'Lanzamiento', finish: 'Finalización' };
const COMMANDS = {
  powerOnCommand: 'Encender sala (ON)', powerOffCommand: 'Apagar sala (OFF)', checkSpeakersCommand: 'Check altavoces',
  stopCheckSpeakersCommand: 'Stop check altavoces', resetAVBCommand: 'Reset AVB',
};
const ROLE_LABELS = { operador: 'Operador (lanza demos)', editor: 'Editor (crea y edita demos)', admin: 'Administrador (todo)' };
const RANK = { operador: 0, editor: 1, admin: 2 };

// --- estado ---------------------------------------------------------------------
const store = { user: null, needsSetup: false, config: null, state: null, log: [], settings: null, timelines: [], files: [], ready: false };
let events = null;
const can = (role) => store.user && RANK[store.user.role] >= RANK[role];
const demoById = (id) => store.config?.demos.find((d) => d.id === id);
const demoState = (id) => store.state?.runner.states[id]?.state ?? 'idle';
const qlabReady = () => store.state?.qlab.ready;

async function boot() {
  const session = await api('GET', '/api/session').catch(() => ({ user: null, needsSetup: false }));
  store.user = session.user;
  store.needsSetup = session.needsSetup;
  if (store.user) await loadAll();
  store.ready = true;
  render();
}

async function loadAll() {
  const data = await api('GET', '/api/bootstrap');
  Object.assign(store, { user: data.user, config: data.config, state: data.state, log: data.log, settings: data.settings ?? null, files: data.files ?? [] });
  store.timelines = data.state.watchout.timelines ?? [];
  connectEvents();
}

function connectEvents() {
  events?.close();
  events = new EventSource('/api/events');
  events.addEventListener('state', (e) => {
    store.state = JSON.parse(e.data);
    if (store.state.watchout.timelines?.length) store.timelines = store.state.watchout.timelines;
    refresh();
  });
  events.addEventListener('config', (e) => { store.config = JSON.parse(e.data); refresh(true); });
  events.addEventListener('files', (e) => { store.files = JSON.parse(e.data); if (['files', 'demos'].includes(currentView().name)) refresh(); });
  events.addEventListener('log', (e) => { store.log.unshift(JSON.parse(e.data)); store.log.length = Math.min(store.log.length, 300); if (currentView().name === 'log') refresh(); });
  events.onerror = () => { if (!store.user) events.close(); };
}

// --- router ---------------------------------------------------------------------
function currentView() {
  const [name, id, sub] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'demos', id, sub };
}
window.addEventListener('hashchange', () => { draft = null; render(); window.scrollTo(0, 0); });

let draft = null; // copia de trabajo del editor abierto (no se pisa con los eventos en tiempo real)

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (!store.ready) return app.append(h('p', { class: 'boot' }, 'Cargando…'));
  if (!store.user) return app.append(store.needsSetup ? setupView() : loginView());
  app.append(topbar(), h('main', { id: 'main' }, activeBanner(), viewContent()), tabs());
  renderPrompt();
}

/** Actualiza la cabecera, el banner y, si la vista no es un editor, el contenido. */
function refresh(configChanged = false) {
  if (!store.user) return;
  const view = currentView();
  const editing = view.name === 'edit' || view.name === 'new' || (view.name === 'constellation' && view.id === 'edit') || view.name === 'settings';
  const top = document.querySelector('.topbar');
  if (top) top.replaceWith(topbar());
  const main = document.getElementById('main');
  if (!main) return render();
  if (view.name === 'settings') {
    for (const [key, id] of [['qlab', 'qlab-status'], ['watchout', 'watchout-status']]) {
      const el = document.getElementById(id);
      if (el) el.replaceWith(statusLine(store.state[key], id));
    }
  }
  if (editing && !configChanged) {
    const banner = main.querySelector('.banner');
    const next = activeBanner();
    if (banner && next) banner.replaceWith(next);
    else if (banner) banner.remove();
    else if (next) main.prepend(next);
  } else if (!editing) {
    const scroll = window.scrollY;
    main.replaceChildren(...[activeBanner(), viewContent()].filter(Boolean));
    window.scrollTo(0, scroll);
  }
  renderPrompt();
}

function viewContent() {
  const view = currentView();
  switch (view.name) {
    case 'demo': return demoDetailView(view.id);
    case 'edit': return can('editor') ? demoEditorView(view.id) : notAllowed();
    case 'new': return can('editor') ? demoEditorView(null) : notAllowed();
    case 'constellation': return view.id === 'edit' && can('editor') ? constellationEditorView() : constellationView();
    case 'check': return checkView();
    case 'log': return logView();
    case 'settings': return can('admin') ? settingsView() : notAllowed();
    case 'files': return can('editor') ? filesView() : notAllowed();
    default: return demosView();
  }
}

const notAllowed = () => h('div', { class: 'empty' }, 'Tu usuario no tiene permiso para ver esta sección.');

// --- piezas comunes --------------------------------------------------------------
function statusPill(label, snapshot) {
  const status = snapshot?.status;
  const cls = status === 'connected' ? 'ok' : status === 'connecting' ? 'warn' : status === 'disabled' || status === 'disconnected' ? '' : 'bad';
  const title = `${label}: ${status === 'connected' ? 'conectado' : snapshot?.detail || status || '—'}`;
  return h('span', { class: 'pill', title }, h('span', { class: `dot ${cls}` }), h('span', { class: 'label' }, label));
}

function topbar() {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/demos' }, h('img', { src: 'img/icon.png', alt: '' }), 'Sala-In'),
    statusPill('QLab', store.state?.qlab),
    statusPill('WO', store.state?.watchout),
    h('button', { class: 'ghost small', title: `Sesión de ${store.user.username}`, onclick: logout }, '⎋'));
}

function tabs() {
  const view = currentView().name;
  const items = [['demos', '✨', 'Demos'], ['constellation', '✳️', 'Constellation'], ['check', '✅', 'Check'], ['log', '📜', 'Registro']];
  if (can('admin')) items.push(['settings', '⚙️', 'Ajustes']);
  const activeName = ['demo', 'edit', 'new'].includes(view) ? 'demos' : view;
  return h('nav', { class: 'tabs' }, items.map(([name, glyph, label]) =>
    h('a', { href: `#/${name}`, class: activeName === name ? 'active' : '' }, h('span', {}, glyph), label)));
}

function activeBanner() {
  const runner = store.state?.runner;
  if (!runner) return null;
  const demo = demoById(runner.activeDemoId) ?? demoById(runner.currentStep?.demoId);
  if (!demo && !runner.busy) return null;
  if (!demo) return null;
  const st = demoState(demo.id);
  const busy = runner.busy;
  const countdown = runner.countdown?.demoId === demo.id ? runner.countdown : null;
  return h('div', { class: `banner ${busy ? 'busy' : ''}` },
    h('div', { class: 'row' },
      h('strong', {}, `${icon(demo.symbol)} ${demo.name}`),
      h('span', { class: `badge ${badgeClass(st)}` }, STATE_LABELS[st] ?? st),
      h('span', { class: 'spacer' }),
      currentView().id !== demo.id ? h('a', { class: 'button small', href: `#/demo/${demo.id}` }, 'Abrir mando') : null),
    runner.currentStep ? h('p', { class: 'small muted' }, [PHASES[runner.currentStep.phase], runner.currentStep.title].filter(Boolean).join(' · ')) : null,
    countdown ? [h('p', { class: 'small' }, `Preparando la sala · ${countdown.remaining} s`),
      h('div', { class: 'progress' }, h('div', { style: { width: `${((countdown.total - countdown.remaining + 1) / countdown.total) * 100}%` } }))] : null,
    presentationPlaying() && currentView().id !== demo.id ? slideRemote(true) : null,
    h('div', { class: 'row' },
      busy ? h('button', { class: 'small', onclick: () => run(() => api('POST', '/api/runner/cancel'), 'Tarea detenida') }, 'Detener') : null,
      h('button', { class: 'small danger', disabled: st === 'finishing', onclick: () => finishDemo(demo) }, 'Finalizar demo')));
}

// --- presentaciones ----------------------------------------------------------------
const presentation = () => store.state?.presentation ?? { status: 'idle' };
const presentationPlaying = () => presentation().status === 'playing';
const hasPresentation = (demo) => ['preparation', 'launch', 'finish'].some((p) => demo[p].some((s) => s.kind === 'presentationStart'));
const slideAction = (action, body) => run(() => api('POST', `/api/presentation/${action}`, body));

/** Mando de diapositivas. `compact` para el banner. */
function slideRemote(compact = false) {
  const p = presentation();
  const counter = p.total ? `${p.slide} / ${p.total}` : `${p.slide || '–'}`;
  if (compact) {
    return h('div', { class: 'mini-remote' },
      h('span', { class: 'small' }, `🖥️ Diapositiva ${counter}`),
      h('button', { class: 'small', onclick: () => slideAction('previous') }, '◀'),
      h('button', { class: 'small primary', onclick: () => slideAction('next') }, 'Siguiente ▶'));
  }
  const gotoInput = h('input', { type: 'number', min: 1, max: p.total || undefined, placeholder: 'Nº', style: { width: '90px' } });
  return h('div', { class: 'card slides' },
    h('div', { class: 'section-head' }, h('h2', {}, '🖥️ Presentación'), h('span', { class: 'badge running' }, p.driver === 'simulado' ? 'Simulada' : 'Keynote')),
    h('p', { class: 'muted small' }, p.fileName),
    h('div', { class: 'slide-counter' }, h('span', {}, 'Diapositiva'), h('strong', {}, counter)),
    h('div', { class: 'slide-buttons' },
      h('button', { class: 'big-button', style: { '--tint': 'var(--surface-2)' }, onclick: () => slideAction('previous') }, h('span', { class: 'glyph' }, '◀'), 'Anterior'),
      h('button', { class: 'big-button', onclick: () => slideAction('next') }, h('span', { class: 'glyph' }, '▶'), 'Siguiente')),
    h('p', { class: 'small muted' }, '«Siguiente» también avanza las animaciones de la diapositiva. En un ordenador puedes usar las flechas del teclado o la barra espaciadora.'),
    h('div', { class: 'row' },
      gotoInput, h('button', { class: 'small', onclick: () => gotoInput.value && slideAction('goto', { slide: Number(gotoInput.value) }) }, 'Ir a la diapositiva'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'small ghost', onclick: async () => { if (await confirmDialog('¿Detener la presentación?', 'Se cerrará Keynote. La demo sigue activa hasta que la finalices.', { ok: 'Detener', danger: true })) slideAction('stop'); } }, 'Detener presentación')));
}

function presentationStatusCard(demo) {
  const p = presentation();
  const mine = p.demoId === demo.id;
  if (mine && p.status === 'playing') return slideRemote();
  let text = 'La presentación se abrirá al lanzar la demo.';
  if (mine && p.status === 'opening') text = `Abriendo «${p.fileName}» en Keynote…`;
  else if (mine && p.status === 'error') text = `⚠️ ${p.detail}`;
  else if (mine && p.status === 'stopped') text = `⚠️ ${p.detail} Relanza la demo para volver a abrirla.`;
  else if (p.status === 'playing') text = `Ahora se está reproduciendo otra presentación («${p.fileName}»).`;
  return h('div', { class: 'card' }, h('h2', {}, '🖥️ Presentación'), h('p', { class: 'small muted' }, text));
}

document.addEventListener('keydown', (e) => {
  if (!presentationPlaying() || currentView().name !== 'demo' || document.getElementById('modal-root').childElementCount) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); slideAction('next'); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); slideAction('previous'); }
});

function formatSize(bytes) {
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Sube un archivo mostrando el progreso (XHR permite medir la subida; fetch no). */
function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/files?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('X-Salain-Upload', '1');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data.file);
      else reject(new Error(data.error ?? `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Se perdió la conexión durante la subida.'));
    xhr.send(file);
  });
}

const ACCEPT = '.key,.pptx,.ppt,.zip';
const FILE_HELP = 'Keynote (.key) o PowerPoint (.pptx). Si el .key no se deja elegir, en Keynote usa Archivo → Avanzado → Cambiar tipo de archivo → Archivo único, o comprímelo en .zip.';

function uploadPicker(onUploaded) {
  const bar = h('div', { style: { width: '0%' } });
  const status = h('p', { class: 'small muted' }, FILE_HELP);
  const progress = h('div', { class: 'progress hidden' }, bar);
  const input = h('input', { type: 'file', accept: ACCEPT, class: 'hidden', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    button.disabled = true;
    progress.classList.remove('hidden');
    status.textContent = `Subiendo «${file.name}» (${formatSize(file.size)})…`;
    try {
      const uploaded = await uploadFile(file, (ratio) => { bar.style.width = `${Math.round(ratio * 100)}%`; status.textContent = `Subiendo «${file.name}» · ${Math.round(ratio * 100)} %`; });
      status.textContent = `✓ «${uploaded.name}» subido.`;
      onUploaded(uploaded);
    } catch (error) {
      status.textContent = `⚠️ ${error.message}`;
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
      e.target.value = '';
    }
  } });
  const button = h('button', { class: 'primary', onclick: () => input.click() }, '⬆︎ Elegir archivo…');
  return h('div', { style: { display: 'grid', gap: '8px' } }, h('div', { class: 'row' }, button, input), progress, status);
}

async function newPresentation() {
  const values = { name: '', fileId: '' };
  const timeline = store.settings?.presentation?.watchoutTimelineId;
  const created = await modal((close) => {
    const fileList = h('div', {});
    const renderFiles = () => fileList.replaceChildren(
      field('Presentación', h('select', { onchange: (e) => { values.fileId = e.target.value; } },
        h('option', { value: '' }, store.files.length ? 'Elige una ya subida…' : 'Sube un archivo primero'),
        store.files.map((f) => h('option', { value: f.id, selected: f.id === values.fileId }, `${f.name} · ${formatSize(f.size)}`)))));
    renderFiles();
    const nameInput = input(values, 'name', 'text', 'Nombre de la demo (por defecto, el del archivo)');
    return [
      h('h2', {}, 'Nueva presentación'),
      h('p', { class: 'small muted' }, 'Crea una demo que abre la presentación en Keynote y la muestra en las paredes. Luego puedes editarla como cualquier otra demo.'),
      uploadPicker((file) => { store.files = [file, ...store.files.filter((f) => f.id !== file.id)]; values.fileId = file.id; if (!values.name) { values.name = file.name.replace(/\.[^.]+$/, ''); nameInput.value = values.name; } renderFiles(); }),
      fileList,
      field('Nombre', nameInput),
      timeline || !can('admin') ? null : h('p', { class: 'small muted' }, 'ℹ️ Aún no has elegido el timeline de WATCHOUT para presentaciones (Ajustes → Presentaciones). La demo solo abrirá Keynote.'),
      h('div', { class: 'actions' }, h('button', { onclick: () => close(null) }, 'Cancelar'),
        h('button', { class: 'primary', onclick: async () => {
          if (!values.fileId) return toast('Elige o sube una presentación.', 'error');
          const result = await run(() => api('POST', '/api/presentations', values), 'Presentación creada');
          if (result) close(result.demo);
        } }, 'Crear')),
    ];
  });
  if (created) location.hash = `#/demo/${created.id}`;
}

function fileSelect(obj, key) {
  const current = String(obj[key] ?? '');
  const options = store.files.map((f) => h('option', { value: f.id, selected: f.id === current }, f.name));
  if (current && !store.files.some((f) => f.id === current)) options.unshift(h('option', { value: current, selected: true }, 'Archivo borrado: elige otro'));
  if (!current) options.unshift(h('option', { value: '', selected: true }, store.files.length ? 'Elige una presentación…' : 'No hay archivos subidos'));
  return h('select', { onchange: (e) => { obj[key] = e.target.value; } }, options);
}

function filesView() {
  const usage = (id) => store.config.demos.filter((d) => ['preparation', 'launch', 'finish'].some((p) => d[p].some((s) => s.kind === 'presentationStart' && s.value === id))).map((d) => d.name);
  return h('section', {},
    h('div', { class: 'row' }, h('a', { class: 'button small ghost', href: '#/demos' }, '‹ Demos')),
    h('h1', {}, 'Archivos'),
    h('div', { class: 'card' }, h('h2', {}, 'Subir presentación'), uploadPicker(() => {})),
    store.files.length ? h('div', { class: 'card' }, h('table', {}, h('tbody', {}, store.files.map((f) => {
      const used = usage(f.id);
      return h('tr', {},
        h('td', {}, h('strong', {}, f.name), h('div', { class: 'small muted' }, `${formatSize(f.size)} · ${new Date(f.uploadedAt).toLocaleDateString('es-ES')} · ${f.by}`),
          used.length ? h('div', { class: 'small muted' }, `Usado en: ${used.join(', ')}`) : null),
        h('td', { style: { textAlign: 'right' } }, h('button', { class: 'small ghost', onclick: async () => {
          if (!await confirmDialog(`¿Borrar «${f.name}»?`, used.length ? `Lo usan estas demos: ${used.join(', ')}. Dejarán de poder abrirlo.` : 'No se puede deshacer.', { ok: 'Borrar', danger: true })) return;
          run(() => api('DELETE', `/api/files/${f.id}`), 'Archivo borrado');
        } }, '✕')));
    })))) : h('div', { class: 'empty' }, 'No hay archivos subidos.'));
}

function badgeClass(state) {
  if (state === 'running') return 'running';
  if (['configuring', 'launching', 'finishing'].includes(state)) return 'busy';
  if (state === 'failed') return 'failed';
  return '';
}

let shownPrompt = null;
function renderPrompt() {
  const prompt = store.state?.runner.prompt;
  if (!prompt) {
    if (shownPrompt) { document.getElementById('modal-root').innerHTML = ''; shownPrompt = null; }
    return;
  }
  if (shownPrompt === prompt.id) return;
  shownPrompt = prompt.id;
  const isInstruction = prompt.kind === 'instruction';
  modal((close) => [
    h('h2', {}, isInstruction ? `📋 ${prompt.title || 'Instrucción'}` : `❓ ${prompt.title || 'Confirmación'}`),
    h('p', {}, prompt.text || ''),
    h('div', { class: 'actions' },
      h('button', { onclick: () => { close(); answer(prompt.id, false); } }, 'Cancelar demo'),
      h('button', { class: 'primary', onclick: () => { close(); answer(prompt.id, true); } }, isInstruction ? 'Hecho' : 'Continuar')),
  ]);
}
const answer = (id, accept) => run(() => api('POST', '/api/runner/prompt', { id, accept }));

async function logout() {
  if (!await confirmDialog('Cerrar sesión', `Sesión iniciada como ${store.user.username}.`, { ok: 'Cerrar sesión' })) return;
  await api('POST', '/api/logout').catch(() => {});
  events?.close();
  store.user = null;
  render();
}

// --- acceso ----------------------------------------------------------------------
function loginView() {
  const username = h('input', { autocomplete: 'username', autocapitalize: 'none', required: true });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const submit = async (e) => {
    e.preventDefault();
    const result = await run(() => api('POST', '/api/login', { username: username.value, password: password.value }));
    if (result) { store.user = result.user; await loadAll(); render(); }
  };
  return h('form', { class: 'auth', onsubmit: submit },
    h('img', { src: 'img/icon.png', alt: '' }), h('h1', { style: { textAlign: 'center' } }, 'Sala-In'),
    h('label', { class: 'field' }, 'Usuario', username), h('label', { class: 'field' }, 'Contraseña', password),
    h('button', { class: 'primary', type: 'submit' }, 'Entrar'));
}

function setupView() {
  const username = h('input', { autocomplete: 'username', autocapitalize: 'none', required: true, value: 'admin' });
  const password = h('input', { type: 'password', autocomplete: 'new-password', required: true, minLength: 6 });
  const submit = async (e) => {
    e.preventDefault();
    const result = await run(() => api('POST', '/api/setup', { username: username.value, password: password.value }));
    if (result) { store.user = result.user; store.needsSetup = false; await loadAll(); location.hash = '#/settings'; render(); }
  };
  return h('form', { class: 'auth', onsubmit: submit },
    h('img', { src: 'img/icon.png', alt: '' }), h('h1', { style: { textAlign: 'center' } }, 'Primera puesta en marcha'),
    h('p', { class: 'muted' }, 'Crea el usuario administrador. Después podrás configurar QLab, WATCHOUT y los demás usuarios.'),
    h('label', { class: 'field' }, 'Usuario administrador', username), h('label', { class: 'field' }, 'Contraseña (mínimo 6 caracteres)', password),
    h('button', { class: 'primary', type: 'submit' }, 'Crear administrador'));
}

// --- demos -------------------------------------------------------------------------
function demosView() {
  const { demos, commands } = store.config;
  const power = (name, label, glyph, tint) => h('button', {
    class: 'big-button', style: { '--tint': tint }, disabled: !qlabReady() || !commands[name],
    onclick: async () => {
      if (!await confirmDialog(`¿${label}?`, `Se enviará ${commands[name]}`, { ok: label, danger: name === 'powerOffCommand' })) return;
      run(() => api('POST', `/api/commands/${name}`), 'Enviado');
    },
  }, h('span', { class: 'glyph' }, glyph), label);
  return h('section', {},
    h('img', { class: 'logo', src: 'img/spacemap.png', alt: 'Spacemap Go' }),
    h('div', { class: 'grid' }, power('powerOnCommand', 'Encender sala', '⏻', 'var(--ok)'), power('powerOffCommand', 'Apagar sala', '⭘', 'var(--danger)')),
    h('div', { class: 'section-head' }, h('h2', {}, 'Demos'), can('editor') ? h('div', { class: 'row' },
      h('a', { class: 'button small ghost', href: '#/files', title: 'Archivos subidos' }, '📁'),
      h('button', { class: 'small', onclick: newPresentation }, '＋ Presentación'),
      h('a', { class: 'button small', href: '#/new' }, '＋ Demo')) : null),
    demos.length ? h('div', { class: 'grid wide' }, demos.map(demoCard))
      : h('div', { class: 'empty' }, can('editor') ? 'Aún no hay demos. Crea una o importa la configuración de la app iPad en Ajustes.' : 'Aún no hay demos.'));
}

function demoCard(demo) {
  const st = demoState(demo.id);
  const active = store.state?.runner.activeDemoId === demo.id;
  return h('a', { class: `card demo-card ${active ? 'active' : ''}`, href: `#/demo/${demo.id}` },
    h('span', { class: 'glyph', style: { '--tint': demo.colorHex } }, icon(demo.symbol)),
    h('div', {}, h('h3', {}, demo.name), demo.summary ? h('p', { class: 'small muted' }, demo.summary) : null),
    st !== 'idle' ? h('span', { class: `badge ${badgeClass(st)}` }, STATE_LABELS[st]) : h('span', { class: 'muted small' }, `${demo.estimatedMinutes} min`));
}

async function launchDemo(demo) {
  const runner = store.state.runner;
  const other = demoById(runner.activeDemoId);
  const parts = [];
  if (other && other.id !== demo.id) parts.push(`Se finalizará antes «${other.name}».`);
  else if (other) parts.push('La demo ya está activa: se finalizará y se volverá a lanzar.');
  if (demo.roomConfigurationCommand) parts.push(`Se configurará la sala (${demo.configurationSeconds} s).`);
  if (demo.requiresLaunchConfirmation || other) {
    if (!await confirmDialog(`¿Lanzar «${demo.name}»?`, parts.join(' '), { ok: 'Lanzar' })) return;
  }
  run(() => api('POST', `/api/demos/${demo.id}/launch`));
}

async function finishDemo(demo) {
  if (!await confirmDialog(`¿Finalizar «${demo.name}»?`, demo.finish.length ? 'Se ejecutarán los pasos de Finalización.' : 'La demo no tiene pasos de Finalización.', { ok: 'Finalizar', danger: true })) return;
  run(() => api('POST', `/api/demos/${demo.id}/finish`));
}

function demoDetailView(id) {
  const demo = demoById(id);
  if (!demo) return h('div', { class: 'empty' }, 'Demo no disponible. ', h('a', { href: '#/demos' }, 'Volver'));
  const st = demoState(demo.id);
  const runner = store.state.runner;
  const isActive = runner.activeDemoId === demo.id;
  const running = isActive && st === 'running';
  const busy = runner.busy && (runner.currentStep?.demoId === demo.id || isActive);
  const error = runner.states[demo.id]?.error;
  return h('section', {},
    h('div', { class: 'row' }, h('a', { class: 'button small ghost', href: '#/demos' }, '‹ Demos'), h('span', { class: 'spacer' }),
      can('editor') ? h('a', { class: 'button small', href: `#/edit/${demo.id}` }, '✏️ Editar') : null),
    h('div', { class: 'card', style: { justifyItems: 'center', textAlign: 'center' } },
      h('div', { style: { fontSize: '3rem' } }, icon(demo.symbol)),
      h('h1', {}, demo.name),
      demo.summary ? h('p', { class: 'muted' }, demo.summary) : null,
      h('span', { class: `badge ${badgeClass(st)}` }, STATE_LABELS[st]),
      error ? h('p', { class: 'small', style: { color: '#FF8F92' } }, error) : null,
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'primary', disabled: busy && isActive && st !== 'running', onclick: () => launchDemo(demo) }, isActive ? '↻ Relanzar' : '▶ Lanzar demo'),
        isActive || busy ? h('button', { class: 'danger', disabled: st === 'finishing', onclick: () => finishDemo(demo) }, '■ Finalizar') : null),
      !qlabReady() ? h('p', { class: 'small muted' }, '⚠️ QLab no está conectado: los comandos OSC fallarán.') : null),
    hasPresentation(demo) ? presentationStatusCard(demo) : null,
    hasPresentation(demo) && !demo.liveControls.length ? null : [
      h('div', { class: 'section-head' }, h('h2', {}, 'Mando de la demo'),
        !running && demo.liveControls.length ? h('span', { class: 'small muted' }, 'Disponible cuando la demo esté en curso') : null),
      demo.liveControls.length
        ? h('div', { class: 'grid' }, demo.liveControls.map((control) => controlButton(control, !running, `/api/demos/${demo.id}/controls/${control.id}`)))
        : h('div', { class: 'empty' }, 'Esta demo no tiene botones de mando.')]);
}

function controlButton(control, disabled, endpoint) {
  const target = (control.kind ?? 'osc') === 'osc' ? control.oscAddress : `${CONTROL_KINDS[control.kind]} ${timelineLabel(control.timelineId)}`;
  return h('button', {
    class: 'big-button', style: { '--tint': control.colorHex }, disabled,
    title: target,
    onclick: async () => {
      if (control.requiresConfirmation && !await confirmDialog(`¿Ejecutar ${control.title}?`, target, { ok: 'Ejecutar' })) return;
      run(() => api('POST', endpoint));
    },
  }, h('span', { class: 'glyph' }, icon(control.symbol)), control.title);
}

const timelineLabel = (id) => {
  const timeline = store.timelines.find((t) => String(t.id) === String(id));
  return timeline ? `«${timeline.name}»` : `timeline ${id || '?'}`;
};

// --- editor de demos --------------------------------------------------------------
function blankDemo() {
  return {
    name: 'Nueva demo', summary: '', symbol: 'sparkles.rectangle.stack', colorHex: '#3478F6', estimatedMinutes: 5,
    requiresLaunchConfirmation: true, roomConfigurationCommand: '', configurationSeconds: 10,
    preparation: [], launch: [], finish: [], liveControls: [],
  };
}

function demoEditorView(id) {
  if (!draft) {
    const source = id ? demoById(id) : blankDemo();
    if (!source) return h('div', { class: 'empty' }, 'Demo no encontrada.');
    draft = clone(source);
    loadTimelines();
  }
  const d = draft;
  const container = h('section', {});
  const rerender = () => container.replaceWith(demoEditorView(id));

  const save = async () => {
    const payload = { ...d, roomConfigurationCommand: (d.roomConfigurationCommand ?? '').trim() };
    const result = await run(() => (id ? api('PUT', `/api/demos/${id}`, payload) : api('POST', '/api/demos', payload)), 'Demo guardada');
    if (result) { draft = null; location.hash = `#/demo/${result.demo.id}`; }
  };
  const remove = async () => {
    if (!await confirmDialog(`¿Borrar «${d.name}»?`, 'No se puede deshacer.', { ok: 'Borrar', danger: true })) return;
    if (await run(() => api('DELETE', `/api/demos/${id}`), 'Demo borrada')) { draft = null; location.hash = '#/demos'; }
  };

  appendAll(container,
    h('div', { class: 'row' },
      h('a', { class: 'button small ghost', href: id ? `#/demo/${id}` : '#/demos' }, '‹ Cancelar'),
      h('span', { class: 'spacer' }),
      id ? h('button', { class: 'small danger', onclick: remove }, 'Borrar') : null,
      h('button', { class: 'small primary', onclick: save }, 'Guardar')),
    h('h1', {}, id ? 'Editar demo' : 'Nueva demo'),
    h('div', { class: 'card' },
      h('div', { class: 'form-grid' },
        field('Nombre', input(d, 'name')),
        field('Duración estimada (min)', input(d, 'estimatedMinutes', 'number'))),
      field('Descripción', textarea(d, 'summary')),
      h('div', {}, h('p', { class: 'small muted' }, 'Icono'), iconPicker(d, rerender)),
      h('div', {}, h('p', { class: 'small muted' }, 'Color'), colorPicker(d, rerender)),
      checkbox(d, 'requiresLaunchConfirmation', 'Pedir confirmación antes de lanzar')),
    h('div', { class: 'card' },
      h('h2', {}, '⚙️ Configurar sala'),
      h('p', { class: 'small muted' }, 'Comando OSC que se envía al lanzar la demo, seguido de una cuenta atrás mientras la sala se prepara. Déjalo vacío si no hace falta.'),
      h('div', { class: 'form-grid' },
        field('Comando OSC', input(d, 'roomConfigurationCommand', 'text', '/cue/configuracion/start')),
        field('Cuenta atrás (segundos)', input(d, 'configurationSeconds', 'number')))),
    Object.entries(PHASES).map(([phase, title]) => phaseEditor(d, phase, title, rerender)),
    controlsEditor(d.liveControls, rerender, 'Mando de la demo', 'Botones disponibles mientras la demo está en curso.'),
    h('div', { class: 'row end' }, h('button', { class: 'primary', onclick: save }, 'Guardar demo')));
  return container;
}

const PHASE_HELP = {
  preparation: 'Se ejecuta al lanzar, después de configurar la sala.',
  launch: 'Se ejecuta a continuación de la Preparación. Al terminar, la demo queda «En curso».',
  finish: 'Se ejecuta al pulsar Finalizar o al lanzar otra demo mientras esta está activa.',
};

function phaseEditor(d, phase, title, rerender) {
  const steps = d[phase];
  const add = (kind) => { steps.push({ id: uuid(), kind, title: STEP_KINDS[kind].replace(/ \(.*\)/, ''), value: '', delaySeconds: 1, isEnabled: true, continueOnError: false }); rerender(); };
  const kindSelect = h('select', {}, Object.entries(STEP_KINDS).map(([k, label]) => h('option', { value: k }, label)));
  return h('div', { class: 'card' },
    h('div', { class: 'section-head' }, h('h2', {}, title), h('span', { class: 'small muted' }, `${steps.length} pasos`)),
    h('p', { class: 'small muted' }, PHASE_HELP[phase]),
    steps.map((step, index) => stepEditor(step, index, steps, rerender)),
    h('div', { class: 'row' }, kindSelect, h('button', { class: 'small', onclick: () => add(kindSelect.value) }, '＋ Añadir paso')));
}

function listTools(list, index, rerender) {
  const move = (delta) => { const [item] = list.splice(index, 1); list.splice(index + delta, 0, item); rerender(); };
  return [
    h('button', { class: 'icon small', title: 'Subir', disabled: index === 0, onclick: () => move(-1) }, '↑'),
    h('button', { class: 'icon small', title: 'Bajar', disabled: index === list.length - 1, onclick: () => move(1) }, '↓'),
    h('button', { class: 'icon small', title: 'Eliminar', onclick: () => { list.splice(index, 1); rerender(); } }, '✕'),
  ];
}

function stepEditor(step, index, steps, rerender) {
  const kindSelect = h('select', { onchange: (e) => { step.kind = e.target.value; rerender(); } },
    Object.entries(STEP_KINDS).map(([k, label]) => h('option', { value: k, selected: k === step.kind }, label)));
  let valueField;
  if (step.kind === 'osc') valueField = field('Comando OSC (puede llevar argumentos: /cue/1/level 0 -10)', input(step, 'value', 'text', '/cue/5/start'));
  else if (step.kind.startsWith('watchout')) valueField = field('Timeline de WATCHOUT', timelineSelect(step, 'value'));
  else if (step.kind === 'wait') valueField = field('Segundos', input(step, 'delaySeconds', 'number'));
  else if (step.kind === 'presentationStart') valueField = field('Presentación (sube archivos en Demos → ＋ Presentación o en Archivos)', fileSelect(step, 'value'));
  else if (step.kind === 'presentationStop') valueField = h('p', { class: 'small muted' }, 'Detiene la presentación y cierra Keynote.');
  else valueField = field(step.kind === 'confirmation' ? 'Pregunta que verá el operador' : 'Instrucción que verá el operador', textarea(step, 'value'));
  const testable = !['wait', 'confirmation', 'instruction', 'presentationStart', 'presentationStop'].includes(step.kind);
  return h('div', { class: `step ${step.isEnabled ? '' : 'disabled'}` },
    h('div', { class: 'step-head' }, h('strong', { class: 'muted' }, `${index + 1}.`), kindSelect, input(step, 'title', 'text', 'Título'), listTools(steps, index, rerender)),
    valueField,
    h('div', { class: 'row' },
      checkbox(step, 'isEnabled', 'Activo', rerender), checkbox(step, 'continueOnError', 'Continuar si falla'),
      h('span', { class: 'spacer' }),
      testable ? h('button', { class: 'small', onclick: () => run(() => api('POST', '/api/test-step', { step }), 'Paso enviado') }, 'Probar') : null));
}

function controlsEditor(controls, rerender, title, help) {
  const add = () => { controls.push({ id: uuid(), title: 'Control', oscAddress: '', colorHex: '#3478F6', symbol: 'play.fill', requiresConfirmation: false }); rerender(); };
  return h('div', { class: 'card' },
    h('div', { class: 'section-head' }, h('h2', {}, title), h('button', { class: 'small', onclick: add }, '＋ Añadir botón')),
    help ? h('p', { class: 'small muted' }, help) : null,
    controls.length ? null : h('p', { class: 'small muted' }, 'Sin botones.'),
    controls.map((control, index) => {
      const kind = control.kind ?? 'osc';
      const kindSelect = h('select', { onchange: (e) => {
        if (e.target.value === 'osc') { delete control.kind; delete control.timelineId; } else { control.kind = e.target.value; control.timelineId ??= ''; }
        rerender();
      } }, Object.entries(CONTROL_KINDS).map(([k, label]) => h('option', { value: k, selected: k === kind }, label)));
      return h('div', { class: 'step' },
        h('div', { class: 'step-head' }, h('span', { style: { fontSize: '1.4rem' } }, icon(control.symbol)), input(control, 'title', 'text', 'Título'), listTools(controls, index, rerender)),
        h('div', { class: 'form-grid' },
          field('Acción', kindSelect),
          kind === 'osc' ? field('Comando OSC', input(control, 'oscAddress', 'text', '/cue/5/start')) : field('Timeline', timelineSelect(control, 'timelineId'))),
        h('details', {}, h('summary', { class: 'small muted' }, 'Icono y color'),
          h('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } }, iconPicker(control, rerender), colorPicker(control, rerender))),
        h('div', { class: 'row' }, checkbox(control, 'requiresConfirmation', 'Pedir confirmación'), h('span', { class: 'spacer' }),
          h('button', { class: 'small', onclick: () => run(() => api('POST', '/api/test-step', { control }), 'Enviado') }, 'Probar')));
    }));
}

// Campos enlazados a un objeto del borrador
function field(label, control) { return h('label', { class: 'field' }, label, control); }
function input(obj, key, type = 'text', placeholder = '') {
  return h('input', {
    type, placeholder, value: obj[key] ?? '', autocapitalize: type === 'text' && key !== 'name' && key !== 'title' ? 'none' : undefined,
    oninput: (e) => { obj[key] = type === 'number' ? Number(e.target.value) : e.target.value; },
  });
}
function textarea(obj, key) { return h('textarea', { value: obj[key] ?? '', oninput: (e) => { obj[key] = e.target.value; } }); }
function checkbox(obj, key, label, rerender) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(obj[key]), onchange: (e) => { obj[key] = e.target.checked; rerender?.(); } }), label);
}
function iconPicker(obj, rerender) {
  return h('div', { class: 'icon-picker' }, Object.entries(ICONS).map(([name, glyph]) =>
    h('button', { type: 'button', title: name, class: obj.symbol === name ? 'selected' : '', onclick: () => { obj.symbol = name; rerender(); } }, glyph)));
}
function colorPicker(obj, rerender) {
  return h('div', { class: 'swatches' },
    COLORS.map((color) => h('button', { type: 'button', title: color, class: obj.colorHex?.toUpperCase() === color ? 'selected' : '', style: { background: color }, onclick: () => { obj.colorHex = color; rerender(); } })),
    h('input', { type: 'color', value: obj.colorHex ?? '#3478F6', onchange: (e) => { obj.colorHex = e.target.value.toUpperCase(); rerender(); } }));
}
function timelineSelect(obj, key) {
  const current = String(obj[key] ?? '');
  const options = store.timelines.map((t) => h('option', { value: t.id, selected: String(t.id) === current }, `${t.name} (ID ${t.id})`));
  if (!store.timelines.length) {
    return h('input', { value: current, placeholder: 'ID del timeline (p. ej. 24)', oninput: (e) => { obj[key] = e.target.value.trim(); } });
  }
  if (current && !store.timelines.some((t) => String(t.id) === current)) options.unshift(h('option', { value: current, selected: true }, `ID ${current} (no encontrado)`));
  if (!current) { options.unshift(h('option', { value: '', selected: true }, 'Elige un timeline…')); }
  return h('select', { onchange: (e) => { obj[key] = e.target.value; } }, options);
}
async function loadTimelines() {
  const result = await api('GET', '/api/watchout/timelines').catch(() => null);
  if (result?.timelines?.length) {
    const changed = JSON.stringify(result.timelines) !== JSON.stringify(store.timelines);
    store.timelines = result.timelines;
    if (changed && draft) { const main = document.getElementById('main'); if (main) main.replaceChildren(...[activeBanner(), viewContent()].filter(Boolean)); }
  }
}

// --- Constellation ------------------------------------------------------------------
function constellationView() {
  const buttons = store.config.constellationButtons;
  return h('section', {},
    h('img', { class: 'logo', src: 'img/constellation.png', alt: 'Constellation' }),
    h('div', { class: 'section-head' }, h('h2', {}, 'Controles'), can('editor') ? h('a', { class: 'button small', href: '#/constellation/edit' }, '✏️ Editar botones') : null),
    buttons.length ? h('div', { class: 'grid' }, buttons.map((b) => controlButton(b, false, `/api/constellation/${b.id}`)))
      : h('div', { class: 'empty' }, 'Sin botones de Constellation.'));
}

function constellationEditorView() {
  if (!draft) { draft = clone(store.config.constellationButtons); loadTimelines(); }
  const container = h('section', {});
  const rerender = () => container.replaceWith(constellationEditorView());
  const save = async () => {
    if (await run(() => api('PUT', '/api/constellation', { buttons: draft }), 'Botones guardados')) { draft = null; location.hash = '#/constellation'; }
  };
  appendAll(container,
    h('div', { class: 'row' }, h('a', { class: 'button small ghost', href: '#/constellation' }, '‹ Cancelar'), h('span', { class: 'spacer' }),
      h('button', { class: 'small primary', onclick: save }, 'Guardar')),
    controlsEditor(draft, rerender, 'Botones de Constellation'),
    h('div', { class: 'row end' }, h('button', { class: 'primary', onclick: save }, 'Guardar botones')));
  return container;
}

// --- Check ----------------------------------------------------------------------------
function checkView() {
  const { commands } = store.config;
  const button = (name, label, glyph, tint, confirmFirst) => h('button', {
    class: 'big-button', style: { '--tint': tint }, disabled: !qlabReady() || !commands[name],
    onclick: async () => {
      if (confirmFirst && !await confirmDialog(`¿${label}?`, `Se enviará ${commands[name]}`, { ok: label, danger: true })) return;
      run(() => api('POST', `/api/commands/${name}`), 'Enviado');
    },
  }, h('span', { class: 'glyph' }, glyph), label, h('span', { class: 'sub mono' }, commands[name] || 'sin configurar'));
  return h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, 'Check'), can('editor') ? h('button', { class: 'small', onclick: editCommands }, '⚙️ Comandos') : null),
    h('div', { class: 'grid' },
      button('checkSpeakersCommand', 'Check altavoces', '🔊', '#3478F6'),
      button('stopCheckSpeakersCommand', 'Stop check', '🔇', '#E5484D'),
      button('resetAVBCommand', 'Reset AVB', '🔄', '#F0A020', true)),
    !qlabReady() ? h('p', { class: 'small muted' }, '⚠️ QLab no está conectado.') : null);
}

async function editCommands() {
  const values = { ...store.config.commands };
  const ok = await modal((close) => [
    h('h2', {}, 'Comandos de sala'),
    Object.entries(COMMANDS).map(([name, label]) => field(label, input(values, name, 'text', '/cue/...'))),
    h('div', { class: 'actions' }, h('button', { onclick: () => close(false) }, 'Cancelar'), h('button', { class: 'primary', onclick: () => close(true) }, 'Guardar')),
  ]);
  if (ok) run(() => api('PUT', '/api/commands', values), 'Comandos guardados');
}

// --- Registro ---------------------------------------------------------------------------
function logView() {
  return h('section', {},
    h('h2', {}, 'Registro de actividad'),
    store.log.length ? h('div', { class: 'log' }, store.log.map((entry) => h('div', {},
      h('span', { class: 'muted mono' }, new Date(entry.date).toLocaleTimeString('es-ES')),
      h('span', {}, entry.direction),
      h('span', { class: entry.direction === '!' ? 'err' : '' }, h('strong', {}, entry.message), ' · ', entry.result))))
      : h('div', { class: 'empty' }, 'Sin actividad todavía.'));
}

// --- Ajustes (admin) --------------------------------------------------------------------
function settingsView() {
  if (!draft) {
    const s = store.settings ?? { qlab: {}, watchout: {} };
    draft = { qlab: { ...s.qlab, passcode: '' }, watchout: { ...s.watchout }, users: null };
    api('GET', '/api/users').then((r) => { if (draft) { draft.users = r.users; rerenderSettings(); } }).catch(() => {});
  }
  const d = draft;
  const q = store.state.qlab;
  const w = store.state.watchout;
  const saveQLab = async () => {
    const payload = { ...d.qlab, passcode: d.qlab.passcode === '' ? undefined : d.qlab.passcode };
    const result = await run(() => api('PUT', '/api/settings', { qlab: payload }), 'Ajustes de QLab guardados');
    if (result) { store.settings = result; d.qlab.passcode = ''; d.qlab.hasPasscode = result.qlab.hasPasscode; }
  };
  const clearPasscode = () => run(async () => {
    store.settings = await api('PUT', '/api/settings', { qlab: { ...d.qlab, passcode: '' } });
    d.qlab.hasPasscode = false; rerenderSettings();
  }, 'Passcode eliminado');
  const saveWatchout = async () => {
    const result = await run(() => api('PUT', '/api/settings', { watchout: d.watchout }), 'Ajustes de WATCHOUT guardados');
    if (result) store.settings = result;
  };
  const status = statusLine;

  return h('section', { id: 'settings' },
    h('h1', {}, 'Ajustes'),
    h('div', { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', {}, 'QLab (OSC por UDP)'), h('button', { class: 'small', onclick: () => run(() => api('POST', '/api/qlab/reconnect'), 'Reconectando…') }, 'Reconectar')),
      status(q, 'qlab-status'),
      h('div', { class: 'form-grid' },
        field('IP del Mac de QLab', input(d.qlab, 'host', 'text', '127.0.0.1 si está en este Mac')),
        field('Puerto OSC de QLab', input(d.qlab, 'port', 'number')),
        field('Workspace (nombre o ID, vacío = el que esté al frente)', input(d.qlab, 'workspace')),
        field('Puerto local para respuestas', input(d.qlab, 'replyPort', 'number')),
        field(d.qlab.hasPasscode ? 'Passcode (guardado; escribe para cambiarlo)' : 'Passcode de OSC Access', h('input', { type: 'password', value: d.qlab.passcode, autocomplete: 'new-password', oninput: (e) => { d.qlab.passcode = e.target.value; } }))),
      h('div', { class: 'row end' }, d.qlab.hasPasscode ? h('button', { class: 'small ghost', onclick: clearPasscode }, 'Quitar passcode') : null, h('button', { class: 'primary small', onclick: saveQLab }, 'Guardar QLab'))),
    h('div', { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', {}, 'WATCHOUT 7 (API HTTP)'), h('button', { class: 'small', onclick: () => run(() => api('POST', '/api/watchout/refresh'), 'Actualizado') }, 'Comprobar')),
      status(w, 'watchout-status'),
      h('p', { class: 'small muted' }, 'IP del equipo donde corre el Director (en vuestra sala, WO-SUELO). Puerto 3019 por defecto.'),
      h('div', { class: 'form-grid' }, field('IP del Director', input(d.watchout, 'host', 'text', '192.168.1.x')), field('Puerto', input(d.watchout, 'port', 'number'))),
      w.timelines?.length ? h('details', {}, h('summary', { class: 'small' }, `${w.timelines.length} timelines detectados`),
        h('table', {}, h('tbody', {}, w.timelines.map((t) => h('tr', {}, h('td', { class: 'mono' }, t.id), h('td', {}, t.name)))))) : null,
      h('div', { class: 'row end' }, h('button', { class: 'primary small', onclick: saveWatchout }, 'Guardar WATCHOUT'))),
    presentationSettingsCard(d),
    usersCard(d),
    importExportCard());
}

function statusLine(snapshot, id) {
  const cls = snapshot.status === 'connected' ? 'ok' : snapshot.status === 'connecting' ? 'warn' : 'bad';
  return h('p', { class: 'small', id }, h('span', { class: `dot ${cls}`, style: { display: 'inline-block', marginRight: '6px' } }),
    snapshot.status === 'connected' ? `Conectado${snapshot.version ? ` · versión ${snapshot.version}` : ''}` : snapshot.detail || snapshot.status);
}

function presentationSettingsCard(d) {
  d.presentation ??= { ...(store.settings?.presentation ?? { driver: 'simulado', watchoutTimelineId: '' }) };
  const save = async () => {
    const result = await run(() => api('PUT', '/api/settings', { presentation: d.presentation }), 'Ajustes de presentaciones guardados');
    if (result) store.settings = result;
  };
  return h('div', { class: 'card' },
    h('h2', {}, '🖥️ Presentaciones'),
    h('p', { class: 'small muted' }, 'Keynote se abre a pantalla completa en este Mac; NDI Scan Converter lo envía a WATCHOUT, donde la fuente NDI está colocada en las 4 paredes dentro de un timeline propio.'),
    h('div', { class: 'form-grid' },
      field('Reproductor', h('select', { onchange: (e) => { d.presentation.driver = e.target.value; } },
        h('option', { value: 'keynote', selected: d.presentation.driver === 'keynote' }, 'Keynote en este Mac'),
        h('option', { value: 'simulado', selected: d.presentation.driver === 'simulado' }, 'Simulado (para pruebas)'))),
      field('Timeline de WATCHOUT con la fuente NDI', timelineSelect(d.presentation, 'watchoutTimelineId'))),
    h('p', { class: 'small muted' }, 'Las presentaciones nuevas usarán este timeline: se reproduce al lanzar y se para al finalizar.'),
    h('div', { class: 'row end' }, h('button', { class: 'primary small', onclick: save }, 'Guardar presentaciones')));
}

function rerenderSettings() {
  const el = document.getElementById('settings');
  if (el && currentView().name === 'settings') el.replaceWith(settingsView());
}

function usersCard(d) {
  const form = { username: '', password: '', role: 'operador' };
  const create = async () => {
    const result = await run(() => api('POST', '/api/users', form), 'Usuario creado');
    if (result) { d.users = (await api('GET', '/api/users')).users; rerenderSettings(); }
  };
  const roleSelect = (value, onchange) => h('select', { onchange }, Object.entries(ROLE_LABELS).map(([k, label]) => h('option', { value: k, selected: k === value }, label)));
  const reload = async () => { d.users = (await api('GET', '/api/users')).users; rerenderSettings(); };
  return h('div', { class: 'card' },
    h('h2', {}, 'Usuarios'),
    d.users ? h('table', {}, h('tbody', {}, d.users.map((u) => h('tr', {},
      h('td', {}, u.username, u.id === store.user.id ? h('span', { class: 'muted small' }, ' (tú)') : null),
      h('td', {}, roleSelect(u.role, (e) => run(async () => { await api('PUT', `/api/users/${u.id}`, { role: e.target.value }); await reload(); }, 'Rol actualizado'))),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', { class: 'small', onclick: () => changePassword(u) }, 'Contraseña'),
        u.id !== store.user.id ? h('button', { class: 'small ghost', onclick: async () => {
          if (await confirmDialog(`¿Borrar a ${u.username}?`, '', { ok: 'Borrar', danger: true })) run(async () => { await api('DELETE', `/api/users/${u.id}`); await reload(); }, 'Usuario borrado');
        } }, '✕') : null)))))
      : h('p', { class: 'muted small' }, 'Cargando…'),
    h('h3', {}, 'Nuevo usuario'),
    h('div', { class: 'form-grid' },
      field('Usuario', input(form, 'username')),
      field('Contraseña', h('input', { type: 'password', autocomplete: 'new-password', oninput: (e) => { form.password = e.target.value; } })),
      field('Rol', roleSelect(form.role, (e) => { form.role = e.target.value; }))),
    h('div', { class: 'row end' }, h('button', { class: 'primary small', onclick: create }, 'Crear usuario')));
}

async function changePassword(user) {
  const values = { password: '' };
  const ok = await modal((close) => [
    h('h2', {}, `Contraseña de ${user.username}`),
    field('Nueva contraseña (mínimo 6)', h('input', { type: 'password', autocomplete: 'new-password', oninput: (e) => { values.password = e.target.value; } })),
    h('div', { class: 'actions' }, h('button', { onclick: () => close(false) }, 'Cancelar'), h('button', { class: 'primary', onclick: () => close(true) }, 'Guardar')),
  ]);
  if (ok) {
    const result = await run(() => api('PUT', `/api/users/${user.id}`, { password: values.password }), 'Contraseña cambiada');
    if (result && user.id === store.user.id) { toast('Vuelve a iniciar sesión con la nueva contraseña.'); store.user = null; render(); }
  }
}

function importExportCard() {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('El archivo no es JSON válido.', 'error'); }
    const full = data.format === 'QLabRemoteCues';
    if (!await confirmDialog('¿Importar configuración?', full ? 'Se sustituirán las demos, los botones de Constellation y los comandos actuales. Si el archivo trae un perfil de conexión, se usará para QLab (el passcode se conserva).' : 'Se añadirá la demo del archivo.', { ok: 'Importar' })) return;
    const result = await run(() => api('POST', '/api/import', { data }));
    if (result) { toast(result.summary); store.settings = result.settings; draft = null; rerenderSettings(); }
    e.target.value = '';
  } });
  return h('div', { class: 'card' },
    h('h2', {}, 'Importar / exportar'),
    h('p', { class: 'small muted' }, 'Compatible con el archivo QLab-Remote-Cues.qlabremote.json de la app de iPad. Los passcodes nunca se exportan. Los pasos de WATCHOUT solo existen en la web: la app de iPad no los entiende.'),
    h('div', { class: 'row' },
      h('a', { class: 'button', href: '/api/export', download: 'QLab-Remote-Cues.qlabremote.json' }, '⬇︎ Exportar'),
      h('button', { onclick: () => fileInput.click() }, '⬆︎ Importar…'), fileInput));
}

boot();
