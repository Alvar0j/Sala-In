// Reproductor de presentaciones. En la sala, Keynote en pantalla completa en el Mac
// (capturado por NDI hacia WATCHOUT); la web lo controla con AppleScript.
// El controlador «simulado» sirve para el modo demostración y las pruebas.
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';

const POLL_MS = 3000;

export class Presenter extends EventEmitter {
  constructor({ log, drivers = {} }) {
    super();
    this.log = log;
    this.drivers = { keynote: new KeynoteDriver(), simulado: new SimulatedDriver(), ...drivers };
    this.driverName = 'simulado';
    this.state = idleState();
    this.queue = Promise.resolve();
    this.timer = null;
  }

  get driver() { return this.drivers[this.driverName] ?? this.drivers.simulado; }

  snapshot() { return { ...this.state, driver: this.driverName }; }

  configure({ driver } = {}) {
    this.driverName = this.drivers[driver] ? driver : 'simulado';
    this.emit('change');
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change');
  }

  // Los comandos se ejecutan de uno en uno (osascript no admite llamadas solapadas a Keynote).
  enqueue(work) {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => {});
    return run;
  }

  open(file, demoId = null) {
    return this.enqueue(async () => {
      this.stopPolling();
      this.set({ status: 'opening', fileId: file.id, fileName: file.name, demoId, slide: 0, total: 0, detail: '' });
      try {
        const { total } = await this.driver.open(file.playPath ?? file.path);
        this.set({ status: 'playing', slide: 1, total: total || 0 });
        this.log('▶', `Presentación «${file.name}»`, `Abierta en ${this.driverName === 'keynote' ? 'Keynote' : 'modo simulado'}`);
        this.startPolling();
      } catch (error) {
        this.set({ status: 'error', detail: error.message });
        this.log('!', `Presentación «${file.name}»`, error.message);
        throw error;
      }
    });
  }

  step(direction) {
    return this.enqueue(async () => {
      if (this.state.status !== 'playing') throw new Error('No hay ninguna presentación en curso.');
      await (direction > 0 ? this.driver.next() : this.driver.previous());
      await this.refresh();
    });
  }

  next() { return this.step(1); }
  previous() { return this.step(-1); }

  goto(slide) {
    return this.enqueue(async () => {
      if (this.state.status !== 'playing') throw new Error('No hay ninguna presentación en curso.');
      const n = Math.round(Number(slide));
      if (!Number.isFinite(n) || n < 1 || (this.state.total && n > this.state.total)) throw new Error('Diapositiva fuera de rango.');
      await this.driver.goto(n);
      await this.refresh();
    });
  }

  stop() {
    return this.enqueue(async () => {
      this.stopPolling();
      if (this.state.status === 'idle') return;
      const name = this.state.fileName;
      try { await this.driver.stop(); } finally {
        this.state = idleState();
        this.emit('change');
        this.log('■', `Presentación «${name}»`, 'Detenida');
      }
    });
  }

  async refresh() {
    try {
      const status = await this.driver.status();
      if (!status.playing) {
        this.stopPolling();
        this.set({ status: 'stopped', detail: 'La presentación se ha cerrado en el Mac.' });
        return;
      }
      if (status.slide !== this.state.slide || status.total !== this.state.total) this.set({ slide: status.slide, total: status.total });
    } catch (error) {
      this.set({ detail: error.message });
    }
  }

  startPolling() {
    this.stopPolling();
    this.timer = setInterval(() => { this.enqueue(() => this.refresh()).catch(() => {}); }, POLL_MS);
    this.timer.unref?.();
  }

  stopPolling() { clearInterval(this.timer); this.timer = null; }
}

const idleState = () => ({ status: 'idle', fileId: null, fileName: '', demoId: null, slide: 0, total: 0, detail: '' });

// --- Keynote (macOS) --------------------------------------------------------------

// Por nombre: el identificador cambió entre versiones (com.apple.iWork.Keynote → com.apple.Keynote).
const KEYNOTE = 'application "Keynote"';

export class KeynoteDriver {
  constructor({ exec = runAppleScript } = {}) { this.exec = exec; }

  async open(path) {
    // Cierra lo que hubiera abierto, abre el archivo (también .pptx, que Keynote importa)
    // y arranca la presentación a pantalla completa desde la primera diapositiva.
    const out = await this.exec([
      'on run argv',
      `  tell ${KEYNOTE}`,
      '    activate',
      '    if playing then stop front document',
      '    close every document saving no',
      '    set theDoc to open (POSIX file (item 1 of argv))',
      '    delay 1',
      '    start theDoc from first slide of theDoc',
      '    return (count of slides of theDoc) as text',
      '  end tell',
      'end run',
    ], [path], 120_000);
    return { total: Number.parseInt(out, 10) || 0 };
  }

  next() { return this.exec([`tell ${KEYNOTE} to show next`]); }
  previous() { return this.exec([`tell ${KEYNOTE} to show previous`]); }

  goto(slide) {
    return this.exec([
      'on run argv',
      `  tell ${KEYNOTE}`,
      '    set current slide of front document to slide (item 1 of argv as integer) of front document',
      '  end tell',
      'end run',
    ], [String(slide)]);
  }

  stop() {
    return this.exec([
      `tell ${KEYNOTE}`,
      '  if playing then stop front document',
      '  close every document saving no',
      'end tell',
    ]);
  }

  async status() {
    const out = await this.exec([
      `if ${KEYNOTE} is not running then return "stopped"`,
      `tell ${KEYNOTE}`,
      '  if not playing then return "stopped"',
      '  set theDoc to front document',
      '  return ((slide number of current slide of theDoc) as text) & "/" & ((count of slides of theDoc) as text)',
      'end tell',
    ]);
    if (out.trim() === 'stopped') return { playing: false };
    const [slide, total] = out.trim().split('/').map((n) => Number.parseInt(n, 10));
    return { playing: true, slide: slide || 0, total: total || 0 };
  }
}

export function runAppleScript(lines, args = [], timeout = 15_000) {
  if (process.platform !== 'darwin') {
    return Promise.reject(new Error('Keynote solo está disponible si la web corre en un Mac. Usa el reproductor «simulado» para probar.'));
  }
  const argv = lines.flatMap((line) => ['-e', line]).concat(args);
  return new Promise((resolve, reject) => {
    execFile('osascript', argv, { timeout }, (error, stdout, stderr) => {
      if (error) {
        const message = String(stderr || error.message).trim();
        if (/-1728|-10814|No puede obtenerse application|Can.t get application/i.test(message)) {
          return reject(new Error('No se encuentra Keynote en este Mac. Instálalo desde la App Store y ábrelo una vez.'));
        }
        if (/-1743|not authori[sz]ed/i.test(message)) {
          return reject(new Error('macOS no permite que la web controle Keynote. Actívalo en Ajustes del Sistema → Privacidad y seguridad → Automatización.'));
        }
        return reject(new Error(`Keynote: ${message.replace(/^\d+:\d+: execution error: /, '')}`));
      }
      resolve(String(stdout).trim());
    });
  });
}

// --- Simulado ---------------------------------------------------------------------

export class SimulatedDriver {
  constructor({ slides = 12 } = {}) { this.slides = slides; this.slide = 0; this.playing = false; }
  async open() { this.playing = true; this.slide = 1; return { total: this.slides }; }
  async next() { if (this.slide < this.slides) this.slide += 1; }
  async previous() { if (this.slide > 1) this.slide -= 1; }
  async goto(n) { this.slide = n; }
  async stop() { this.playing = false; this.slide = 0; }
  async status() { return this.playing ? { playing: true, slide: this.slide, total: this.slides } : { playing: false }; }
}
