// Usuarios y sesiones. Contraseñas con scrypt; sesión en cookie firmada con HMAC.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { newID } from './model.js';

export const ROLES = ['operador', 'editor', 'admin'];
const RANK = { operador: 0, editor: 1, admin: 2 };
const SESSION_DAYS = 30;
export const COOKIE = 'salain_session';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 32);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored ?? '').split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const hasRole = (user, role) => Boolean(user) && RANK[user.role] >= RANK[role];

export function validateUsername(name) {
  const value = String(name ?? '').trim();
  if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(value)) throw new Error('El usuario debe tener entre 2 y 40 caracteres (letras, números, . _ -).');
  return value;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  return password;
}

export class Auth {
  constructor(store) { this.store = store; }

  get users() { return this.store.users; }
  needsSetup() { return this.users.length === 0; }

  publicUser(user) { return user && { id: user.id, username: user.username, role: user.role }; }
  list() { return this.users.map((u) => this.publicUser(u)); }

  create({ username, password, role }) {
    const name = validateUsername(username);
    if (this.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) throw new Error('Ese usuario ya existe.');
    if (!ROLES.includes(role)) throw new Error('Rol no válido.');
    const user = { id: newID(), username: name, role, password: hashPassword(validatePassword(password)), version: 1 };
    this.store.saveUsers([...this.users, user]);
    return this.publicUser(user);
  }

  update(id, { password, role }) {
    const users = this.users.map((u) => ({ ...u }));
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error('Usuario no encontrado.');
    if (role !== undefined) {
      if (!ROLES.includes(role)) throw new Error('Rol no válido.');
      if (user.role === 'admin' && role !== 'admin' && users.filter((u) => u.role === 'admin').length === 1) {
        throw new Error('Debe quedar al menos un administrador.');
      }
      user.role = role;
    }
    if (password) {
      user.password = hashPassword(validatePassword(password));
      user.version = (user.version ?? 1) + 1; // invalida sus sesiones abiertas
    }
    this.store.saveUsers(users);
    return this.publicUser(user);
  }

  remove(id) {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new Error('Usuario no encontrado.');
    if (user.role === 'admin' && this.users.filter((u) => u.role === 'admin').length === 1) {
      throw new Error('Debe quedar al menos un administrador.');
    }
    this.store.saveUsers(this.users.filter((u) => u.id !== id));
  }

  login(username, password) {
    const user = this.users.find((u) => u.username.toLowerCase() === String(username ?? '').trim().toLowerCase());
    // Se calcula el hash aunque el usuario no exista para no revelar qué usuarios hay.
    const ok = verifyPassword(password, user?.password ?? 'scrypt:00:00');
    return ok && user ? user : null;
  }

  sign(payload) {
    return createHmac('sha256', this.store.secret).update(payload).digest('base64url');
  }

  issue(user) {
    const expires = Date.now() + SESSION_DAYS * 86_400_000;
    const payload = `${user.id}.${user.version ?? 1}.${expires}`;
    return { token: `${payload}.${this.sign(payload)}`, maxAge: SESSION_DAYS * 86_400 };
  }

  verify(token) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 4) return null;
    const [id, version, expires, signature] = parts;
    const payload = `${id}.${version}.${expires}`;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (Number(expires) < Date.now()) return null;
    const user = this.users.find((u) => u.id === id);
    if (!user || String(user.version ?? 1) !== version) return null;
    return user;
  }
}
