import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

type CredentialRecord = {
  version: 1 | 2;
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
  mfa?: { secret: string; recoveryCodeHashes: string[]; enabledAt: string };
  profile?: MasterProfile;
};

export type MasterProfile = { name: string; email: string; phone: string };

const DEFAULT_PROFILE: MasterProfile = { name: 'Admin Master', email: '', phone: '' };

const cleanProfileText = (value: unknown, label: string, max: number) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new TypeError(`${label} invalido.`);
  const clean = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  if (clean.length > max) throw new Error(`${label} demasiado longo.`);
  return clean;
};

export const validateMasterProfile = (input: unknown): MasterProfile => {
  if (!input || typeof input !== 'object') throw new TypeError('Perfil invalido.');
  const data = input as Record<string, unknown>;
  const name = cleanProfileText(data.name, 'Nome', 80);
  const email = cleanProfileText(data.email, 'Email', 120);
  const phone = cleanProfileText(data.phone, 'Telefone', 30);
  if (name.length < 2) throw new Error('Indique um nome com pelo menos 2 caracteres.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error('Email invalido.');
  if (phone && !/^[+\d\s()-]{6,30}$/u.test(phone)) throw new Error('Telefone invalido.');
  return { name, email, phone };
};

type AttemptState = { failures: number; blockedUntil: number };

const SESSION_TTL_MS = 30 * 60 * 1000;
const ABSOLUTE_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILURES_BEFORE_DELAY = 3;
const MAX_DELAY_MS = 5 * 60 * 1000;
const MFA_TTL_MS = 5 * 60 * 1000;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const encodeBase32 = (value: Buffer) => {
  let bits = '';
  for (const byte of value) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) output += BASE32_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
};

const decodeBase32 = (value: string) => {
  let bits = '';
  for (const character of value.replace(/=+$/u, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Segredo MFA invalido.');
    bits += index.toString(2).padStart(5, '0');
  }
  const output = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < output.length; index++) output[index] = parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  return output;
};

const totpForCounter = (secret: string, counter: number) => {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
};

const recoveryHash = (code: string) => crypto.createHash('sha256').update(code, 'utf8').digest('hex');

const derivePassword = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), salt, 64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });

export const validateMasterPassword = (password: unknown): string => {
  if (typeof password !== 'string') throw new TypeError('Palavra-passe invalida.');
  const normalized = password.normalize('NFKC');
  if (normalized.length < 12 || normalized.length > 256) {
    throw new Error('Use uma palavra-passe entre 12 e 256 caracteres.');
  }
  const categories = [/[a-z]/, /[A-Z]/, /\d/, /[^\p{L}\p{N}\s]/u].filter((rule) => rule.test(normalized)).length;
  if (categories < 3) throw new Error('Use pelo menos tres grupos: maiusculas, minusculas, numeros e simbolos.');
  return normalized;
};

export class MasterAuthService {
  private readonly credentialsPath: string;
  private readonly attemptsPath: string;
  private readonly sessions = new Map<number, { idleExpiresAt: number; absoluteExpiresAt: number }>();
  // The Master is one account: reopening a window must not reset its rate limit.
  private attempts: AttemptState = { failures: 0, blockedUntil: 0 };
  private busy = false;
  private readonly senderVersions = new Map<number, number>();
  private readonly pendingPassword = new Map<number, { expiresAt: number; secret?: string }>();
  private readonly pendingEnrollment = new Map<number, { expiresAt: number; secret: string }>();
  private lastTotpCounter = -1;
  private readonly protectSecret: (value: string) => string;
  private readonly revealSecret: (value: string) => string;
  // Com requireMfa = false a palavra-passe basta para abrir sessão (instalação de uso pessoal).
  private readonly requireMfa: boolean;

  constructor(
    userDataPath: string,
    secretProtection?: { protect(value: string): string; reveal(value: string): string },
    options: { requireMfa?: boolean } = {}
  ) {
    this.requireMfa = options.requireMfa ?? true;
    this.credentialsPath = path.join(userDataPath, 'master-credentials.json');
    this.attemptsPath = path.join(userDataPath, 'master-auth-attempts.json');
    this.protectSecret = secretProtection?.protect ?? ((value) => value);
    this.revealSecret = secretProtection?.reveal ?? ((value) => value);
    try {
      const stored = JSON.parse(fs.readFileSync(this.attemptsPath, 'utf8')) as AttemptState;
      if (Number.isFinite(stored.failures) && Number.isFinite(stored.blockedUntil)) this.attempts = stored;
    } catch { /* first execution or invalid non-authoritative rate-limit state */ }
  }

  isConfigured() { return fs.existsSync(this.credentialsPath); }

  async setup(senderId: number, password: unknown) {
    return this.exclusive(async () => {
    const senderVersion = this.senderVersions.get(senderId) ?? 0;
    if (this.isConfigured()) throw new Error('A credencial mestra ja foi configurada.');
    const cleanPassword = validateMasterPassword(password);
    const salt = crypto.randomBytes(32);
    const now = new Date().toISOString();
    const record: CredentialRecord = {
      version: 1,
      algorithm: 'scrypt',
      salt: salt.toString('base64'),
      hash: (await derivePassword(cleanPassword, salt)).toString('base64'),
      createdAt: now,
      updatedAt: now
    };
    fs.mkdirSync(path.dirname(this.credentialsPath), { recursive: true });
    fs.writeFileSync(this.credentialsPath, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    if ((this.senderVersions.get(senderId) ?? 0) === senderVersion) this.startSessionAfterPassword(senderId);
    return this.status(senderId);
    });
  }

  async login(senderId: number, password: unknown) {
    return this.exclusive(async () => {
      const senderVersion = this.senderVersions.get(senderId) ?? 0;
      await this.verifyPassword(password);
      const record = this.readCredential();
      if ((this.senderVersions.get(senderId) ?? 0) === senderVersion) this.startSessionAfterPassword(senderId, record);
      return this.status(senderId);
    });
  }

  private async verifyPassword(password: unknown) {
    if (!this.isConfigured()) throw new Error('A credencial mestra ainda nao foi configurada.');
    if (typeof password !== 'string' || password.length > 256) throw new Error('Credenciais invalidas.');
    const state = this.attempts;
    const now = Date.now();
    if (state?.blockedUntil && state.blockedUntil > now) {
      const seconds = Math.ceil((state.blockedUntil - now) / 1000);
      throw new Error(`Demasiadas tentativas. Tente novamente em ${seconds} segundos.`);
    }
    const record = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8')) as CredentialRecord;
    const expected = Buffer.from(record.hash, 'base64');
    const actual = await derivePassword(password, Buffer.from(record.salt, 'base64'));
    const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!valid) {
      const failures = (state?.failures ?? 0) + 1;
      const delay = failures >= MAX_FAILURES_BEFORE_DELAY
        ? Math.min(MAX_DELAY_MS, 2 ** (failures - MAX_FAILURES_BEFORE_DELAY) * 1000)
        : 0;
      this.attempts = { failures, blockedUntil: Date.now() + delay };
      this.persistAttempts();
      throw new Error('Credenciais invalidas.');
    }
    this.attempts = { failures: 0, blockedUntil: 0 };
    this.persistAttempts();
  }

  async changePassword(senderId: number, currentPassword: unknown, newPassword: unknown) {
    return this.exclusive(async () => {
    const senderVersion = this.senderVersions.get(senderId) ?? 0;
    this.assertAuthenticated(senderId);
    await this.verifyPassword(currentPassword);
    const cleanPassword = validateMasterPassword(newPassword);
    const previous = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8')) as CredentialRecord;
    const salt = crypto.randomBytes(32);
    const updated: CredentialRecord = {
      ...previous,
      salt: salt.toString('base64'),
      hash: (await derivePassword(cleanPassword, salt)).toString('base64'),
      updatedAt: new Date().toISOString()
    };
    if ((this.senderVersions.get(senderId) ?? 0) !== senderVersion) throw new Error('Sessao mestra revogada.');
    this.assertAuthenticated(senderId);
    const temporaryPath = `${this.credentialsPath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(updated, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryPath, this.credentialsPath);
    this.sessions.clear();
    this.createSession(senderId);
    return this.status(senderId);
    });
  }

  private startSessionAfterPassword(senderId: number, record?: CredentialRecord) {
    if (!this.requireMfa) {
      this.pendingPassword.delete(senderId);
      this.createSession(senderId);
      return;
    }
    this.pendingPassword.set(senderId, {
      expiresAt: Date.now() + MFA_TTL_MS,
      secret: record?.mfa ? this.revealSecret(record.mfa.secret) : undefined
    });
  }

  getProfile(senderId: number): MasterProfile {
    this.assertAuthenticated(senderId);
    return { ...DEFAULT_PROFILE, ...this.readCredential().profile };
  }

  updateProfile(senderId: number, input: unknown): MasterProfile {
    this.assertAuthenticated(senderId);
    const profile = validateMasterProfile(input);
    const record = this.readCredential();
    record.profile = profile;
    record.updatedAt = new Date().toISOString();
    this.writeCredential(record);
    return profile;
  }

  status(senderId: number) {
    const pending = this.pendingPassword.get(senderId);
    if (pending && pending.expiresAt <= Date.now()) this.pendingPassword.delete(senderId);
    const session = this.sessions.get(senderId);
    const expiresAt = session ? Math.min(session.idleExpiresAt, session.absoluteExpiresAt) : 0;
    if (expiresAt <= Date.now()) this.sessions.delete(senderId);
    return {
      configured: this.isConfigured(),
      authenticated: expiresAt > Date.now(),
      requiresMfa: Boolean(this.pendingPassword.get(senderId)?.secret),
      requiresMfaEnrollment: Boolean(this.pendingPassword.has(senderId) && !this.pendingPassword.get(senderId)?.secret),
      expiresAt: expiresAt > Date.now() ? new Date(expiresAt).toISOString() : null
    };
  }

  beginMfaEnrollment(senderId: number) {
    const pending = this.pendingPassword.get(senderId);
    if (!pending || pending.expiresAt <= Date.now() || pending.secret) throw new Error('Autenticacao por palavra-passe necessaria.');
    const secret = encodeBase32(crypto.randomBytes(20));
    this.pendingEnrollment.set(senderId, { secret, expiresAt: Date.now() + MFA_TTL_MS });
    const issuer = 'TangoMaster';
    return { secret, qrCode: `otpauth://totp/${issuer}:Administrador?secret=${secret}&issuer=${issuer}` };
  }

  confirmMfaEnrollment(senderId: number, token: unknown) {
    const pending = this.pendingEnrollment.get(senderId);
    if (!pending || pending.expiresAt <= Date.now() || !this.verifyTotp(senderId, pending.secret, token)) {
      if (pending?.expiresAt && pending.expiresAt <= Date.now()) this.pendingEnrollment.delete(senderId);
      return { authenticated: false };
    }
    const record = this.readCredential();
    const recoveryCodes = Array.from({ length: 10 }, () => {
      const raw = crypto.randomBytes(8).toString('base64url').toUpperCase().replace(/[^A-Z2-9]/gu, 'X').slice(0, 10);
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    record.version = 2;
    record.mfa = {
      secret: this.protectSecret(pending.secret),
      recoveryCodeHashes: recoveryCodes.map(recoveryHash),
      enabledAt: new Date().toISOString()
    };
    record.updatedAt = new Date().toISOString();
    this.writeCredential(record);
    this.pendingEnrollment.delete(senderId);
    this.pendingPassword.delete(senderId);
    this.createSession(senderId);
    return { ...this.status(senderId), recoveryCodes };
  }

  verifyMfa(senderId: number, token: unknown) {
    const pending = this.pendingPassword.get(senderId);
    if (!pending || pending.expiresAt <= Date.now() || !pending.secret || typeof token !== 'string') return { authenticated: false };
    const normalized = token.trim().toUpperCase();
    let recovered = false;
    if (!this.verifyTotp(senderId, pending.secret, normalized)) {
      if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u.test(normalized)) return { authenticated: false };
      const record = this.readCredential();
      const index = record.mfa?.recoveryCodeHashes.indexOf(recoveryHash(normalized)) ?? -1;
      if (index < 0 || !record.mfa) return { authenticated: false };
      record.mfa.recoveryCodeHashes.splice(index, 1);
      record.updatedAt = new Date().toISOString();
      this.writeCredential(record);
      recovered = true;
    }
    this.pendingPassword.delete(senderId);
    this.createSession(senderId);
    return { ...this.status(senderId), recovered };
  }

  logout(senderId: number) {
    this.revokeSender(senderId);
    return this.status(senderId);
  }

  assertAuthenticated(senderId: number) {
    if (!this.status(senderId).authenticated) throw new Error('Sessao mestra inexistente ou expirada.');
    this.sessions.get(senderId)!.idleExpiresAt = Date.now() + SESSION_TTL_MS;
  }

  revokeSender(senderId: number) {
    this.sessions.delete(senderId);
    this.pendingPassword.delete(senderId);
    this.pendingEnrollment.delete(senderId);
    this.senderVersions.set(senderId, (this.senderVersions.get(senderId) ?? 0) + 1);
  }

  private createSession(senderId: number) {
    const now = Date.now();
    this.sessions.set(senderId, { idleExpiresAt: now + SESSION_TTL_MS, absoluteExpiresAt: now + ABSOLUTE_SESSION_TTL_MS });
  }

  private readCredential() { return JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8')) as CredentialRecord; }

  private writeCredential(record: CredentialRecord) {
    const temporaryPath = `${this.credentialsPath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryPath, this.credentialsPath);
  }

  private verifyTotp(_senderId: number, secret: string, token: unknown) {
    if (typeof token !== 'string' || !/^\d{6}$/u.test(token)) return false;
    const current = Math.floor(Date.now() / 30_000);
    for (const counter of [current - 1, current, current + 1]) {
      if (totpForCounter(secret, counter) !== token || this.lastTotpCounter >= counter) continue;
      this.lastTotpCounter = counter;
      return true;
    }
    return false;
  }

  private persistAttempts() {
    fs.mkdirSync(path.dirname(this.attemptsPath), { recursive: true });
    fs.writeFileSync(this.attemptsPath, JSON.stringify(this.attempts), { encoding: 'utf8', mode: 0o600 });
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Autenticacao em curso. Aguarde antes de tentar novamente.');
    this.busy = true;
    try { return await operation(); }
    finally { this.busy = false; }
  }
}

export const generateMasterTotpForTest = totpForCounter;
