// Cliente OSC/UDP de QLab 5. Mantiene una única conexión autenticada en nombre de
// todos los usuarios de la web (equivale a QLabService.swift).
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { encode, decode, parseCommand } from './osc.js';

const escape = (component) => encodeURIComponent(component).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export const QLabPath = {
  workspace: (ws, command) => (ws ? `/workspace/${escape(ws)}/${command}` : `/${command}`),
};

// Mensajes de aplicación: no llevan /workspace/{id} delante.
const APP_LEVEL = new Set(['version', 'workspaces', 'alwaysReply', 'udpReplyPort', 'udpKeepAlive', 'forgetMeNot', 'connect', 'disconnect', 'workspace']);
const WORKSPACES_TIMEOUT_MS = 1_500;

const HEARTBEAT_MS = 20_000;
const SILENCE_LIMIT_MS = 65_000;
const CONNECT_TIMEOUT_MS = 4_000;

export class QLabClient extends EventEmitter {
  /** @param {{log: (dir: string, message: string, result: string) => void}} options */
  constructor({ log, socketFactory = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }) }) {
    super();
    this.log = log;
    this.socketFactory = socketFactory;
    this.settings = null;
    this.socket = null;
    this.status = 'disconnected'; // disconnected | connecting | connected | error
    this.detail = '';
    this.ready = false;
    this.version = '';
    this.cues = [];
    this.workspaceId = '';   // ID interno del workspace elegido
    this.workspaceName = '';
    this.lastMessageAt = 0;
    this.attempt = 0;
    this.timers = new Set();
    this.generation = 0;
  }

  snapshot() {
    return {
      status: this.status, detail: this.detail, ready: this.ready, version: this.version,
      host: this.settings?.host ?? '', port: this.settings?.port ?? 0, workspace: this.workspaceName || this.settings?.workspace || '',
      cues: this.cues,
    };
  }

  configure(settings) {
    this.settings = settings;
    this.restart();
  }

  restart() {
    this.stop();
    if (!this.settings?.host) {
      this.setStatus('disconnected', 'Sin configurar');
      return;
    }
    this.attempt = 0;
    this.open();
  }

  stop() {
    this.generation += 1;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.socket) {
      try { this.rawSend({ address: '/disconnect', args: [] }); } catch {}
      try { this.socket.close(); } catch {}
    }
    this.socket = null;
    this.ready = false;
  }

  later(ms, fn) {
    const generation = this.generation;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (generation === this.generation) fn();
    }, ms);
    this.timers.add(timer);
  }

  setStatus(status, detail = '') {
    const changed = status !== this.status || detail !== this.detail;
    this.status = status;
    this.detail = detail;
    if (changed) this.emit('change');
  }

  open() {
    const { host, port, replyPort } = this.settings;
    this.ready = false;
    this.connectSent = false;
    this.setStatus('connecting', this.attempt ? `Reintento ${this.attempt}` : '');
    const socket = this.socketFactory();
    this.socket = socket;
    socket.on('message', (data) => this.onPacket(data));
    socket.on('error', (error) => {
      this.log('!', 'UDP', error.message);
      this.fail(error.message);
    });
    socket.bind(replyPort, () => {
      this.log('•', 'Conexión', `Intentando ${host}:${port}, respuestas UDP ${replyPort}`);
      this.handshake();
    });
  }

  handshake() {
    // 1) Se pregunta qué workspaces hay abiertos para usar su ID interno en todos los
    //    comandos (QLab rechaza /cue/... sin workspace, y los nombres con espacios dan problemas).
    // 2) Si QLab no contesta a /workspaces, se usa lo escrito en Ajustes tal cual.
    const { replyPort } = this.settings;
    this.workspaceId = '';
    this.workspaceName = '';
    try {
      this.rawSend({ address: '/udpReplyPort', args: [{ type: 'i', value: replyPort }] });
      this.rawSend({ address: '/alwaysReply', args: [{ type: 'i', value: 1 }] });
      this.rawSend({ address: '/workspaces', args: [] });
    } catch (error) {
      this.fail(error.message);
      return;
    }
    this.later(WORKSPACES_TIMEOUT_MS, () => {
      if (!this.workspaceId && !this.connectSent) this.connectWorkspace(this.settings.workspace, this.settings.workspace);
    });
    this.later(CONNECT_TIMEOUT_MS, () => {
      if (!this.ready) this.fail(this.detail && this.status === 'error' ? this.detail : 'QLab no responde');
    });
  }

  chooseWorkspace(list) {
    const wanted = String(this.settings.workspace ?? '').trim();
    const clean = (name) => String(name ?? '').trim().toLowerCase().replace(/\.qlab\d*$/, '');
    const workspaces = (Array.isArray(list) ? list : []).filter((w) => w?.uniqueID);
    if (!workspaces.length) {
      this.setStatus('error', 'QLab no tiene ningún workspace abierto');
      return;
    }
    const found = wanted
      ? workspaces.find((w) => w.uniqueID === wanted || clean(w.displayName) === clean(wanted))
      : workspaces[0];
    if (!found) {
      const names = workspaces.map((w) => `«${w.displayName}»`).join(', ');
      this.log('!', 'QLab', `No hay ningún workspace llamado «${wanted}». Abiertos: ${names}`);
      this.setStatus('error', `Workspace «${wanted}» no encontrado. Abiertos: ${names}`);
      return;
    }
    this.connectWorkspace(found.uniqueID, found.displayName ?? found.uniqueID);
  }

  connectWorkspace(id, name) {
    if (this.connectSent) return;
    this.connectSent = true;
    this.workspaceId = id ?? '';
    this.workspaceName = name ?? '';
    const { passcode } = this.settings;
    try {
      this.rawSend({ address: QLabPath.workspace(this.workspaceId, 'connect'), args: passcode ? [{ type: 's', value: passcode }] : [] });
      this.rawSend({ address: QLabPath.workspace(this.workspaceId, 'updates'), args: [{ type: 'i', value: 1 }] });
      this.rawSend({ address: '/udpKeepAlive', args: [{ type: 'i', value: 1 }] });
      this.rawSend({ address: '/version', args: [] });
    } catch (error) {
      this.fail(error.message);
    }
  }

  /** Añade /workspace/{id} a los comandos que no lo llevan. */
  scoped(address) {
    if (!this.workspaceId || address.startsWith('/workspace/')) return address;
    const first = address.split('/')[1] ?? '';
    return APP_LEVEL.has(first) ? address : `/workspace/${escape(this.workspaceId)}${address}`;
  }

  fail(reason) {
    const wasReady = this.ready;
    this.ready = false;
    this.setStatus('error', reason);
    if (wasReady) this.log('!', 'QLab', `Conexión perdida: ${reason}`);
    try { this.socket?.close(); } catch {}
    this.socket = null;
    this.generation += 1;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.attempt += 1;
    const delay = Math.min(2 ** Math.min(this.attempt - 1, 5), 30) * 1000;
    this.later(delay, () => this.open());
  }

  heartbeat() {
    if (!this.ready) return;
    if (Date.now() - this.lastMessageAt > SILENCE_LIMIT_MS) {
      this.fail('Sin respuesta de QLab');
      return;
    }
    try { this.rawSend({ address: QLabPath.workspace(this.workspaceId, 'thump'), args: [] }); } catch {}
    this.later(HEARTBEAT_MS, () => this.heartbeat());
  }

  rawSend(message) {
    if (!this.socket) throw new Error('Sin conexión con QLab');
    const packet = encode(message);
    this.socket.send(packet, this.settings.port, this.settings.host);
  }

  /** Envía un comando escrito por el usuario (p. ej. "/cue/5/start"). */
  async send(command) {
    if (!this.ready) throw new Error('QLab no está conectado. Revisa la conexión en Ajustes.');
    const message = parseCommand(command);
    message.address = this.scoped(message.address);
    this.rawSend(message);
    this.log('→', command, 'Enviado');
  }

  refreshCues() {
    if (!this.ready) return;
    const ws = this.workspaceId;
    try {
      this.rawSend({ address: QLabPath.workspace(ws, 'cueLists/shallow'), args: [] });
      this.rawSend({ address: QLabPath.workspace(ws, 'runningOrPausedCues/shallow'), args: [] });
    } catch {}
  }

  onPacket(data) {
    let message;
    try { message = decode(data); } catch (error) {
      this.log('!', 'UDP', error.message);
      return;
    }
    this.lastMessageAt = Date.now();
    const { address } = message;
    const json = message.args[0]?.type === 's' ? message.args[0].value : null;
    const envelope = json ? safeJSON(json) : null;

    if (address === '/reply/workspaces') {
      if (!this.connectSent) this.chooseWorkspace(envelope?.data);
      return;
    }
    if (address.endsWith('/connect') && address.startsWith('/reply')) {
      const status = envelope?.status ?? '';
      const data = envelope?.data;
      // QLab 5 responde "ok" (o data "ok:view|edit|control"); "badpass" si el passcode es incorrecto.
      const text = typeof data === 'string' ? data : '';
      const denied = text === 'badpass' || (text.startsWith('ok:') && !text.includes('control'));
      if (status === 'ok' && !denied) {
        const first = !this.ready;
        this.ready = true;
        this.attempt = 0;
        this.setStatus('connected', '');
        if (first) {
          this.log('✓', 'QLab', 'Workspace autenticado y listo');
          this.later(HEARTBEAT_MS, () => this.heartbeat());
          this.refreshCues();
        }
      } else {
        const reason = status === 'badpass' || text === 'badpass' ? 'Passcode incorrecto'
          : text.startsWith('ok:') ? 'El passcode no tiene permiso de control' : 'Workspace o permisos no válidos';
        this.log('!', 'Autenticación', reason);
        this.ready = false;
        this.setStatus('error', reason);
      }
      return;
    }
    if (address.includes('/version') && address.startsWith('/reply')) {
      this.version = typeof envelope?.data === 'string' ? envelope.data : '';
      this.emit('change');
      return;
    }
    if (address.includes('cueLists')) {
      this.cues = decodeCues(envelope).map((cue) => ({ ...cue, isRunning: this.cues.find((c) => c.id === cue.id)?.isRunning ?? false }));
      this.emit('change');
      return;
    }
    if (address.includes('runningOrPausedCues')) {
      const running = new Set(decodeCues(envelope).map((c) => c.id));
      this.cues = this.cues.map((cue) => ({ ...cue, isRunning: running.has(cue.id) }));
      this.emit('change');
      return;
    }
    if (address.startsWith('/update/')) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.refreshCues(), 250);
      return;
    }
    if (!address.startsWith('/reply') || address.endsWith('/thump')) return;
    const shown = address.replace(/^\/reply/, '').replace(/^\/workspace\/[^/]+/, '');
    if (envelope?.status && envelope.status !== 'ok') {
      this.log('!', shown, `QLab respondió: ${envelope.status}`);
    } else if (['string', 'number', 'boolean'].includes(typeof envelope?.data)
      && !APP_LEVEL.has(shown.split('/')[1] ?? '') && !shown.endsWith('/updates')) {
      this.log('←', shown, `QLab: ${String(envelope.data).slice(0, 120)}`);
    }
  }
}

function safeJSON(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function decodeCues(envelope) {
  const items = Array.isArray(envelope?.data) ? envelope.data : [];
  const flat = [];
  const visit = (item) => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.uniqueID === 'string') {
      flat.push({
        id: item.uniqueID, number: item.number ?? '', name: item.name || item.listName || 'Sin nombre',
        type: item.type ?? '', colorName: item['colorName/live'] ?? item.colorName ?? '', armed: item.armed ?? true,
      });
    }
    if (Array.isArray(item.cues)) item.cues.forEach(visit);
  };
  items.forEach(visit);
  return flat;
}
