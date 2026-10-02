// Pedidos de cadastro de empresas feitos na página pública da versão web.
// O Tango Master consulta-os e decide (via /api/tenants) se cria a empresa.

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected'];

export const ensureRegistrationRequestsTable = async (sql) => {
  await sql(`
    CREATE TABLE IF NOT EXISTS tango_registration_requests (
      id TEXT PRIMARY KEY,
      nif TEXT NOT NULL,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      handled_at TIMESTAMPTZ
    )
  `);
  await sql('CREATE INDEX IF NOT EXISTS idx_tango_registration_requests_status ON tango_registration_requests (status, created_at DESC)');
};

const text = (value, max) => String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, max + 1);

export const normalizeNif = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

/** Valida e normaliza o pedido; devolve { error } com mensagem para o utilizador quando inválido. */
export const parseRegistrationRequest = (body) => {
  const nif = normalizeNif(body?.nif);
  const companyName = text(body?.companyName, 200);
  const contactName = text(body?.contactName, 120);
  const phone = text(body?.phone, 30);
  const email = text(body?.email, 160);
  const message = text(body?.message, 1000);

  if (!/^[0-9A-Z]{9,20}$/u.test(nif)) return { error: 'Indique um NIF ou BI válido.' };
  if (companyName.length < 2 || companyName.length > 200) return { error: 'Indique o nome da empresa.' };
  if (contactName.length < 2 || contactName.length > 120) return { error: 'Indique o nome da pessoa de contacto.' };
  if (!/^[+\d\s()-]{6,30}$/u.test(phone)) return { error: 'Indique um telefone válido.' };
  if (email && (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))) return { error: 'Indique um email válido.' };
  if (message.length > 1000) return { error: 'A mensagem é demasiado longa.' };
  return { value: { nif, companyName, contactName, phone, email: email || null, message: message || null } };
};

export const toPublicRequest = (row) => ({
  id: row.id,
  nif: row.nif,
  companyName: row.company_name,
  contactName: row.contact_name,
  phone: row.phone,
  email: row.email,
  message: row.message,
  status: row.status,
  createdAt: row.created_at,
  handledAt: row.handled_at
});
