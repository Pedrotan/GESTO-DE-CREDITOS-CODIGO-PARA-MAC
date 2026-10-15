const escapeHtml = value => String(value ?? '').replace(/[&<>"']/gu, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const safeLink = (value, appUrl, production) => {
  const url = new URL(value, appUrl);
  const base = new URL(appUrl);
  if (url.origin !== base.origin || (production && url.protocol !== 'https:')) {
    throw new TypeError('MAIL_LINK_INVALID');
  }
  return url.href;
};

export const createMailTemplates = ({ appUrl, supportAddress = 'suporte@tangogestaoecreditos.tech',
  supportName = 'Suporte Tango', production = true } = {}) => {
  if (!appUrl) throw new TypeError('MAIL_APP_URL_REQUIRED');

  const layout = ({ title, bodyHtml, bodyText }) => ({
    html: `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f3f5f4;color:#17211f;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;background:#fff;border:1px solid #dce4e0"><header style="padding:24px 28px;background:#123f36;color:#fff"><p style="margin:0;font-size:12px;letter-spacing:1px">TANGO GESTÃO DE CRÉDITOS</p></header><section style="padding:28px;line-height:1.6"><h1 style="font-size:22px;line-height:1.3">${escapeHtml(title)}</h1>${bodyHtml}<hr style="border:0;border-top:1px solid #dce4e0;margin:28px 0"><p style="font-size:13px;color:#52615c">${escapeHtml(supportName)} · <a href="mailto:${escapeHtml(supportAddress)}">${escapeHtml(supportAddress)}</a></p><p style="font-size:12px;color:#687570">Se não solicitou esta operação, ignore esta mensagem e contacte o suporte.</p></section></main></body></html>`,
    text: `${title}\n\n${bodyText}\n\n${supportName}: ${supportAddress}\nSe não solicitou esta operação, ignore esta mensagem.`,
  });

  const button = link => `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#176b56;color:#fff;text-decoration:none">Continuar no Tango</a></p><p style="font-size:12px;word-break:break-all;color:#52615c">${escapeHtml(link)}</p>`;
  const greeting = name => name ? `<p>Olá ${escapeHtml(name)},</p>` : '<p>Olá,</p>';

  return Object.freeze({
    verification({ name, link, expiresInMinutes = 30 }) {
      const safe = safeLink(link, appUrl, production);
      return { kind: 'email_verification', subject: 'Confirme o endereço de e-mail da sua empresa', ...layout({
        title: 'Confirmação de e-mail', bodyHtml: `${greeting(name)}<p>Confirme que este endereço pode receber mensagens relativas ao pedido de registo da empresa.</p>${button(safe)}<p>Este link expira em ${Number(expiresInMinutes)} minutos. A confirmação não aprova nem ativa a empresa.</p>`,
        bodyText: `Confirme o endereço de e-mail da sua empresa: ${safe}\nO link expira em ${Number(expiresInMinutes)} minutos. A confirmação não aprova nem ativa a empresa.`,
      }) };
    },
    loginNotification({ name, occurredAt, timezone = 'Africa/Luanda', device, browser, recognized = false }) {
      const details = [device, browser].filter(Boolean).map(escapeHtml).join(' · ');
      const state = recognized ? 'acesso reconhecido' : 'novo acesso';
      return { kind: 'login_notification', subject: 'Novo acesso à sua conta Tango', ...layout({
        title: 'Novo acesso à sua conta', bodyHtml: `${greeting(name)}<p>Foi detetado um ${state} em ${escapeHtml(occurredAt)} (${escapeHtml(timezone)}).</p>${details ? `<p>Dispositivo/navegador: ${details}</p>` : ''}<p>Se não reconhece este acesso, contacte o suporte e altere a sua palavra-passe a partir do dispositivo de confiança.</p>`,
        bodyText: `Foi detetado um ${state} em ${occurredAt} (${timezone}).${details ? `\nDispositivo/navegador: ${device} · ${browser}` : ''}\nSe não reconhece o acesso, contacte o suporte.`,
      }) };
    },
    passwordReset({ name, link, expiresInMinutes = 15 }) {
      const safe = safeLink(link, appUrl, production);
      return { kind: 'password_reset', subject: 'Pedido de redefinição da palavra-passe Tango', ...layout({
        title: 'Redefinir palavra-passe', bodyHtml: `${greeting(name)}<p>Foi solicitado um link para redefinir a palavra-passe.</p>${button(safe)}<p>O link expira em ${Number(expiresInMinutes)} minutos e só pode ser utilizado uma vez.</p>`,
        bodyText: `Redefina a palavra-passe: ${safe}\nO link expira em ${Number(expiresInMinutes)} minutos e só pode ser utilizado uma vez.`,
      }) };
    },
    passwordChanged({ name, occurredAt }) {
      return { kind: 'password_changed', subject: 'A palavra-passe da sua conta Tango foi alterada', ...layout({
        title: 'Palavra-passe alterada', bodyHtml: `${greeting(name)}<p>A palavra-passe foi alterada em ${escapeHtml(occurredAt)}.</p><p>Se não reconhece esta alteração, contacte imediatamente o suporte.</p>`,
        bodyText: `A palavra-passe foi alterada em ${occurredAt}. Se não reconhece esta alteração, contacte imediatamente o suporte.`,
      }) };
    },
    suspiciousActivity({ name, occurredAt, summary }) {
      return { kind: 'security_alert', subject: 'Alerta de segurança da sua conta Tango', ...layout({
        title: 'Atividade que merece atenção', bodyHtml: `${greeting(name)}<p>${escapeHtml(summary)}</p><p>Data e hora: ${escapeHtml(occurredAt)}. Se não reconhece esta atividade, contacte o suporte.</p>`,
        bodyText: `${summary}\nData e hora: ${occurredAt}. Se não reconhece esta atividade, contacte o suporte.`,
      }) };
    },
    emailChanged({ name, newEmail, occurredAt }) {
      return { kind: 'email_changed', subject: 'O endereço de e-mail da sua conta Tango foi alterado', ...layout({
        title: 'Endereço de e-mail alterado', bodyHtml: `${greeting(name)}<p>O endereço associado à conta foi alterado para ${escapeHtml(newEmail)} em ${escapeHtml(occurredAt)}.</p><p>Se não reconhece esta alteração, contacte o suporte.</p>`,
        bodyText: `O endereço associado à conta foi alterado para ${newEmail} em ${occurredAt}. Se não reconhece esta alteração, contacte o suporte.`,
      }) };
    },
    adminNotification({ title, summary, link }) {
      const safeTitle = String(title || '').slice(0, 160);
      const safeSummary = String(summary || '').slice(0, 2000);
      const safe = link ? safeLink(link, appUrl, production) : null;
      return { kind: 'admin_notification', subject: `Tango: ${safeTitle}`, ...layout({
        title: safeTitle, bodyHtml: `<p>${escapeHtml(safeSummary)}</p>${safe ? button(safe) : ''}`,
        bodyText: `${safeSummary}${safe ? `\n${safe}` : ''}`,
      }) };
    },
  });
};