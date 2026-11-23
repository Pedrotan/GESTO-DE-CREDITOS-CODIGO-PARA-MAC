// Emissão da guia de férias (página de Férias e página de Declarações): número sequencial, saldo, data de regresso,
// direito anual e subsídio de férias a partir dos dados do sistema.
import { dataRegresso, saldoFerias } from '@/bibliotecas/rh/ferias';
import { HORARIO_OMISSAO, type Feriado, type Horario } from '@/bibliotecas/rh/ponto';
import { valorNumerico, type ParametroRH } from '@/bibliotecas/rh/parametros-rh';
import { gerarGuiaFeriasPdf, type SaidaPdf } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoFeriasRH, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import type { ActorRH, Cargo, Contrato, Departamento, Funcionario } from '@/servicos/rh/ServicoRH';

export type ContextoGuia = {
    planos: PlanoFeriasRH[]; horarios: Horario[]; feriados: Feriado[]; funcionarios: Funcionario[]; contratos: Contrato[];
    parametros: ParametroRH[]; cargos: Cargo[]; departamentos: Departamento[];
};

export async function emitirGuiaFerias(p: PlanoFeriasRH, ctx: ContextoGuia, settings: unknown, actor: ActorRH, saida: SaidaPdf = 'save') {
    if (!p.data_inicio || !p.data_fim) throw new Error('O plano de férias não tem datas.');
    const hoje = luandaTodayKey();
    const f = ctx.funcionarios.find(x => x.id === p.funcionario_id);
    const contrato = ctx.contratos.find(c => c.funcionario_id === p.funcionario_id && c.estado === 'activo');
    const direito = contrato?.dias_ferias ?? valorNumerico(ctx.parametros, 'dias_ferias_ano', hoje, 22);
    const horario = ctx.horarios.find(h => h.id === f?.horario_id) || ctx.horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    const saldo = saldoFerias(ctx.planos, p.funcionario_id, p.ano, direito, hoje, direito, f?.data_admissao, valorNumerico(ctx.parametros, 'ferias_transitados_max', hoje, 0)).saldo;
    // O regresso guardado no plano (calculado pelo calendário laboral); os planos antigos calculam-no aqui.
    const regresso = p.data_regresso || dataRegresso(p.data_fim, horario, ctx.feriados);
    const emitido = await ServicoFeriasRH.emitirGuia(p, { inicio: p.data_inicio, fim: p.data_fim, dias: p.dias, regresso, saldo }, actor);
    return gerarGuiaFeriasPdf({
        numero: emitido.numero, emitidoEm: emitido.emitido_em, ano: p.ano, inicio: p.data_inicio, fim: p.data_fim, dias: p.dias, regresso, saldoRestante: saldo,
        aprovadoPor: p.aprovado_por_nome, direito,
        salarioBaseMinor: contrato?.salario_base_minor ?? null, subsidioPct: valorNumerico(ctx.parametros, 'subsidio_ferias_pct', hoje, 0.5),
        funcionario: {
            nome: f?.nome || '—', numero: f?.numero_mecanografico || '—', bi: f?.bi_numero, admissao: f?.data_admissao,
            cargo: ctx.cargos.find(c => c.id === f?.cargo_id)?.nome, departamento: ctx.departamentos.find(d => d.id === f?.departamento_id)?.nome,
        },
    }, settings, actor.name, saida);
}
