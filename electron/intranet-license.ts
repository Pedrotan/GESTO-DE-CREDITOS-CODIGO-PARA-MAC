import type { CloudLicenseStatus } from './licenca-nuvem.ts';
import { verifyLicenseActivation } from './protecao-seguranca.ts';
import { decodeLicensePayload, validateSignedLicensePayload } from '../src/bibliotecas/payload-licenca.ts';
import { assertLocalServerAccess } from '../src/bibliotecas/intranet-policy.ts';

/** O processo principal confere o módulo num token verificado ou numa licença RSA assinada. */
export function assertIntranetLicense(status: CloudLicenseStatus, legacyKey: string, publicKeys: string[], now = Date.now()) {
    if (status.licenca && status.licenca.plano !== 'trial') {
        assertLocalServerAccess(true, { isValid: status.state === 'active', tier: status.licenca.escalao, features: status.licenca.funcionalidades });
        return;
    }
    const verified = verifyLicenseActivation(legacyKey, 'local-server', publicKeys);
    let legacy: { isValid: boolean; tier: string; features?: Record<string, unknown> } | null = null;
    if (verified.ok) {
        try {
            const envelope = JSON.parse(verified.key.startsWith('{') ? verified.key : Buffer.from(verified.key, 'base64').toString('utf8'));
            const payload = JSON.parse(decodeLicensePayload(envelope.payload));
            const { expiration } = validateSignedLicensePayload(payload, now);
            expiration.setHours(23, 59, 59, 999);
            if (expiration.getTime() >= now) {
                legacy = { isValid: true, tier: payload.tier, features: payload.features && typeof payload.features === 'object' ? payload.features : {} };
            }
        } catch { /* Sem licença antiga válida, aplica-se a licença de demonstração, se existir. */ }
    }
    if (legacy) { assertLocalServerAccess(true, legacy); return; }
    assertLocalServerAccess(true, status.licenca ? { isValid: status.state === 'active', tier: status.licenca.escalao, features: status.licenca.funcionalidades } : null);
}
