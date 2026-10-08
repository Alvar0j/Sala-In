// Imágenes de fondo subidas desde la web para los botones. Se guardan en <datos>/images/.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

export const MAX_IMAGE = 15 * 1024 ** 2; // 15 MB
export const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const NAME = /^[A-F0-9-]{36}\.(png|jpe?g|webp)$/;

export class ImageStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'images');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async upload(req, originalName) {
    const ext = path.extname(String(originalName ?? '')).toLowerCase();
    if (!IMAGE_TYPES[ext]) throw Object.assign(new Error('Formato no admitido: usa PNG, JPG o WEBP.'), { status: 400 });
    const length = Number(req.headers['content-length']);
    if (length > MAX_IMAGE) throw Object.assign(new Error('La imagen es demasiado grande (máximo 15 MB).'), { status: 413 });
    const name = `${randomUUID().toUpperCase()}${ext === '.jpeg' ? '.jpg' : ext}`;
    const target = path.join(this.dir, name);
    let size = 0;
    try {
      await pipeline(req, async function* (source) {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > MAX_IMAGE) throw Object.assign(new Error('La imagen es demasiado grande (máximo 15 MB).'), { status: 413 });
          yield chunk;
        }
      }, fs.createWriteStream(target, { mode: 0o600 }));
    } catch (error) {
      fs.rmSync(target, { force: true });
      throw error;
    }
    if (!size) { fs.rmSync(target, { force: true }); throw Object.assign(new Error('La imagen está vacía.'), { status: 400 }); }
    return `upload:${name}`;
  }

  /** Ruta del archivo para una referencia «upload:<nombre>», o null si no existe. */
  resolve(name) {
    if (!NAME.test(name)) return null;
    const file = path.join(this.dir, name);
    return fs.existsSync(file) ? { file, type: IMAGE_TYPES[path.extname(name)] } : null;
  }
}
