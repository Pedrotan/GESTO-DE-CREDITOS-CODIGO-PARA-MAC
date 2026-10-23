// Processamento salarial: Aberto → Calculado → Aprovado → Pago → Fechado. Só em «aberto»/«calculado» mudam o
// ponto e as rubricas; a aprovação é de outra pessoa (excepto o Super Administrador); ao fechar, os lançamentos
// entram na contabilidade existente (ServicoContabilidade) e o mês fica imutável (triggers do esquema protegido).
import { db } from '@/bibliotecas/bd';
import { calcularRecibo, diasForaDoContrato, mesesServicoNoAno, type EntradaRecibo, type LinhaRecibo, type RubricaMotor, type TipoProcessamento } from '@/bibliotecas/rh/motor-salarial';
import { diasUteis, HORARIO_OMISSAO, horasSemanais, resumoMes } from '@/bibliotecas/rh/ponto';
import { tabelaIrtEmVigor, valorNumerico, valorTexto } from '@/bibliotecas/rh/parametros-rh';
import { isPrimaryOwner } from '@/bibliotecas/conta-principal';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoContabilidade } from '@/servicos/ServicoContabilidade';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { auditoriaRH, ServicoRH, type ActorRH } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';

type Statement = { sql: string; params?: unknown[]; expectChanges?: number };
export type EstadoProcessamento = 'aberto' | 'calculado' | 'aprovado' | 'pago' | 'fechado';
export type Processamento = {
    id: string; ano: number; mes: number; tipo: TipoProcessamento; estado: EstadoProcessamento; descricao: string | null; funcionarios_json: string | null;
    irt_tabela_id: string | null; parametros_json: string | null; total_bruto_minor: number; total_liquido_minor: number; total_inss_trab_minor: number;
    total_inss_emp_minor: number; total_irt_minor: number; total_outros_minor: number; num_recibos: number;
    calculado_por: string | null; calculado_por_nome: string | null; calculado_em: string | null; aprovado_por_nome: string | null; aprovado_em: string | null;
    pago_por_nome: string | null; pago_em: string | null; conta_pagamento: string | null; fechado_por_nome: string | null; fechado_em: string | null;
    lancamentos_json: string | null; criado_em: string; criado_por_nome: string | null;
};
export type Recibo = {
    id: string; processamento_id: string; funcionario_id: string; numero_recibo: string; nome: string; numero_mecanografico: string | null; cargo: string | null;
    departamento: string | null; nif: string | null; numero_inss: string | null; iban: string | null; banco: string | null; salario_base_minor: number;
    dias_trabalhados: number; valor_dia_minor: number; valor_hora_minor: number; total_abonos_minor: number; total_descontos_minor: number; bruto_minor: number;
    base_inss_minor: number; inss_minor: number; inss_emp_minor: number; isento_irt_minor: number; base_irt_minor: number; irt_minor: number; escalao_irt: number | null;
    outros_descontos_minor: number; liquido_minor: number; custo_empresa_minor: number; avisos_json: string | null; resumo_json: string | null; criado_em: string;
};
export type LinhaReciboRH = LinhaRecibo & { id: string; recibo_id: string };
export type RubricaPontual = { id: string; processamento_id: string; funcionario_id: string; rubrica_id: string; quantidade: number; valor_minor: number; descricao: string | null; criado_por_nome: string | null };

export const ROTULO_TIPO: Record<TipoProcessamento, string> = { normal: 'Salário', ferias: 'Subsídio de férias', natal: 'Subsídio de Natal', acerto: 'Acerto' };
const PREFIXO: Record<TipoProcessamento, string> = { normal: 'S', ferias: 'F', natal: 'N', acerto: 'A' };
const agora = () => new Date().toISOString();
const autoridadeTotal = (actor: ActorRH) => actor.role === 'super_admin' || isPrimaryOwner(actor);
const ultimoDia = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')}`;
const LOTE = 40;

export class ServicoSalariosRH {
    static processamentos() {
        return db.all<Processamento>('SELECT * FROM rh_processamento ORDER BY ano DESC, mes DESC, criado_em DESC').catch(() => [] as Processamento[]);
    }
    static recibos(processamentoId: string) {
        return db.all<Recibo>('SELECT * FROM rh_recibo WHERE processamento_id = ? ORDER BY nome', [processamentoId]).catch(() => [] as Recibo[]);
    }
    static recibosFuncionario(funcionarioId: string) {
        return db.all<Recibo & { ano: number; mes: number; tipo: TipoProcessamento; estado: EstadoProcessamento }>(`SELECT r.*, p.ano, p.mes, p.tipo, p.estado FROM rh_recibo r
            JOIN rh_processamento p ON p.id = r.processamento_id WHERE r.funcionario_id = ? ORDER BY p.ano DESC, p.mes DESC`, [funcionarioId])
            .catch(() => [] as Array<Recibo & { ano: number; mes: number; tipo: TipoProcessamento; estado: EstadoProcessamento }>);
    }
    /** Todos os recibos com o mês e o estado do processamento (relatórios). */
    static todosRecibos() {
        type Linha = Recibo & { ano: number; mes: number; tipo: TipoProcessamento; estado: EstadoProcessamento };
        return db.all<Linha>(`SELECT r.*, p.ano, p.mes, p.tipo, p.estado FROM rh_recibo r JOIN rh_processamento p ON p.id = r.processamento_id
            ORDER BY p.ano, p.mes, r.nome`).catch(() => [] as Linha[]);
    }
    /** Linhas de horas extra, atrasos e faltas de todos os recibos (relatório de horas extra e atrasos). */
    static linhasTempo() {
        return db.all<{ recibo_id: string; codigo: string; quantidade: number; valor_minor: number }>(`SELECT recibo_id, codigo, quantidade, valor_minor FROM rh_recibo_linha
            WHERE codigo IN ('HORAS_EXTRA', 'ATRASOS', 'FALTAS')`).catch(() => [] as Array<{ recibo_id: string; codigo: string; quantidade: number; valor_minor: number }>);
    }
    static linhas(reciboId: string) {
        return db.all<LinhaReciboRH>('SELECT * FROM rh_recibo_linha WHERE recibo_id = ? ORDER BY ordem, descricao', [reciboId]).catch(() => [] as LinhaReciboRH[]);
    }
    static linhasProcessamento(processamentoId: string) {
        return db.all<LinhaReciboRH>(`SELECT l.* FROM rh_recibo_linha l JOIN rh_recibo r ON r.id = l.recibo_id WHERE r.processamento_id = ? ORDER BY l.ordem`, [processamentoId]).catch(() => [] as LinhaReciboRH[]);
    }
    static pontuais(processamentoId: string) {
        return db.all<RubricaPontual>('SELECT * FROM rh_rubrica_pontual WHERE processamento_id = ? ORDER BY criado_em', [processamentoId]).catch(() => [] as RubricaPontual[]);
    }

    /** Abre um processamento: normal (um por mês, todos os activos), férias, Natal ou acerto (funcionários escolhidos). */
    static async abrir(input: { ano: number; mes: number; tipo: TipoProcessamento; funcionarios?: string[]; descricao?: string }, actor: ActorRH) {
        if (!Number.isInteger(input.ano) || input.mes < 1 || input.mes > 12) throw new Error('Ano ou mês inválido.');
        const existentes = await this.processamentos();
        if (input.tipo === 'normal' && existentes.some(p => p.tipo === 'normal' && p.ano === input.ano && p.mes === input.mes))
            throw new Error('Já existe o processamento normal deste mês.');
        if (input.tipo === 'acerto' && !input.funcionarios?.length) throw new Error('Escolha os funcionários do acerto.');
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_processamento (id, ano, mes, tipo, estado, descricao, funcionarios_json, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, 'aberto', ?, ?, ?, ?, ?)`,
                params: [id, input.ano, input.mes, input.tipo, input.descricao?.trim() || null, input.funcionarios?.length ? JSON.stringify(input.funcionarios) : null, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Abriu o processamento ${ROTULO_TIPO[input.tipo]} de ${String(input.mes).padStart(2, '0')}/${input.ano}`, { processamentoId: id }, undefined, undefined, when),
        ]);
        return id;
    }

    /** Apaga um processamento que ainda está aberto (aberto por engano). */
    static async apagarAberto(p: Processamento, actor: ActorRH) {
        if (p.estado !== 'aberto') throw new Error('Só se apaga um processamento aberto.');
        await db.transaction([
            { sql: 'DELETE FROM rh_rubrica_pontual WHERE processamento_id = ?', params: [p.id] },
            { sql: `DELETE FROM rh_processamento WHERE id = ? AND estado = 'aberto'`, params: [p.id], expectChanges: 1 },
            auditoriaRH(actor, 'delete', `Apagou o processamento aberto ${String(p.mes).padStart(2, '0')}/${p.ano} (${ROTULO_TIPO[p.tipo]})`, { processamentoId: p.id }),
        ]);
    }

    static async acrescentarPontual(p: Processamento, input: { funcionario_id: string; rubrica_id: string; valor_minor: number; quantidade?: number; descricao?: string }, actor: ActorRH) {
        if (!['aberto', 'calculado'].includes(p.estado)) throw new Error('O processamento já foi aprovado.');
        if (!input.funcionario_id || !input.rubrica_id || !(input.valor_minor > 0)) throw new Error('Escolha o funcionário, a rubrica e o valor.');
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_rubrica_pontual (id, processamento_id, funcionario_id, rubrica_id, quantidade, valor_minor, descricao, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), p.id, input.funcionario_id, input.rubrica_id, Number(input.quantidade) || 1, Math.round(input.valor_minor), input.descricao?.trim() || null, when, actor.id, actor.name], expectChanges: 1 },
            // Volta a «aberto»: os valores mudaram e têm de ser recalculados antes da aprovação.
            { sql: `UPDATE rh_processamento SET estado = 'aberto', actualizado_em = ? WHERE id = ? AND estado IN ('aberto', 'calculado')`, params: [when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Rubrica pontual no processamento ${p.mes}/${p.ano}`, { processamentoId: p.id, funcionarioId: input.funcionario_id }, undefined, input, when),
        ]);
    }

    static async retirarPontual(p: Processamento, id: string, actor: ActorRH) {
        const when = agora();
        await db.transaction([
            { sql: 'DELETE FROM rh_rubrica_pontual WHERE id = ? AND processamento_id = ?', params: [id, p.id], expectChanges: 1 },
            { sql: `UPDATE rh_processamento SET estado = 'aberto', actualizado_em = ? WHERE id = ? AND estado IN ('aberto', 'calculado')`, params: [when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'delete', `Retirou uma rubrica pontual do processamento ${p.mes}/${p.ano}`, { processamentoId: p.id, rubricaPontualId: id }, undefined, undefined, when),
        ]);
    }

    /** Corre o motor para todos os funcionários do processamento e grava recibos, linhas, totais e as taxas usadas. */
    static async calcular(p: Processamento, actor: ActorRH) {
        if (!['aberto', 'calculado'].includes(p.estado)) throw new Error('Só se calcula um processamento aberto ou calculado.');
        const referencia = ultimoDia(p.ano, p.mes);
        const hoje = luandaTodayKey();
        const [funcionarios, contratos, rubricas, fixas, pontuais, parametros, tabelas, horarios, feriados, pontos, ausencias, tipos, cargos, departamentos] = await Promise.all([
            ServicoRH.funcionarios(), ServicoRH.contratos(), ServicoRH.rubricas(), ServicoRH.todasRubricasFuncionarios(), this.pontuais(p.id), ServicoRH.parametros(),
            ServicoRH.tabelasIrt(), ServicoTempoRH.horarios(), ServicoTempoRH.feriados(), ServicoTempoRH.pontosMes(p.ano, p.mes), ServicoTempoRH.ausencias(),
            ServicoTempoRH.tiposAusencia(), ServicoRH.cargos(), ServicoRH.departamentos(),
        ]);
        const tabela = tabelaIrtEmVigor(tabelas, referencia);
        if (!tabela) throw new Error(`Não há tabela do IRT em vigor a ${referencia}. Crie-a nas Configurações de RH.`);
        const escaloes = await ServicoRH.escaloesIrt(tabela.id);
        const porCodigo = new Map(rubricas.map(r => [r.codigo, r as RubricaMotor]));
        const porId = new Map(rubricas.map(r => [r.id, r as RubricaMotor]));
        const sistema = Object.fromEntries((['SAL_BASE', 'FALTAS', 'ATRASOS', 'HORAS_EXTRA', 'SUB_FERIAS', 'SUB_NATAL'] as const).map(c => {
            const r = porCodigo.get(c);
            if (!r) throw new Error(`Falta a rubrica de sistema ${c}.`);
            return [c, r];
        })) as EntradaRecibo['sistema'];
        const num = (chave: string, omissao: number) => valorNumerico(parametros, chave, referencia, omissao);
        const taxas = {
            inss_trabalhador: num('inss_trabalhador', 0.03), inss_empresa: num('inss_empresa', 0.08), inss_reformado: num('inss_reformado', 0.08),
            divisor_dia: valorTexto(parametros, 'divisor_dia', referencia, '30'), horas_extra_acrescimo: num('horas_extra_acrescimo', 0.5),
            horas_extra_feriado_acrescimo: num('horas_extra_feriado_acrescimo', 1), subsidio_ferias_pct: num('subsidio_ferias_pct', 0.5),
            subsidio_natal_pct: num('subsidio_natal_pct', 0.5), salario_minimo: num('salario_minimo', 0), irt_tabela: `${tabela.ano} — ${tabela.lei_referencia}`,
        };
        const escolhidos = p.funcionarios_json ? new Set<string>(JSON.parse(p.funcionarios_json)) : null;
        const inicioMes = `${p.ano}-${String(p.mes).padStart(2, '0')}-01`;
        const elegiveis = funcionarios.filter(f => (escolhidos ? escolhidos.has(f.id) : true) && f.data_admissao <= referencia && (!f.data_saida || f.data_saida >= inicioMes)
            && (escolhidos || f.estado !== 'suspenso'));

        const recibos: Array<{ recibo: Statement; linhas: Statement[]; totais: { bruto: number; liquido: number; inss: number; inssEmp: number; irt: number; outros: number } }> = [];
        const when = agora();
        elegiveis.forEach((f, indice) => {
            const contrato = contratos.find(c => c.funcionario_id === f.id && c.estado === 'activo')
                || contratos.filter(c => c.funcionario_id === f.id && c.inicio <= referencia).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
            const avisos: string[] = [];
            if (!contrato) avisos.push('Sem contrato: salário base 0.');
            const base = contrato?.salario_base_minor || 0;
            const horario = horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
            const resumo = resumoMes({ funcionarioId: f.id, ano: p.ano, mes: p.mes, horario, feriados, pontos, ausencias, tipos, admissao: f.data_admissao, saida: f.data_saida, hoje });
            const divisor = taxas.divisor_dia === 'uteis' ? diasUteis(inicioMes, referencia, horario, feriados) : 30;
            const linhasFixas = fixas.filter(x => x.funcionario_id === f.id && x.inicio <= referencia && (!x.fim || x.fim >= inicioMes))
                .map(x => ({ rubrica: porId.get(x.rubrica_id)!, valorMinor: x.valor_minor, quantidade: x.quantidade })).filter(x => x.rubrica);
            const linhasMes = pontuais.filter(x => x.funcionario_id === f.id)
                .map(x => ({ rubrica: porId.get(x.rubrica_id)!, valorMinor: x.valor_minor, quantidade: x.quantidade, descricao: x.descricao || undefined })).filter(x => x.rubrica);
            const reformado = Boolean(f.reformado);
            const resultado = calcularRecibo({
                tipo: p.tipo, salarioBaseMinor: base, horasSemanais: contrato?.horas_semanais || horasSemanais(horario) || 40, divisorDia: divisor,
                diasForaContrato: diasForaDoContrato(p.ano, p.mes, f.data_admissao, f.data_saida, divisor),
                faltasDescontaveis: resumo.faltasDescontaveis, minutosAtraso: resumo.minutosAtraso, horasExtra: resumo.horasExtra, horasExtraFeriado: resumo.horasExtraFeriado,
                acrescimoHorasExtra: taxas.horas_extra_acrescimo, acrescimoHorasExtraFeriado: taxas.horas_extra_feriado_acrescimo,
                subsidioPct: p.tipo === 'ferias' ? taxas.subsidio_ferias_pct : taxas.subsidio_natal_pct, mesesServico: mesesServicoNoAno(p.ano, f.data_admissao, f.data_saida),
                // Só as rubricas fixas entram no salário normal; nos subsídios e acertos entram só as do próprio processamento.
                rubricas: p.tipo === 'normal' ? [...linhasFixas, ...linhasMes] : linhasMes, sistema,
                // Reformado que volta ao activo: taxa especial a cargo da empresa (parâmetro inss_reformado; confirmar com o contabilista).
                taxaInssTrabalhador: reformado ? 0 : taxas.inss_trabalhador, taxaInssEmpresa: reformado ? taxas.inss_reformado : taxas.inss_empresa,
                escaloes,
            });
            if (!f.iban) avisos.push('Sem IBAN.');
            if (p.tipo === 'normal' && taxas.salario_minimo > 0 && base > 0 && base < taxas.salario_minimo * 100) avisos.push('Salário base abaixo do mínimo nacional.');
            if (p.tipo === 'normal' && resumo.ausenciasPendentes) avisos.push(`${resumo.ausenciasPendentes} ausência(s) pendente(s) de justificação ou aprovação.`);
            if (p.tipo === 'normal' && resumo.diasSemRegisto) avisos.push(`${resumo.diasSemRegisto} dia(s) útil(eis) sem registo de ponto nem falta.`);
            if (resultado.liquidoMinor < 0) avisos.push('Líquido negativo: reveja os descontos.');
            const reciboId = crypto.randomUUID();
            const numero = `${p.ano}${String(p.mes).padStart(2, '0')}-${PREFIXO[p.tipo]}-${String(indice + 1).padStart(4, '0')}`;
            recibos.push({
                recibo: {
                    sql: `INSERT INTO rh_recibo (id, processamento_id, funcionario_id, numero_recibo, nome, numero_mecanografico, cargo, departamento, nif, numero_inss, iban, banco,
                            salario_base_minor, dias_trabalhados, valor_dia_minor, valor_hora_minor, total_abonos_minor, total_descontos_minor, bruto_minor, base_inss_minor,
                            inss_minor, inss_emp_minor, isento_irt_minor, base_irt_minor, irt_minor, escalao_irt, outros_descontos_minor, liquido_minor, custo_empresa_minor,
                            avisos_json, resumo_json, criado_em)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    params: [reciboId, p.id, f.id, numero, f.nome, f.numero_mecanografico, cargos.find(c => c.id === f.cargo_id)?.nome || null,
                        departamentos.find(d => d.id === f.departamento_id)?.nome || null, f.nif, f.numero_inss, f.iban, f.banco, base, resultado.diasTrabalhados,
                        resultado.valorDiaMinor, resultado.valorHoraMinor, resultado.totalAbonosMinor, resultado.totalDescontosMinor, resultado.brutoMinor, resultado.baseInssMinor,
                        resultado.inssTrabalhadorMinor, resultado.inssEmpresaMinor, resultado.isentoIrtMinor, resultado.materiaColectavelMinor, resultado.irtMinor,
                        resultado.escalaoIrt, resultado.outrosDescontosMinor, resultado.liquidoMinor, resultado.custoEmpresaMinor,
                        avisos.length ? JSON.stringify(avisos) : null, JSON.stringify({ ...resumo, taxaIrt: resultado.taxaIrt, reformado }), when],
                    expectChanges: 1,
                },
                linhas: resultado.linhas.map((l, i) => ({
                    sql: `INSERT INTO rh_recibo_linha (id, recibo_id, rubrica_id, codigo, descricao, tipo, quantidade, valor_unitario_minor, valor_minor, incide_inss, incide_irt, isento_irt_minor, ordem)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    params: [`${reciboId}:${i + 1}`, reciboId, l.rubrica_id, l.codigo, l.descricao, l.tipo, l.quantidade, l.valor_unitario_minor, l.valor_minor, l.incide_inss, l.incide_irt, l.isento_irt_minor, l.ordem],
                    expectChanges: 1,
                })),
                totais: { bruto: resultado.brutoMinor, liquido: resultado.liquidoMinor, inss: resultado.inssTrabalhadorMinor, inssEmp: resultado.inssEmpresaMinor, irt: resultado.irtMinor, outros: resultado.outrosDescontosMinor },
            });
        });
        if (!recibos.length) throw new Error('Não há funcionários para processar neste mês.');

        // Volta a «aberto» e limpa o cálculo anterior; grava em lotes (limite de instruções por transacção) e só no fim passa a «calculado».
        await db.transaction([
            { sql: `UPDATE rh_processamento SET estado = 'aberto', actualizado_em = ? WHERE id = ? AND estado IN ('aberto', 'calculado')`, params: [when, p.id], expectChanges: 1 },
            { sql: 'DELETE FROM rh_recibo_linha WHERE recibo_id IN (SELECT id FROM rh_recibo WHERE processamento_id = ?)', params: [p.id] },
            { sql: 'DELETE FROM rh_recibo WHERE processamento_id = ?', params: [p.id] },
        ]);
        for (let i = 0; i < recibos.length; i += LOTE) {
            await db.transaction(recibos.slice(i, i + LOTE).flatMap(x => [x.recibo, ...x.linhas]));
        }
        const total = (k: keyof (typeof recibos)[number]['totais']) => recibos.reduce((s, x) => s + x.totais[k], 0);
        await db.transaction([
            { sql: `UPDATE rh_processamento SET estado = 'calculado', irt_tabela_id = ?, parametros_json = ?, total_bruto_minor = ?, total_liquido_minor = ?, total_inss_trab_minor = ?,
                    total_inss_emp_minor = ?, total_irt_minor = ?, total_outros_minor = ?, num_recibos = ?, calculado_por = ?, calculado_por_nome = ?, calculado_em = ?, actualizado_em = ?
                    WHERE id = ? AND estado = 'aberto'`,
                params: [tabela.id, JSON.stringify(taxas), total('bruto'), total('liquido'), total('inss'), total('inssEmp'), total('irt'), total('outros'), recibos.length,
                    actor.id, actor.name, when, when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Calculou o processamento ${String(p.mes).padStart(2, '0')}/${p.ano} (${ROTULO_TIPO[p.tipo]}): ${recibos.length} recibo(s)`,
                { processamentoId: p.id, totalLiquidoMinor: total('liquido'), irtTabela: tabela.id }, undefined, taxas, when),
        ]);
        return { recibos: recibos.length };
    }

    /** Volta de «calculado» a «aberto» (corrigir o ponto e recalcular). */
    static async reabrir(p: Processamento, motivo: string, actor: ActorRH) {
        if (p.estado === 'fechado') throw new Error('Um mês fechado não se reabre: faça um processamento de acerto no mês seguinte.');
        const when = agora();
        if (p.estado === 'calculado') {
            await db.transaction([
                { sql: `UPDATE rh_processamento SET estado = 'aberto', actualizado_em = ? WHERE id = ? AND estado = 'calculado'`, params: [when, p.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Reabriu o processamento ${p.mes}/${p.ano} para correcção`, { processamentoId: p.id, motivo }, undefined, undefined, when),
            ]);
            return;
        }
        // Aprovado ou pago (ainda sem contabilidade): só o Super Administrador, com justificação.
        if (!autoridadeTotal(actor)) throw new Error('Só o Super Administrador reabre um processamento aprovado ou pago.');
        if (!motivo?.trim() || motivo.trim().length < 10) throw new Error('Indique a justificação da reabertura (pelo menos 10 caracteres).');
        await db.transaction([
            { sql: `UPDATE rh_processamento SET estado = 'calculado', aprovado_por = NULL, aprovado_por_nome = NULL, aprovado_em = NULL, pago_por = NULL, pago_por_nome = NULL, pago_em = NULL,
                    actualizado_em = ? WHERE id = ? AND estado IN ('aprovado', 'pago')`, params: [when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Reabriu o processamento ${p.mes}/${p.ano} (${p.estado} → calculado): ${motivo.trim()}`, { processamentoId: p.id, motivo: motivo.trim(), justification: motivo.trim() },
                { estado: p.estado }, { estado: 'calculado' }, when),
        ]);
    }

    /** Aprovação: outra pessoa que não quem calculou (o Super Administrador pode fazer ambos). */
    static async aprovar(p: Processamento, actor: ActorRH) {
        if (p.estado !== 'calculado') throw new Error('Só se aprova um processamento calculado.');
        const when = agora();
        const proprio = p.calculado_por === actor.id;
        if (proprio && !autoridadeTotal(actor)) throw new Error('O processamento tem de ser aprovado por outra pessoa (quem calculou não aprova).');
        await db.transaction([
            proprio
                ? { sql: `UPDATE rh_processamento SET aprovado_por = ?, aprovado_por_nome = ?, aprovado_em = ?, estado = 'aprovado', actualizado_em = ? WHERE id = ? AND estado = 'calculado'`,
                    params: [actor.id, actor.name, when, when, p.id], expectChanges: 1 }
                : { sql: `UPDATE rh_processamento SET aprovado_por = ?, aprovado_por_nome = ?, aprovado_em = ?, estado = 'aprovado', actualizado_em = ? WHERE id = ? AND estado = 'calculado' AND calculado_por <> ?`,
                    params: [actor.id, actor.name, when, when, p.id, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'approve', `Aprovou o processamento ${p.mes}/${p.ano} (${ROTULO_TIPO[p.tipo]}): líquido ${(p.total_liquido_minor / 100).toFixed(2)} Kz`,
                { processamentoId: p.id, totalLiquidoMinor: p.total_liquido_minor }, undefined, undefined, when),
        ]);
    }

    /** Pagamento: marca os recibos como pagos (o ficheiro de transferências é gerado na página). */
    static async pagar(p: Processamento, conta: 'bank' | 'cash', actor: ActorRH) {
        if (p.estado !== 'aprovado') throw new Error('Só se paga um processamento aprovado.');
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_processamento SET pago_por = ?, pago_por_nome = ?, pago_em = ?, conta_pagamento = ?, estado = 'pago', actualizado_em = ? WHERE id = ? AND estado = 'aprovado'`,
                params: [actor.id, actor.name, when, conta, when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Marcou como pago o processamento ${p.mes}/${p.ano} (${conta === 'bank' ? 'banco' : 'caixa'})`, { processamentoId: p.id }, undefined, undefined, when),
        ]);
    }

    /**
     * Fecho: lança na contabilidade existente (despesas pagas pela conta do pagamento) os salários líquidos, o INSS
     * (trabalhador + empresa) e o IRT retido, e bloqueia o mês. Os lançamentos ficam ligados ao processamento.
     */
    static async fechar(p: Processamento, actor: ActorRH) {
        if (p.estado !== 'pago') throw new Error('Só se fecha um processamento pago.');
        const conta = (p.conta_pagamento === 'cash' ? 'cash' : 'bank') as 'cash' | 'bank';
        const periodo = `${String(p.mes).padStart(2, '0')}/${p.ano}`;
        const lancamentos = [
            { descricao: `${ROTULO_TIPO[p.tipo]} ${periodo}: salários líquidos (${p.num_recibos} recibo(s))`, valor: p.total_liquido_minor, rubrica: 'salarios_liquidos' },
            { descricao: `${ROTULO_TIPO[p.tipo]} ${periodo}: INSS (trabalhador ${(p.total_inss_trab_minor / 100).toFixed(2)} + empresa ${(p.total_inss_emp_minor / 100).toFixed(2)} Kz)`, valor: p.total_inss_trab_minor + p.total_inss_emp_minor, rubrica: 'inss' },
            { descricao: `${ROTULO_TIPO[p.tipo]} ${periodo}: IRT retido`, valor: p.total_irt_minor, rubrica: 'irt' },
        ].filter(l => l.valor > 0);
        if (await ServicoFinanceiro.getPanicLock()) throw new Error('A movimentação financeira está congelada.');
        if ((await ServicoFinanceiro.getAccountingConfig()).cashGuard) {
            const saldo = await ServicoFinanceiro.liquidBalancesMinor();
            const total = lancamentos.reduce((s, l) => s + l.valor, 0);
            if (saldo[conta] < total) throw new Error(`Saldo insuficiente em ${conta === 'bank' ? 'banco' : 'caixa'} para lançar ${(total / 100).toLocaleString('pt-PT')} Kz (disponível ${(saldo[conta] / 100).toLocaleString('pt-PT')} Kz).`);
        }
        const criados: Array<{ id: string; rubrica: string; valor: number }> = [];
        for (const l of lancamentos) {
            const entrada = await ServicoContabilidade.createEntry({
                type: 'adjustment', description: l.descricao, debit: 'expenses', credit: conta, amountPrincipal: 0, amountInterest: 0, amountLateInterest: 0,
                amountTotal: l.valor / 100, processedBy: actor.name, usuario_id: actor.id, category: 'salarios',
            } as Parameters<typeof ServicoContabilidade.createEntry>[0]);
            criados.push({ id: entrada.id, rubrica: l.rubrica, valor: l.valor });
        }
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_processamento SET fechado_por = ?, fechado_por_nome = ?, fechado_em = ?, lancamentos_json = ?, estado = 'fechado', actualizado_em = ? WHERE id = ? AND estado = 'pago'`,
                params: [actor.id, actor.name, when, JSON.stringify(criados), when, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Fechou o processamento ${periodo} (${ROTULO_TIPO[p.tipo]}) e lançou ${criados.length} movimento(s) na contabilidade`,
                { processamentoId: p.id, lancamentos: criados }, undefined, undefined, when),
        ]);
        return criados;
    }
}
