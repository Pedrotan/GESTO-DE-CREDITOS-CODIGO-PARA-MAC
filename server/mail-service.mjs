import nodemailer from 'nodemailer';
import { loadMailConfig, smtpTransportOptions } from './mail-config.mjs';

const validEmail = value => typeof value === 'string' && value.length <= 254 &&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value) && !/[\r\n]/u.test(value);
const safeHeader = value => typeof value === 'string' && value.length <= 998 && !/[\r\n]/u.test(value);
const MESSAGE_KINDS = new Set([
  'email_verification', 'login_notification', 'password_reset', 'password_changed',
  'security_alert', 'email_changed', 'admin_notification', 'transactional',
]);

const safeErrorCode = error => {
  if (['EAUTH', 'EENVELOPE'].includes(error?.code)) return 'smtp_rejected';
  if (['ECONNECTION', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET'].includes(error?.code)) return 'smtp_unavailable';
  return 'smtp_delivery_failed';
};

export class MailService {
  #config;
  #createTransport;
  #onEvent;
  #transport;

  constructor({ env = process.env, createTransport = nodemailer.createTransport, onEvent = () => {} } = {}) {
    this.#config = loadMailConfig(env);
    this.#createTransport = createTransport;
    this.#onEvent = onEvent;
  }

  get status() {
    return this.#config.status;
  }

  async send(message) {
    const kind = String(message?.kind || 'transactional');
    if (!this.#config.enabled) return { status: 'disabled', code: 'mail_disabled' };
    if (!message || !MESSAGE_KINDS.has(kind) || !validEmail(message.to) || !safeHeader(message.subject) ||
        typeof message.text !== 'string' || !message.text.trim() || message.text.length > 100_000 ||
        (message.html !== undefined && (typeof message.html !== 'string' || message.html.length > 500_000)) ||
        (message.replyTo !== undefined && !validEmail(message.replyTo))) {
      return { status: 'rejected', code: 'mail_message_invalid' };
    }

    try {
      if (!this.#transport) this.#transport = this.#createTransport(smtpTransportOptions(this.#config));
      const info = await this.#transport.sendMail({
        from: { name: this.#config.fromName, address: this.#config.fromAddress },
        replyTo: { name: this.#config.supportName, address: message.replyTo || this.#config.supportAddress },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { 'X-Tango-Message-Kind': kind },
      });
      await this.#record({ kind, status: 'sent' });
      return { status: 'sent', messageId: String(info?.messageId || '') };
    } catch (error) {
      const code = safeErrorCode(error);
      await this.#record({ kind, status: 'failed', code });
      return { status: 'failed', code };
    }
  }

  async verifyConnection() {
    if (!this.#config.enabled) return { status: 'disabled', code: 'mail_disabled' };
    try {
      if (!this.#transport) this.#transport = this.#createTransport(smtpTransportOptions(this.#config));
      await this.#transport.verify();
      return { status: 'ready' };
    } catch (error) {
      return { status: 'failed', code: safeErrorCode(error) };
    }
  }

  async #record(event) {
    try {
      await this.#onEvent({ ...event, occurredAt: new Date().toISOString() });
    } catch {
      // Audit callbacks must not change mail delivery behavior.
    }
  }
}

export const createMailService = options => new MailService(options);