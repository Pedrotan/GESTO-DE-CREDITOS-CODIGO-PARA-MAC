export class MailConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MailConfigurationError';
    this.code = code;
  }
}

const validEmail = value => typeof value === 'string' && value.length <= 254 &&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value) && !/[\r\n]/u.test(value);
const positiveInteger = (value, fallback, max) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new MailConfigurationError('MAIL_CONFIGURATION_INVALID');
  }
  return parsed;
};

export const loadMailConfig = (env = process.env) => {
  const enabledValue = String(env.MAIL_ENABLED ?? '').trim().toLowerCase();
  if (!enabledValue || enabledValue === 'false') {
    return Object.freeze({ enabled: false, status: 'disabled' });
  }
  if (enabledValue !== 'true') throw new MailConfigurationError('MAIL_CONFIGURATION_INVALID');

  const queueValue = String(env.MAIL_QUEUE_ENABLED ?? 'false').trim().toLowerCase();
  if (!['true', 'false'].includes(queueValue)) throw new MailConfigurationError('MAIL_CONFIGURATION_INVALID');
  if (queueValue === 'true') throw new MailConfigurationError('MAIL_QUEUE_UNAVAILABLE');
  if (String(env.MAIL_MAILER || 'smtp').trim().toLowerCase() !== 'smtp') {
    throw new MailConfigurationError('MAIL_CONFIGURATION_INVALID');
  }

  const host = String(env.MAIL_HOST || '').trim();
  const username = String(env.MAIL_USERNAME || '').trim();
  const password = String(env.MAIL_PASSWORD || '');
  const fromAddress = String(env.MAIL_FROM_ADDRESS || '').trim();
  const supportAddress = String(env.MAIL_SUPPORT_ADDRESS || '').trim();
  const fromName = String(env.MAIL_FROM_NAME || '').trim();
  const supportName = String(env.MAIL_SUPPORT_NAME || '').trim();
  const appUrlValue = String(env.APP_URL || '').trim();
  const port = Number(env.MAIL_PORT || 587);
  const encryption = String(env.MAIL_ENCRYPTION || '').trim().toLowerCase();

  if (!host || !username || !password || !fromAddress || !supportAddress || !fromName || !supportName || !appUrlValue) {
    throw new MailConfigurationError('MAIL_CONFIGURATION_MISSING');
  }
    if (!/^[a-z0-9.-]+$/iu.test(host) || !Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      !validEmail(fromAddress) || !validEmail(supportAddress) || fromName.length > 120 || supportName.length > 120 ||
      /[\r\n]/u.test(fromName + supportName)) {
    throw new MailConfigurationError('MAIL_CONFIGURATION_INVALID');
  }
  if ((port === 587 && encryption !== 'starttls') || (port === 465 && encryption !== 'tls') ||
      !['starttls', 'tls'].includes(encryption)) {
    throw new MailConfigurationError('MAIL_TLS_CONFIGURATION_INVALID');
  }

  let appUrl;
  try {
    appUrl = new URL(appUrlValue);
  } catch {
    throw new MailConfigurationError('MAIL_APP_URL_INVALID');
  }
  const production = String(env.NODE_ENV || '').toLowerCase() === 'production';
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.search || appUrl.hash ||
      (production && appUrl.protocol !== 'https:')) {
    throw new MailConfigurationError('MAIL_APP_URL_INVALID');
  }

  return Object.freeze({
    enabled: true,
    status: 'configured',
    host,
    port,
    encryption,
    username,
    password,
    fromAddress,
    fromName,
    supportAddress,
    supportName,
    appUrl: appUrl.origin,
    connectTimeoutMs: positiveInteger(env.MAIL_CONNECT_TIMEOUT, 10, 60) * 1000,
    sendTimeoutMs: positiveInteger(env.MAIL_SEND_TIMEOUT, 30, 120) * 1000,
    queueEnabled: false,
  });
};

export const smtpTransportOptions = config => {
  if (!config?.enabled) throw new MailConfigurationError('MAIL_DISABLED');
  return {
    host: config.host,
    port: config.port,
    secure: config.encryption === 'tls',
    requireTLS: config.encryption === 'starttls',
    connectionTimeout: config.connectTimeoutMs,
    greetingTimeout: config.connectTimeoutMs,
    socketTimeout: config.sendTimeoutMs,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: config.username, pass: config.password },
  };
};