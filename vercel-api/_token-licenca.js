import crypto from 'node:crypto';

// Token de licença assinado com Ed25519 (JWS compacto, "alg": "EdDSA").
// A chave privada vive só no servidor, na variável TANGO_LICENSE_SIGNING_KEY (PKCS#8 em PEM ou em base64 DER).
// A chave pública vai embutida no Desktop, que verifica a assinatura sem precisar de Internet.

const b64url = (input) => Buffer.from(input).toString('base64url');
const fromB64url = (input) => Buffer.from(String(input), 'base64url');

/** Lê a chave privada de assinatura; null quando não está configurada ou não é Ed25519. */
export const loadSigningKey = (raw = process.env.TANGO_LICENSE_SIGNING_KEY) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const key = value.includes('BEGIN')
      ? crypto.createPrivateKey(value.replace(/\\n/g, '\n'))
      : crypto.createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' });
    return key.asymmetricKeyType === 'ed25519' ? key : null;
  } catch {
    return null;
  }
};

/** Chave pública (SPKI DER em base64) e o seu identificador (kid), derivados da chave privada. */
export const publicKeyInfo = (privateKey) => {
  const der = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  return {
    alg: 'EdDSA',
    kid: crypto.createHash('sha256').update(der).digest('hex').slice(0, 16),
    publicKey: der.toString('base64'),
  };
};

export const signLicenseToken = (privateKey, claims) => {
  const { kid } = publicKeyInfo(privateKey);
  const header = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = crypto.sign(null, Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
};

/**
 * Verifica a assinatura e devolve as reivindicações; null se a assinatura, o algoritmo ou a chave não batem.
 * Não decide sobre a validade no tempo: quem chama compara `exp` com a hora (e tolera tokens expirados no heartbeat).
 */
export const verifyLicenseToken = (token, publicKeys) => {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    if (header?.alg !== 'EdDSA') return null;
    for (const entry of publicKeys) {
      if (entry.kid && header.kid && entry.kid !== header.kid) continue;
      const key = crypto.createPublicKey({ key: Buffer.from(entry.publicKey, 'base64'), format: 'der', type: 'spki' });
      if (crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, fromB64url(parts[2]))) {
        return JSON.parse(fromB64url(parts[1]).toString('utf8'));
      }
    }
  } catch {
    return null;
  }
  return null;
};
