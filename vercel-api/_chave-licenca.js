import crypto from 'node:crypto';

// Chave de licença: TANGO-XXXX-XXXX-XXXX-XXXX.
// 15 caracteres aleatórios em base32 sem caracteres confusos (75 bits) + 1 dígito de controlo (Luhn mod 32), que
// apanha um carácter trocado e a maioria das trocas de dois caracteres vizinhos antes de perguntar ao servidor.
// A chave não contém dados (plano, datas): tudo vive no servidor, que guarda apenas o hash.

export const KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const BODY_LENGTH = 15;

const luhnCheckChar = (body) => {
  const n = KEY_ALPHABET.length;
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    let addend = factor * KEY_ALPHABET.indexOf(body[i]);
    addend = Math.floor(addend / n) + (addend % n);
    sum += addend;
    factor = factor === 2 ? 1 : 2;
  }
  return KEY_ALPHABET[(n - (sum % n)) % n];
};

const format = (chars) => `TANGO-${chars.match(/.{4}/g).join('-')}`;

/** Nova chave aleatória (aleatoriedade criptográfica, sem viés de módulo: 256 é múltiplo de 32). */
export const generateLicenseKey = () => {
  const bytes = crypto.randomBytes(BODY_LENGTH);
  const body = Array.from(bytes, byte => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join('');
  return format(body + luhnCheckChar(body));
};

/**
 * Os 16 caracteres da chave, sem o prefixo, traços nem espaços; null quando não é uma chave bem escrita
 * (tamanho, caracteres fora do alfabeto ou dígito de controlo errado).
 */
export const parseLicenseKey = (value) => {
  let chars = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (chars.startsWith('TANGO')) chars = chars.slice(5);
  if (chars.length !== BODY_LENGTH + 1) return null;
  if ([...chars].some(char => !KEY_ALPHABET.includes(char))) return null;
  return luhnCheckChar(chars.slice(0, BODY_LENGTH)) === chars[BODY_LENGTH] ? chars : null;
};

/** Hash guardado no servidor (a chave em claro nunca é guardada). */
export const licenseKeyHash = (chars) => crypto.createHash('sha256').update(`tango-license:${chars}`).digest('hex');

/** Prefixo mostrado no painel para reconhecer a chave, ex.: "TANGO-7KQ2". */
export const licenseKeyPrefix = (chars) => `TANGO-${chars.slice(0, 4)}`;
