// Alertas do livro de ponto (secção 7.7), no formato da tarefa de alertas do RH. Cada alerta tem um id único
// (tipo + referência + data) para nunca duplicar: a tarefa insere os novos e resolve os que deixaram de existir.
import type { Alerta } from './alertas-rh.ts';
import { formatarMinutos, horaDe, minutosAbsolutos, type ConfigPonto, type DiaPonto } from './ponto-calculo.ts';

export type EntradaAlertasPonto = {
    hoje: string;
    /** «aaaa-mm-ddThh:mm» em hora de Luanda. */
    agora: string;
    config: ConfigPonto;
    linhas: Array<{ funcionario: { id: string; nome: string }; dias: DiaPonto[] }>;
    /** Minutos de horas extra já registados este ano, antes do mês corrente. */
    extraAnoAnterioresMin: Map<string, number>;
    justificacoesPendentes: Array<{ id: string; funcionario_id: string; data_inicio: string; criado_em: string }>;
    mesAnteriorFechado: boolean;
};

const dataPt = (d: string) => d.split('-').reverse().join('/');

export function alertasPonto(e: EntradaAlertasPonto): Alerta[] {
    const alertas: Alerta[] = [];
    const mes = e.hoje.slice(0, 7);
    const nomes = new Map(e.linhas.map(l => [l.funcionario.id, l.funcionario.nome]));
    const base = (id: string, tipo: string, funcionarioId: string | null, mensagem: string, prioridade: 1 | 2 | 3, data = e.hoje): Alerta =>
        ({ id, tipo, referencia_id: funcionarioId, funcionario_id: funcionarioId, mensagem, data_alerta: data, destinatario_perfil: 'rh', prioridade, accao: '/rh/ponto' } as Alerta);

    for (const l of e.linhas) {
        const f = l.funcionario;
        const hoje = l.dias.find(d => d.data === e.hoje);
        if (hoje?.util && hoje.estado === 'SEM_REGISTO' && e.agora.slice(11, 16) >= e.config.hora_alerta_sem_marcacao)
            alertas.push(base(`ponto_sem_marcacao:${f.id}:${e.hoje}`, 'ponto_sem_marcacao', f.id, `${f.nome}: sem marcação de entrada hoje (${dataPt(e.hoje)}).`, 2));
        if (hoje && hoje.primeira_entrada && !hoje.ultima_saida && hoje.saida_prevista
            && minutosAbsolutos(e.agora) > minutosAbsolutos(hoje.saida_prevista) + 120)
            alertas.push(base(`ponto_sem_saida:${f.id}:${e.hoje}`, 'ponto_sem_saida', f.id, `${f.nome}: entrada sem saída hoje (entrou às ${horaDe(hoje.primeira_entrada)}).`, 2));
        const atrasos = l.dias.filter(d => d.data.startsWith(mes) && d.minutos_atraso > 0).length;
        if (e.config.alerta_atrasos_mes > 0 && atrasos >= e.config.alerta_atrasos_mes)
            alertas.push(base(`ponto_atrasos:${f.id}:${mes}`, 'ponto_atrasos', f.id, `${f.nome}: ${atrasos} atrasos este mês.`, 3));
        if (e.config.limite_extra_diario_min > 0)
            for (const d of l.dias.filter(x => x.minutos_extra > e.config.limite_extra_diario_min))
                alertas.push(base(`ponto_extra_dia:${f.id}:${d.data}`, 'ponto_extra_limite', f.id,
                    `${f.nome}: ${formatarMinutos(d.minutos_extra)} de horas extra em ${dataPt(d.data)} (limite diário ${formatarMinutos(e.config.limite_extra_diario_min)}).`, 2, d.data));
        const ano = (e.extraAnoAnterioresMin.get(f.id) || 0) + l.dias.reduce((s, d) => s + d.minutos_extra, 0);
        if (e.config.limite_extra_anual_min > 0 && ano > e.config.limite_extra_anual_min)
            alertas.push(base(`ponto_extra_ano:${f.id}:${e.hoje.slice(0, 4)}`, 'ponto_extra_limite', f.id,
                `${f.nome}: ${formatarMinutos(ano)} de horas extra este ano (limite anual ${formatarMinutos(e.config.limite_extra_anual_min)}).`, 1));
    }
    // «agora» está em hora de Luanda (UTC+1); criado_em está em UTC.
    const agoraUtc = Date.parse(`${e.agora}:00Z`) - 3_600_000;
    for (const j of e.justificacoesPendentes) {
        const horas = (agoraUtc - Date.parse(j.criado_em)) / 3_600_000;
        const atrasada = Number.isFinite(horas) && horas >= 48;
        alertas.push({ ...base(`ponto_justificacao:${j.id}`, 'ponto_justificacao', j.funcionario_id,
            `${nomes.get(j.funcionario_id) || 'Funcionário'}: justificação de ${dataPt(j.data_inicio)} por decidir${atrasada ? ' há mais de 48 horas' : ''}.`, atrasada ? 1 : 2),
            referencia_id: j.id });
    }
    if (!e.mesAnteriorFechado) {
        const anterior = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
        alertas.push({ ...base(`ponto_mes_validar:${anterior}`, 'ponto_mes_validar', null, `O livro de ponto de ${anterior.split('-').reverse().join('/')} ainda não foi validado e fechado.`, 2),
            referencia_id: anterior });
    }
    return alertas;
}
