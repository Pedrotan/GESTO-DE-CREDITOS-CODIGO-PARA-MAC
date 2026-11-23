// Compliance (fase 1): perfil KYC do cliente, verificações de identidade com decisão por outra pessoa, avaliações de
// risco versionadas com revisão humana, revisão de possíveis duplicados e versões do modelo de risco.
// Cada escrita vai numa transacção com o registo de auditoria. As regras de imutabilidade e dos quatro olhos estão
// também na base de dados (triggers) e no processo principal (permissão e autor de cada comando).
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { isPrimaryOwner } from '@/bibliotecas/conta-principal';
import type { User } from '@/tipos/autenticacao';
import {
    calcularRisco, diligenciaDoNivel, lerConfiguracao, proximaRevisao, validarConfiguracao, ROTULO_NIVEL,
    type ConfiguracaoRisco, type NivelRisco, type RegraDisparada, type ResultadoFactor,
} from '@/bibliotecas/compliance/motor-risco';
import { DOCUMENTOS_SUPORTE, avaliarKyc, ehEmpresa, entradaRisco, mascararDocumento, type ClienteKyc, type Diligencia, type EstadoProcessoKyc } from '@/bibliotecas/compliance/kyc';
import { ROTULO_DECISAO_DUPLICADO, ROTULO_MOTIVO, type DecisaoDuplicado, type GrupoDuplicado } from '@/bibliotecas/compliance/duplicados';
import {
    SQL_AVALIACAO_REGISTAR, SQL_AVALIACAO_REVER, SQL_DUPLICADO_REVER, SQL_KYC_DECIDIR, SQL_KYC_REGISTAR, SQL_MODELO_CRIAR, SQL_MODELO_DESACTIVAR,
    SQL_PERFIL_CRIAR, SQL_PERFIL_DADOS, SQL_PERFIL_EM_VERIFICACAO, SQL_PERFIL_KYC_DECIDIDO, SQL_PERFIL_NIVEL_REVISTO, SQL_PERFIL_RISCO,
    type PermissaoCompliance,
} from '@/bibliotecas/compliance/permissoes-compliance';

export type ActorCompliance = { id: string; name: string; role?: string; permissions?: string[]; isOwner?: unknown };
type Statement = { sql: string; params?: unknown[]; expectChanges?: number };

export type PerfilCompliance = {
    id: string; client_id: string; profissao: string | null; entidade_empregadora: string | null; origem_fundos: string | null; finalidade_credito: string | null;
    pep: number | null; pep_funcao: string | null; pep_relacao: 'proprio' | 'familiar' | 'associado' | null; beneficiario_efectivo: string | null;
    documentos_entregues: string | null; observacoes: string | null; estado_kyc: EstadoProcessoKyc;
    kyc_verificado_em: string | null; kyc_verificado_por: string | null; kyc_verificado_por_nome: string | null;
    nivel_risco: NivelRisco | null; pontuacao_risco: number | null; diligencia: Diligencia | null; avaliacao_id: string | null; proxima_revisao: string | null;
    criado_em: string; actualizado_em: string | null; actualizado_por_nome: string | null;
};
export type TipoVerificacao = 'inicial' | 'actualizacao' | 'periodica' | 'reforcada';
export type FonteVerificacao = 'presencial' | 'documento_original' | 'copia_certificada' | 'consulta_online' | 'declaracao';
export type VerificacaoKyc = {
    id: string; client_id: string; tipo: TipoVerificacao; documento_tipo: string; documento_ref: string | null; documento_emissor: string | null;
    documento_validade: string | null; fonte: FonteVerificacao; controlos: string | null; notas: string | null; estado: 'pendente' | 'verificado' | 'recusado';
    registado_por: string | null; registado_por_nome: string | null; registado_em: string;
    decidido_por: string | null; decidido_por_nome: string | null; decidido_em: string | null; motivo_decisao: string | null;
};
export type AvaliacaoRisco = {
    id: string; client_id: string; modelo_id: string; modelo_versao: number; tipo: 'inicial' | 'reavaliacao' | 'periodica' | 'evento'; motivo: string | null;
    pontuacao: number; pontuacao_ponderada: number; nivel: NivelRisco; decisao: string; requer_revisao: number;
    factores: string; regras: string; dados: string | null; criado_em: string; criado_por: string | null; criado_por_nome: string | null;
    revisto_por: string | null; revisto_por_nome: string | null; revisto_em: string | null; revisao_decisao: 'confirmada' | 'alterada' | null;
    nivel_final: NivelRisco | null; revisao_parecer: string | null;
};
export type ModeloRisco = { id: string; versao: number; nome: string; configuracao: string; activo: number; notas: string | null; criado_em: string; criado_por_nome: string | null };
export type RevisaoDuplicado = { id: string; chave: string; motivo: string; clientes: string; decisao: DecisaoDuplicado; justificacao: string; decidido_por_nome: string | null; decidido_em: string };

export type DadosCompliance = {
    perfis: PerfilCompliance[]; verificacoes: VerificacaoKyc[]; avaliacoes: AvaliacaoRisco[]; modelos: ModeloRisco[]; revisoes: RevisaoDuplicado[];
};

export const ROTULO_TIPO_VERIFICACAO: Record<TipoVerificacao, string> = {
    inicial: 'Inicial', actualizacao: 'Actualização de dados', periodica: 'Revisão periódica', reforcada: 'Diligência reforçada',
};
export const ROTULO_FONTE: Record<FonteVerificacao, string> = {
    presencial: 'Presencial (cliente e documento original)', documento_original: 'Documento original apresentado', copia_certificada: 'Cópia certificada',
    consulta_online: 'Consulta online autorizada', declaracao: 'Declaração do cliente',
};
export const CONTROLOS_VERIFICACAO = {
    documento_original_visto: 'Documento original visto',
    foto_confere: 'A fotografia confere com a pessoa',
    dados_conferem: 'Nome, número e datas conferem com o cadastro',
    validade_confirmada: 'Validade do documento confirmada',
    morada_confirmada: 'Morada confirmada',
} as const;

/** Decisões que esclarecem o grupo (pessoas diferentes): o grupo deixa de contar como sinal de risco. */
export const DECISOES_ESCLARECIDAS: DecisaoDuplicado[] = ['homonimo', 'familia_partilha'];

const SQL_AUDITORIA = `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, 'compliance', ?, ?, ?, ?)`;
const auditoria = (actor: ActorCompliance, action: string, details: string, metadata: Record<string, unknown>, anterior?: unknown, novo?: unknown, when = new Date().toISOString()): Statement => ({
    sql: SQL_AUDITORIA,
    params: [crypto.randomUUID(), when, actor.id, actor.name, action, details,
        anterior === undefined ? null : JSON.stringify(anterior), novo === undefined ? null : JSON.stringify(novo), JSON.stringify(metadata)],
});

const texto = (v: unknown) => { const t = String(v ?? '').trim(); return t ? t : null; };
const lista = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);

/** Pode exercer a permissão? (a conta principal e o Super Administrador podem sempre). */
export const podeCompliance = (actor: ActorCompliance | null | undefined, permissao: PermissaoCompliance) =>
    !!actor && ServicoControloAcesso.temPermissao(actor as Partial<User>, permissao);
const exigir = (actor: ActorCompliance, permissao: PermissaoCompliance, accao: string) => {
    if (!podeCompliance(actor, permissao)) throw new Error(`Sem permissão para ${accao}.`);
};
const ehSuperior = (actor: ActorCompliance) => actor.role === 'super_admin' || isPrimaryOwner(actor);

export const lerJson = <T>(valor: string | null | undefined, padrao: T): T => { try { return valor ? JSON.parse(valor) as T : padrao; } catch { return padrao; } };

export class ServicoCompliance {
    static async carregar(): Promise<DadosCompliance> {
        const [perfis, verificacoes, avaliacoes, modelos, revisoes] = await Promise.all([
            lista(db.query<PerfilCompliance>('SELECT * FROM compliance_perfil')),
            lista(db.query<VerificacaoKyc>('SELECT * FROM compliance_kyc_verificacao ORDER BY registado_em DESC')),
            lista(db.query<AvaliacaoRisco>('SELECT * FROM compliance_risco_avaliacao ORDER BY criado_em DESC')),
            lista(db.query<ModeloRisco>('SELECT * FROM compliance_risco_modelo ORDER BY versao DESC, criado_em DESC')),
            lista(db.query<RevisaoDuplicado>('SELECT * FROM compliance_duplicado_revisao ORDER BY decidido_em DESC')),
        ]);
        return { perfis, verificacoes, avaliacoes, modelos, revisoes };
    }

    /** Versão activa do modelo de risco (a mais recente marcada como activa). */
    static modeloActivo(modelos: ModeloRisco[]): ModeloRisco | null {
        return modelos.find(m => m.activo === 1) || null;
    }

    // ── Perfil KYC ────────────────────────────────────────────────────────────────
    static async guardarPerfil(cliente: ClienteKyc, anterior: PerfilCompliance | null, dados: Partial<PerfilCompliance> & { documentos?: string[] }, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'alterar o perfil de Compliance');
        const pep = dados.pep === 1 ? 1 : dados.pep === 0 ? 0 : null;
        if (pep === 1 && !texto(dados.pep_funcao)) throw new Error('Indique a função pública exercida pela pessoa politicamente exposta.');
        const relacao = pep === 1 && ['proprio', 'familiar', 'associado'].includes(String(dados.pep_relacao)) ? dados.pep_relacao! : null;
        const documentos = (dados.documentos || []).filter(d => d in DOCUMENTOS_SUPORTE);
        const novo = {
            profissao: texto(dados.profissao), entidade_empregadora: texto(dados.entidade_empregadora), origem_fundos: texto(dados.origem_fundos),
            finalidade_credito: texto(dados.finalidade_credito), pep, pep_funcao: pep === 1 ? texto(dados.pep_funcao) : null, pep_relacao: relacao,
            beneficiario_efectivo: ehEmpresa(cliente) ? texto(dados.beneficiario_efectivo) : null,
            documentos_entregues: JSON.stringify(documentos), observacoes: texto(dados.observacoes),
        };
        const when = new Date().toISOString();
        const antes = anterior ? {
            profissao: anterior.profissao, entidade_empregadora: anterior.entidade_empregadora, origem_fundos: anterior.origem_fundos, finalidade_credito: anterior.finalidade_credito,
            pep: anterior.pep, pep_funcao: anterior.pep_funcao, pep_relacao: anterior.pep_relacao, beneficiario_efectivo: anterior.beneficiario_efectivo,
            documentos_entregues: anterior.documentos_entregues, observacoes: anterior.observacoes,
        } : undefined;
        await db.transaction([
            { sql: SQL_PERFIL_CRIAR, params: [cliente.id, cliente.id, when, actor.id] },
            { sql: SQL_PERFIL_DADOS, params: [novo.profissao, novo.entidade_empregadora, novo.origem_fundos, novo.finalidade_credito, novo.pep, novo.pep_funcao,
                novo.pep_relacao, novo.beneficiario_efectivo, novo.documentos_entregues, novo.observacoes, actor.id, actor.name, when, cliente.id], expectChanges: 1 },
            auditoria(actor, anterior ? 'update' : 'create', `Actualizou o perfil KYC de ${cliente.name || cliente.id}`, { clientId: cliente.id, modulo: 'kyc' }, antes, novo, when),
        ]);
    }

    // ── Verificações KYC ──────────────────────────────────────────────────────────
    static async registarVerificacao(cliente: ClienteKyc, verificacoes: VerificacaoKyc[], dados: {
        tipo: TipoVerificacao; fonte: FonteVerificacao; emissor?: string; controlos: string[]; notas?: string;
    }, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'registar verificações KYC');
        if (verificacoes.some(v => v.client_id === cliente.id && v.estado === 'pendente')) throw new Error('Já existe uma verificação por decidir para este cliente.');
        if (!(dados.tipo in ROTULO_TIPO_VERIFICACAO) || !(dados.fonte in ROTULO_FONTE)) throw new Error('Indique o tipo e a fonte da verificação.');
        const controlos = dados.controlos.filter(c => c in CONTROLOS_VERIFICACAO);
        if (!controlos.length) throw new Error('Marque os controlos efectuados na verificação.');
        const empresa = ehEmpresa(cliente);
        const documentoTipo = empresa ? 'NIF' : cliente.documentType === 'PASSAPORTE' ? 'PASSAPORTE' : 'BI';
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_PERFIL_CRIAR, params: [cliente.id, cliente.id, when, actor.id] },
            { sql: SQL_KYC_REGISTAR, params: [id, cliente.id, dados.tipo, documentoTipo, mascararDocumento(cliente.nif), texto(dados.emissor),
                empresa ? null : (cliente.expiryDate || null), dados.fonte, JSON.stringify(controlos), texto(dados.notas), actor.id, actor.name, when], expectChanges: 1 },
            { sql: SQL_PERFIL_EM_VERIFICACAO, params: [actor.id, actor.name, when, cliente.id] },
            auditoria(actor, 'create', `Registou a verificação KYC (${ROTULO_TIPO_VERIFICACAO[dados.tipo].toLowerCase()}) de ${cliente.name || cliente.id}`,
                { clientId: cliente.id, verificacaoId: id, fonte: dados.fonte, controlos }, undefined, undefined, when),
        ]);
        return id;
    }

    static async decidirVerificacao(cliente: ClienteKyc, v: VerificacaoKyc, decisao: 'verificado' | 'recusado', motivo: string, actor: ActorCompliance) {
        exigir(actor, 'compliance_approve', 'decidir verificações KYC');
        if (v.estado !== 'pendente') throw new Error('Esta verificação já foi decidida.');
        if (v.registado_por === actor.id && !ehSuperior(actor)) throw new Error('Quem registou a verificação não a pode decidir: tem de ser outro responsável.');
        const fundamento = texto(motivo);
        if (decisao === 'recusado' && (!fundamento || fundamento.length < 10)) throw new Error('Indique o motivo da recusa (pelo menos 10 caracteres).');
        if (decisao === 'verificado' && avaliarKyc(cliente, null, luandaTodayKey()).documento.estado === 'expirado') {
            throw new Error('O documento de identificação está expirado: actualize-o no cadastro antes de o dar por verificado.');
        }
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_KYC_DECIDIR, params: [decisao, actor.id, actor.name, when, fundamento, v.id], expectChanges: 1 },
            { sql: SQL_PERFIL_KYC_DECIDIDO, params: [decisao, when, actor.id, actor.name, when, cliente.id], expectChanges: 1 },
            auditoria(actor, decisao === 'verificado' ? 'approve' : 'reject', `${decisao === 'verificado' ? 'Confirmou' : 'Recusou'} a verificação KYC de ${cliente.name || cliente.id}`,
                { clientId: cliente.id, verificacaoId: v.id, motivo: fundamento }, { estado: 'pendente' }, { estado: decisao }, when),
        ]);
    }

    // ── Avaliação de risco ────────────────────────────────────────────────────────
    static async avaliarRisco(input: {
        cliente: ClienteKyc; perfil: PerfilCompliance | null; creditos: Parameters<typeof entradaRisco>[0]['creditos']; duplicadosPorRever: string[];
        modelo: ModeloRisco | null; tipo: AvaliacaoRisco['tipo']; motivo?: string;
        screening?: Parameters<typeof entradaRisco>[0]['screening'];
        alertasFundamentados?: number;
        suspeitaFundamentada?: boolean;
    }, actor: ActorCompliance) {
        exigir(actor, 'compliance_manage', 'avaliar o risco de clientes');
        if (!input.modelo) throw new Error('Não há nenhuma versão activa do modelo de risco.');
        const config = lerConfiguracao(input.modelo.configuracao);
        const hoje = luandaTodayKey();
        const entrada = entradaRisco({ cliente: input.cliente, perfil: input.perfil, creditos: input.creditos, duplicadosPorRever: input.duplicadosPorRever, hoje, screening: input.screening, alertasFundamentados: input.alertasFundamentados, suspeitaFundamentada: input.suspeitaFundamentada });
        const r = calcularRisco(entrada, config);
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        const revisao = proximaRevisao(hoje, r.nivel, config);
        await db.transaction([
            { sql: SQL_PERFIL_CRIAR, params: [input.cliente.id, input.cliente.id, when, actor.id] },
            { sql: SQL_AVALIACAO_REGISTAR, params: [id, input.cliente.id, input.modelo.id, input.modelo.versao, input.tipo, texto(input.motivo), r.pontuacao, r.pontuacaoPonderada,
                r.nivel, r.decisao, r.requerRevisao ? 1 : 0, JSON.stringify(r.factores), JSON.stringify(r.regras), JSON.stringify(entrada), when, actor.id, actor.name], expectChanges: 1 },
            { sql: SQL_PERFIL_RISCO, params: [r.nivel, r.pontuacao, diligenciaDoNivel(r.nivel), id, revisao, when, actor.id, actor.name, input.cliente.id], expectChanges: 1 },
            auditoria(actor, 'create', `Avaliou o risco de ${input.cliente.name || input.cliente.id}: ${ROTULO_NIVEL[r.nivel]} (${r.pontuacao}/100)`,
                { clientId: input.cliente.id, avaliacaoId: id, modeloVersao: input.modelo.versao, regras: r.regras.map(x => x.id) }, undefined, { nivel: r.nivel, pontuacao: r.pontuacao }, when),
        ]);
        return { id, ...r, proximaRevisao: revisao };
    }

    static async reverAvaliacao(cliente: ClienteKyc, av: AvaliacaoRisco, modelo: ModeloRisco | null, dados: { nivelFinal: NivelRisco; parecer: string }, actor: ActorCompliance) {
        exigir(actor, 'compliance_approve', 'rever avaliações de risco');
        if (av.revisto_por) throw new Error('Esta avaliação já foi revista.');
        if (av.criado_por === actor.id && !ehSuperior(actor)) throw new Error('Quem pediu a avaliação não a pode rever: tem de ser outro responsável.');
        const parecer = texto(dados.parecer);
        if (!parecer || parecer.length < 10) throw new Error('Escreva o parecer da revisão (pelo menos 10 caracteres).');
        const regras = lerJson<RegraDisparada[]>(av.regras, []);
        const ordem: Record<NivelRisco, number> = { baixo: 0, medio: 1, elevado: 2 };
        const imposta = regras.filter(r => r.nivelMinimo && ordem[r.nivelMinimo] > ordem[dados.nivelFinal]);
        if (imposta.length) throw new Error(`Não é possível baixar para ${ROTULO_NIVEL[dados.nivelFinal].toLowerCase()}: a regra «${imposta[0].descricao}» impõe o nível ${ROTULO_NIVEL[imposta[0].nivelMinimo!].toLowerCase()}.`);
        const decisao = dados.nivelFinal === av.nivel ? 'confirmada' : 'alterada';
        const config = lerConfiguracao(modelo?.configuracao);
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_AVALIACAO_REVER, params: [actor.id, actor.name, when, decisao, dados.nivelFinal, parecer, av.id], expectChanges: 1 },
            { sql: SQL_PERFIL_NIVEL_REVISTO, params: [dados.nivelFinal, diligenciaDoNivel(dados.nivelFinal), proximaRevisao(luandaTodayKey(), dados.nivelFinal, config), when, actor.id, actor.name, cliente.id, av.id] },
            auditoria(actor, 'approve', `${decisao === 'confirmada' ? 'Confirmou' : 'Alterou'} a avaliação de risco de ${cliente.name || cliente.id} (${ROTULO_NIVEL[av.nivel]} → ${ROTULO_NIVEL[dados.nivelFinal]})`,
                { clientId: cliente.id, avaliacaoId: av.id, parecer }, { nivel: av.nivel }, { nivel: dados.nivelFinal }, when),
        ]);
    }

    // ── Duplicados ────────────────────────────────────────────────────────────────
    static async reverDuplicado(grupo: GrupoDuplicado, nomes: string[], decisao: DecisaoDuplicado, justificacao: string, actor: ActorCompliance) {
        exigir(actor, 'compliance_approve', 'rever possíveis duplicados');
        if (!(decisao in ROTULO_DECISAO_DUPLICADO)) throw new Error('Escolha a conclusão da revisão.');
        const fundamento = texto(justificacao);
        if (!fundamento || fundamento.length < 10) throw new Error('Justifique a conclusão (pelo menos 10 caracteres).');
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_DUPLICADO_REVER, params: [id, grupo.chave, grupo.motivo, JSON.stringify(grupo.clientes), decisao, fundamento, actor.id, actor.name, when], expectChanges: 1 },
            auditoria(actor, 'approve', `Reviu possível duplicado (${ROTULO_MOTIVO[grupo.motivo]}): ${nomes.join(', ')} — ${ROTULO_DECISAO_DUPLICADO[decisao]}`,
                { chave: grupo.chave, clientes: grupo.clientes, decisao, justificacao: fundamento }, undefined, undefined, when),
        ]);
    }

    // ── Modelo de risco ───────────────────────────────────────────────────────────
    static async novaVersaoModelo(modelos: ModeloRisco[], config: ConfiguracaoRisco, nome: string, notas: string, actor: ActorCompliance) {
        exigir(actor, 'compliance_settings', 'alterar o modelo de risco');
        const erros = validarConfiguracao(config);
        if (erros.length) throw new Error(erros.join(' '));
        const titulo = texto(nome);
        if (!titulo) throw new Error('Dê um nome à nova versão.');
        const fundamento = texto(notas);
        if (!fundamento || fundamento.length < 10) throw new Error('Explique o motivo da alteração (pelo menos 10 caracteres).');
        const versao = modelos.reduce((m, x) => Math.max(m, Number(x.versao) || 0), 0) + 1;
        const anterior = this.modeloActivo(modelos);
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: SQL_MODELO_CRIAR, params: [id, versao, titulo, JSON.stringify(config), fundamento, when, actor.id, actor.name], expectChanges: 1 },
            { sql: SQL_MODELO_DESACTIVAR, params: [id] },
            auditoria(actor, 'update', `Criou e activou a versão ${versao} do modelo de risco («${titulo}»)`, { modeloId: id, versao, motivo: fundamento },
                anterior ? lerConfiguracao(anterior.configuracao) : undefined, config, when),
        ]);
        return id;
    }
}

export type { ResultadoFactor, RegraDisparada };
