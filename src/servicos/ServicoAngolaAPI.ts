/**
 * Consulta de NIF/BI em Electron ou na versão web.
 * No navegador, utiliza uma função server-side da Vercel para evitar CORS
 * e o bloqueio de conteúdo HTTP numa página HTTPS.
 */
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
    source?: string;
    message?: string;
    title?: string;
}

import { detetarGeneroPorNome } from '@/bibliotecas/genero';
import { calcularIdade, normalizarDataISO, inferirProvinciaDoBI } from '@/bibliotecas/formatadores';

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
    };
}

export class ServicoAngolaAPI {
    static async fetchBIData(
        biNumber: string,
        type: 'SINGULAR' | 'COLECTIVO' = 'SINGULAR'
    ): Promise<BIDataResult | null> {
        const document = (biNumber || '').trim().toUpperCase();
        if (document.length < 9) return null;

        try {
            // 1. Em ambiente Electron, utiliza o handler IPC nativo com todos os endpoints
            const electronLookup = (window as any).electronAPI?.lookupBI;
            if (electronLookup) {
                const electronRes = await electronLookup(document, type);
                if (electronRes && electronRes.success) {
                    return sanitizeResult(electronRes, document);
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

            // 3. Fallback para a rota interna / proxy server-side
            const params = new URLSearchParams({ document, type });
            const response = await fetch(`/api/lookup-document?${params.toString()}`, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(10_000)
            });
            const result = await response.json().catch(() => null);
            if (response.ok && result?.success) {
                return sanitizeResult(result, document);
            }
            if (result) {
                return sanitizeResult(result, document);
            }
            return { success: false, name: '', message: `Documento não encontrado nos registos nacionais.` };
        } catch (error: any) {
            console.error(`[ServicoAngolaAPI] Falha na consulta ${type}:`, error);
            return {
                success: false,
                name: '',
                message: error?.name === 'TimeoutError'
                    ? 'O serviço de consulta demorou muito a responder.'
                    : 'Não foi possível consultar o documento neste momento.'
            };
        }
    }
}
