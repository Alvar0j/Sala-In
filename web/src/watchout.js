// Cliente de la API HTTP de WATCHOUT 7 (Director, puerto 3019 por defecto).
// Documentación: https://docs.dataton.com/watchout-7/external_protocol/ext_wo7.html
import { EventEmitter } from 'node:events';

const POLL_MS = 15_000;
const TIMEOUT_MS = 3_000;

export class WatchoutClient extends EventEmitter {
  constructor({ log, fetchImpl = fetch }) {
    super();
    this.log = log;
    this.fetch = fetchImpl;
    this.settings = null;
    this.status = 'disabled'; // disabled | connecting | connected | error
    this.detail = '';
    this.version = '';
    this.timelines = [];
    this.timer = null;
  }

  snapshot() {
    return {
      status: this.status, detail: this.detail, version: this.version,
      host: this.settings?.host ?? '', port: this.settings?.port ?? 0, timelines: this.timelines,
    };
  }

  configure(settings) {
    this.settings = settings;
    clearTimeout(this.timer);
    if (!settings?.host) {
      this.setStatus('disabled', 'Sin configurar');
      return;
    }
    this.setStatus('connecting', '');
    this.poll();
  }

  stop() { clearTimeout(this.timer); this.timer = null; }

  setStatus(status, detail = '') {
    const changed = status !== this.status || detail !== this.detail;
    this.status = status; this.detail = detail;
    if (changed) this.emit('change');
  }

  get baseURL() { return `http://${this.settings.host}:${this.settings.port}`; }

  async request(method, path) {
    if (!this.settings?.host) throw new Error('WATCHOUT no está configurado. Revisa Ajustes.');
    const response = await this.fetch(this.baseURL + path, { method, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    if (!response.ok) throw new Error(`WATCHOUT respondió ${response.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }

  async poll() {
    clearTimeout(this.timer);
    try {
      const info = await this.request('GET', '/info');
      this.version = typeof info === 'string' ? info : (info?.version ?? info?.productVersion ?? JSON.stringify(info ?? ''));
      await this.loadTimelines();
      this.setStatus('connected', '');
    } catch (error) {
      this.setStatus('error', describe(error));
    }
    if (this.settings?.host) this.timer = setTimeout(() => this.poll(), POLL_MS);
  }

  async loadTimelines() {
    const data = await this.request('GET', '/v0/timelines');
    const next = normalizeTimelines(data);
    if (JSON.stringify(next) !== JSON.stringify(this.timelines)) {
      this.timelines = next;
      this.emit('change');
    }
    return this.timelines;
  }

  async timelineAction(action, timelineId) {
    const id = String(timelineId ?? '').trim();
    if (!/^[\w-]+$/.test(id)) throw new Error(`ID de timeline no válido: ${id || 'vacío'}`);
    try {
      await this.request('POST', `/v0/${action}/${encodeURIComponent(id)}`);
    } catch (error) {
      this.log('!', `WATCHOUT ${action} ${this.timelineName(id)}`, describe(error));
      throw new Error(`WATCHOUT: ${describe(error)}`);
    }
    this.log('→', `WATCHOUT ${action} ${this.timelineName(id)}`, 'Enviado');
  }

  timelineName(id) {
    const timeline = this.timelines.find((t) => String(t.id) === String(id));
    return timeline ? `«${timeline.name}» (${id})` : `timeline ${id}`;
  }

  play(id) { return this.timelineAction('play', id); }
  pause(id) { return this.timelineAction('pause', id); }
  stopTimeline(id) { return this.timelineAction('stop', id); }
}

function describe(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'WATCHOUT no responde (tiempo agotado)';
  if (error?.cause?.code === 'ECONNREFUSED') return 'Conexión rechazada: ¿está abierto el Director y la API activada?';
  return error?.message ?? String(error);
}

// El formato exacto de /v0/timelines no está documentado; aceptamos varias formas.
export function normalizeTimelines(data) {
  let list = [];
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object') {
    const inner = data.timelines ?? data.items ?? data;
    list = Array.isArray(inner) ? inner : Object.entries(inner).map(([key, value]) => (
      value && typeof value === 'object' ? { id: key, ...value } : { id: key, name: String(value) }
    ));
  }
  return list
    .map((item) => ({ id: String(item.id ?? item.timelineId ?? item.key ?? ''), name: String(item.name ?? item.title ?? item.id ?? '') }))
    .filter((t) => t.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
