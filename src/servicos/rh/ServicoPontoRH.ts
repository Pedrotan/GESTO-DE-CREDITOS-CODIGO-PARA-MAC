// Livro de ponto (especificação «Livro de ponto: melhorias e novas funcionalidades»): marcações individuais que
// nunca se apagam (anulam-se com motivo), cálculo de cada dia pelo motor, lançamento de faltas a partir da grelha,
// acções em massa, validação e fecho do mês com envio dos totais ao processamento salarial, auditoria, marcação
// pelo funcionário (portal) e no quiosque, importação do relógio, justificações e o painel «Hoje».
// Neste sistema cada empresa tem a base de dados nos seus computadores e sincroniza pela nuvem: as «rotas» da
// secção 11 são os métodos deste serviço, e no desktop o processo principal volta a confirmar as permissões.
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { configDosParametros, distanciaMetros, horaDe, minutosAbsolutos, totaisDosDias, type ConfigPonto, type DiaPonto, type Marcacao, type TipoMarcacao } from '@/bibliotecas/rh/ponto-calculo';
import { calcularFuncionario, celulaElegivel, construirGrelha, funcionariosDoMes, horarioDoFuncionario, marcacoesDoLegado, totaisParaSalario,
    type AusenciaPonto, type DadosGrelha, type FuncionarioPonto, type Grelha, type PontoLegado, type TotaisSalario } from '@/bibliotecas/rh/ponto-grelha';
import { idMarcacaoImportada, previsualizarCsv, type LinhaPrevia, type MapeamentoCsv } from '@/bibliotecas/rh/ponto-importacao';
import { datasDoMes, minutosPrevistos, somarDias, type TipoAusencia } from '@/bibliotecas/rh/ponto';
import { RH_PARAMETROS_PONTO } from '@/bibliotecas/rh/esquema-rh';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { auditoriaRH, ServicoRH, type ActorRH, type Funcionario } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';

type Statement = { sql: string; params?: unknown[]; expectChanges?: number };
export type EstadoPeriodo = 'aberto' | 'em_validacao' | 'validado' | 'fechado';
export type PeriodoPonto = {
    id: string; ano: number; mes: number; departamento_id: string | null; estado: EstadoPeriodo;
    validado_por_nome: string | null; validado_em: string | null; aprovado_por_nome: string | null; aprovado_em: string | null;
    fechado_por_nome: string | null; fechado_em: string | null; reaberto_por_nome: string | null; reaberto_em: string | null; motivo_reabertura: string | null;
    resumo_json: string | null; processamento_desactualizado: number;
};
export type MarcacaoRH = Marcacao & {
    dispositivo_id: string | null; latitude: number | null; longitude: number | null; foto_data_url: string | null; motivo: string | null;
    criado_por_nome: string | null; criado_em: string; motivo_anulacao: string | null; anulada_por_nome: string | null; anulada_em: string | null;
};
export type Justificacao = {
    id: string; funcionario_id: string; data_inicio: string; data_fim: string; ausencia_id: string | null; motivo_codigo: string; motivo: string;
    anexo_nome: string | null; anexo_mime: string | null; anexo_data_url?: string | null; estado: 'pendente' | 'aprovada' | 'rejeitada';
    comentario: string | null; decidido_por_nome: string | null; decidido_em: string | null; criado_em: string; criado_por_nome: string | null;
};
export type AcaoCelula = 'presente' | 'falta' | 'falta_justificada' | 'dispensa' | 'licenca' | 'limpar';
export type Escopo = { rh: boolean; departamentos: Set<string>; funcionarioProprio: string | null };

/** Motivos da justificação pelo funcionário e o tipo de ausência (justificada) em que se transformam ao aprovar. */
export const MOTIVOS_JUSTIFICACAO: Array<{ codigo: string; nome: string; tipo: string }> = [
    { codigo: 'doenca', nome: 'Doença', tipo: 'DOE' },
    { codigo: 'falecimento', nome: 'Falecimento de familiar', tipo: 'FAL' },
    { codigo: 'casamento', nome: 'Casamento', tipo: 'CAS' },
    { codigo: 'consulta', nome: 'Consulta médica', tipo: 'FJ' },
    { codigo: 'outro', nome: 'Outro motivo', tipo: 'FJ' },
];
const MIME_ANEXO = /^data:(application\/pdf|image\/(png|jpe?g|webp));base64,/u;
const LIMITE_ANEXO = 5 * 1024 * 1024;

const agora = () => new Date().toISOString();
/** Hora de Angola (UTC+1, sem hora de verão) no formato «aaaa-mm-ddTHH:MM». */
export const agoraLuanda = (instante = Date.now()) => new Date(instante + 3_600_000).toISOString().slice(0, 16);
const chaveMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;
const lista = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
const motivoValido = (motivo: string | null | undefined, campo = 'o motivo') => {
    const m = String(motivo || '').trim();
    if (m.length < 5) throw new Error(`Indique ${campo} (pelo menos 5 caracteres): fica na auditoria.`);
    return m;
};
const meta = (extra: Record<string, unknown>) => ({ modulo: 'ponto', ...extra });
const hashPin = async (funcionarioId: string, pin: string) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tango-ponto:${funcionarioId}:${pin}`));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
};
const ORIGEM_RESUMO: Record<string, 'manual' | 'importado' | 'app'> = { manual: 'manual', csv: 'importado', relogio: 'importado', app: 'app', quiosque: 'app' };

/** Instrução de inserção de uma marcação (o processo principal reconhece esta forma nas marcações do portal). */
const INSERIR_MARCACAO = `INSERT INTO rh_marcacao (id, funcionario_id, data, data_hora, tipo, origem, dispositivo_id, latitude, longitude, foto_data_url, pendente_validacao, motivo, criado_por, criado_por_nome, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const inserirMarcacao = (m: { id: string; funcionario_id: string; data: string; data_hora: string; tipo: TipoMarcacao | null; origem: Marcacao['origem'];
    dispositivo_id?: string | null; latitude?: number | null; longitude?: number | null; foto?: string | null; pendente?: boolean; motivo?: string | null }, actor: ActorRH, when: string): Statement => ({
    sql: INSERIR_MARCACAO,
    params: [m.id, m.funcionario_id, m.data, m.data_hora, m.tipo, m.origem, m.dispositivo_id || null, m.latitude ?? null, m.longitude ?? null, m.foto || null,
        m.pendente ? 1 : 0, m.motivo || null, actor.id, actor.name, when],
    expectChanges: 1,
});

export type ContextoPonto = Omit<DadosGrelha, 'ano' | 'mes'> & { tiposPorCodigo: Map<string, TipoAusencia>; parametros: Awaited<ReturnType<typeof ServicoRH.parametros>> };

export class ServicoPontoRH {
    // ── Contexto e permissões ─────────────────────────────────────────────────────
    /** Carrega tudo o que o motor precisa entre duas datas (com um dia de folga para os turnos nocturnos). */
    static async contexto(de: string, ate: string): Promise<ContextoPonto> {
        const hoje = luandaTodayKey();
        const [funcionarios, horarios, feriados, tipos, ausencias, marcacoes, legados, parametros, justificacoes] = await Promise.all([
            ServicoRH.funcionarios(), ServicoTempoRH.horarios(), ServicoTempoRH.feriados(), ServicoTempoRH.tiposAusencia(),
            lista(db.all<AusenciaPonto>(`SELECT id, funcionario_id, tipo_id, data_inicio, data_fim, horas, estado, meio_dia FROM rh_ausencia WHERE data_fim >= ? AND data_inicio <= ?`, [somarDias(de, -1), somarDias(ate, 1)])),
            lista(db.all<MarcacaoRH>('SELECT * FROM rh_marcacao WHERE data >= ? AND data <= ?', [somarDias(de, -1), somarDias(ate, 1)])),
            lista(db.all<PontoLegado>('SELECT funcionario_id, data, entrada, saida, origem, observacoes FROM rh_ponto WHERE data >= ? AND data <= ?', [de, ate])),
            ServicoRH.parametros(),
            lista(db.all<{ funcionario_id: string; data_inicio: string; data_fim: string }>(`SELECT funcionario_id, data_inicio, data_fim FROM rh_justificacao WHERE estado = 'pendente'`)),
        ]);
        // Ausência com uma justificação pendente do funcionário: assinalada na grelha.
        for (const a of ausencias) {
            if (justificacoes.some(j => j.funcionario_id === a.funcionario_id && j.data_inicio <= a.data_fim && j.data_fim >= a.data_inicio)) a.justificacao_estado = 'pendente';
        }
        return {
            hoje, agora: agoraLuanda(), funcionarios: funcionarios as FuncionarioPonto[], horarios, feriados, tipos, ausencias, marcacoes, legados,
            config: configDosParametros(parametros, hoje), tiposPorCodigo: new Map(tipos.map(t => [t.codigo, t])), parametros,
        };
    }

    static configuracao(parametros: Awaited<ReturnType<typeof ServicoRH.parametros>>, data = luandaTodayKey()): ConfigPonto {
        return configDosParametros(parametros, data);
    }

    /** RH (gere o RH) ou chefe de departamento (responsável do departamento, pela ficha ligada à sua conta). */
    static async escopo(actor: ActorRH): Promise<Escopo> {
        const rh = ServicoControloAcesso.temPermissao(actor as any, 'hr_manage');
        const [departamentos, propria] = await Promise.all([
            ServicoRH.departamentos(), db.get<{ id: string }>('SELECT id FROM rh_funcionario WHERE utilizador_id = ?', [actor.id]).catch(() => undefined),
        ]);
        const chefe = new Set(departamentos.filter(d => propria && d.responsavel_id === propria.id).map(d => d.id));
        return { rh, departamentos: chefe, funcionarioProprio: propria?.id || null };
    }

    static podeGerir(escopo: Escopo, f: Pick<FuncionarioPonto, 'departamento_id'>) {
        return escopo.rh || Boolean(f.departamento_id && escopo.departamentos.has(f.departamento_id));
    }

    private static assertPodeGerir(escopo: Escopo, f: Pick<FuncionarioPonto, 'departamento_id' | 'nome'>) {
        if (!this.podeGerir(escopo, f)) throw new Error(`Sem permissão para alterar o ponto de ${f.nome}: só o RH ou o chefe do departamento.`);
    }

    // ── Períodos (fecho do mês) ───────────────────────────────────────────────────
    static idPeriodo = (ano: number, mes: number, departamentoId?: string | null) => `${chaveMes(ano, mes)}${departamentoId ? `:${departamentoId}` : ''}`;

    static periodos(ano: number, mes: number) {
        return lista(db.all<PeriodoPonto>('SELECT * FROM rh_ponto_periodo WHERE ano = ? AND mes = ?', [ano, mes]));
    }

    static async estadoMes(ano: number, mes: number): Promise<EstadoPeriodo> {
        const row = await db.get<{ estado: EstadoPeriodo }>('SELECT estado FROM rh_ponto_periodo WHERE id = ?', [this.idPeriodo(ano, mes)]).catch(() => undefined);
        return row?.estado || 'aberto';
    }

    /** O dia pode ser alterado? Não, se o mês do ponto estiver fechado ou o salário desse mês já tiver sido calculado. */
    private static async assertEditavel(datas: string[]) {
        for (const mes of new Set(datas.map(d => d.slice(0, 7)))) {
            const [a, m] = mes.split('-').map(Number);
            if (await this.estadoMes(a, m) === 'fechado') throw new Error(`O livro de ponto de ${mes.split('-').reverse().join('/')} está fechado: peça ao RH para o reabrir (com motivo).`);
            const processado = await ServicoTempoRH.mesBloqueado(`${mes}-01`);
            if (processado) throw new Error(`O salário de ${mes.split('-').reverse().join('/')} já foi processado (${processado}): reabra o processamento para corrigir o ponto.`);
        }
    }

    // ── Grelha ────────────────────────────────────────────────────────────────────
    static async grelha(ano: number, mes: number): Promise<{ grelha: Grelha; contexto: ContextoPonto; periodos: PeriodoPonto[] }> {
        const datas = datasDoMes(ano, mes);
        const [contexto, periodos] = await Promise.all([this.contexto(datas[0], datas[datas.length - 1]), this.periodos(ano, mes)]);
        return { grelha: construirGrelha({ ...contexto, ano, mes }), contexto, periodos };
    }

    /** Detalhe de um dia: cálculo, marcações (também as anuladas), registo da versão anterior e histórico. */
    static async dia(funcionarioId: string, data: string) {
        const ctx = await this.contexto(data, data);
        const f = ctx.funcionarios.find(x => x.id === funcionarioId);
        if (!f) throw new Error('Funcionário não encontrado.');
        const [calculo] = calcularFuncionario(f, [data], ctx);
        const marcacoes = (ctx.marcacoes as MarcacaoRH[]).filter(m => m.funcionario_id === funcionarioId && m.data === data).sort((a, b) => a.data_hora.localeCompare(b.data_hora));
        const legado = ctx.legados.find(p => p.funcionario_id === funcionarioId && p.data === data) || null;
        return { funcionario: f, horario: horarioDoFuncionario(f, ctx.horarios), calculo, marcacoes, legado, historico: await this.historicoDia(funcionarioId, data), config: ctx.config };
    }

    static historicoDia(funcionarioId: string, data: string) {
        return lista(db.all<{ id: string; timestamp: string; userName: string; action: string; details: string; previousState: string | null; newState: string | null; metadata: string | null }>(
            `SELECT id, timestamp, userName, action, details, previousState, newState, metadata FROM audit_logs
             WHERE entity = 'rh' AND metadata LIKE ? AND metadata LIKE ? ORDER BY timestamp DESC LIMIT 100`,
            [`%"funcionarioId":"${funcionarioId}"%`, `%"data":"${data}"%`]));
    }

    // ── Alterações de um dia ─────────────────────────────────────────────────────
    /**
     * Instruções que alteram um dia: marcações novas, marcações anuladas, ausência nova ou anulada, e o resumo
     * do dia em rh_ponto recalculado com o estado final (para os computadores com a versão anterior o verem).
     * Um dia com um registo da versão anterior passa primeiro a marcações, para as alterações ficarem rastreáveis.
     */
    private static prepararDia(ctx: ContextoPonto, f: FuncionarioPonto, data: string, alteracoes: {
        novas?: Array<{ data_hora: string; tipo: TipoMarcacao | null; origem?: Marcacao['origem']; motivo?: string | null }>;
        anular?: string[]; ausenciaNova?: { tipo: TipoAusencia; meio_dia?: 'manha' | 'tarde' | null; motivo: string; documento_id?: string | null };
        anularAusencia?: string | null; motivo: string; descricao: string; acao: string;
    }, actor: ActorRH, when: string): { statements: Statement[]; depois: DiaPonto } {
        const statements: Statement[] = [];
        const doDia = ctx.marcacoes.filter(m => m.funcionario_id === f.id && m.data === data);
        const antes = doDia.filter(m => !m.anulada);
        const legado = ctx.legados.find(p => p.funcionario_id === f.id && p.data === data);
        if (!doDia.length && legado?.entrada) {
            for (const m of marcacoesDoLegado(legado)) {
                statements.push(inserirMarcacao({ ...m, motivo: 'Registo da versão anterior do livro de ponto' }, actor, when));
                ctx.marcacoes.push({ ...m });
            }
        }
        const anular = new Set(alteracoes.anular || []);
        for (const id of anular) {
            statements.push({
                sql: `UPDATE rh_marcacao SET anulada = 1, motivo_anulacao = ?, anulada_por = ?, anulada_por_nome = ?, anulada_em = ? WHERE id = ? AND anulada = 0`,
                params: [alteracoes.motivo, actor.id, actor.name, when, id], expectChanges: 1,
            });
            const alvo = ctx.marcacoes.find(m => m.id === id);
            if (alvo) alvo.anulada = 1;
        }
        for (const nova of alteracoes.novas || []) {
            const id = crypto.randomUUID();
            const m: Marcacao = { id, funcionario_id: f.id, data, data_hora: nova.data_hora, tipo: nova.tipo, origem: nova.origem || 'manual' };
            statements.push(inserirMarcacao({ ...m, motivo: nova.motivo ?? alteracoes.motivo }, actor, when));
            ctx.marcacoes.push(m);
        }
        if (alteracoes.anularAusencia) {
            statements.push({
                sql: `UPDATE rh_ausencia SET estado = 'anulada', anulado_por = ?, anulado_por_nome = ?, anulado_em = ?, motivo_anulacao = ?, actualizado_em = ? WHERE id = ? AND estado <> 'anulada'`,
                params: [actor.id, actor.name, when, alteracoes.motivo, when, alteracoes.anularAusencia], expectChanges: 1,
            });
            const a = ctx.ausencias.find(x => x.id === alteracoes.anularAusencia);
            if (a) a.estado = 'anulada';
        }
        if (alteracoes.ausenciaNova) {
            const { tipo, meio_dia: meioDia } = alteracoes.ausenciaNova;
            const id = crypto.randomUUID();
            const util = calcularFuncionario(f, [data], ctx)[0].util;
            // Meio dia: metade das horas previstas do horário (para o resumo antigo, que conta ausências por horas).
            const horas = meioDia ? Math.round(minutosPrevistos(horarioDoFuncionario(f, ctx.horarios)) / 120 * 100) / 100 : 0;
            statements.push({
                sql: `INSERT INTO rh_ausencia (id, funcionario_id, tipo_id, data_inicio, data_fim, dias, horas, motivo, documento_id, estado, pedido_dispensa,
                        aprovado_por, aprovado_por_nome, aprovado_em, criado_em, criado_por, criado_por_nome, meio_dia)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aprovada', 0, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, f.id, tipo.id, data, data, meioDia ? 0.5 : util ? 1 : 0, horas, alteracoes.ausenciaNova.motivo, alteracoes.ausenciaNova.documento_id || null,
                    actor.id, actor.name, when, when, actor.id, actor.name, meioDia || null],
                expectChanges: 1,
            });
            ctx.ausencias.push({ id, funcionario_id: f.id, tipo_id: tipo.id, data_inicio: data, data_fim: data, horas, estado: 'aprovada', meio_dia: meioDia || null });
        }
        const [depois] = calcularFuncionario(f, [data], ctx);
        const reais = ctx.marcacoes.filter(m => m.funcionario_id === f.id && m.data === data && !m.anulada);
        statements.push(this.resumoDia(f.id, depois, reais, actor, when));
        statements.push(auditoriaRH(actor, alteracoes.acao, `${alteracoes.descricao} · ${f.nome} · ${data.split('-').reverse().join('/')}`,
            meta({ entidade: 'dia', funcionarioId: f.id, data, motivo: alteracoes.motivo }),
            { estado: antesDoDia(antes), marcacoes: antes.map(m => `${horaDe(m.data_hora)} ${m.tipo || ''}`.trim()) },
            { estado: depois.estado, marcacoes: reais.map(m => `${horaDe(m.data_hora)} ${m.tipo || ''}`.trim()) }, when));
        return { statements, depois };
    }

    /** Resumo do dia em rh_ponto (entrada e saída da versão anterior + colunas novas). */
    private static resumoDia(funcionarioId: string, d: DiaPonto, reais: Marcacao[], actor: ActorRH, when: string): Statement {
        const origem = ORIGEM_RESUMO[reais[reais.length - 1]?.origem || 'manual'] || 'manual';
        return {
            sql: `INSERT INTO rh_ponto (id, funcionario_id, data, entrada, saida, horas_trabalhadas, horas_extra, minutos_atraso, origem, observacoes, registado_por, registado_por_nome, criado_em,
                    estado, minutos_trabalhados, minutos_saida_antecipada, minutos_extra, minutos_noturnos, incompleto, editado_manualmente, primeira_entrada, ultima_saida, recalculado_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET entrada = excluded.entrada, saida = excluded.saida, horas_trabalhadas = excluded.horas_trabalhadas,
                    horas_extra = excluded.horas_extra, minutos_atraso = excluded.minutos_atraso, origem = excluded.origem, registado_por = excluded.registado_por,
                    registado_por_nome = excluded.registado_por_nome, actualizado_em = excluded.criado_em, estado = excluded.estado,
                    minutos_trabalhados = excluded.minutos_trabalhados, minutos_saida_antecipada = excluded.minutos_saida_antecipada, minutos_extra = excluded.minutos_extra,
                    minutos_noturnos = excluded.minutos_noturnos, incompleto = excluded.incompleto, editado_manualmente = excluded.editado_manualmente,
                    primeira_entrada = excluded.primeira_entrada, ultima_saida = excluded.ultima_saida, recalculado_em = excluded.recalculado_em`,
            params: [`${funcionarioId}:${d.data}`, funcionarioId, d.data, horaDe(d.primeira_entrada), horaDe(d.ultima_saida),
                Math.round(d.minutos_trabalhados / 60 * 100) / 100, Math.round(d.minutos_extra / 60 * 100) / 100, d.minutos_atraso, origem,
                actor.id, actor.name, when, d.estado, d.minutos_trabalhados, d.minutos_saida_antecipada, d.minutos_extra, d.minutos_noturnos,
                d.incompleto ? 1 : 0, reais.some(m => m.origem === 'manual') ? 1 : 0, d.primeira_entrada, d.ultima_saida, when],
        };
    }

    private static async preparar(funcionarioId: string, data: string, actor: ActorRH) {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(data)) throw new Error('Data inválida.');
        await this.assertEditavel([data]);
        const [ctx, escopo] = await Promise.all([this.contexto(data, data), this.escopo(actor)]);
        const f = ctx.funcionarios.find(x => x.id === funcionarioId);
        if (!f) throw new Error('Funcionário não encontrado.');
        this.assertPodeGerir(escopo, f);
        return { ctx, f };
    }

    /** Acrescenta uma marcação (registo manual): o motivo é obrigatório e fica na auditoria. */
    static async adicionarMarcacao(input: { funcionarioId: string; data: string; hora: string; tipo: TipoMarcacao; diaSeguinte?: boolean; motivo: string }, actor: ActorRH) {
        const motivo = motivoValido(input.motivo);
        if (!/^\d{2}:\d{2}$/u.test(input.hora)) throw new Error('Indique a hora (HH:MM).');
        const { ctx, f } = await this.preparar(input.funcionarioId, input.data, actor);
        const diaHora = `${input.diaSeguinte ? somarDias(input.data, 1) : input.data}T${input.hora}`;
        const { statements } = this.prepararDia(ctx, f, input.data, { novas: [{ data_hora: diaHora, tipo: input.tipo }], motivo, acao: 'create', descricao: `Marcação manual (${input.tipo} ${input.hora})` }, actor, agora());
        await db.transaction(statements);
    }

    /** Corrige uma marcação: anula a original e regista a nova (as marcações nunca se alteram). */
    static async editarMarcacao(input: { funcionarioId: string; data: string; marcacaoId: string; hora: string; tipo: TipoMarcacao; diaSeguinte?: boolean; motivo: string }, actor: ActorRH) {
        const motivo = motivoValido(input.motivo);
        const { ctx, f } = await this.preparar(input.funcionarioId, input.data, actor);
        const original = ctx.marcacoes.find(m => m.id === input.marcacaoId) || ctx.legados.filter(p => p.funcionario_id === f.id && p.data === input.data).flatMap(marcacoesDoLegado).find(m => m.id === input.marcacaoId);
        if (!original) throw new Error('A marcação já não existe.');
        const diaHora = `${input.diaSeguinte ? somarDias(input.data, 1) : input.data}T${input.hora}`;
        const { statements } = this.prepararDia(ctx, f, input.data, {
            anular: [input.marcacaoId], novas: [{ data_hora: diaHora, tipo: input.tipo }], motivo, acao: 'update',
            descricao: `Corrigiu a marcação ${horaDe(original.data_hora)} → ${input.hora} (${input.tipo})`,
        }, actor, agora());
        await db.transaction(statements);
    }

    static async anularMarcacao(input: { funcionarioId: string; data: string; marcacaoId: string; motivo: string }, actor: ActorRH) {
        const motivo = motivoValido(input.motivo);
        const { ctx, f } = await this.preparar(input.funcionarioId, input.data, actor);
        const { statements } = this.prepararDia(ctx, f, input.data, { anular: [input.marcacaoId], motivo, acao: 'cancel', descricao: 'Anulou uma marcação' }, actor, agora());
        await db.transaction(statements);
    }

    /** Observação do dia (fica no resumo do dia). */
    static async observacao(funcionarioId: string, data: string, texto: string, actor: ActorRH) {
        const { ctx, f } = await this.preparar(funcionarioId, data, actor);
        const when = agora();
        const [calculo] = calcularFuncionario(f, [data], ctx);
        const reais = ctx.marcacoes.filter(m => m.funcionario_id === f.id && m.data === data && !m.anulada);
        await db.transaction([
            this.resumoDia(f.id, calculo, reais, actor, when),
            { sql: 'UPDATE rh_ponto SET observacoes = ?, actualizado_em = ? WHERE id = ?', params: [texto.trim() || null, when, `${f.id}:${data}`], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Observação no ponto de ${f.nome} em ${data}: ${texto.trim() || '(apagada)'}`, meta({ entidade: 'dia', funcionarioId: f.id, data }), undefined, { observacao: texto.trim() }, when),
        ]);
    }

    /**
     * Acção sobre uma ou várias células (menu da célula ou barra de acções em massa). Ignora as células onde a acção
     * não se aplica (feriado, descanso, férias, licença, futuro, fora do contrato, mês fechado) e devolve quantas.
     */
    static async acao(input: { celulas: Array<{ funcionarioId: string; data: string }>; acao: AcaoCelula; motivo?: string; tipoJustificadaId?: string; meioDia?: 'manha' | 'tarde' | null; documentoId?: string | null; massa?: boolean }, actor: ActorRH) {
        if (!input.celulas.length) throw new Error('Escolha pelo menos uma célula.');
        // Edição: limpar, ou qualquer acção em massa, exige motivo. Lançar num dia vazio pela célula usa a descrição da acção.
        const motivo = input.massa || input.acao === 'limpar' ? motivoValido(input.motivo) : (input.motivo?.trim() || `Lançado no livro de ponto (${input.acao.replace('_', ' ')})`);
        const datas = input.celulas.map(c => c.data).sort();
        const [ctx, escopo] = await Promise.all([this.contexto(datas[0], datas[datas.length - 1]), this.escopo(actor)]);
        const bloqueados = new Set<string>();
        for (const mes of new Set(datas.map(d => d.slice(0, 7)))) await this.assertEditavel([`${mes}-01`]).catch(() => bloqueados.add(mes));
        const tipo = (codigo: string) => {
            const t = ctx.tiposPorCodigo.get(codigo);
            if (!t) throw new Error(`Falta o tipo de ausência ${codigo} nas configurações de RH.`);
            return t;
        };
        const tipoNovo = input.acao === 'falta' ? tipo('F') : input.acao === 'falta_justificada' ? (ctx.tipos.find(t => t.id === input.tipoJustificadaId && t.justificada) || tipo('FJ'))
            : input.acao === 'dispensa' ? tipo('D') : input.acao === 'licenca' ? tipo('L') : null;
        const statements: Statement[] = [];
        const ignoradas: string[] = [];
        let alteradas = 0;
        const when = agora();
        for (const c of input.celulas) {
            const f = ctx.funcionarios.find(x => x.id === c.funcionarioId);
            if (!f) continue;
            const nome = `${f.nome} ${c.data.split('-').reverse().join('/')}`;
            if (bloqueados.has(c.data.slice(0, 7))) { ignoradas.push(`${nome}: mês fechado ou processado`); continue; }
            if (!this.podeGerir(escopo, f)) { ignoradas.push(`${nome}: sem permissão`); continue; }
            const [dia] = calcularFuncionario(f, [c.data], ctx);
            const elegivel = input.acao === 'licenca' ? !['FORA', 'FR', 'FS'].includes(dia.estado) : celulaElegivel(dia, input.acao);
            if (!elegivel) { ignoradas.push(`${nome}: ${dia.estado === 'FUTURO' ? 'dia futuro' : `não se aplica (${dia.estado})`}`); continue; }
            const marcacoes = ctx.marcacoes.filter(m => m.funcionario_id === f.id && m.data === c.data && !m.anulada).map(m => m.id);
            const legado = ctx.legados.find(p => p.funcionario_id === f.id && p.data === c.data && p.entrada) && !ctx.marcacoes.some(m => m.funcionario_id === f.id && m.data === c.data);
            const temMarcacoes = marcacoes.length > 0 || Boolean(legado);
            if (input.acao === 'limpar') {
                const ausencia = dia.ausencia_id ? ctx.ausencias.find(a => a.id === dia.ausencia_id) : null;
                const anularAusencia = ausencia && ausencia.data_inicio === c.data && ausencia.data_fim === c.data ? ausencia.id : null;
                if (!temMarcacoes && !anularAusencia) { ignoradas.push(`${nome}: nada para limpar${ausencia ? ' (ausência de vários dias: anule-a em «Dispensas e licenças»)' : ''}`); continue; }
                const todas = [...marcacoes, ...(legado ? marcacoesDoLegado(ctx.legados.find(p => p.funcionario_id === f.id && p.data === c.data)!).map(m => m.id) : [])];
                statements.push(...this.prepararDia(ctx, f, c.data, { anular: todas, anularAusencia, motivo, acao: 'cancel', descricao: 'Limpou o dia' }, actor, when).statements);
                alteradas += 1;
                continue;
            }
            if (temMarcacoes) { ignoradas.push(`${nome}: já tem marcações (use Limpar ou Editar)`); continue; }
            if (dia.ausencia_id) { ignoradas.push(`${nome}: já tem uma ausência lançada`); continue; }
            if (input.acao === 'presente') {
                const horario = horarioDoFuncionario(f, ctx.horarios);
                const saidaDia = horario.saida <= horario.entrada ? somarDias(c.data, 1) : c.data;
                statements.push(...this.prepararDia(ctx, f, c.data, {
                    novas: [{ data_hora: `${c.data}T${horario.entrada}`, tipo: 'entrada' }, { data_hora: `${saidaDia}T${horario.saida}`, tipo: 'saida' }],
                    motivo, acao: 'create', descricao: 'Marcou presente com o horário previsto',
                }, actor, when).statements);
            } else {
                statements.push(...this.prepararDia(ctx, f, c.data, {
                    ausenciaNova: { tipo: tipoNovo!, meio_dia: input.meioDia || null, motivo, documento_id: input.documentoId || null }, motivo, acao: 'create', descricao: `Lançou ${tipoNovo!.nome}${input.meioDia ? ` (${input.meioDia === 'manha' ? 'manhã' : 'tarde'})` : ''}`,
                }, actor, when).statements);
            }
            alteradas += 1;
        }
        if (statements.length) await db.transaction(statements);
        return { alteradas, ignoradas };
    }

    /** Recalcula e grava o resumo de todos os dias de um mês (depois de mudar um horário, um feriado ou a configuração). */
    static async recalcularMes(ano: number, mes: number, actor: ActorRH, progresso?: (feito: number, total: number) => void) {
        await this.assertEditavel([`${chaveMes(ano, mes)}-01`]);
        const datas = datasDoMes(ano, mes);
        const ctx = await this.contexto(datas[0], datas[datas.length - 1]);
        const when = agora();
        const funcionarios = funcionariosDoMes(ctx.funcionarios, ano, mes);
        let feito = 0;
        for (const f of funcionarios) {
            const dias = calcularFuncionario(f, datas, ctx);
            const statements = dias.flatMap(d => {
                const reais = ctx.marcacoes.filter(m => m.funcionario_id === f.id && m.data === d.data && !m.anulada);
                const legado = ctx.legados.some(p => p.funcionario_id === f.id && p.data === d.data);
                return reais.length || legado ? [this.resumoDia(f.id, d, reais.length ? reais : marcacoesDoLegado(ctx.legados.find(p => p.funcionario_id === f.id && p.data === d.data)!), actor, when)] : [];
            });
            if (statements.length) await db.transaction(statements);
            feito += 1;
            progresso?.(feito, funcionarios.length);
        }
        await db.transaction([auditoriaRH(actor, 'update', `Recalculou o livro de ponto de ${mes}/${ano}`, meta({ entidade: 'periodo', ano, mes }), undefined, undefined, when)]);
        return funcionarios.length;
    }

    // ── Validação, fecho e reabertura ─────────────────────────────────────────────
    /** Dias sem registo e marcações incompletas que impedem validar o mês (por funcionário). */
    static problemasDoMes(grelha: Grelha, departamentoId?: string | null) {
        return grelha.linhas.filter(l => !departamentoId || l.funcionario.departamento_id === departamentoId).flatMap(l => l.dias
            .filter(d => (d.estado === 'SEM_REGISTO' && d.data < luandaTodayKey()) || d.incompleto)
            .map(d => ({ funcionario: l.funcionario, data: d.data, tipo: d.incompleto ? 'incompleto' as const : 'pendente' as const })));
    }

    private static async converterPendentes(problemas: ReturnType<typeof ServicoPontoRH.problemasDoMes>, ctx: ContextoPonto, actor: ActorRH, when: string) {
        if (!ctx.config.lancar_falta_automatica) throw new Error('A conversão de dias sem registo em faltas está desligada (Configuração do ponto › «Converter pendentes em faltas»).');
        const tipo = ctx.tiposPorCodigo.get('F');
        if (!tipo) throw new Error('Falta o tipo de ausência F.');
        return problemas.filter(p => p.tipo === 'pendente').flatMap(p => this.prepararDia(ctx, p.funcionario, p.data, {
            ausenciaNova: { tipo, motivo: 'Dia sem registo convertido em falta na validação do mês' }, motivo: 'Dia sem registo convertido em falta na validação do mês',
            acao: 'create', descricao: 'Converteu um dia sem registo em falta',
        }, actor, when).statements);
    }

    /**
     * Validação do mês de um departamento: o chefe valida (em validação) e o RH aprova (validado). Só sem dias por
     * resolver nem marcações incompletas; com a opção ligada, os dias sem registo passam a faltas.
     */
    static async validarMes(ano: number, mes: number, departamentoId: string, actor: ActorRH, opcoes: { converterPendentes?: boolean } = {}) {
        const escopo = await this.escopo(actor);
        if (!escopo.rh && !escopo.departamentos.has(departamentoId)) throw new Error('Só o chefe deste departamento ou o RH validam o mês.');
        if (await this.estadoMes(ano, mes) === 'fechado') throw new Error('O mês já está fechado.');
        const { grelha, contexto } = await this.grelha(ano, mes);
        const problemas = this.problemasDoMes(grelha, departamentoId);
        const when = agora();
        const extra: Statement[] = [];
        if (problemas.some(p => p.tipo === 'incompleto')) throw new Error(`Há ${problemas.filter(p => p.tipo === 'incompleto').length} dia(s) com marcações incompletas (entrada sem saída): corrija-os antes de validar.`);
        if (problemas.length) {
            if (!opcoes.converterPendentes) throw new Error(`Há ${problemas.length} dia(s) sem registo: resolva-os («Resolver pendentes») ou converta-os em faltas.`);
            extra.push(...await this.converterPendentes(problemas, contexto, actor, when));
        }
        const id = this.idPeriodo(ano, mes, departamentoId);
        const estado: EstadoPeriodo = escopo.rh ? 'validado' : 'em_validacao';
        await db.transaction([
            ...extra,
            { sql: `INSERT INTO rh_ponto_periodo (id, ano, mes, departamento_id, estado, criado_em) VALUES (?, ?, ?, ?, 'aberto', ?) ON CONFLICT(id) DO NOTHING`, params: [id, ano, mes, departamentoId, when] },
            escopo.rh
                ? { sql: `UPDATE rh_ponto_periodo SET estado = 'validado', aprovado_por = ?, aprovado_por_nome = ?, aprovado_em = ?, validado_por = COALESCE(validado_por, ?), validado_por_nome = COALESCE(validado_por_nome, ?), validado_em = COALESCE(validado_em, ?), actualizado_em = ? WHERE id = ?`,
                    params: [actor.id, actor.name, when, actor.id, actor.name, when, when, id], expectChanges: 1 }
                : { sql: `UPDATE rh_ponto_periodo SET estado = 'em_validacao', validado_por = ?, validado_por_nome = ?, validado_em = ?, actualizado_em = ? WHERE id = ?`,
                    params: [actor.id, actor.name, when, when, id], expectChanges: 1 },
            auditoriaRH(actor, 'approve', `${estado === 'validado' ? 'Aprovou' : 'Validou'} o ponto de ${mes}/${ano} do departamento`, meta({ entidade: 'periodo', ano, mes, departamentoId, estado }), undefined, { estado }, when),
        ]);
        return estado;
    }

    /**
     * Fecho do mês pelo RH: bloqueia o ponto e as ausências do mês e guarda os totais de cada funcionário, que o
     * processamento salarial passa a ler (faltas, atrasos, horas extra por tipo, nocturno, dias de trabalho efectivo).
     */
    static async fecharMes(ano: number, mes: number, actor: ActorRH, opcoes: { converterPendentes?: boolean } = {}) {
        if (!ServicoControloAcesso.temPermissao(actor as any, 'hr_manage')) throw new Error('Só o RH fecha o mês.');
        if (await this.estadoMes(ano, mes) === 'fechado') throw new Error('O mês já está fechado.');
        const datas = datasDoMes(ano, mes);
        if (luandaTodayKey() <= datas[datas.length - 1]) throw new Error('O mês ainda não terminou: só se fecha a partir do dia 1 do mês seguinte.');
        const processado = await ServicoTempoRH.mesBloqueado(datas[0]);
        if (processado) throw new Error(`O salário do mês já foi processado (${processado}): reabra o processamento antes de fechar o ponto.`);
        const { grelha, contexto } = await this.grelha(ano, mes);
        const problemas = this.problemasDoMes(grelha);
        const when = agora();
        const extra: Statement[] = [];
        if (problemas.some(p => p.tipo === 'incompleto')) throw new Error(`Há ${problemas.filter(p => p.tipo === 'incompleto').length} dia(s) com marcações incompletas: corrija-os antes de fechar.`);
        if (problemas.length) {
            if (!opcoes.converterPendentes) throw new Error(`Há ${problemas.length} dia(s) sem registo: resolva-os ou converta-os em faltas antes de fechar.`);
            extra.push(...await this.converterPendentes(problemas, contexto, actor, when));
        }
        // Totais calculados já com as conversões (o motor volta a correr sobre o contexto actualizado).
        const final = construirGrelha({ ...contexto, ano, mes });
        const totais: TotaisSalario[] = final.linhas.map(totaisParaSalario);
        const resumo = JSON.stringify({ fechado_em: when, totais });
        const resumos = final.linhas.flatMap(l => l.dias.filter(d => contexto.marcacoes.some(m => m.funcionario_id === l.funcionario.id && m.data === d.data && !m.anulada))
            .map(d => this.resumoDia(l.funcionario.id, d, contexto.marcacoes.filter(m => m.funcionario_id === l.funcionario.id && m.data === d.data && !m.anulada), actor, when)));
        const id = this.idPeriodo(ano, mes);
        await db.transaction([
            ...extra, ...resumos,
            { sql: `INSERT INTO rh_ponto_periodo (id, ano, mes, departamento_id, estado, criado_em) VALUES (?, ?, ?, NULL, 'aberto', ?) ON CONFLICT(id) DO NOTHING`, params: [id, ano, mes, when] },
            { sql: `UPDATE rh_ponto_periodo SET estado = 'fechado', fechado_por = ?, fechado_por_nome = ?, fechado_em = ?, resumo_json = ?, processamento_desactualizado = 0, actualizado_em = ? WHERE id = ? AND estado <> 'fechado'`,
                params: [actor.id, actor.name, when, resumo, when, id], expectChanges: 1 },
            auditoriaRH(actor, 'close', `Fechou o livro de ponto de ${mes}/${ano} (${totais.length} funcionário(s))`, meta({ entidade: 'periodo', ano, mes }), undefined,
                { faltas: totais.reduce((s, t) => s + t.faltas_injustificadas, 0), extra_min: totais.reduce((s, t) => s + t.minutos_extra_util + t.minutos_extra_descanso + t.minutos_extra_feriado, 0) }, when),
        ]);
        return totais;
    }

    /** Reabre o mês (RH ou Super Administrador, com motivo). Se o salário do mês já foi calculado, fica marcado como desactualizado. */
    static async reabrirMes(ano: number, mes: number, motivoBruto: string, actor: ActorRH) {
        if (!ServicoControloAcesso.temPermissao(actor as any, 'hr_manage') && actor.role !== 'super_admin') throw new Error('Só o RH ou o Super Administrador reabrem o mês.');
        const motivo = motivoValido(motivoBruto, 'o motivo da reabertura');
        if (await this.estadoMes(ano, mes) !== 'fechado') throw new Error('O mês não está fechado.');
        const processado = await ServicoTempoRH.mesBloqueado(`${chaveMes(ano, mes)}-01`);
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_ponto_periodo SET estado = 'aberto', reaberto_por = ?, reaberto_por_nome = ?, reaberto_em = ?, motivo_reabertura = ?, processamento_desactualizado = ?, actualizado_em = ? WHERE id = ? AND estado = 'fechado'`,
                params: [actor.id, actor.name, when, motivo, processado ? 1 : 0, when, this.idPeriodo(ano, mes)], expectChanges: 1 },
            auditoriaRH(actor, 'reopen', `Reabriu o livro de ponto de ${mes}/${ano}: ${motivo}`, meta({ entidade: 'periodo', ano, mes, motivo }), { estado: 'fechado' }, { estado: 'aberto' }, when),
        ]);
        return { processamentoDesactualizado: Boolean(processado) };
    }

    /**
     * Totais do mês para o processamento salarial: os do fecho, ou (se a empresa não exige o fecho) calculados agora.
     * `null` com `exigeFecho` = o processamento tem de esperar pelo fecho do ponto.
     */
    static async totaisSalario(ano: number, mes: number): Promise<{ totais: Map<string, TotaisSalario> | null; fechado: boolean; exigeFecho: boolean }> {
        const periodo = await db.get<PeriodoPonto>('SELECT * FROM rh_ponto_periodo WHERE id = ?', [this.idPeriodo(ano, mes)]).catch(() => undefined);
        const datas = datasDoMes(ano, mes);
        if (periodo?.estado === 'fechado' && periodo.resumo_json) {
            const { totais } = JSON.parse(periodo.resumo_json) as { totais: TotaisSalario[] };
            return { totais: new Map(totais.map(t => [t.funcionario_id, t])), fechado: true, exigeFecho: true };
        }
        const ctx = await this.contexto(datas[0], datas[datas.length - 1]);
        if (ctx.config.exigir_fecho_para_salarios) return { totais: null, fechado: false, exigeFecho: true };
        const grelha = construirGrelha({ ...ctx, ano, mes });
        return { totais: new Map(grelha.linhas.map(l => [l.funcionario.id, totaisParaSalario(l)])), fechado: false, exigeFecho: false };
    }

    // ── Configuração ──────────────────────────────────────────────────────────────
    /** Grava as opções alteradas como parâmetros com vigência a partir de hoje (alterar de novo no mesmo dia actualiza esse valor). */
    static async guardarConfiguracao(alteracoes: Partial<Record<keyof ConfigPonto, string | number | boolean | null>>, actor: ActorRH) {
        if (!ServicoControloAcesso.temPermissao(actor as any, 'hr_settings') && !ServicoControloAcesso.temPermissao(actor as any, 'hr_manage')) throw new Error('Sem permissão para configurar o ponto.');
        const hoje = luandaTodayKey();
        const parametros = await ServicoRH.parametros();
        const when = agora();
        const statements: Statement[] = [];
        for (const [campo, bruto] of Object.entries(alteracoes)) {
            const chave = `ponto_${campo}`;
            if (!RH_PARAMETROS_PONTO.some(p => p.chave === chave)) continue;
            const valor = typeof bruto === 'boolean' ? (bruto ? '1' : '0') : bruto === null || bruto === undefined ? '' : String(bruto).trim();
            const versoes = parametros.filter(p => p.chave === chave).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio));
            const vigente = versoes.find(p => p.vigencia_inicio <= hoje && (!p.vigencia_fim || p.vigencia_fim >= hoje));
            if (vigente?.valor === valor) continue;
            if (vigente && vigente.vigencia_inicio === hoje) {
                statements.push({ sql: 'UPDATE rh_parametro SET valor = ? WHERE id = ?', params: [valor, vigente.id], expectChanges: 1 });
            } else {
                const vespera = somarDias(hoje, -1);
                if (vigente) statements.push({ sql: 'UPDATE rh_parametro SET vigencia_fim = ? WHERE id = ? AND vigencia_fim IS NULL', params: [vespera, vigente.id] });
                statements.push({ sql: `INSERT INTO rh_parametro (id, chave, valor, descricao, vigencia_inicio, vigencia_fim, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
                    params: [crypto.randomUUID(), chave, valor, RH_PARAMETROS_PONTO.find(p => p.chave === chave)!.descricao, hoje, when, actor.id], expectChanges: 1 });
            }
            statements.push(auditoriaRH(actor, 'update', `Configuração do ponto: ${campo} = ${valor || '(vazio)'}`, meta({ entidade: 'configuracao', campo }), { valor: vigente?.valor }, { valor }, when));
        }
        if (statements.length) await db.transaction(statements);
        return statements.length;
    }

    // ── Auditoria ─────────────────────────────────────────────────────────────────
    static auditoria(filtro: { de: string; ate: string; funcionarioId?: string | null; utilizador?: string | null; accao?: string | null }) {
        const condicoes = [`entity = 'rh'`, `metadata LIKE '%"modulo":"ponto"%'`, 'timestamp >= ?', 'timestamp <= ?'];
        const params: unknown[] = [`${filtro.de}T00:00:00`, `${filtro.ate}T23:59:59.999Z`];
        if (filtro.funcionarioId) { condicoes.push('metadata LIKE ?'); params.push(`%"funcionarioId":"${filtro.funcionarioId}"%`); }
        if (filtro.utilizador) { condicoes.push('userName = ?'); params.push(filtro.utilizador); }
        if (filtro.accao) { condicoes.push('action = ?'); params.push(filtro.accao); }
        return lista(db.all<{ id: string; timestamp: string; userName: string; action: string; details: string; previousState: string | null; newState: string | null; metadata: string | null }>(
            `SELECT id, timestamp, userName, action, details, previousState, newState, metadata FROM audit_logs WHERE ${condicoes.join(' AND ')} ORDER BY timestamp DESC LIMIT 2000`, params));
    }

    // ── Importação do relógio ─────────────────────────────────────────────────────
    static async previsualizarImportacao(texto: string, mapa: MapeamentoCsv): Promise<LinhaPrevia[]> {
        const [funcionarios, horarios] = await Promise.all([ServicoRH.funcionarios(), ServicoTempoRH.horarios()]);
        const linhasBrutas = previsualizarCsv(texto, mapa, funcionarios.map(f => ({ ...f, horario: horarioDoFuncionario(f, horarios) })), []);
        const datas = linhasBrutas.map(l => l.data).filter((d): d is string => Boolean(d)).sort();
        const existentes = datas.length
            ? await lista(db.all<Marcacao>('SELECT funcionario_id, data_hora, tipo FROM rh_marcacao WHERE anulada = 0 AND data >= ? AND data <= ?', [somarDias(datas[0], -1), somarDias(datas[datas.length - 1], 1)]))
            : [];
        return previsualizarCsv(texto, mapa, funcionarios.map(f => ({ ...f, horario: horarioDoFuncionario(f, horarios) })), existentes);
    }

    /** Importa só as linhas válidas (o id é estável: o mesmo ficheiro em dois computadores não duplica). Associações manuais: n.º → funcionário. */
    static async importar(linhas: LinhaPrevia[], associacoes: Record<string, string>, actor: ActorRH) {
        if (!ServicoControloAcesso.temPermissao(actor as any, 'hr_manage')) throw new Error('Só o RH importa marcações.');
        const validas = linhas.map(l => (l.estado === 'funcionario_desconhecido' && associacoes[l.numero] && l.data && l.data_hora ? { ...l, funcionario_id: associacoes[l.numero], estado: 'valida' as const } : l))
            .filter(l => l.estado === 'valida' && l.funcionario_id && l.data && l.data_hora);
        const bloqueados = new Set<string>();
        for (const mes of new Set(validas.map(l => l.data!.slice(0, 7)))) await this.assertEditavel([`${mes}-01`]).catch(() => bloqueados.add(mes));
        const when = agora();
        const aceites = validas.filter(l => !bloqueados.has(l.data!.slice(0, 7)));
        const statements: Statement[] = aceites.map(l => ({
            sql: INSERIR_MARCACAO.replace('INSERT INTO', 'INSERT OR IGNORE INTO'),
            params: [idMarcacaoImportada(l.funcionario_id!, l.data_hora!, l.tipo), l.funcionario_id, l.data, l.data_hora, l.tipo, 'csv', null, null, null, null, 0, 'Importado do relógio', actor.id, actor.name, when],
        }));
        if (statements.length) {
            statements.push(auditoriaRH(actor, 'import', `Importou ${aceites.length} marcação(ões) do relógio`, meta({ entidade: 'marcacao', linhas: aceites.length, ignoradas: linhas.length - aceites.length }), undefined, undefined, when));
            await db.transaction(statements);
        }
        return { importadas: aceites.length, ignoradas: linhas.filter(l => l.estado === 'duplicada').length, erros: linhas.length - aceites.length - linhas.filter(l => l.estado === 'duplicada').length, mesesBloqueados: [...bloqueados] };
    }

    // ── Marcação pelo funcionário (portal) e no quiosque ──────────────────────────
    /** Próximas acções possíveis pela ordem das marcações de hoje. */
    static proximasAccoes(marcacoesHoje: Array<Pick<Marcacao, 'tipo' | 'data_hora' | 'anulada'>>): TipoMarcacao[] {
        const ultima = marcacoesHoje.filter(m => !m.anulada).sort((a, b) => a.data_hora.localeCompare(b.data_hora)).pop();
        if (!ultima || ultima.tipo === 'saida') return ['entrada'];
        if (ultima.tipo === 'inicio_pausa') return ['fim_pausa'];
        return ['saida', 'inicio_pausa'];
    }

    static marcacoesDoDia(funcionarioId: string, data: string) {
        return lista(db.all<MarcacaoRH>('SELECT * FROM rh_marcacao WHERE funcionario_id = ? AND data = ? ORDER BY data_hora', [funcionarioId, data]));
    }

    /**
     * Marcação pelo próprio funcionário: hora deste computador (em Angola), área permitida e fotografia conforme a
     * configuração. Sem internet fica guardada aqui e segue na sincronização, marcada para revisão.
     */
    static async marcarPeloPortal(f: Funcionario, tipo: TipoMarcacao, extra: { latitude?: number | null; longitude?: number | null; foto?: string | null; offline?: boolean }, actor: ActorRH) {
        const parametros = await ServicoRH.parametros();
        const hoje = luandaTodayKey();
        const config = configDosParametros(parametros, hoje);
        if (!config.autoregisto_app) throw new Error('A marcação do ponto no portal não está activa nesta empresa.');
        if (f.utilizador_id !== actor.id) throw new Error('Só pode marcar o seu próprio ponto.');
        if (config.exigir_geolocalizacao) {
            if (extra.latitude == null || extra.longitude == null) throw new Error('Active a localização do dispositivo para marcar o ponto.');
            if (config.local_latitude == null || config.local_longitude == null) throw new Error('O local de trabalho ainda não foi configurado pelo RH.');
            const distancia = distanciaMetros(extra.latitude, extra.longitude, config.local_latitude, config.local_longitude);
            if (distancia > config.raio_permitido_m) throw new Error(`Está a ${Math.round(distancia)} m do local de trabalho (máximo ${config.raio_permitido_m} m).`);
        }
        if (config.exigir_selfie && !/^data:image\/(jpeg|png|webp);base64,/u.test(extra.foto || '')) throw new Error('Tire uma fotografia para marcar o ponto.');
        if (extra.foto && extra.foto.length > 400_000) throw new Error('A fotografia é demasiado grande.');
        await this.assertEditavel([hoje]);
        const doDia = await this.marcacoesDoDia(f.id, hoje);
        if (!this.proximasAccoes(doDia).includes(tipo)) throw new Error('Esta marcação não segue a anterior (ex.: duas entradas seguidas).');
        const agoraLocal = agoraLuanda();
        if (doDia.some(m => !m.anulada && m.tipo === tipo && minutosAbsolutos(agoraLocal) - minutosAbsolutos(m.data_hora) < 2)) throw new Error('Já marcou há menos de 2 minutos.');
        const when = agora();
        await db.transaction([
            inserirMarcacao({ id: crypto.randomUUID(), funcionario_id: f.id, data: hoje, data_hora: agoraLocal, tipo, origem: 'app', latitude: extra.latitude ?? null,
                longitude: extra.longitude ?? null, foto: extra.foto || null, pendente: Boolean(extra.offline), motivo: null }, actor, when),
            auditoriaRH(actor, 'create', `Marcou ${tipo.replace('_', ' ')} no portal às ${horaDe(agoraLocal)}`, meta({ entidade: 'marcacao', funcionarioId: f.id, data: hoje }), undefined, { tipo, hora: horaDe(agoraLocal) }, when),
        ]);
        return agoraLocal;
    }

    /** Define (ou retira, com PIN vazio) o PIN de 4 a 6 algarismos do quiosque. O PIN não se repete na empresa. */
    static async definirPin(funcionarioId: string, pin: string, actor: ActorRH) {
        if (!ServicoControloAcesso.temPermissao(actor as any, 'hr_manage')) throw new Error('Só o RH define os PIN do quiosque.');
        const limpo = pin.trim();
        if (limpo && !/^\d{4,6}$/u.test(limpo)) throw new Error('O PIN tem de ter 4 a 6 algarismos.');
        const funcionarios = await ServicoRH.funcionarios();
        if (limpo) {
            for (const outro of funcionarios.filter(x => x.id !== funcionarioId && (x as any).pin_ponto_hash)) {
                if (await hashPin(outro.id, limpo) === (outro as any).pin_ponto_hash) throw new Error('Este PIN já está atribuído a outro funcionário: escolha outro.');
            }
        }
        const when = agora();
        await db.transaction([
            { sql: 'UPDATE rh_funcionario SET pin_ponto_hash = ?, actualizado_em = ? WHERE id = ?', params: [limpo ? await hashPin(funcionarioId, limpo) : null, when, funcionarioId], expectChanges: 1 },
            auditoriaRH(actor, 'update', limpo ? 'Definiu o PIN do quiosque' : 'Retirou o PIN do quiosque', meta({ entidade: 'funcionario', funcionarioId }), undefined, undefined, when),
        ]);
    }

    /** Quiosque: identifica o funcionário pelo PIN (a sessão do quiosque é de um administrador). */
    static async identificarPorPin(pin: string) {
        if (!/^\d{4,6}$/u.test(pin.trim())) return null;
        const funcionarios = (await ServicoRH.funcionarios()).filter(f => f.estado === 'activo' && (f as any).pin_ponto_hash);
        for (const f of funcionarios) if (await hashPin(f.id, pin.trim()) === (f as any).pin_ponto_hash) return f;
        return null;
    }

    static async marcarNoQuiosque(f: Funcionario, tipo: TipoMarcacao, foto: string | null, dispositivoId: string, actor: ActorRH) {
        const hoje = luandaTodayKey();
        await this.assertEditavel([hoje]);
        const doDia = await this.marcacoesDoDia(f.id, hoje);
        if (!this.proximasAccoes(doDia).includes(tipo)) throw new Error('Esta marcação não segue a anterior.');
        const agoraLocal = agoraLuanda();
        if (doDia.some(m => !m.anulada && m.tipo === tipo && minutosAbsolutos(agoraLocal) - minutosAbsolutos(m.data_hora) < 2)) throw new Error('Já marcou há menos de 2 minutos.');
        const when = agora();
        await db.transaction([
            inserirMarcacao({ id: crypto.randomUUID(), funcionario_id: f.id, data: hoje, data_hora: agoraLocal, tipo, origem: 'quiosque', dispositivo_id: dispositivoId, foto, motivo: null }, actor, when),
            auditoriaRH(actor, 'create', `Quiosque: ${f.nome} marcou ${tipo.replace('_', ' ')} às ${horaDe(agoraLocal)}`, meta({ entidade: 'marcacao', funcionarioId: f.id, data: hoje, dispositivo: dispositivoId }), undefined, undefined, when),
        ]);
        return agoraLocal;
    }

    // ── Justificações pelo funcionário ────────────────────────────────────────────
    static justificacoes(funcionarioId?: string) {
        const colunas = 'id, funcionario_id, data_inicio, data_fim, ausencia_id, motivo_codigo, motivo, anexo_nome, anexo_mime, estado, comentario, decidido_por_nome, decidido_em, criado_em, criado_por_nome';
        return funcionarioId
            ? lista(db.all<Justificacao>(`SELECT ${colunas} FROM rh_justificacao WHERE funcionario_id = ? ORDER BY criado_em DESC`, [funcionarioId]))
            : lista(db.all<Justificacao>(`SELECT ${colunas} FROM rh_justificacao ORDER BY estado = 'pendente' DESC, criado_em DESC`));
    }

    static async anexoJustificacao(id: string) {
        return db.get<{ anexo_nome: string; anexo_data_url: string }>('SELECT anexo_nome, anexo_data_url FROM rh_justificacao WHERE id = ?', [id]).catch(() => undefined);
    }

    /** Pedido do funcionário: justificar uma falta ou dias sem registo, com documento (foto ou PDF até 5 MB). O chefe é avisado. */
    static async pedirJustificacao(f: Funcionario, input: { data_inicio: string; data_fim: string; motivo_codigo: string; motivo: string; anexo?: { nome: string; dataUrl: string } | null }, actor: ActorRH) {
        if (f.utilizador_id !== actor.id && !ServicoControloAcesso.temPermissao(actor as any, 'hr_manage')) throw new Error('Só pode justificar as suas faltas.');
        const fim = input.data_fim || input.data_inicio;
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.data_inicio) || fim < input.data_inicio) throw new Error('Indique o dia (ou o período) a justificar.');
        if (input.data_inicio > luandaTodayKey()) throw new Error('Só se justificam dias passados ou o de hoje.');
        if (!MOTIVOS_JUSTIFICACAO.some(m => m.codigo === input.motivo_codigo)) throw new Error('Escolha o motivo.');
        const motivo = motivoValido(input.motivo, 'a explicação');
        if (input.anexo) {
            if (!MIME_ANEXO.test(input.anexo.dataUrl)) throw new Error('O documento tem de ser uma fotografia (PNG, JPG) ou um PDF.');
            if (Math.ceil((input.anexo.dataUrl.length - input.anexo.dataUrl.indexOf(',') - 1) * 3 / 4) > LIMITE_ANEXO) throw new Error('O documento tem de ter no máximo 5 MB.');
        }
        const pendente = await db.get<{ id: string }>(`SELECT id FROM rh_justificacao WHERE funcionario_id = ? AND estado = 'pendente' AND data_inicio <= ? AND data_fim >= ?`, [f.id, fim, input.data_inicio]).catch(() => undefined);
        if (pendente) throw new Error('Já há um pedido de justificação pendente para estes dias.');
        const ausencia = await db.get<{ id: string }>(`SELECT id FROM rh_ausencia WHERE funcionario_id = ? AND estado <> 'anulada' AND data_inicio <= ? AND data_fim >= ?`, [f.id, fim, input.data_inicio]).catch(() => undefined);
        const id = crypto.randomUUID();
        const when = agora();
        const chefe = await db.get<{ utilizador_id: string | null }>(`SELECT r.utilizador_id FROM rh_departamento d JOIN rh_funcionario r ON r.id = d.responsavel_id WHERE d.id = ?`, [f.departamento_id]).catch(() => undefined);
        await db.transaction([
            { sql: `INSERT INTO rh_justificacao (id, funcionario_id, data_inicio, data_fim, ausencia_id, motivo_codigo, motivo, anexo_nome, anexo_mime, anexo_data_url, estado, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`,
                params: [id, f.id, input.data_inicio, fim, ausencia?.id || null, input.motivo_codigo, motivo, input.anexo?.nome || null,
                    input.anexo ? input.anexo.dataUrl.slice(5, input.anexo.dataUrl.indexOf(';')) : null, input.anexo?.dataUrl || null, when, actor.id, actor.name], expectChanges: 1 },
            { sql: `INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, 'warning', 0, ?)`,
                params: [`justificacao:${id}`, chefe?.utilizador_id || null, 'Justificação de falta por decidir', `${f.nome} pediu a justificação de ${input.data_inicio.split('-').reverse().join('/')}${fim !== input.data_inicio ? ` a ${fim.split('-').reverse().join('/')}` : ''}.`, when] },
            auditoriaRH(actor, 'create', `Pedido de justificação de ${f.nome}: ${input.data_inicio}${fim !== input.data_inicio ? ` a ${fim}` : ''}`, meta({ entidade: 'justificacao', funcionarioId: f.id, data: input.data_inicio, justificacaoId: id }), undefined, undefined, when),
        ]);
        return id;
    }

    /** Decisão do chefe ou do RH. Aprovada: a falta passa a justificada (ou é criada já justificada nos dias sem registo). */
    static async decidirJustificacao(id: string, aprovar: boolean, comentario: string, actor: ActorRH) {
        const j = await db.get<Justificacao>('SELECT * FROM rh_justificacao WHERE id = ?', [id]);
        if (!j || j.estado !== 'pendente') throw new Error('O pedido já foi decidido.');
        const [ctx, escopo] = await Promise.all([this.contexto(j.data_inicio, j.data_fim), this.escopo(actor)]);
        const f = ctx.funcionarios.find(x => x.id === j.funcionario_id);
        if (!f) throw new Error('Funcionário não encontrado.');
        this.assertPodeGerir(escopo, f);
        if (!aprovar && comentario.trim().length < 5) throw new Error('Indique o motivo da rejeição (o funcionário recebe-o).');
        await this.assertEditavel([j.data_inicio, j.data_fim]);
        const when = agora();
        const statements: Statement[] = [{
            sql: `UPDATE rh_justificacao SET estado = ?, comentario = ?, decidido_por = ?, decidido_por_nome = ?, decidido_em = ? WHERE id = ? AND estado = 'pendente'`,
            params: [aprovar ? 'aprovada' : 'rejeitada', comentario.trim() || null, actor.id, actor.name, when, id], expectChanges: 1,
        }];
        if (aprovar) {
            const codigo = MOTIVOS_JUSTIFICACAO.find(m => m.codigo === j.motivo_codigo)?.tipo || 'FJ';
            const tipo = ctx.tiposPorCodigo.get(codigo) || ctx.tiposPorCodigo.get('FJ');
            if (!tipo) throw new Error('Falta o tipo de ausência justificada nas configurações de RH.');
            const ausencia = j.ausencia_id ? ctx.ausencias.find(a => a.id === j.ausencia_id && a.estado !== 'anulada') : null;
            if (ausencia) {
                statements.push({ sql: `UPDATE rh_ausencia SET tipo_id = ?, documento_id = COALESCE(documento_id, ?), motivo = ?, estado = 'aprovada', aprovado_por = COALESCE(aprovado_por, ?), aprovado_por_nome = COALESCE(aprovado_por_nome, ?), aprovado_em = COALESCE(aprovado_em, ?), actualizado_em = ? WHERE id = ?`,
                    params: [tipo.id, `justificacao:${j.id}`, j.motivo, actor.id, actor.name, when, when, ausencia.id], expectChanges: 1 });
            } else {
                for (const data of datasEntre(j.data_inicio, j.data_fim)) {
                    const [dia] = calcularFuncionario(f, [data], ctx);
                    if (dia.estado !== 'SEM_REGISTO' && !(dia.estado === 'F' && !dia.ausencia_id)) continue;
                    statements.push(...this.prepararDia(ctx, f, data, { ausenciaNova: { tipo, motivo: j.motivo, documento_id: `justificacao:${j.id}` }, motivo: j.motivo, acao: 'approve', descricao: `Aprovou a justificação (${tipo.nome})` }, actor, when).statements);
                }
            }
        }
        const utilizador = (f as Funcionario).utilizador_id;
        if (utilizador) statements.push({ sql: `INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)`,
            params: [`justificacao-decisao:${id}`, utilizador, aprovar ? 'Justificação aprovada' : 'Justificação rejeitada',
                `${j.data_inicio.split('-').reverse().join('/')}: ${aprovar ? 'a falta passou a justificada.' : `rejeitada — ${comentario.trim()}`}`, aprovar ? 'success' : 'warning', when] });
        statements.push(auditoriaRH(actor, aprovar ? 'approve' : 'reject', `${aprovar ? 'Aprovou' : 'Rejeitou'} a justificação de ${f.nome} (${j.data_inicio})`,
            meta({ entidade: 'justificacao', funcionarioId: f.id, data: j.data_inicio, justificacaoId: id }), { estado: 'pendente' }, { estado: aprovar ? 'aprovada' : 'rejeitada', comentario }, when));
        await db.transaction(statements);
    }

    /** O ponto do próprio funcionário num mês (portal): os dias calculados e os totais. */
    static async meuMes(f: Funcionario, ano: number, mes: number) {
        const datas = datasDoMes(ano, mes);
        const ctx = await this.contexto(datas[0], datas[datas.length - 1]);
        const proprio = ctx.funcionarios.find(x => x.id === f.id);
        if (!proprio) throw new Error('Ficha não encontrada.');
        const dias = calcularFuncionario(proprio, datas, ctx);
        return { dias, totais: totaisDosDias(dias, ctx.hoje), config: ctx.config, horario: horarioDoFuncionario(proprio, ctx.horarios) };
    }

    // ── Painel «Hoje» ─────────────────────────────────────────────────────────────
    static async hoje() {
        const hoje = luandaTodayKey();
        const ctx = await this.contexto(hoje, hoje);
        const agoraLocal = agoraLuanda();
        const activos = ctx.funcionarios.filter(f => f.estado === 'activo' && f.data_admissao <= hoje && (!f.data_saida || f.data_saida >= hoje));
        const linhas = activos.map(f => ({ funcionario: f, dia: calcularFuncionario(f, [hoje], ctx)[0], horario: horarioDoFuncionario(f, ctx.horarios) }));
        const depoisDoAlerta = agoraLocal.slice(11, 16) >= ctx.config.hora_alerta_sem_marcacao;
        const contagem = (estado: string) => linhas.filter(l => l.dia.estado === estado).length;
        return {
            hoje, agora: agoraLocal,
            presentes: contagem('P'), ferias: contagem('Fe'), licenca: contagem('L') + contagem('D'),
            atrasados: linhas.filter(l => l.dia.estado === 'P' && l.dia.minutos_atraso > 0),
            ausentes: linhas.filter(l => l.dia.util && l.dia.estado === 'SEM_REGISTO' && depoisDoAlerta),
            faltas: linhas.filter(l => ['F', 'FJ'].includes(l.dia.estado)),
            semSaida: linhas.filter(l => l.dia.estado === 'P' && !l.dia.ultima_saida && l.dia.saida_prevista && minutosAbsolutos(agoraLocal) > minutosAbsolutos(l.dia.saida_prevista) + 120),
            config: ctx.config,
        };
    }
}

const antesDoDia = (marcacoes: Marcacao[]) => (marcacoes.length ? 'com marcações' : 'sem marcações');
const datasEntre = (de: string, ate: string) => {
    const datas: string[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) datas.push(d);
    return datas;
};
