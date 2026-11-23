// Painel de RH: junta numa só chamada (o «GET /rh/painel» da arquitectura local-first) o dia de hoje, os pedidos do
// portal, os 8 indicadores com variação, as séries dos gráficos, o mapa de presença, os alertas, os próximos eventos
// e o estado dos salários do mês. Todos os números saem do livro de ponto, dos contratos, das férias e dos
// processamentos (fuso de Luanda, horário de cada funcionário e calendário laboral). Respeita o departamento e o
// período escolhidos; sem «Ver salários» não lê processamentos nem valores.
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { estadoEfectivo, saldoFerias } from '@/bibliotecas/rh/ferias';
import { calendarioDoAno } from '@/bibliotecas/rh/calendario-laboral';
import { prazoContrato } from '@/bibliotecas/rh/contratos-rh';
import { somarDias, datasDoMes } from '@/bibliotecas/rh/ponto';
import {
    assiduidade, assiduidadeDiaria, ausencias, camposEmFalta, estadoMapa, etapaSalarios, extrasEFaltas, intervaloDoPeriodo, mesesDoIntervalo, variacao,
    type EstadoMapa, type EtapaSalarios, type Intervalo, type LinhaPainel, type Periodo, type TiposAusencia,
} from '@/bibliotecas/rh/painel-rh';
import { ServicoRH, type Funcionario } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';
import { ServicoPontoRH } from './ServicoPontoRH';
import { ServicoFeriasRH, type PlanoFeriasRH } from './ServicoFeriasRH';
import { ServicoSalariosRH } from './ServicoSalariosRH';
import { ServicoPortalComunicacao, type PedidoRH } from './ServicoPortalComunicacao';
import { ServicoAlertasRH, type AlertaRH } from './ServicoAlertasRH';

export type FiltroPainel = { departamentoId: string | null; periodo: Periodo; de?: string; ate?: string; salarios: boolean };
export type PedidoPainel = {
    id: string; tipo: 'ferias' | 'dispensa' | 'justificacao' | 'pedido'; rotulo: string; funcionarioId: string; nome: string; detalhe: string; criadoEm: string;
    origem: PlanoFeriasRH | PedidoRH | { id: string };
};
export type EventoPainel = { data: string; tipo: 'fecho' | 'feriado' | 'ponte' | 'ferias' | 'aniversario' | 'contrato'; titulo: string; detalhe: string; rota?: string };

const agoraLuanda = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const SEMANA_EXTENSO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const dataPt = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

export class ServicoPainelRH {
    /** Dias do livro de ponto dos meses pedidos, juntos por funcionário (o mesmo motor do processamento salarial). */
    private static async linhas(meses: Array<{ ano: number; mes: number }>) {
        const unicos = [...new Map(meses.map(m => [`${m.ano}-${m.mes}`, m])).values()];
        const grelhas = await Promise.all(unicos.map(m => ServicoPontoRH.grelha(m.ano, m.mes).catch(() => null)));
        const porFuncionario = new Map<string, LinhaPainel>();
        for (const g of grelhas) for (const l of g?.grelha.linhas || []) {
            const x = porFuncionario.get(l.funcionario.id) || { funcionarioId: l.funcionario.id, nome: l.funcionario.nome, departamentoId: l.funcionario.departamento_id, dias: [] };
            x.dias.push(...l.dias);
            porFuncionario.set(l.funcionario.id, x);
        }
        for (const l of porFuncionario.values()) l.dias.sort((a, b) => a.data.localeCompare(b.data));
        const estados = await Promise.all(unicos.map(async m => [`${m.ano}-${String(m.mes).padStart(2, '0')}`, await ServicoPontoRH.estadoMes(m.ano, m.mes).catch(() => 'aberto')] as const));
        return { linhas: [...porFuncionario.values()], estados: new Map<string, string>(estados) };
    }

    static async carregar(f: FiltroPainel) {
        const hoje = luandaTodayKey();
        const intervalo = intervaloDoPeriodo(f.periodo, hoje, { de: f.de, ate: f.ate });
        // Gráfico diário: «hoje» e «esta semana» mostram os últimos 20 dias úteis (até ~5 semanas para trás).
        const intervaloDiario: Intervalo = ['hoje', 'semana'].includes(f.periodo) ? { de: somarDias(hoje, -35), ate: hoje } : { de: intervalo.de, ate: intervalo.ate > hoje ? hoje : intervalo.ate };
        const mesMapa = intervalo.ate.slice(0, 7) > hoje.slice(0, 7) ? hoje.slice(0, 7) : intervalo.ate.slice(0, 7);
        const [anoMapa, numMapa] = mesMapa.split('-').map(Number);
        const meses = [...mesesDoIntervalo({ de: intervalo.anterior.de, ate: intervalo.ate > hoje ? hoje : intervalo.ate }), ...mesesDoIntervalo(intervaloDiario), { ano: anoMapa, mes: numMapa }];

        const [funcionariosTodos, departamentos, contratos, parametros, planos, ausenciasRegistadas, justificacoes, pedidos, alertasAbertos, hojePonto, registados, opcoes, dadosPonto] = await Promise.all([
            ServicoRH.funcionarios(), ServicoRH.departamentos(), ServicoRH.contratos(), ServicoRH.parametros(), ServicoFeriasRH.planos(), ServicoTempoRH.ausencias(),
            ServicoPontoRH.justificacoes().catch(() => []), ServicoPortalComunicacao.todosPedidos().catch(() => [] as PedidoRH[]), ServicoAlertasRH.abertos(),
            ServicoPontoRH.hoje().catch(() => null), ServicoTempoRH.feriadosRegistados(), ServicoTempoRH.opcoesCalendario(), this.linhas(meses),
        ]);
        const processamentos = f.salarios ? await ServicoSalariosRH.processamentos().catch(() => []) : [];
        const noDepartamento = (x: { departamento_id?: string | null; departamentoId?: string | null }) => !f.departamentoId || (x.departamento_id ?? x.departamentoId) === f.departamentoId;
        const funcionarios = funcionariosTodos.filter(noDepartamento);
        const ids = new Set(funcionarios.map(x => x.id));
        const activos = funcionarios.filter(x => x.estado === 'activo');
        const linhas = dadosPonto.linhas.filter(l => ids.has(l.funcionarioId) && funcionarios.find(x => x.id === l.funcionarioId)?.estado !== 'cessado');
        const contratoActivo = new Map(contratos.filter(c => c.estado === 'activo').map(c => [c.funcionario_id, c]));
        const num = (chave: string, omissao: number) => valorNumerico(parametros, chave, hoje, omissao);
        const fimPeriodo = intervalo.ate > hoje ? hoje : intervalo.ate;

        // ── Hoje ──
        const calendarioHoje = calendarioDoAno(Number(hoje.slice(0, 4)), registados, opcoes).get(hoje);
        const feriadoHoje = calendarioHoje?.folga && calendarioHoje.activo ? calendarioHoje.nome : null;
        const presentesHoje = linhas.filter(l => l.dias.find(d => d.data === hoje)?.estado === 'P').length;
        const devidos = linhas.filter(l => { const d = l.dias.find(x => x.data === hoje); return d && d.util && !['Fe', 'L', 'D', 'FORA', 'FR', 'FS'].includes(d.estado); }).length;
        const ausentesHoje = (hojePonto?.ausentes || []).filter(l => ids.has(l.funcionario.id)).map(l => ({
            id: l.funcionario.id, nome: l.funcionario.nome, telefone: (l.funcionario as Funcionario).telefone || null,
            departamento: departamentos.find(d => d.id === l.funcionario.departamento_id)?.nome || '—',
        }));
        const contaHoje = (estados: string[]) => linhas.filter(l => estados.includes(l.dias.find(d => d.data === hoje)?.estado || '')).length;
        const semMarcacoes = Boolean(hojePonto) && !feriadoHoje && devidos > 0 && presentesHoje === 0 && agoraLuanda().slice(11, 16) >= '09:00'
            && !linhas.some(l => (l.dias.find(d => d.data === hoje)?.primeira_entrada));
        const hojeBloco = {
            data: hoje, diaSemana: SEMANA_EXTENSO[new Date(`${hoje}T12:00:00Z`).getUTCDay()], feriado: feriadoHoje,
            diaUtil: devidos > 0 && !feriadoHoje,
            presentes: presentesHoje, atrasados: (hojePonto?.atrasados || []).filter(l => ids.has(l.funcionario.id)).length,
            ausentes: feriadoHoje ? 0 : ausentesHoje.length, ferias: contaHoje(['Fe']), licencas: contaHoje(['L', 'D']),
            taxaPresenca: devidos ? Math.round((presentesHoje / devidos) * 100) : 0, devidos,
            ausentesLista: feriadoHoje ? [] : ausentesHoje, horaAlerta: hojePonto?.config.hora_alerta_sem_marcacao || '08:30',
        };

        // ── Portal ──
        const nome = (id: string) => funcionariosTodos.find(x => x.id === id)?.nome || 'Funcionário';
        const recentes: PedidoPainel[] = [
            ...planos.filter(p => p.estado === 'planeado' && p.pedido_funcionario && ids.has(p.funcionario_id)).map(p => ({
                id: p.id, tipo: 'ferias' as const, rotulo: 'Férias', funcionarioId: p.funcionario_id, nome: nome(p.funcionario_id),
                detalhe: `${dataPt(p.data_inicio || '')} a ${dataPt(p.data_fim || '')} · ${p.dias} dias úteis${p.chefe_aprovado_em ? ' · aprovado pelo chefe' : ''}`, criadoEm: (p as { criado_em?: string }).criado_em || '', origem: p })),
            ...ausenciasRegistadas.filter(a => a.estado === 'pendente' && ids.has(a.funcionario_id)).map(a => ({
                id: a.id, tipo: 'dispensa' as const, rotulo: 'Dispensa', funcionarioId: a.funcionario_id, nome: nome(a.funcionario_id),
                detalhe: `${dataPt(a.data_inicio)}${a.data_fim !== a.data_inicio ? ` a ${dataPt(a.data_fim)}` : ''}${a.motivo ? ` · ${a.motivo}` : ''}`, criadoEm: a.criado_em, origem: a })),
            ...justificacoes.filter(j => j.estado === 'pendente' && ids.has(j.funcionario_id)).map(j => ({
                id: j.id, tipo: 'justificacao' as const, rotulo: 'Justificação de falta', funcionarioId: j.funcionario_id, nome: nome(j.funcionario_id),
                detalhe: `${dataPt(j.data_inicio)}${j.data_fim !== j.data_inicio ? ` a ${dataPt(j.data_fim)}` : ''} · ${j.motivo}`, criadoEm: j.criado_em, origem: { id: j.id } })),
            ...pedidos.filter(p => p.estado === 'pendente' && ids.has(p.funcionario_id)).map(p => ({
                id: p.id, tipo: 'pedido' as const, rotulo: p.tipo === 'declaracao' ? 'Declaração' : p.tipo === 'subsidio_ferias' ? 'Subsídio de férias' : /^altera[çc][ãa]o de dados/iu.test(p.assunto || '') ? 'Alteração de dados' : 'Outro pedido',
                funcionarioId: p.funcionario_id, nome: nome(p.funcionario_id), detalhe: p.assunto + (p.descricao ? ` · ${p.descricao}` : ''), criadoEm: p.criado_em, origem: p })),
        ].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
        const portal = {
            ferias: recentes.filter(r => r.tipo === 'ferias').length, justificacoes: recentes.filter(r => r.tipo === 'justificacao').length,
            declaracoes: recentes.filter(r => r.tipo === 'pedido' && (r.origem as PedidoRH).tipo === 'declaracao').length,
            alteracoes: recentes.filter(r => r.tipo === 'pedido' && /^altera[çc][ãa]o de dados/iu.test((r.origem as PedidoRH).assunto || '')).length,
            pendentes: recentes.length, recentes: recentes.slice(0, 5),
            comAcesso: activos.filter(x => x.utilizador_id).length, total: activos.length,
            antigos: recentes.filter(r => r.criadoEm && Date.parse(r.criadoEm) < Date.now() - 48 * 3_600_000).length,
        };

        // ── Indicadores ──
        const massa = activos.reduce((s, x) => s + (contratoActivo.get(x.id)?.salario_base_minor || 0), 0);
        const comSalario = activos.filter(x => contratoActivo.has(x.id)).length;
        const transitadosMax = num('ferias_transitados_max', 0);
        const anoFerias = Number(hoje.slice(0, 4));
        const saldos = activos.map(x => {
            const direito = contratoActivo.get(x.id)?.dias_ferias ?? num('dias_ferias_ano', 22);
            return saldoFerias(planos, x.id, anoFerias, direito, hoje, direito, x.data_admissao, transitadosMax);
        });
        const planeados = planos.filter(p => ids.has(p.funcionario_id) && p.ano === anoFerias && p.estado === 'planeado').reduce((s, p) => s + (Number(p.dias) || 0), 0);
        const assid = assiduidade(linhas, { de: intervalo.de, ate: fimPeriodo }, hoje);
        const assidAnterior = assiduidade(linhas, intervalo.anterior, hoje);
        const ef = extrasEFaltas(linhas, { de: intervalo.de, ate: fimPeriodo }, hoje);
        const efAnterior = extrasEFaltas(linhas, intervalo.anterior, hoje);
        const soma = (m: Map<string, { minutosExtra: number; faltas: number }>, k: 'minutosExtra' | 'faltas') => [...m.values()].reduce((s, x) => s + x[k], 0);
        const divisor = num('divisor_dia', 30) || 30;
        const valorFalta = num('valor_falta', 0);
        const horasMes = (num('horas_dia', 8) || 8) * 22;
        const acrescimo = num('horas_extra_acrescimo', 0.5);
        let descontoFaltas = 0;
        let custoExtra = 0;
        for (const [id, x] of ef) {
            const salario = contratoActivo.get(id)?.salario_base_minor || 0;
            descontoFaltas += x.faltas * (valorFalta > 0 ? Math.round(valorFalta * 100) : Math.round(salario / divisor));
            custoExtra += Math.round((x.minutosExtra / 60) * (salario / horasMes) * (1 + acrescimo));
        }
        const incompletos = activos.map(x => ({ id: x.id, nome: x.nome, faltam: camposEmFalta(x) })).filter(x => x.faltam.length);
        const admitidos = funcionarios.filter(x => x.data_admissao >= intervalo.de && x.data_admissao <= intervalo.ate).length;
        const kpis = {
            activos: activos.length, suspensos: funcionarios.filter(x => x.estado === 'suspenso').length, admitidos,
            massaSalarial: f.salarios ? massa : null, salarioMedio: f.salarios && comSalario ? Math.round(massa / comSalario) : null,
            saldoFerias: saldos.reduce((s, x) => s + x.saldo, 0), transitados: saldos.reduce((s, x) => s + x.transitados, 0), planeados,
            assiduidade: assid.taxa, assiduidadeAnterior: assidAnterior.taxa, assiduidadeVariacao: assid.taxa !== null && assidAnterior.taxa !== null ? Math.round((assid.taxa - assidAnterior.taxa) * 10) / 10 : null,
            faltas: soma(ef, 'faltas'), faltasVariacao: variacao(soma(ef, 'faltas'), soma(efAnterior, 'faltas')), descontoFaltas: f.salarios ? descontoFaltas : null,
            minutosExtra: soma(ef, 'minutosExtra'), extraVariacao: variacao(soma(ef, 'minutosExtra'), soma(efAnterior, 'minutosExtra')), custoExtra: f.salarios ? custoExtra : null,
            fichasIncompletas: incompletos.length, incompletos,
        };

        // ── Gráficos ──
        const diaria = assiduidadeDiaria(linhas, intervaloDiario, hoje, 20);
        const meta = num('painel_meta_assiduidade', 95);
        const doze = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 12 + i, 1)); return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }; });
        const massaMensal = f.salarios ? doze.map(({ ano, mes }) => {
            const doMes = processamentos.filter(p => p.ano === ano && p.mes === mes && p.estado !== 'aberto' && !f.departamentoId);
            const total = doMes.reduce((s, p) => s + (Number(p.total_bruto_minor) || 0), 0);
            const chave = `${ano}-${String(mes).padStart(2, '0')}`;
            const actual = chave === hoje.slice(0, 7);
            // Sem processamento no mês corrente: a massa salarial base (estimativa, marcada assim).
            return { mes: chave, rotulo: MESES_CURTOS[mes - 1], total: total || (actual ? massa : 0), real: total > 0, estimado: !total && actual };
        }) : [];
        const ordemDeps = departamentos.map(d => d.id);
        const porDepartamento = departamentos.map(d => {
            const doDep = funcionariosTodos.filter(x => x.estado === 'activo' && x.departamento_id === d.id);
            return { id: d.id, nome: d.nome, funcionarios: doDep.length, massa: f.salarios ? doDep.reduce((s, x) => s + (contratoActivo.get(x.id)?.salario_base_minor || 0), 0) : null,
                presentesHoje: dadosPonto.linhas.filter(l => l.departamentoId === d.id && l.dias.find(x => x.data === hoje)?.estado === 'P').length };
        }).filter(d => d.funcionarios > 0);
        const semDepartamento = funcionariosTodos.filter(x => x.estado === 'activo' && !x.departamento_id).length;
        if (semDepartamento) porDepartamento.push({ id: '', nome: 'Sem departamento', funcionarios: semDepartamento, massa: null, presentesHoje: 0 });
        const aus = ausencias(linhas, { de: intervalo.de, ate: fimPeriodo }, hoje);
        const diasMapa = datasDoMes(anoMapa, numMapa).filter(d => linhas.some(l => l.dias.find(x => x.data === d)?.util));
        const mapa = linhas.map(l => {
            const diasLinha = diasMapa.map(data => ({ data, estado: estadoMapa(l.dias.find(x => x.data === data), hoje) as EstadoMapa }));
            const contados = diasLinha.filter(x => x.estado && x.estado !== 'futuro' && x.estado !== 'L');
            const presentes = contados.filter(x => x.estado === 'P' || x.estado === 'A').length;
            return { funcionarioId: l.funcionarioId, nome: l.nome, dias: diasLinha, taxa: contados.length ? Math.round((presentes / contados.length) * 100) : null };
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

        // ── Salários do mês ──
        const [anoActual, mesActual] = hoje.split('-').map(Number);
        const procMes = processamentos.find(p => p.ano === anoActual && p.mes === mesActual && p.tipo === 'normal');
        const etapa: EtapaSalarios = etapaSalarios(procMes?.estado || null, dadosPonto.estados.get(hoje.slice(0, 7)) === 'fechado');
        const salariosMes = f.salarios ? {
            etapa, processamentoId: procMes?.id || null, estado: procMes?.estado || null, base: massa,
            bruto: procMes && procMes.estado !== 'aberto' ? Number(procMes.total_bruto_minor) || 0 : null,
            descontos: procMes && procMes.estado !== 'aberto' ? (Number(procMes.total_inss_trab_minor) || 0) + (Number(procMes.total_irt_minor) || 0) : null,
            // Subsídios e abonos: o bruto processado menos o salário base dos contratos activos.
            subsidios: procMes && procMes.estado !== 'aberto' ? Math.max(0, (Number(procMes.total_bruto_minor) || 0) - massa) : null,
            liquido: procMes && procMes.estado !== 'aberto' ? Number(procMes.total_liquido_minor) || 0 : null,
        } : null;

        // ── Próximos eventos (30 dias; feriados até 45) ──
        const ate30 = somarDias(hoje, 30);
        const eventos: EventoPainel[] = [];
        const fimMes = datasDoMes(anoActual, mesActual).slice(-1)[0];
        eventos.push({ data: fimMes, tipo: 'fecho', titulo: 'Fecho do mês', detalhe: 'validar o ponto e processar os salários', rota: '/rh/processamento' });
        for (const ano of new Set([anoActual, Number(somarDias(hoje, 45).slice(0, 4))])) {
            for (const d of calendarioDoAno(ano, registados, opcoes).values()) {
                if (d.data < hoje || d.data > somarDias(hoje, 45) || !d.activo || d.tipo === 'data_internacional') continue;
                eventos.push({ data: d.data, tipo: d.tipo === 'ponte' ? 'ponte' : 'feriado', titulo: d.nome,
                    detalhe: `${d.tipo === 'ponte' ? 'ponte' : d.tipo === 'nacional' ? 'feriado nacional' : 'dia sem trabalho'} · ${SEMANA_EXTENSO[new Date(`${d.data}T12:00:00Z`).getUTCDay()]}` });
            }
        }
        for (const p of planos) {
            if (!ids.has(p.funcionario_id) || !p.data_inicio || p.data_inicio < hoje || p.data_inicio > ate30 || !['aprovado'].includes(estadoEfectivo(p, hoje))) continue;
            eventos.push({ data: p.data_inicio, tipo: 'ferias', titulo: `Férias de ${nome(p.funcionario_id)}`, detalhe: `até ${dataPt(p.data_fim || '')}${p.data_regresso ? ` · regressa ${dataPt(p.data_regresso)}` : ''}`, rota: '/rh/ferias' });
        }
        for (const x of activos) {
            if (!x.data_nascimento) continue;
            for (const ano of [anoActual, anoActual + 1]) {
                const data = `${ano}${x.data_nascimento.slice(4, 10)}`;
                if (data >= hoje && data <= ate30) eventos.push({ data, tipo: 'aniversario', titulo: `Aniversário de ${x.nome}`, detalhe: `faz ${ano - Number(x.data_nascimento.slice(0, 4))} anos` });
            }
        }
        for (const c of contratos.filter(c => c.estado === 'activo' && ids.has(c.funcionario_id) && c.fim && c.fim >= hoje && c.fim <= somarDias(hoje, 60))) {
            eventos.push({ data: c.fim!, tipo: 'contrato', titulo: `Fim do contrato de ${nome(c.funcionario_id)}`, detalhe: prazoContrato(c, hoje).rotulo, rota: `/rh/contratos?contrato=${c.id}` });
        }
        eventos.sort((a, b) => a.data.localeCompare(b.data));

        // ── Alertas (os da tarefa diária, filtrados pelo departamento) ──
        const alertas = alertasAbertos.filter((a: AlertaRH) => a.destinatario_perfil !== 'clientes' && (!f.departamentoId || !a.funcionario_id || ids.has(a.funcionario_id)));

        // Lembretes que o desenho mostra mesmo sem alerta (BI a expirar e contratos a terminar: «nenhum»).
        const semBi = !alertas.some(a => a.tipo === 'documento' && a.id.startsWith('bi-funcionario'));
        const semContratos = !alertas.some(a => a.tipo === 'contrato');
        return {
            lembretesVazios: [...(semBi ? ['BI a expirar nos próximos 90 dias: nenhum'] : []), ...(semContratos ? ['Contratos a terminar em 60 dias: nenhum'] : [])],
            anoAnterior: anoFerias - 1,
            funcionariosSemAcesso: activos.filter(x => !x.utilizador_id).map(x => ({ id: x.id, nome: x.nome, email: x.email, numero: x.numero_mecanografico, cargo_id: x.cargo_id, departamento_id: x.departamento_id, seccao_id: x.seccao_id ?? null })),
            actualizadoEm: new Date().toISOString(), hoje: hojeBloco, intervalo, semMarcacoes, portal, kpis, alertas, eventos: eventos.slice(0, 8), salariosMes,
            graficos: {
                assiduidadeDiaria: diaria, meta, massaMensal, porDepartamento, ordemDepartamentos: ordemDeps,
                ausenciasTipo: aus.tipos as TiposAusencia, ausenciasSemana: aus.semana, mapa, diasMapa, mesMapa,
            },
            funcionarios: funcionarios.map(x => ({ id: x.id, nome: x.nome })),
        };
    }
}

export type DadosPainel = Awaited<ReturnType<typeof ServicoPainelRH.carregar>>;
