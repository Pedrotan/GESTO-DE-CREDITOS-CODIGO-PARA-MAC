
// crypto_layer.ts - Wrapper para Web Crypto API e Node Crypto
// Abstrai as operações de assinatura e verificação para facilitar o uso no Frontend e Backend (se necessário via polyfill)

/**
 * Converte uma chave PEM (Base64 com headers) para ArrayBuffer
 */
const pemToArrayBuffer = (pem: string): ArrayBuffer => {
    const b64 = pem.replace(/-----BEGIN [^-]+-----/, '')
        .replace(/-----END [^-]+-----/, '')
        .replace(/[\r\n\s]/g, '');
    const str = atob(b64);
    const buf = new ArrayBuffer(str.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
        view[i] = str.charCodeAt(i);
    }
    return buf;
};

/**
 * Importa uma chave pública RSA
 */
export const importPublicKey = async (pemKey: string): Promise<CryptoKey> => {
    const binaryKey = pemToArrayBuffer(pemKey);
    return await window.crypto.subtle.importKey(
        "spki",
        binaryKey,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
        },
        true,
        ["verify"]
    );
};

/**
 * Verifica assinatura RSA
 * @param data Dados originais em string (JSON stringified)
 * @param signature Assinatura em Base64
 * @param publicKey Chave pública importada
 */
export const verifySignature = async (data: string, signature: string, publicKey: CryptoKey): Promise<boolean> => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const signatureBuffer = pemToArrayBuffer(`-----BEGIN P-----${signature}-----END P-----`); // Reusing pem helper for base64 decode

    return await window.crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        signatureBuffer,
        dataBuffer
    );
};

