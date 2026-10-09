export const LINKS_OFICIAIS_DOCUMENTOS = {
    PORTAL_CONTRIBUINTE: 'https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte',
    SEPE_CONSULTA_NIF: 'https://sepe.gov.ao/catalogo/eservicos/consulta-de-nif',
} as const;

/**
 * Abre o portal oficial de consulta de documentos de Angola no navegador externo.
 */
export function abrirPortalOficial(tipo: 'MINFIN' | 'SEPE'): void {
    const url = tipo === 'MINFIN'
        ? LINKS_OFICIAIS_DOCUMENTOS.PORTAL_CONTRIBUINTE
        : LINKS_OFICIAIS_DOCUMENTOS.SEPE_CONSULTA_NIF;

    if (typeof window !== 'undefined') {
        const electronOpen = (window as any).electronAPI?.openExternal;
        if (typeof electronOpen === 'function') {
            electronOpen(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }
}

export interface BIDataResult {
    success: boolean;
    name: string;
    address?: string;
    birthDate?: string;
    age?: number;
    issueDate?: string;
    expiryDate?: string;
    gender?: string;
    maritalStatus?: string;
    fatherName?: string;
    motherName?: string;
    taxRegime?: string;
    taxPayerType?: string;
    status?: string;
    /** "Inadimplente" no Portal do Contribuinte (MINFIN). */
    defaulter?: boolean;
    source?: string;
    message?: string;
    title?: string;
    officialLinks?: {
        minfin: string;
        sepe: string;
    };
}

import { detetarGeneroPorNome } from '../bibliotecas/genero.ts';
import { calcularIdade, normalizarDataISO, inferirProvinciaDoBI } from '../bibliotecas/formatadores.ts';

function normalizeGender(raw: any): string {
    if (!raw) return "";
    const g = String(raw).trim().toUpperCase();
    if (g.startsWith("M") || g.includes("MASC") || g === "HOMEM" || g === "H") return "M";
    if (g.startsWith("F") || g.includes("FEM") || g === "MULHER") return "F";
    if (g === "OUTRO" || g === "OTHER") return "Outro";
    return g;
}

function normalizeMarital(raw: any): string {
    if (!raw) return "";
    const s = String(raw).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (s.includes("SOLTEIR")) return "SOLTEIRO";
    if (s.includes("CASAD")) return "CASADO";
    if (s.includes("DIVORC")) return "DIVORCIADO";
    if (s.includes("VIUV")) return "VIUVO";
    if (s.includes("UNIAO") || s.includes("FACTO")) return "UNIAO_DE_FACTO";
    return s;
}

function sanitizeResult(res: any, document?: string): BIDataResult {
    if (!res || !res.success) return res;
    const rawBirth = res.birthDate || res.data_nascimento || res.birth_date;
    const birthDate = normalizarDataISO(rawBirth) || undefined;
    const age = (res.age !== undefined && res.age !== null && Number(res.age) > 0)
        ? Number(res.age)
        : (birthDate ? (calcularIdade(birthDate) ?? undefined) : undefined);

    const name = String(res.name || res.nome || "").trim().toUpperCase();
    const gender = normalizeGender(res.gender || res.sexo) || (name ? (detetarGeneroPorNome(name) ?? undefined) : undefined);
    const address = res.address ? String(res.address).trim() : (document ? inferirProvinciaDoBI(document) || undefined : undefined);

    return {
        ...res,
        name,
        birthDate,
        age,
        gender,
        maritalStatus: normalizeMarital(res.maritalStatus || res.estado_civil) || undefined,
        issueDate: normalizarDataISO(res.issueDate || res.data_emissao) || undefined,
        expiryDate: normalizarDataISO(res.expiryDate || res.data_validade) || undefined,
        address,
        taxRegime: res.taxRegime || undefined,
        taxPayerType: res.taxPayerType || undefined,
        status: res.status || undefined,
        defaulter: typeof res.defaulter === 'boolean' ? res.defaulter : undefined,
        officialLinks: res.officialLinks || {
            minfin: LINKS_OFICIAIS_DOCUMENTOS.PORTAL_CONTRIBUINTE,
            sepe: LINKS_OFICIAIS_DOCUMENTOS.SEPE_CONSULTA_NIF,
        },
    };
}

const NOT_FOUND_MESSAGE = 'O documento não foi encontrado nos serviços de consulta. Confirme o número ou preencha os dados manualmente a partir do documento.';
const UNAVAILABLE_MESSAGE = 'Não foi possível obter os dados automaticamente neste momento. Preencha os dados manualmente a partir do documento do cliente; pode confirmá-los nos portais oficiais (MINFIN ou SEPE) indicados abaixo do campo.';

export class ServicoAngolaAPI {
    static async fetchBIData(
        biNumber: string,
        type: 'SINGULAR' | 'COLECTIVO' = 'SINGULAR',
        server?: { url: string; secret: string }
    ): Promise<BIDataResult | null> {
        const document = (biNumber || '').trim().toUpperCase().replace(/\s+/g, '');
        if (document.length < 9) return null;

        // O Master usa primeiro o servidor: as chaves dos fornecedores permanecem no backend.
        const tenantId = typeof localStorage !== 'undefined' ? localStorage.getItem('tango_active_tenant_id') : null;
        const tenantCode = typeof localStorage !== 'undefined' ? localStorage.getItem('tango_active_tenant_code') : null;
        const lookupServer = server?.url || (typeof window !== 'undefined' && window.location.protocol.startsWith('http') ? window.location.origin : 'https://tangogestaoecreditos.tech');
        if ((server?.url && server.secret) || (tenantId && tenantCode)) {
            try {
                const params = new URLSearchParams({ document, type });
                const response = await fetch(lookupServer.trim().replace(/\/+$/, '') + '/api/lookup-document?' + params, {
                    headers: { Accept: 'application/json',
                        ...(server?.secret ? { Authorization: 'Bearer ' + server.secret.trim() } :
                            { 'x-tenant-id': tenantId!, 'x-sync-passkey': tenantCode! }) },
                    signal: AbortSignal.timeout(12_000)
                });
                const result = await response.json().catch(() => null);
                if (result?.success && response.ok) return sanitizeResult(result, document);
                // Documento inexistente é uma resposta definitiva; fornecedor por configurar ou indisponível
                // não é: segue para as restantes fontes (consulta nativa do desktop e serviços públicos).
                if (result?.code === 'DOCUMENT_NOT_FOUND') return { ...result, success: false, name: '', message: NOT_FOUND_MESSAGE };
            } catch {
                // Servidor inacessível: tenta as restantes fontes.
            }
        }
        try {
            // 1. Em ambiente Electron, utiliza o handler IPC nativo com todos os endpoints
            const electronLookup = typeof window !== 'undefined' ? (window as any).electronAPI?.lookupBI : undefined;
            if (electronLookup) {
                try {
                    const electronRes = await electronLookup(document, type);
                    if (electronRes && electronRes.success) {
                        return sanitizeResult(electronRes, document);
                    }
                } catch (err) {
                    // Uma falha no canal nativo não deve impedir as restantes fontes de consulta.
                    console.warn('[ServicoAngolaAPI] Consulta nativa falhou:', err);
                }
            }

            // 2. Consulta direta às APIs públicas com suporte CORS no navegador
            const encoded = encodeURIComponent(document);
            const directEndpoints = type === 'COLECTIVO'
                ? [
                    { url: `https://consulta.edgarsingui.ao/consultar/${encoded}/nif`, source: 'Consulta NIF Angola (Edgar Singui)' },
                    { url: `https://consulta.edgarsingui.ao/consultar/${encoded}`, source: 'Consulta NIF Angola' },
                    { url: `https://angolaapi.onrender.com/api/v1/validate/nif/${encoded}`, source: 'Angola API' }
                ]
                : [
                    { url: `https://joaotomas.elprimesolution.com/api/gateway/consulta-bi/consultar/${encoded}`, source: 'João Tomás API (El Prime Solution)' },
                    { url: `https://joaotomas.elprimesolution.com/api/consulta-bi/${encoded}`, source: 'João Tomás API' },
                    { url: `https://consulta.edgarsingui.ao/consultar/${encoded}/bilhete`, source: 'Consulta BI Angola (Edgar Singui)' },
                    { url: `https://consulta.edgarsingui.ao/consultar/${encoded}`, source: 'Consulta BI Angola' },
                    { url: `https://angolaapi.onrender.com/api/v1/validate/bi/${encoded}`, source: 'Angola API' }
                ];

            for (const ep of directEndpoints) {
                try {
                    const res = await fetch(ep.url, {
                        headers: { Accept: 'application/json' },
                        signal: AbortSignal.timeout(6_000)
                    });
                    if (res.ok) {
                        const json = await res.json().catch(() => null);
                        if (json && !json.error && json.error !== true && json.success !== false) {
                            const dataObj = json.data && typeof json.data === 'object' && !Array.isArray(json.data)
                                ? { ...json, ...json.data }
                                : json;

                            const foundName = dataObj.name || dataObj.nome || dataObj.razao_social || dataObj.designacao || dataObj.full_name || dataObj.titular;
                            if (foundName && String(foundName).trim()) {
                                return sanitizeResult({
                                    success: true,
                                    name: String(foundName).trim(),
                                    address: dataObj.endereco || dataObj.morada || dataObj.address || dataObj.bairro || dataObj.municipio,
                                    birthDate: dataObj.data_de_nascimento || dataObj.data_nascimento || dataObj.birth_date || dataObj.birthDate,
                                    gender: dataObj.genero || dataObj.sexo || dataObj.gender,
                                    maritalStatus: dataObj.estado_civil || dataObj.marital_status || dataObj.maritalStatus,
                                    issueDate: dataObj.data_emissao || dataObj.issue_date || dataObj.issueDate,
                                    expiryDate: dataObj.data_validade || dataObj.expiry_date || dataObj.expiryDate,
                                    source: ep.source
                                }, document);
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`[ServicoAngolaAPI] Tentativa falhou em ${ep.url}:`, err);
                }
            }

            // 3. Fallback para a rota server-side: no Master usa o servidor configurado e a chave mestra;
            // fora de uma origem http (Electron em file://) não existe rota relativa.
            const base = server?.url.trim().replace(/\/+$/, '')
                || (typeof window !== 'undefined' && window.location?.protocol.startsWith('http') ? '' : null);
            if (base !== null) {
                const params = new URLSearchParams({ document, type });
                const response = await fetch(`${base}/api/lookup-document?${params.toString()}`, {
                    headers: {
                        Accept: 'application/json',
                        ...(server?.secret ? { Authorization: `Bearer ${server.secret.trim()}` } : {})
                    },
                    signal: AbortSignal.timeout(10_000)
                });
                const result = await response.json().catch(() => null);
                if (response.ok && result?.success) {
                    return sanitizeResult(result, document);
                }
            }
            return {
                success: false,
                name: '',
                message: UNAVAILABLE_MESSAGE,
                officialLinks: {
                    minfin: LINKS_OFICIAIS_DOCUMENTOS.PORTAL_CONTRIBUINTE,
                    sepe: LINKS_OFICIAIS_DOCUMENTOS.SEPE_CONSULTA_NIF,
                }
            };
        } catch (error: any) {
            console.error(`[ServicoAngolaAPI] Falha na consulta ${type}:`, error);
            return {
                success: false,
                name: '',
                message: error?.name === 'TimeoutError'
                    ? 'O serviço de consulta demorou muito a responder. ' + UNAVAILABLE_MESSAGE
                    : UNAVAILABLE_MESSAGE,
                officialLinks: {
                    minfin: LINKS_OFICIAIS_DOCUMENTOS.PORTAL_CONTRIBUINTE,
                    sepe: LINKS_OFICIAIS_DOCUMENTOS.SEPE_CONSULTA_NIF,
                }
            };
        }
    }
}
