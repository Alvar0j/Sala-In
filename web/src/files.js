// Archivos subidos desde la web (presentaciones). Se guardan en <datos>/files/<id>/.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { newID } from './model.js';

export const MAX_UPLOAD = 2 * 1024 ** 3; // 2 GB
export const ALLOWED = ['.key', '.pptx', '.ppt', '.zip'];

export class FileStore {
  constructor(dataDir, { unzip = extractZip } = {}) {
    this.dir = path.join(dataDir, 'files');
    this.index = path.join(dataDir, 'files.json');
    this.unzip = unzip;
    fs.mkdirSync(this.dir, { recursive: true });
    try { this.files = JSON.parse(fs.readFileSync(this.index, 'utf8')); } catch { this.files = []; }
  }

  list() { return this.files.map(publicFile); }
  get(id) { return this.files.find((f) => f.id === id) ?? null; }

  save() {
    const temp = `${this.index}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.files, null, 2));
    fs.renameSync(temp, this.index);
  }

  /** Guarda el cuerpo de la petición en disco sin cargarlo en memoria. */
  async upload(req, { name, user }) {
    const clean = sanitizeName(name);
    const ext = path.extname(clean).toLowerCase();
    if (!ALLOWED.includes(ext)) throw Object.assign(new Error(`Formato no admitido (${ext || 'sin extensión'}). Sube .key, .pptx o un .zip con el .key.`), { status: 415 });
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_UPLOAD) throw Object.assign(new Error('Archivo demasiado grande (máximo 2 GB).'), { status: 413 });

    const id = newID();
    const folder = path.join(this.dir, id);
    fs.mkdirSync(folder, { recursive: true });
    const target = path.join(folder, clean);
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD) req.destroy(Object.assign(new Error('Archivo demasiado grande (máximo 2 GB).'), { status: 413 }));
    });
    try {
      await pipeline(req, fs.createWriteStream(target));
      if (size === 0) throw Object.assign(new Error('El archivo está vacío.'), { status: 400 });
      let playPath = target;
      if (ext === '.zip') playPath = await this.extractKeynote(target, folder);
      const file = {
        id, name: clean, size, uploadedAt: new Date().toISOString(), by: user,
        kind: path.extname(playPath).toLowerCase() === '.key' ? 'keynote' : 'powerpoint',
        path: target, playPath,
      };
      this.files = [file, ...this.files];
      this.save();
      return publicFile(file);
    } catch (error) {
      fs.rmSync(folder, { recursive: true, force: true });
      throw error;
    }
  }

  async extractKeynote(zipPath, folder) {
    const out = path.join(folder, 'contenido');
    try {
      await this.unzip(zipPath, out);
    } catch (error) {
      throw Object.assign(new Error(`No se pudo descomprimir el .zip: ${error.message}`), { status: 400 });
    }
    const found = findPresentation(out);
    if (!found) throw Object.assign(new Error('El .zip no contiene ninguna presentación .key o .pptx.'), { status: 400 });
    return found;
  }

  remove(id) {
    const file = this.get(id);
    if (!file) throw Object.assign(new Error('Archivo no encontrado.'), { status: 404 });
    fs.rmSync(path.join(this.dir, id), { recursive: true, force: true });
    this.files = this.files.filter((f) => f.id !== id);
    this.save();
  }
}

export function sanitizeName(name) {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/')).normalize('NFC');
  const clean = base.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').replace(/^\.+/, '').trim().slice(0, 150);
  if (!clean) throw Object.assign(new Error('Nombre de archivo no válido.'), { status: 400 });
  return clean;
}

function findPresentation(dir, depth = 0) {
  if (depth > 3) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('__MACOSX') && !e.name.startsWith('.'));
  for (const entry of entries) {
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.key' || ext === '.pptx' || ext === '.ppt') return path.join(dir, entry.name); // .key puede ser carpeta (paquete)
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findPresentation(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function extractZip(zipPath, out) {
  const [cmd, args] = process.platform === 'darwin' ? ['ditto', ['-x', '-k', zipPath, out]] : ['unzip', ['-q', '-o', zipPath, '-d', out]];
  return new Promise((resolve, reject) => execFile(cmd, args, { timeout: 300_000 }, (error, _o, stderr) => (error ? reject(new Error(String(stderr || error.message).trim())) : resolve())));
}

const publicFile = ({ id, name, size, uploadedAt, by, kind }) => ({ id, name, size, uploadedAt, by, kind });
