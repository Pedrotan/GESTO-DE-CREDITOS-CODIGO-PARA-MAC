// Controlo do crédito pelo Compliance (especificação, secção 7.2): antes de conceder, desembolsar ou reforçar um
// crédito, o sistema aplica uma regra explícita — PERMITIDO, REQUER REVISÃO (autorização de Compliance), PENDENTE
// (resolver primeiro: verificação ou correspondência por decidir) ou BLOQUEADO. Uma falha do screening nunca
// equivale a aprovação. Só impede a operação com a política em modo «bloqueio» (com validação jurídica registada);
// em modo «aviso» mostra o resultado e regista-o, sem impedir.
//
// O mesmo código corre no renderer e no processo principal (Electron), com um leitor de base de dados genérico.

import { CONTROLOS, ROTULO_EFEITO, efeitoDe, lerPoliticaBloqueio, type CodigoControlo, type Efeito, type PoliticaBloqueio } from './politica-bloqueio.ts';
import { estadoScreening, versoesActivasDe, type EntradaInternaRegisto, type EstadoScreening, type ResultadoPessoa, type VersaoListaRegisto } from './screening.ts';
import { situacaoDocumento } from './kyc.ts';

export type DecisaoControlo = 'permitido' | 'requer_revisao' | 'pendente' | 'bloqueado';
export const ROTULO_DECISAO_CONTROLO: Record<DecisaoControlo, string> = {
    permitido: 'Permitido', requer_revisao: 'Requer autorização de Compliance', pendente: 'Pendente de Compliance', bloqueado: 'Bloqueado pelo Compliance',
};

export type AutorizacaoControlo = { id: string; decisao: 'autorizado' | 'recusado'; montanteMaximo: number; validoAte: string; motivos: string[]; autorizadoEm: string };
export type EntradaControlo = {
    hoje: string; politica: PoliticaBloqueio; montante: number;
    kycProcesso: 'pendente' | 'em_verificacao' | 'verificado' | 'recusado' | null;
    documento: 'valido' | 'a_expirar' | 'expirado' | 'sem_data';
    screening: EstadoScreening; pep: boolean; nivelRisco: 'baixo' | 'medio' | 'elevado' | null; avaliacaoPorRever: boolean;
    medidasBloqueio: number; casosAbertos: number; autorizacoes: AutorizacaoControlo[];
};
export type MotivoControlo = { codigo: CodigoControlo; efeito: Efeito; texto: string; autorizado: boolean };
export type ResultadoControlo = {
    decisao: DecisaoControlo; impede: boolean; modo: PoliticaBloqueio['modo']; motivos: MotivoControlo[];
    autorizacao: AutorizacaoControlo | null; porAutorizar: CodigoControlo[];
};

const ORDEM: Record<Efeito, number> = { permitir: 0, rever: 1, pendente: 2, bloquear: 3 };
const DECISAO: Record<Efeito, DecisaoControlo> = { permitir: 'permitido', rever: 'requer_revisao', pendente: 'pendente', bloquear: 'bloqueado' };

export function decidirControlo(e: EntradaControlo): ResultadoControlo {
    const codigos: CodigoControlo[] = [];
    if (e.screening === 'confirmada') codigos.push('sancao_confirmada');
    if (e.medidasBloqueio > 0) codigos.push('medida_bloqueio');
    if (e.kycProcesso === 'recusado') codigos.push('kyc_recusado');
    else if (e.kycProcesso === 'em_verificacao') codigos.push('kyc_em_verificacao');
    else if (e.kycProcesso !== 'verificado') codigos.push('kyc_nao_verificado');
    if (e.screening === 'possivel') codigos.push('screening_possivel');
    else if (e.screening === 'erro') codigos.push('screening_erro');
    else if (e.screening === 'nao_verificado' || e.screening === 'desactualizado') codigos.push('screening_por_fazer');
    if (e.documento === 'expirado') codigos.push('documento_expirado');
    if (e.pep) codigos.push('pep');
    if (e.nivelRisco === 'elevado') codigos.push('risco_elevado');
    if (!e.nivelRisco) codigos.push('sem_avaliacao');
    if (e.avaliacaoPorRever) codigos.push('avaliacao_por_rever');
    if (e.casosAbertos > 0) codigos.push('investigacao_em_curso');

    // Autorização de Compliance válida (a mais recente): recusa = bloqueio; autorização cobre os «rever» indicados.
    const validas = e.autorizacoes.filter(a => a.validoAte.slice(0, 10) >= e.hoje.slice(0, 10)).sort((a, b) => b.autorizadoEm.localeCompare(a.autorizadoEm));
    const ultima = validas[0] || null;
    if (ultima?.decisao === 'recusado') codigos.push('autorizacao_recusada');
    const autorizacao = ultima?.decisao === 'autorizado' && e.montante <= ultima.montanteMaximo ? ultima : null;

    const motivos: MotivoControlo[] = codigos.map(codigo => {
        const efeito = efeitoDe(e.politica, codigo);
        const autorizado = efeito === 'rever' && !!autorizacao && autorizacao.motivos.includes(codigo);
        return { codigo, efeito, texto: CONTROLOS[codigo].titulo, autorizado };
    }).filter(m => m.efeito !== 'permitir');
    const pior = motivos.filter(m => !m.autorizado).reduce<Efeito>((p, m) => (ORDEM[m.efeito] > ORDEM[p] ? m.efeito : p), 'permitir');
    const decisao = DECISAO[pior];
    return {
        decisao, modo: e.politica.modo, impede: e.politica.modo === 'bloqueio' && decisao !== 'permitido', motivos,
        autorizacao: motivos.some(m => m.autorizado) ? autorizacao : null,
        porAutorizar: motivos.filter(m => m.efeito === 'rever' && !m.autorizado).map(m => m.codigo),
    };
}

/** Mensagem para quem tenta a operação (o que falta e a quem pedir). */
export function mensagemControlo(r: ResultadoControlo, operacao: string): string {
    const lista = r.motivos.filter(m => !m.autorizado).map(m => `${m.texto} (${ROTULO_EFEITO[m.efeito]})`).join('; ');
    return `${ROTULO_DECISAO_CONTROLO[r.decisao]}: não é possível ${operacao}. ${lista}. Resolva na ficha de Compliance do cliente ou peça a autorização a um responsável de Compliance.`;
}

// ── Leitura da base de dados (renderer e processo principal) ───────────────────
export type LeitorBd = {
    todos: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
    um: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>;
};
const seguro = async <T>(p: Promise<T>, padrao: T): Promise<T> => { try { return (await p) ?? padrao; } catch { return padrao; } };
const json = <T>(v: string | null | undefined, padrao: T): T => { try { return v ? JSON.parse(v) as T : padrao; } catch { return padrao; } };

/** Reúne o estado de Compliance do cliente para a decisão (tabelas em falta contam como «sem dados»). */
export async function lerEntradaControlo(bd: LeitorBd, clientId: string, montante: number, hoje: string): Promise<EntradaControlo> {
    const [modelo, perfil, cliente, ultimo, decisoes, versoes, interna, medidas, casos, autorizacoes] = await Promise.all([
        seguro(bd.um<{ configuracao: string }>('SELECT configuracao FROM compliance_risco_modelo WHERE activo = 1 ORDER BY versao DESC LIMIT 1'), undefined),
        seguro(bd.um<{ estado_kyc: EntradaControlo['kycProcesso']; pep: number | null; nivel_risco: EntradaControlo['nivelRisco']; avaliacao_id: string | null }>(
            'SELECT estado_kyc, pep, nivel_risco, avaliacao_id FROM compliance_perfil WHERE client_id = ?', [clientId]), undefined),
        seguro(bd.um<{ id: string; nif: string | null; expiryDate: string | null; documentType: string | null; clientType: string | null }>(
            'SELECT id, nif, expiryDate, documentType, clientType FROM clients WHERE id = ?', [clientId]), undefined),
        seguro(bd.um<{ criado_em: string; resultados: string }>('SELECT criado_em, resultados FROM compliance_screening WHERE client_id = ? ORDER BY criado_em DESC LIMIT 1', [clientId]), undefined),
        seguro(bd.todos<{ fonte: string; ref: string; nome_pesquisado: string; decisao: 'falso_positivo' | 'confirmada'; categoria: string | null }>(
            'SELECT fonte, ref, nome_pesquisado, decisao, categoria FROM compliance_screening_decisao WHERE client_id = ?', [clientId]), []),
        seguro(bd.todos<VersaoListaRegisto>('SELECT id, fonte, activa, importada_em, data_lista, hash, total_entradas FROM compliance_lista_versao WHERE activa = 1'), []),
        seguro(bd.todos<EntradaInternaRegisto>('SELECT activa, criado_em, actualizado_em FROM compliance_lista_interna'), []),
        seguro(bd.um<{ n: number }>(`SELECT COUNT(*) AS n FROM compliance_decisao d WHERE d.client_id = ? AND d.tipo = 'medida' AND d.decisao IN ('bloqueio_operacoes', 'encerramento_relacao')
            AND NOT EXISTS (SELECT 1 FROM compliance_bloqueio_levantamento l WHERE l.decisao_id = d.id)`, [clientId]), undefined),
        seguro(bd.um<{ n: number }>("SELECT COUNT(*) AS n FROM compliance_caso WHERE client_id = ? AND estado <> 'encerrado'", [clientId]), undefined),
        seguro(bd.todos<{ id: string; decisao: 'autorizado' | 'recusado'; montante_maximo_minor: number; valido_ate: string; motivos: string; autorizado_em: string }>(
            'SELECT id, decisao, montante_maximo_minor, valido_ate, motivos, autorizado_em FROM compliance_autorizacao WHERE client_id = ?', [clientId]), []),
    ]);
    const politica = lerPoliticaBloqueio(json<{ bloqueios?: PoliticaBloqueio }>(modelo?.configuracao, {}).bloqueios);
    const avaliacao = perfil?.avaliacao_id
        ? await seguro(bd.um<{ requer_revisao: number; revisto_por: string | null }>('SELECT requer_revisao, revisto_por FROM compliance_risco_avaliacao WHERE id = ?', [perfil.avaliacao_id]), undefined)
        : undefined;
    const scr = estadoScreening({
        ultimo: ultimo ? { criadoEm: ultimo.criado_em, resultados: json<ResultadoPessoa[]>(ultimo.resultados, []) } : null,
        decisoes, versoesActivas: versoesActivasDe(versoes, interna),
    });
    const documento = cliente ? situacaoDocumento(cliente, hoje).estado : 'sem_data';
    return {
        hoje, politica, montante,
        kycProcesso: perfil?.estado_kyc ?? null, documento, screening: scr.estado, pep: perfil?.pep === 1 || scr.pepConfirmado,
        nivelRisco: perfil?.nivel_risco ?? null, avaliacaoPorRever: !!avaliacao && avaliacao.requer_revisao === 1 && !avaliacao.revisto_por,
        medidasBloqueio: Number(medidas?.n) || 0, casosAbertos: Number(casos?.n) || 0,
        autorizacoes: autorizacoes.map(a => ({ id: a.id, decisao: a.decisao, montanteMaximo: (Number(a.montante_maximo_minor) || 0) / 100, validoAte: a.valido_ate,
            motivos: json<string[]>(a.motivos, []), autorizadoEm: a.autorizado_em })),
    };
}

/** Avalia o cliente para uma operação de crédito (atalho: ler + decidir). */
export async function avaliarControloCredito(bd: LeitorBd, clientId: string, montante: number, hoje: string): Promise<ResultadoControlo> {
    return decidirControlo(await lerEntradaControlo(bd, clientId, montante, hoje));
}
