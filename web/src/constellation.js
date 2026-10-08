// Cliente de Constellation (Meyer Sound NADIA). Usa la misma interfaz que su dashboard web:
//   GET http://IP:8080/cmd?<comando de texto de CueStation con «_» en lugar de espacios>
// p. ej. «print default/cues maxdepth=1» → /cmd?print_default/cues_maxdepth=1
// Los presets acústicos son cues de CueStation; se recuperan con «recall cue N».
import { EventEmitter } from 'node:events';

const POLL_MS = 15_000;
const TIMEOUT_MS = 4_000;

// Listas de cues que no se ofrecen en la web (calibración, mediciones con ruido rosa o barridos, arranque…).
const HIDDEN_LISTS = /^[-\s]*$|calibra|measure|startup|fire alarm|default cue list/i;

export const recallCommand = (cueId) => `recall cue ${cueId}`;

export class ConstellationClient extends EventEmitter {
  constructor({ log, fetchImpl = fetch }) {
    super();
    this.log = log;
    this.fetch = fetchImpl;
    this.settings = null;
    this.status = 'disabled';
    this.detail = '';
    this.groups = [];
    this.cues = new Map();
    this.hiddenCues = new Set();
    this.timer = null;
  }

  snapshot() {
    return {
      status: this.status, detail: this.detail, host: this.settings?.host ?? '', port: this.settings?.port ?? 0,
      groups: this.groups,
    };
  }

  configure(settings) {
    this.settings = settings;
    clearTimeout(this.timer);
    this.groups = []; this.cues = new Map(); this.hiddenCues = new Set();
    if (!settings?.host) { this.setStatus('disabled', 'Sin configurar'); return; }
    this.setStatus('connecting', '');
    this.poll();
  }

  stop() { clearTimeout(this.timer); this.timer = null; }

  setStatus(status, detail = '') {
    const changed = status !== this.status || detail !== this.detail;
    this.status = status; this.detail = detail;
    if (changed) this.emit('change');
  }

  /** Envía un comando de texto y devuelve la respuesta del NADIA en texto plano. */
  async command(text) {
    if (!this.settings?.host) throw new Error('Constellation no está configurado. Revisa Ajustes.');
    const clean = String(text ?? '').trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Comando de Constellation vacío.');
    if (!/^[\w ./=,:$+-]+$/.test(clean)) throw new Error(`Comando de Constellation con caracteres no válidos: ${clean}`);
    const url = `http://${this.settings.host}:${this.settings.port}/cmd?${clean.replaceAll(' ', '_')}&_=${Date.now()}`;
    let response;
    try {
      response = await this.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new Error(describe(error));
    }
    const body = await response.text();
    if (!response.ok) throw new Error(`Constellation respondió ${response.status}`);
    return responseText(body);
  }

  async poll() {
    clearTimeout(this.timer);
    try {
      if (!this.groups.length) await this.loadCues();
      else await this.command('get CueListPlayer 4 Active CueList ID');
      this.setStatus('connected', '');
    } catch (error) {
      this.setStatus('error', error.message);
    }
    if (this.settings?.host) this.timer = setTimeout(() => this.poll(), POLL_MS);
  }

  async loadCues() {
    const [lists, cues] = await Promise.all([
      this.command('print default/cuelists'),
      this.command('print default/cues maxdepth=1'),
    ]);
    const parsed = parseCueCatalog(lists, cues);
    this.groups = parsed.groups;
    this.cues = parsed.cues;
    this.hiddenCues = parsed.hiddenCues;
    this.emit('change');
    return this.groups;
  }

  cueName(cueId) {
    const name = this.cues.get(String(cueId));
    return name ? `«${name}» (cue ${cueId})` : `cue ${cueId}`;
  }

  /** Valor de un paso: un número de cue (se recupera) o un comando de texto completo. */
  async run(value) {
    const text = String(value ?? '').trim();
    const isCue = /^\d+$/.test(text);
    if (isCue && this.hiddenCues.has(text)) {
      throw new Error(`El cue ${text} es de calibración o mediciones; no se lanza desde la web.`);
    }
    const label = isCue ? `Constellation ${this.cueName(text)}` : `Constellation «${text}»`;
    try {
      const reply = await this.command(isCue ? recallCommand(text) : text);
      this.log('→', label, reply ? reply.slice(0, 160) : 'Enviado');
      return reply;
    } catch (error) {
      this.log('!', label, error.message);
      throw new Error(`Constellation: ${error.message}`);
    }
  }
}

function describe(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Constellation no responde (tiempo agotado)';
  const code = error?.cause?.code;
  if (code === 'ECONNREFUSED') return 'Conexión rechazada: revisa la IP y el puerto (8080)';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'No se llega a esa IP desde este Mac (¿está conectado a la red AVB?)';
  return error?.message ?? String(error);
}

/** Extrae el texto de «Got Response» de la página HTML que devuelve el NADIA. */
export function responseText(html) {
  const text = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const start = text.indexOf('Got Response:');
  const end = text.lastIndexOf('(End of response)');
  return (start >= 0 ? text.slice(start + 'Got Response:'.length, end > start ? end : undefined) : text).trim();
}

/** Agrupa los cues por lista (Acoustic Presets, Constellation On/Off…) en el orden del dashboard. */
export function parseCueCatalog(listsText, cuesText) {
  const cues = new Map();
  for (const m of cuesText.matchAll(/default\/cues\/(\d+): CoreCue: name=\[([^\]]*)\]/g)) cues.set(m[1], m[2].trim());

  const lists = new Map();
  for (const m of listsText.matchAll(/default\/cuelists\/(\d+): CoreCueList: name=\[([^\]]*)\](?: comment=\[([^\]]*)\])?/g)) {
    lists.set(m[1], { id: m[1], name: m[2].trim(), comment: m[3] ?? '', confirm: /confirm=true/i.test(m[3] ?? ''), entries: [] });
  }
  for (const m of listsText.matchAll(/default\/cuelists\/(\d+)\/I(\d+): CoreCueEntry: name=\[[^\]]*\] cueID=\[(-?\d+)\]/g)) {
    lists.get(m[1])?.entries.push({ index: Number(m[2]), cueId: m[3] });
  }

  const groups = [];
  const shown = new Set();
  const inHidden = new Set();
  for (const list of lists.values()) {
    const entries = list.entries.sort((a, b) => a.index - b.index);
    if (HIDDEN_LISTS.test(list.name) || /group=Utilities/i.test(list.comment)) {
      for (const e of entries) inHidden.add(e.cueId);
      continue;
    }
    const items = entries
      .filter((e) => cues.has(e.cueId) && !/^-{2,}/.test(cues.get(e.cueId)))
      .map((e) => ({ id: e.cueId, name: shortName(cues.get(e.cueId)) }));
    if (!items.length) continue;
    for (const item of items) shown.add(item.id);
    groups.push({ id: list.id, name: list.name, confirm: list.confirm, cues: items });
  }
  // Un cue que aparece en una lista visible no se bloquea aunque también esté en otra oculta.
  const hiddenCues = new Set([...inHidden].filter((id) => !shown.has(id)));
  return { groups, cues, hiddenCues };
}

// «Presentación | Performance Type» → «Presentación»
const shortName = (name) => name.split(' | ')[0].trim() || name;
