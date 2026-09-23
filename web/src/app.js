// Servidor HTTP: API JSON, eventos en tiempo real (SSE) y archivos estáticos.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Auth, COOKIE, hasRole, ROLES } from './auth.js';
import { QLabClient } from './qlab.js';
import { WatchoutClient } from './watchout.js';
import { DemoRunner } from './runner.js';
import {
  normalizeDemo, normalizeControl, normalizeCommands, normalizeStep, exportPackage, importPackage, newID, COMMAND_NAMES,
} from './model.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_BODY = 5 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createApp({ dataDir, qlab: qlabOverride, watchout: watchoutOverride, loginDelayMs = 400 } = {}) {
  const store = new Store(dataDir);
  const auth = new Auth(store);
  const activity = [];
  const clients = new Set();

  const log = (direction, message, result) => {
    activity.unshift({ date: new Date().toISOString(), direction, message, result });
    if (activity.length > 500) activity.length = 500;
    broadcast('log', activity[0]);
  };

  const qlab = qlabOverride ?? new QLabClient({ log });
  const watchout = watchoutOverride ?? new WatchoutClient({ log });
  qlab.log = qlab.log ?? log;
  watchout.log = watchout.log ?? log;
  const runner = new DemoRunner({ qlab, watchout, log, getDemo: (id) => store.config.demos.find((d) => d.id === id) });

  // --- tiempo real -------------------------------------------------------------
  const state = () => ({ qlab: qlab.snapshot(), watchout: watchout.snapshot(), runner: runner.snapshot() });
  let pending = null;
  const scheduleState = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; broadcast('state', state()); }, 50);
  };
  function broadcast(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.write(frame);
  }
  qlab.on('change', scheduleState);
  watchout.on('change', scheduleState);
  runner.on('change', scheduleState);
  const configChanged = () => broadcast('config', publicConfig());
  const keepAlive = setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25_000);

  const publicConfig = () => store.config;
  const publicSettings = () => ({
    qlab: { ...store.settings.qlab, passcode: undefined, hasPasscode: Boolean(store.settings.qlab.passcode) },
    watchout: store.settings.watchout,
  });

  qlab.configure(store.settings.qlab);
  watchout.configure(store.settings.watchout);

  // --- rutas -------------------------------------------------------------------
  const routes = [];
  const route = (method, pattern, role, handler) => {
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, regex, keys, role, handler });
  };

  route('GET', '/api/session', null, ({ user }) => ({ user: auth.publicUser(user), needsSetup: auth.needsSetup() }));

  route('POST', '/api/setup', null, ({ body, res }) => {
    if (!auth.needsSetup()) throw new HttpError(409, 'La web ya está configurada.');
    const user = auth.create({ username: body.username, password: body.password, role: 'admin' });
    setSession(res, store.users.find((u) => u.id === user.id));
    log('•', 'Usuarios', `Administrador «${user.username}» creado`);
    return { user };
  });

  route('POST', '/api/login', null, async ({ body, res }) => {
    const user = auth.login(body.username, body.password);
    if (!user) {
      await new Promise((r) => setTimeout(r, loginDelayMs));
      throw new HttpError(401, 'Usuario o contraseña incorrectos.');
    }
    setSession(res, user);
    return { user: auth.publicUser(user) };
  });

  route('POST', '/api/logout', null, ({ res }) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return { ok: true };
  });

  route('GET', '/api/bootstrap', 'operador', ({ user }) => ({
    user: auth.publicUser(user), config: publicConfig(), state: state(), log: activity.slice(0, 200),
    settings: hasRole(user, 'admin') ? publicSettings() : undefined,
  }));

  // Ejecución
  route('POST', '/api/demos/:id/launch', 'operador', ({ params, user }) => {
    requireDemo(params.id);
    runner.launch(params.id, user.username);
    return { ok: true };
  });
  route('POST', '/api/demos/:id/finish', 'operador', ({ params, user }) => {
    requireDemo(params.id);
    runner.finish(params.id, user.username);
    return { ok: true };
  });
  route('POST', '/api/runner/cancel', 'operador', async ({ user }) => { await runner.cancel(user.username); return { ok: true }; });
  route('POST', '/api/runner/prompt', 'operador', ({ body }) => ({ ok: runner.answerPrompt(String(body.id), body.accept === true) }));

  route('POST', '/api/demos/:id/controls/:controlId', 'operador', async ({ params }) => {
    const demo = requireDemo(params.id);
    const control = demo.liveControls.find((c) => c.id === params.controlId);
    if (!control) throw new HttpError(404, 'Control no encontrado.');
    if (runner.activeDemoId !== demo.id || runner.stateOf(demo.id) !== 'running') {
      throw new HttpError(409, 'Lanza la demo antes de usar su mando.');
    }
    await runner.runControl(control);
    return { ok: true };
  });
  route('POST', '/api/constellation/:controlId', 'operador', async ({ params }) => {
    const control = store.config.constellationButtons.find((c) => c.id === params.controlId);
    if (!control) throw new HttpError(404, 'Botón no encontrado.');
    await runner.runControl(control);
    return { ok: true };
  });
  route('POST', '/api/commands/:name', 'operador', async ({ params }) => {
    if (!COMMAND_NAMES.includes(params.name)) throw new HttpError(404, 'Comando desconocido.');
    const command = store.config.commands[params.name];
    if (!command) throw new HttpError(409, 'Comando sin configurar.');
    await qlab.send(command);
    return { ok: true };
  });

  // Edición
  route('POST', '/api/demos', 'editor', ({ body, user }) => {
    const demo = normalizeDemo({ ...body, id: newID(), order: store.config.demos.length });
    saveConfig({ ...store.config, demos: [...store.config.demos, demo] });
    log('•', 'Demos', `«${demo.name}» creada por ${user.username}`);
    return { demo };
  });
  route('PUT', '/api/demos/:id', 'editor', ({ params, body }) => {
    const current = requireDemo(params.id);
    const demo = normalizeDemo({ ...body, id: current.id, order: current.order });
    saveConfig({ ...store.config, demos: store.config.demos.map((d) => (d.id === demo.id ? demo : d)) });
    return { demo };
  });
  route('DELETE', '/api/demos/:id', 'editor', ({ params, user }) => {
    const demo = requireDemo(params.id);
    if (runner.activeDemoId === demo.id) throw new HttpError(409, 'Finaliza la demo antes de borrarla.');
    saveConfig({ ...store.config, demos: store.config.demos.filter((d) => d.id !== demo.id) });
    log('•', 'Demos', `«${demo.name}» borrada por ${user.username}`);
    return { ok: true };
  });
  route('PUT', '/api/demo-order', 'editor', ({ body }) => {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const position = new Map(ids.map((id, index) => [id, index]));
    const demos = store.config.demos.map((d) => ({ ...d, order: position.get(d.id) ?? ids.length + d.order }));
    saveConfig({ ...store.config, demos });
    return { ok: true };
  });
  route('PUT', '/api/constellation', 'editor', ({ body }) => {
    const buttons = (Array.isArray(body.buttons) ? body.buttons : []).map((b, order) => ({ ...b, order }));
    saveConfig({ ...store.config, constellationButtons: buttons.map(normalizeControl) });
    return { ok: true };
  });
  route('PUT', '/api/commands', 'editor', ({ body }) => {
    saveConfig({ ...store.config, commands: normalizeCommands({ ...store.config.commands, ...body }) });
    return { ok: true };
  });
  route('POST', '/api/test-step', 'editor', async ({ body }) => {
    const step = body.control ? { ...normalizeControl(body.control) } : normalizeStep(body.step ?? {});
    if (body.control) await runner.runControl(step); else await runner.testStep(step);
    return { ok: true };
  });
  route('GET', '/api/watchout/timelines', 'editor', async () => {
    try { await watchout.loadTimelines(); } catch (error) { throw new HttpError(502, error.message); }
    return { timelines: watchout.timelines };
  });
  route('GET', '/api/export', 'editor', ({ res }) => {
    res.setHeader('Content-Disposition', 'attachment; filename="QLab-Remote-Cues.qlabremote.json"');
    return exportPackage(store.config);
  });

  // Administración
  route('POST', '/api/import', 'admin', ({ body, user }) => {
    if (runner.job) throw new HttpError(409, 'Espera a que termine la demo en curso.');
    const { config, profile, summary } = importPackage(store.config, body.data);
    saveConfig(config);
    if (profile && body.applyConnection !== false && profile.host) {
      const qlabSettings = {
        ...store.settings.qlab, host: String(profile.host), port: Number(profile.port) || 53000,
        workspace: String(profile.workspace ?? ''), replyPort: Number(profile.localReplyPort) || 53001,
      };
      store.saveSettings({ ...store.settings, qlab: qlabSettings });
      qlab.configure(qlabSettings);
    }
    log('•', 'Importación', `${summary} (por ${user.username})`);
    return { summary, settings: publicSettings() };
  });
  route('GET', '/api/settings', 'admin', () => publicSettings());
  route('PUT', '/api/settings', 'admin', ({ body, user }) => {
    const next = structuredClone(store.settings);
    if (body.qlab) {
      const q = body.qlab;
      next.qlab = {
        host: String(q.host ?? '').trim(), port: port(q.port, 53000), workspace: String(q.workspace ?? '').trim(),
        replyPort: port(q.replyPort, 53001),
        passcode: q.passcode === undefined || q.passcode === null ? next.qlab.passcode : String(q.passcode),
      };
      if (next.qlab.workspace.includes('/')) throw new HttpError(400, 'El workspace no puede contener «/».');
    }
    if (body.watchout) next.watchout = { host: String(body.watchout.host ?? '').trim(), port: port(body.watchout.port, 3019) };
    store.saveSettings(next);
    if (body.qlab) qlab.configure(next.qlab);
    if (body.watchout) watchout.configure(next.watchout);
    log('•', 'Ajustes', `Conexiones actualizadas por ${user.username}`);
    return publicSettings();
  });
  route('POST', '/api/qlab/reconnect', 'admin', () => { qlab.restart(); return { ok: true }; });
  route('POST', '/api/watchout/refresh', 'admin', async () => { await watchout.poll(); return { ok: true }; });

  route('GET', '/api/users', 'admin', () => ({ users: auth.list(), roles: ROLES }));
  route('POST', '/api/users', 'admin', ({ body }) => ({ user: auth.create(body) }));
  route('PUT', '/api/users/:id', 'admin', ({ params, body }) => ({ user: auth.update(params.id, body) }));
  route('DELETE', '/api/users/:id', 'admin', ({ params, user }) => {
    if (params.id === user.id) throw new HttpError(400, 'No puedes borrar tu propio usuario.');
    auth.remove(params.id);
    return { ok: true };
  });

  function requireDemo(id) {
    const demo = store.config.demos.find((d) => d.id === id);
    if (!demo) throw new HttpError(404, 'Demo no encontrada.');
    return demo;
  }
  function saveConfig(config) { store.saveConfig(config); configChanged(); }
  function setSession(res, user) {
    const { token, maxAge } = auth.issue(user);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
  }

  // --- servidor ------------------------------------------------------------------
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname === '/api/events') return events(req, res);
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return serveStatic(url.pathname, res);
    } catch (error) {
      const status = error.status ?? (error instanceof SyntaxError ? 400 : 500);
      if (status === 500) console.error(error);
      if (!res.headersSent) json(res, status, { error: error.message });
      else res.end();
    }
  });

  function currentUser(req) {
    const cookie = req.headers.cookie ?? '';
    const token = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return auth.verify(token);
  }

  function events(req, res) {
    if (!currentUser(req)) return json(res, 401, { error: 'Inicia sesión.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  }

  async function api(req, res, url) {
    const match = routes
      .map((r) => ({ r, m: r.method === req.method && url.pathname.match(r.regex) }))
      .find(({ m }) => m);
    if (!match) throw new HttpError(404, 'Ruta no encontrada.');
    const { r, m } = match;
    if (req.method !== 'GET' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      // Protección CSRF básica: los formularios de otros sitios no pueden enviar JSON.
      throw new HttpError(415, 'Se esperaba JSON.');
    }
    const user = currentUser(req);
    if (r.role && !user) throw new HttpError(401, 'Inicia sesión.');
    if (r.role && !hasRole(user, r.role)) throw new HttpError(403, 'Tu usuario no tiene permiso para esto.');
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = req.method === 'GET' ? {} : await readBody(req);
    const result = await r.handler({ req, res, params, body, user, url });
    json(res, 200, result ?? { ok: true });
  }

  function serveStatic(pathname, res) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Ruta no válida'); }
    const clean = path.normalize(decoded).replace(/^([/\\])+/, '');
    let file = path.join(PUBLIC_DIR, clean || 'index.html');
    if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Prohibido');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
    const type = MIME[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'max-age=300' });
    fs.createReadStream(file).pipe(res);
  }

  server.on('close', () => {
    clearInterval(keepAlive);
    qlab.stop();
    watchout.stop();
    for (const c of clients) c.end();
  });

  return { server, store, qlab, watchout, runner, auth };
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Archivo demasiado grande.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON no válido.')); }
    });
    req.on('error', reject);
  });
}

function port(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}
