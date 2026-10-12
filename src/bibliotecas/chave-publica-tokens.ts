// Chaves públicas Ed25519 que verificam os tokens de licença emitidos pelo servidor (/api/licencas/ativar e
// /api/licencas/heartbeat). A privada vive só no servidor (TANGO_LICENSE_SIGNING_KEY). O `kid` é o início do
// SHA-256 da chave pública e vem no cabeçalho de cada token.
// Se a chave do servidor for substituída, ACRESCENTE a nova aqui (não remova a anterior até os tokens expirarem).
// Para obter a chave actual: GET https://tangogestaoecreditos.tech/api/licencas/chave-publica

export type LicenseTokenPublicKey = { alg: 'EdDSA'; kid: string; publicKey: string };

export const LICENSE_TOKEN_PUBLIC_KEYS: readonly LicenseTokenPublicKey[] = [
    // Servidor de produção (VPS), configurada a 12/10/2026.
    { alg: 'EdDSA', kid: 'b31639325b40e29d', publicKey: 'MCowBQYDK2VwAyEAdFmONQFZ8HSNpp9kv/ce+HfnggkX0jY1/cilISnXyvA=' },
];
