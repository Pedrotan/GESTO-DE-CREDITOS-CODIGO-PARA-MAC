import * as crypto from 'node:crypto';

type UserRecord = {
  id: string; name: string; email?: string; username?: string; role: string;
  permissions?: string | string[]; status?: string; twoFactorEnabled?: number | boolean;
  twoFactorSecret?: string; avatar?: string; signature?: string;
};

type Session = { user: Record<string, unknown>; idleExpiresAt: number; absoluteExpiresAt: number; mfaEnrollmentRequired?: boolean };
type PendingMfa = { user: Record<string, unknown>; secret: string; expiresAt: number };
type PendingEnrollment = { secret: string; expiresAt: number };

const IDLE_TTL_MS = 30 * 60 * 1000;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const MFA_TTL_MS = 5 * 60 * 1000;
const MFA_ENROLLMENT_TTL_MS = 15 * 60 * 1000;

const decodeBase32 = (value: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.replace(/=+$/u, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Segredo MFA inválido.');
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
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
};

const encodeBase32 = (value: Buffer) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of value) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    output += alphabet[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return output;
};

export class UserSessionService {
  private sessions = new Map<number, Session>();
  private pendingMfa = new Map<number, PendingMfa>();
  private pendingEnrollment = new Map<number, PendingEnrollment>();
  private lastTotpCounter = new Map<string, number>();

  begin(senderId: number, record: UserRecord, requireMfaEnrollment = false) {
    const user = this.publicUser(record);
    if (Boolean(record.twoFactorEnabled)) {
      if (!record.twoFactorSecret) throw new Error('MFA ativo sem segredo configurado. Contacte o administrador.');
      this.pendingMfa.set(senderId, { user, secret: record.twoFactorSecret, expiresAt: Date.now() + MFA_TTL_MS });
      this.sessions.delete(senderId);
      return { authenticated: false, requires2FA: true, userId: record.id };
    }
    this.createSession(senderId, user, requireMfaEnrollment);
    if (requireMfaEnrollment) return { authenticated: false, requiresMfaEnrollment: true, userId: record.id };
    return { authenticated: true, requires2FA: false, user };
  }

  verifyTotp(senderId: number, userId: string, token: unknown) {
    const pending = this.pendingMfa.get(senderId);
    if (!pending || pending.expiresAt <= Date.now() || pending.user.id !== userId) {
      this.pendingMfa.delete(senderId);
      return { authenticated: false, reason: 'challenge_expired' as const };
    }
    if (typeof token !== 'string' || !/^\d{6}$/u.test(token)) return { authenticated: false, reason: 'invalid_code' as const };
    const currentCounter = Math.floor(Date.now() / 30_000);
    for (const counter of [currentCounter - 1, currentCounter, currentCounter + 1]) {
      if (totpForCounter(pending.secret, counter) !== token) continue;
      if ((this.lastTotpCounter.get(userId) ?? -1) >= counter) return { authenticated: false, reason: 'replayed_code' as const };
      this.lastTotpCounter.set(userId, counter);
      this.pendingMfa.delete(senderId);
      this.createSession(senderId, pending.user);
      return { authenticated: true, user: pending.user };
    }
    return { authenticated: false, reason: 'invalid_code' as const };
  }

  hasPendingMfa(senderId: number, userId: string) {
    const pending = this.pendingMfa.get(senderId);
    if (!pending || pending.expiresAt <= Date.now() || String(pending.user.id) !== userId) {
      if (pending?.expiresAt && pending.expiresAt <= Date.now()) this.pendingMfa.delete(senderId);
      return false;
    }
    return true;
  }

  completeMfaRecovery(senderId: number, userId: string) {
    if (!this.hasPendingMfa(senderId, userId)) return { authenticated: false };
    const pending = this.pendingMfa.get(senderId)!;
    this.pendingMfa.delete(senderId);
    this.createSession(senderId, pending.user);
    return { authenticated: true, user: pending.user, recovered: true };
  }

  beginMfaEnrollment(senderId: number) {
    const session = this.sessions.get(senderId);
    if (!session || Math.min(session.idleExpiresAt, session.absoluteExpiresAt) <= Date.now()) {
      this.sessions.delete(senderId);
      throw new Error('SessÃ£o inexistente ou expirada.');
    }
    const user: any = session.user;
    const secret = encodeBase32(crypto.randomBytes(20));
    this.pendingEnrollment.set(senderId, { secret, expiresAt: Date.now() + MFA_ENROLLMENT_TTL_MS });
    const issuer = 'TangoGestaoCreditosERP';
    const account = String(user.email || user.username || user.id);
    const qrCode = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return { secret, qrCode };
  }

  confirmMfaEnrollment(senderId: number, token: unknown) {
    const session = this.sessions.get(senderId);
    if (!session || Math.min(session.idleExpiresAt, session.absoluteExpiresAt) <= Date.now()) {
      this.sessions.delete(senderId);
      return { confirmed: false, reason: 'session_expired' as const };
    }
    const user: any = session.user;
    const pending = this.pendingEnrollment.get(senderId);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pendingEnrollment.delete(senderId);
      return { confirmed: false, reason: 'qr_expired' as const };
    }
    if (!this.verifySecretToken(String(user.id), pending.secret, token, true)) {
      return { confirmed: false, reason: 'invalid_code' as const };
    }
    this.pendingEnrollment.delete(senderId);
    return { confirmed: true, secret: pending.secret, user };
  }

  verifyMfaForSession(senderId: number, secret: string, token: unknown) {
    const user: any = this.assertAuthenticated(senderId);
    return this.verifySecretToken(String(user.id), secret, token, true);
  }

  updateMfaState(senderId: number, enabled: boolean) {
    const session = this.sessions.get(senderId);
    if (!session) throw new Error('SessÃ£o inexistente ou expirada.');
    session.user = { ...session.user, twoFactorEnabled: enabled };
    if (enabled) session.mfaEnrollmentRequired = false;
    return session.user;
  }

  status(senderId: number) {
    const session = this.sessions.get(senderId);
    if (!session) return { authenticated: false, user: null };
    const expiresAt = Math.min(session.idleExpiresAt, session.absoluteExpiresAt);
    if (expiresAt <= Date.now()) {
      this.sessions.delete(senderId);
      return { authenticated: false, user: null };
    }
    if (session.mfaEnrollmentRequired) return { authenticated: false, requiresMfaEnrollment: true, user: null };
    return { authenticated: true, user: session.user, expiresAt: new Date(expiresAt).toISOString() };
  }

  assertAuthenticated(senderId: number) {
    const status = this.status(senderId);
    if (!status.authenticated) throw new Error('Sessão inexistente ou expirada.');
    this.sessions.get(senderId)!.idleExpiresAt = Date.now() + IDLE_TTL_MS;
    return status.user!;
  }

  revokeSender(senderId: number) {
    this.sessions.delete(senderId);
    this.pendingMfa.delete(senderId);
    this.pendingEnrollment.delete(senderId);
  }

  private verifySecretToken(userId: string, secret: string, token: unknown, preventReplay: boolean) {
    if (typeof token !== 'string' || !/^\d{6}$/u.test(token)) return false;
    const currentCounter = Math.floor(Date.now() / 30_000);
    for (const counter of [currentCounter - 1, currentCounter, currentCounter + 1]) {
      if (totpForCounter(secret, counter) !== token) continue;
      if (preventReplay && (this.lastTotpCounter.get(userId) ?? -1) >= counter) return false;
      if (preventReplay) this.lastTotpCounter.set(userId, counter);
      return true;
    }
    return false;
  }

  private createSession(senderId: number, user: Record<string, unknown>, mfaEnrollmentRequired = false) {
    const now = Date.now();
    this.sessions.set(senderId, { user, idleExpiresAt: now + IDLE_TTL_MS, absoluteExpiresAt: now + ABSOLUTE_TTL_MS, mfaEnrollmentRequired });
  }

  private publicUser(record: UserRecord) {
    let permissions: unknown[] = [];
    try { permissions = Array.isArray(record.permissions) ? record.permissions : JSON.parse(record.permissions || '[]'); }
    catch { permissions = []; }
    const { twoFactorSecret: _secret, ...safe } = record;
    return { ...safe, permissions, twoFactorEnabled: Boolean(record.twoFactorEnabled) };
  }
}

const FINANCIAL_DML_PATTERN = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+["'`\[]?(credits|payments|accounting_entries|ledger_transactions|ledger_lines|credit_installments|credit_reinforcements)\b/i;
const FINANCIAL_DDL_PATTERN = /\b(?:ALTER\s+TABLE|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+["'`\[]?(credits|payments|accounting_entries|ledger_transactions|ledger_lines|credit_installments|credit_reinforcements)(?:_old)?\b/i;

export function financialStatementTarget(sql: string, allowMigration = false) {
  const match = sql.match(FINANCIAL_DML_PATTERN) || sql.match(FINANCIAL_DDL_PATTERN);
  if (!match) return null;
  const normalized = sql.trim();
  const migration = /\bFROM\s+(?:credits|payments)_old\b/i.test(normalized) ||
    /^UPDATE\s+accounting_entries\s+SET\s+amountPrincipalMinor\s*=/i.test(sql.trim()) &&
    /WHERE\s+amountTotalMinor\s+IS\s+NULL\s*$/i.test(normalized) ||
    /^UPDATE\s+(?:credits|payments)\s+SET\s+[\s\S]*(?:Minor|idempotencyKey)\s*=/i.test(normalized) &&
    /\bWHERE\b[\s\S]*\bIS\s+NULL\b/i.test(normalized) ||
    /^INSERT\s+OR\s+IGNORE\s+INTO\s+credit_installments\b/i.test(normalized) ||
    /^ALTER\s+TABLE\s+["'`\[]?(?:credits|payments|accounting_entries|ledger_transactions|ledger_lines|credit_installments|credit_reinforcements)["'`\]]?\s+ADD\s+COLUMN\b/i.test(normalized) ||
    /^ALTER\s+TABLE\s+["'`\[]?(credits|payments)["'`\]]?\s+RENAME\s+TO\s+["'`\[]?\1_old["'`\]]?\s*$/i.test(normalized) ||
    /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+["'`\[]?(?:credits|payments|accounting_entries|ledger_transactions|ledger_lines|credit_installments|credit_reinforcements)\b/i.test(normalized) ||
    /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`\[]?(?:credits|payments)_old["'`\]]?\s*$/i.test(normalized);
  return migration && allowMigration ? null : match[1].toLowerCase();
}

export function userReadExposesSecrets(sql: string) {
  const normalized = sql.replace(/\s+/gu, ' ').trim();
  if (!/\bFROM\s+["'`\[]?users\b/i.test(normalized)) return false;
  const select = normalized.match(/^SELECT\s+(.+?)\s+FROM\s/iu)?.[1] || '';
  return /(?:^|,)\s*(?:[a-z_][\w]*\.)?\*\s*(?:,|$)/iu.test(select) ||
    /\b(?:password|twoFactorSecret|mfaRecoveryCodes)\b/iu.test(select);
}

export function userStatementKind(sql: string): 'insert' | 'update' | 'delete' | 'schema' | null {
  const normalized = sql.replace(/\s+/gu, ' ').trim();
  if (/^(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO)\s+["'`\[]?users\b/iu.test(normalized)) return 'insert';
  if (/^UPDATE\s+["'`\[]?users\b/iu.test(normalized)) return 'update';
  if (/^DELETE\s+FROM\s+["'`\[]?users\b/iu.test(normalized)) return 'delete';
  if (/^(?:ALTER\s+TABLE|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+["'`\[]?users\b/iu.test(normalized)) return 'schema';
  return null;
}

export function userUpdateTouchesPrivileges(sql: string) {
  const setClause = sql.replace(/\s+/gu, ' ').match(/^UPDATE\s+["'`\[]?users["'`\]]?\s+SET\s+(.+?)\s+WHERE\s/iu)?.[1] || '';
  return /\b(?:role|permissions|twoFactorEnabled|twoFactorSecret|mfaRecoveryCodes|failedAttempts|blockedAt)\b/iu.test(setClause);
}

export function assertFinancialPermission(user: any, table: string) {
  if (!user) throw new Error('Sessão inexistente ou expirada.');
  if (table === 'credits' || table === 'credit_installments') return;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (!['super_admin', 'admin'].includes(String(user.role)) && !permissions.includes('manage_payments')) {
    throw new Error('O utilizador não possui permissão para operações financeiras.');
  }
}

export const generateTotpForTest = totpForCounter;
