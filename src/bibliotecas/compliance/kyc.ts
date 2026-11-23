// KYC (conhecer o cliente): requisitos de identificação por tipo de cliente e grau de diligência, estado do processo,
// validade do documento e os dados que alimentam o motor de risco. Funções puras (sem base de dados), testadas.
//
// O estado mostrado combina o processo guardado (pendente, em verificação, verificado, recusado) com o que se lê
// do cadastro hoje: um cliente verificado com o documento entretanto expirado ou com dados em falta volta a
// precisar de atenção, sem se apagar a verificação feita.

import { estadoBI, type SituacaoBI } from '../rh/bi-validade.ts';
import type { EntradaRisco } from './motor-risco.ts';

export type EstadoProcessoKyc = 'pendente' | 'em_verificacao' | 'verificado' | 'recusado';
export type EstadoKyc = EstadoProcessoKyc | 'incompleto' | 'expirado';
export type Diligencia = 'simplificada' | 'normal' | 'reforcada';

export const ROTULO_ESTADO_KYC: Record<EstadoKyc, string> = {
    pendente: 'Por verificar', em_verificacao: 'Em verificação', verificado: 'Verificado', recusado: 'Recusado',
    incompleto: 'Incompleto', expirado: 'Documento expirado',
};
export const ROTULO_DILIGENCIA: Record<Diligencia, string> = { simplificada: 'Simplificada', normal: 'Normal', reforcada: 'Reforçada' };

/** Documentos de suporte que o responsável marca como entregues e conferidos. */
export const DOCUMENTOS_SUPORTE = {
    comprovativo_morada: 'Comprovativo de morada',
    comprovativo_rendimentos: 'Comprovativo de rendimentos',
    declaracao_pep: 'Declaração PEP assinada',
    declaracao_origem_fundos: 'Declaração de origem dos fundos',
    certidao_registo_comercial: 'Certidão do registo comercial',
    documento_representante: 'Documento do representante legal',
} as const;
export type DocumentoSuporte = keyof typeof DOCUMENTOS_SUPORTE;

/** Cliente tal como está no cadastro (só os campos usados pelo Compliance). */
export type ClienteKyc = {
    id: string; name?: string | null; nif?: string | null; phone?: string | null; email?: string | null; address?: string | null;
    province?: string | null; municipality?: string | null; birthDate?: string | null; expiryDate?: string | null; issueDate?: string | null;
    documentType?: string | null; clientType?: string | null; clientCategory?: string | null; countryCode?: string | null; nationality?: string | null;
    monthlyIncome?: number | null; workPosition?: string | null; workInstitution?: string | null; employmentSector?: string | null; businessSector?: string | null;
    commercialRegistry?: string | null; legalRepresentative?: string | null; status?: string | null; createdAt?: string | Date | null;
};

/** Perfil de Compliance do cliente (tabela compliance_perfil). */
export type PerfilKyc = {
    profissao?: string | null; entidade_empregadora?: string | null; origem_fundos?: string | null; finalidade_credito?: string | null;
    pep?: number | null; pep_funcao?: string | null; pep_relacao?: string | null; beneficiario_efectivo?: string | null;
    documentos_entregues?: string | null; estado_kyc?: EstadoProcessoKyc | null; proxima_revisao?: string | null; diligencia?: Diligencia | null;
};

export type Requisito = { campo: string; rotulo: string };

/** Pessoa colectiva: tipo «EMPRESA» ou, nos registos antigos sem tipo, NIF de 10 algarismos. */
export const ehEmpresa = (c: ClienteKyc) => c.clientType === 'EMPRESA'
    || (c.clientType !== 'PARTICULAR' && /^\d{10}$/u.test(String(c.nif || '').replace(/[\s.-]/gu, '')));
export const ehEstrangeiro = (c: ClienteKyc) => c.clientCategory === 'ESTRANGEIRO' || c.documentType === 'PASSAPORTE' || (!!c.countryCode && c.countryCode.toUpperCase() !== 'AO');
const temTexto = (v: unknown) => String(v ?? '').trim().length > 0;
const documentoValido = (nif?: string | null) => { const n = String(nif || '').replace(/[^A-Za-z0-9]/gu, '').toUpperCase(); return n.length >= 5 && !n.startsWith('SEM'); };

export function documentosEntregues(perfil: PerfilKyc | null | undefined): DocumentoSuporte[] {
    try {
        const lista = JSON.parse(perfil?.documentos_entregues || '[]');
        return Array.isArray(lista) ? lista.filter((d): d is DocumentoSuporte => d in DOCUMENTOS_SUPORTE) : [];
    } catch { return []; }
}

/**
 * Requisitos KYC em falta. Pessoa singular: nome, documento e validade, data de nascimento, morada, telefone,
 * profissão, rendimento, origem dos fundos e declaração PEP. Empresa: NIF, registo comercial, representante legal,
 * beneficiário efectivo e actividade. A diligência reforçada exige também os comprovativos de morada e rendimentos.
 */
export function requisitosEmFalta(c: ClienteKyc, p: PerfilKyc | null | undefined, diligencia: Diligencia = 'normal'): Requisito[] {
    const falta: Requisito[] = [];
    const empresa = ehEmpresa(c);
    const entregues = documentosEntregues(p);
    if (String(c.name || '').trim().length < 3) falta.push({ campo: 'name', rotulo: 'Nome completo' });
    if (!documentoValido(c.nif)) falta.push({ campo: 'nif', rotulo: empresa ? 'NIF da empresa' : 'Número do documento de identificação' });
    if (!temTexto(c.phone)) falta.push({ campo: 'phone', rotulo: 'Telefone' });
    if (!temTexto(c.address) && !temTexto(c.municipality)) falta.push({ campo: 'address', rotulo: 'Morada' });
    if (empresa) {
        if (!temTexto(c.commercialRegistry)) falta.push({ campo: 'commercialRegistry', rotulo: 'Registo comercial' });
        if (!temTexto(c.legalRepresentative)) falta.push({ campo: 'legalRepresentative', rotulo: 'Representante legal' });
        if (!temTexto(p?.beneficiario_efectivo)) falta.push({ campo: 'beneficiario_efectivo', rotulo: 'Beneficiário efectivo' });
        if (!temTexto(c.businessSector) && !temTexto(p?.profissao)) falta.push({ campo: 'profissao', rotulo: 'Actividade da empresa' });
    } else {
        if (!c.expiryDate) falta.push({ campo: 'expiryDate', rotulo: 'Validade do documento' });
        if (!c.birthDate) falta.push({ campo: 'birthDate', rotulo: 'Data de nascimento' });
        if (!temTexto(p?.profissao) && !temTexto(c.workPosition)) falta.push({ campo: 'profissao', rotulo: 'Profissão' });
        if (!(Number(c.monthlyIncome) > 0)) falta.push({ campo: 'monthlyIncome', rotulo: 'Rendimento mensal' });
    }
    if (!temTexto(p?.origem_fundos)) falta.push({ campo: 'origem_fundos', rotulo: 'Origem dos fundos' });
    if (p?.pep !== 0 && p?.pep !== 1) falta.push({ campo: 'pep', rotulo: 'Declaração PEP' });
    if (p?.pep === 1 && !temTexto(p?.pep_funcao)) falta.push({ campo: 'pep_funcao', rotulo: 'Função pública exercida (PEP)' });
    if (diligencia === 'reforcada') {
        if (!entregues.includes('comprovativo_morada')) falta.push({ campo: 'comprovativo_morada', rotulo: DOCUMENTOS_SUPORTE.comprovativo_morada });
        if (!entregues.includes('comprovativo_rendimentos') && !empresa) falta.push({ campo: 'comprovativo_rendimentos', rotulo: DOCUMENTOS_SUPORTE.comprovativo_rendimentos });
        if (empresa && !entregues.includes('certidao_registo_comercial')) falta.push({ campo: 'certidao_registo_comercial', rotulo: DOCUMENTOS_SUPORTE.certidao_registo_comercial });
        if (p?.pep === 1 && !entregues.includes('declaracao_pep')) falta.push({ campo: 'declaracao_pep', rotulo: DOCUMENTOS_SUPORTE.declaracao_pep });
    }
    return falta;
}

/** Total de requisitos aplicáveis (para a percentagem de completude). */
function totalRequisitos(p: PerfilKyc | null | undefined, diligencia: Diligencia) {
    // 4 comuns (nome, documento, telefone, morada) + 4 próprios do tipo de cliente + origem dos fundos e declaração PEP.
    let total = 10;
    if (p?.pep === 1) total += 1;
    if (diligencia === 'reforcada') total += 2 + (p?.pep === 1 ? 1 : 0);
    return total;
}

/** Situação do documento de identificação (BI ou passaporte), com o texto adaptado ao tipo de documento. */
export function situacaoDocumento(c: ClienteKyc, hoje: string, diasAviso = 60): SituacaoBI {
    if (ehEmpresa(c)) return { estado: 'valido', dias: null, texto: 'Empresa (NIF): sem validade', validade: null };
    const s = estadoBI(c.expiryDate, hoje, diasAviso);
    const nome = c.documentType === 'PASSAPORTE' ? 'Passaporte' : 'Documento';
    return { ...s, texto: s.texto.replace(/\bBI\b/u, nome) };
}

export type AvaliacaoKyc = {
    estado: EstadoKyc; processo: EstadoProcessoKyc; emFalta: Requisito[]; completude: number;
    documento: SituacaoBI; revisaoVencida: boolean; precisaAccao: boolean; diligencia: Diligencia;
};

export function avaliarKyc(c: ClienteKyc, p: PerfilKyc | null | undefined, hoje: string): AvaliacaoKyc {
    const diligencia: Diligencia = p?.diligencia || 'normal';
    const processo: EstadoProcessoKyc = p?.estado_kyc || 'pendente';
    const emFalta = requisitosEmFalta(c, p, diligencia);
    const total = totalRequisitos(p, diligencia);
    const completude = Math.max(0, Math.min(100, Math.round(((total - emFalta.length) / total) * 100)));
    const documento = situacaoDocumento(c, hoje);
    const revisaoVencida = !!p?.proxima_revisao && p.proxima_revisao.slice(0, 10) < hoje.slice(0, 10);
    let estado: EstadoKyc = processo;
    if (processo !== 'recusado') {
        if (documento.estado === 'expirado') estado = 'expirado';
        else if (emFalta.length) estado = 'incompleto';
    }
    const precisaAccao = estado !== 'verificado' || revisaoVencida || documento.estado === 'a_expirar';
    return { estado, processo, emFalta, completude, documento, revisaoVencida, precisaAccao, diligencia };
}

/** NIF/BI mascarado nos ecrãs e nos registos: 4 primeiros + ••••• + 3 últimos. */
export function mascararDocumento(valor: string | null | undefined): string {
    const v = String(valor || '').replace(/\s+/gu, '').toUpperCase();
    if (!v) return '—';
    if (v.length >= 10) return `${v.slice(0, 4)}•••••${v.slice(-3)}`;
    if (v.length >= 6) return `${v.slice(0, 2)}•••${v.slice(-2)}`;
    return '•••••';
}

type CreditoRisco = { clientId: string; status: string; currentBalance?: number | null; principalAmount?: number | null; daysOverdue?: number | null; deletedAt?: unknown };

/** Meses inteiros entre duas datas (aaaa-mm-dd), ou null se a primeira for inválida. */
function mesesEntre(de: string | Date | null | undefined, ate: string) {
    const d = de instanceof Date ? de.toISOString() : String(de || '');
    if (!/^\d{4}-\d{2}-\d{2}/u.test(d)) return null;
    const [a1, m1, d1] = d.slice(0, 10).split('-').map(Number);
    const [a2, m2, d2] = ate.slice(0, 10).split('-').map(Number);
    return Math.max(0, (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** Monta os dados de entrada do motor de risco a partir do cadastro, do perfil KYC e dos créditos do cliente. */
export function entradaRisco(input: {
    cliente: ClienteKyc; perfil: PerfilKyc | null | undefined; creditos: CreditoRisco[]; duplicadosPorRever: string[]; hoje: string;
    /** Estado do screening de PEP e sanções (sem ele, conta como «por fazer»). */
    screening?: { estado: EntradaRisco['screening']; pepConfirmado: boolean };
    /** Alertas da monitorização concluídos como fundamentados. */
    alertasFundamentados?: number;
    suspeitaFundamentada?: boolean;
}): EntradaRisco {
    const { cliente: c, perfil: p, hoje } = input;
    const kyc = avaliarKyc(c, p, hoje);
    const creditos = input.creditos.filter(x => x.clientId === c.id && !x.deletedAt);
    const emCurso = creditos.filter(x => ['active', 'overdue', 'defaulted', 'renegotiated'].includes(x.status));
    const relevantes = creditos.filter(x => ['active', 'overdue', 'defaulted', 'renegotiated', 'pending_approval'].includes(x.status));
    const empresa = ehEmpresa(c);
    return {
        particular: !empresa,
        documento: kyc.documento.estado,
        kycEmFalta: kyc.emFalta.map(r => r.rotulo),
        kycEstado: kyc.processo,
        duplicadosPorRever: input.duplicadosPorRever,
        estrangeiro: ehEstrangeiro(c),
        pais: (c.countryCode || (ehEstrangeiro(c) ? null : 'AO'))?.toUpperCase() || null,
        rendimentoMensal: Number(c.monthlyIncome) > 0 ? Number(c.monthlyIncome) : null,
        origemFundos: p?.origem_fundos || null,
        profissao: p?.profissao || c.workPosition || null,
        sector: c.employmentSector || c.businessSector || null,
        pep: p?.pep === 1 ? true : p?.pep === 0 ? false : null,
        screening: input.screening?.estado ?? 'nao_verificado',
        pepLista: input.screening?.pepConfirmado ?? false,
        alertasFundamentados: input.alertasFundamentados ?? 0,
        suspeitaFundamentada: input.suspeitaFundamentada ?? false,
        exposicao: emCurso.reduce((s, x) => s + Math.max(0, Number(x.currentBalance) || 0), 0),
        creditosActivos: emCurso.length,
        maiorCredito: relevantes.reduce((m, x) => Math.max(m, Number(x.principalAmount) || 0), 0),
        maiorAtrasoDias: creditos.reduce((m, x) => Math.max(m, x.status === 'paid' ? 0 : Number(x.daysOverdue) || 0), 0),
        creditoIncumprido: creditos.some(x => x.status === 'defaulted'),
        clienteBloqueado: c.status === 'blocked',
        antiguidadeMeses: mesesEntre(c.createdAt, hoje),
    };
}
