// Persistencia en archivos JSON dentro de la carpeta de datos (por defecto web/data).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { emptyConfig, normalizeConfig } from './model.js';

export const DEFAULT_SETTINGS = {
  qlab: { host: '', port: 53000, workspace: '', replyPort: 53001, passcode: '' },
  watchout: { host: '', port: 3019 },
};

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.config = normalizeConfig(this.read('config.json', emptyConfig()));
    const settings = this.read('settings.json', {});
    this.settings = {
      qlab: { ...DEFAULT_SETTINGS.qlab, ...settings.qlab },
      watchout: { ...DEFAULT_SETTINGS.watchout, ...settings.watchout },
    };
    this.users = this.read('users.json', []);
    this.secret = this.loadSecret();
  }

  file(name) { return path.join(this.dir, name); }

  read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(`No se pudo leer ${name}: ${error.message}`);
      return fallback;
    }
  }

  write(name, value) {
    const target = this.file(name);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temp, target);
  }

  loadSecret() {
    const target = this.file('secret.key');
    try { return fs.readFileSync(target); } catch {}
    const secret = randomBytes(32);
    fs.writeFileSync(target, secret, { mode: 0o600 });
    return secret;
  }

  saveConfig(config) { this.config = normalizeConfig(config); this.write('config.json', this.config); return this.config; }
  saveSettings(settings) { this.settings = settings; this.write('settings.json', settings); }
  saveUsers(users) { this.users = users; this.write('users.json', users); }
}
