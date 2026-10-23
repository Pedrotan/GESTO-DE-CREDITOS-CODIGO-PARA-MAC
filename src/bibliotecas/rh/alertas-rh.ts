// Alertas e lembretes do RH (e do BI dos clientes). Função pura: recebe os dados e a data e devolve os alertas
// que devem estar abertos hoje, cada um com uma chave única (tipo + referência + data). A tarefa diária insere os
// que faltam, actualiza a mensagem dos que já existem e resolve os abertos que deixaram de estar na lista
// (ex.: o subsídio de férias foi processado, o contrato foi renovado, o documento foi substituído).
import { clienteComBI, estadoBI } from './bi-validade.ts';
import { estadoEfectivo, type PlanoFerias } from './ferias.ts';

export type Destinatario = 'rh' | 'todos' | 'financeiro' | 'clientes';
export type Alerta = {
    id: string; tipo: string; referencia_id: string | null; funcionario_id: string | null; mensagem: string; data_alerta: string;
    destinatario_perfil: Destinatario; prioridade: 1 | 2 | 3; accao: string | null;
};

type Func = { id: string; nome: string; data_nascimento: string | null; estado: string; bi_validade?: string | null };
type Contrato = { id: string; funcionario_id: string; estado: string; fim: string | null; periodo_experiencia_fim: string | null };
type Documento = { id: string; funcionario_id: string; nome: string; estado: string; data_validade: string | null };
type Processamento = { id: string; ano: number; tipo: string; estado: string };
type Cliente = { id: string; name: string; nif?: string | null; expiryDate?: string | null; deletedAt?: unknown };

const DIA = 86_400_000;
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA);
const dataPt = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const processado = (pl: PlanoFerias, processamentos: Processamento[]) => Boolean(pl.subsidio_processado) ||
    processamentos.some(p => p.id === pl.processamento_id && ['aprovado', 'pago', 'fechado'].includes(p.estado));

/** Aniversário deste ano (29/02 conta a 28/02 nos anos não bissextos). */
export function aniversarioNoAno(nascimento: string, ano: number) {
    const [, m, d] = nascimento.slice(0, 10).split('-').map(Number);
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    return `${ano}-${String(m).padStart(2, '0')}-${String(m === 2 && d === 29 && !bissexto ? 28 : d).padStart(2, '0')}`;
}

export function gerarAlertas(e: {
    hoje: string; funcionarios: Func[]; contratos: Contrato[]; documentos: Documento[]; planos: PlanoFerias[]; processamentos: Processamento[];
    ausenciasPendentes: number; clientes?: Cliente[];
    parametros: { alertaFeriasDias: number; mesNatal: number; prazoEntregaDia: number; alertaPrazosDias: number; biDiasAviso: number };
}): Alerta[] {
    const { hoje } = e;
    const lista: Alerta[] = [];
    const add = (a: Omit<Alerta, 'data_alerta'> & { data_alerta?: string }) => lista.push({ data_alerta: hoje, ...a });
    const activos = e.funcionarios.filter(f => f.estado === 'activo');
    const nome = (id: string) => e.funcionarios.find(f => f.id === id)?.nome || '—';
    const ano = Number(hoje.slice(0, 4));

    for (const f of activos) {
        if (f.data_nascimento) {
            for (const a of [ano, ano + 1]) {
                const aniv = aniversarioNoAno(f.data_nascimento, a);
                const falta = dias(hoje, aniv);
                if (falta === 0) add({ id: `aniversario:${f.id}:${aniv}`, tipo: 'aniversario', referencia_id: f.id, funcionario_id: f.id, mensagem: `Hoje é o aniversário de ${f.nome}. Feliz aniversário!`, destinatario_perfil: 'todos', prioridade: 3, accao: null });
                else if (falta > 0 && falta <= 3) add({ id: `aniversario-proximo:${f.id}:${aniv}`, tipo: 'aniversario_proximo', referencia_id: f.id, funcionario_id: f.id, mensagem: `O aniversário de ${f.nome} é ${[0, 6].includes(new Date(`${aniv}T12:00:00Z`).getUTCDay()) ? 'no' : 'na'} ${DIAS_SEMANA[new Date(`${aniv}T12:00:00Z`).getUTCDay()]}, ${dataPt(aniv).slice(0, 5)}.`, destinatario_perfil: 'rh', prioridade: 3, accao: null });
            }
        }
        if (f.bi_validade) {
            const falta = dias(hoje, f.bi_validade);
            if (falta >= 0 && falta <= 30) add({ id: `bi-funcionario:${f.id}:${f.bi_validade}`, tipo: 'documento', referencia_id: f.id, funcionario_id: f.id, mensagem: `O BI de ${f.nome} expira a ${dataPt(f.bi_validade)}.`, destinatario_perfil: 'rh', prioridade: 2, accao: `/rh/funcionarios?ficha=${f.id}` });
        }
    }

    for (const pl of e.planos) {
        if (!pl.data_inicio || !pl.data_fim || !activos.some(f => f.id === pl.funcionario_id)) continue;
        const estado = estadoEfectivo(pl, hoje);
        const falta = dias(hoje, pl.data_inicio);
        if (estado === 'aprovado' && !processado(pl, e.processamentos) && falta >= 0 && falta <= e.parametros.alertaFeriasDias)
            add({ id: `ferias:${pl.id}`, tipo: 'ferias', referencia_id: pl.id, funcionario_id: pl.funcionario_id, prioridade: 1, destinatario_perfil: 'rh', accao: `/rh/ferias?subsidio=${pl.id}`,
                mensagem: `O funcionário ${nome(pl.funcionario_id)} vai sair de férias ${falta === 0 ? 'hoje' : `daqui a ${falta} dia(s)`} (início em ${dataPt(pl.data_inicio)}). Por favor, processe o seu subsídio de férias.` });
        if (['em_gozo', 'gozado'].includes(estado) && dias(pl.data_fim, hoje) === 1)
            add({ id: `regresso:${pl.id}`, tipo: 'regresso', referencia_id: pl.id, funcionario_id: pl.funcionario_id, mensagem: `${nome(pl.funcionario_id)} regressa hoje de férias.`, destinatario_perfil: 'rh', prioridade: 3, accao: null });
    }

    for (const c of e.contratos) {
        if (c.estado !== 'activo' || !activos.some(f => f.id === c.funcionario_id)) continue;
        if (c.fim) {
            const falta = dias(hoje, c.fim);
            if (falta >= 0 && falta <= 60) add({ id: `contrato-${falta <= 30 ? 30 : 60}:${c.id}`, tipo: 'contrato', referencia_id: c.id, funcionario_id: c.funcionario_id, prioridade: falta <= 30 ? 1 : 2, destinatario_perfil: 'rh', accao: `/rh/funcionarios?ficha=${c.funcionario_id}`,
                mensagem: `O contrato de ${nome(c.funcionario_id)} termina a ${dataPt(c.fim)}.` });
        }
        if (c.periodo_experiencia_fim) {
            const falta = dias(hoje, c.periodo_experiencia_fim);
            if (falta >= 0 && falta <= 15) add({ id: `experiencia:${c.id}`, tipo: 'experiencia', referencia_id: c.id, funcionario_id: c.funcionario_id, prioridade: 2, destinatario_perfil: 'rh', accao: `/rh/funcionarios?ficha=${c.funcionario_id}`,
                mensagem: `O período experimental de ${nome(c.funcionario_id)} termina a ${dataPt(c.periodo_experiencia_fim)}.` });
        }
    }

    for (const d of e.documentos) {
        if (d.estado !== 'activo' || !d.data_validade || !activos.some(f => f.id === d.funcionario_id)) continue;
        const falta = dias(hoje, d.data_validade);
        if (falta >= 0 && falta <= 30) add({ id: `documento-${falta === 0 ? 'dia' : '30'}:${d.id}`, tipo: 'documento', referencia_id: d.id, funcionario_id: d.funcionario_id, prioridade: falta === 0 ? 1 : 2, destinatario_perfil: 'rh', accao: `/rh/funcionarios?ficha=${d.funcionario_id}`,
            mensagem: `O documento «${d.nome}» de ${nome(d.funcionario_id)} ${falta === 0 ? 'expira hoje' : `expira a ${dataPt(d.data_validade)}`}.` });
    }

    const mesNatal = e.parametros.mesNatal;
    if (Number(hoje.slice(5, 7)) >= mesNatal && !e.processamentos.some(p => p.tipo === 'natal' && p.ano === ano && ['aprovado', 'pago', 'fechado'].includes(p.estado)))
        add({ id: `natal:${ano}`, tipo: 'natal', referencia_id: String(ano), funcionario_id: null, prioridade: 1, destinatario_perfil: 'rh', accao: '/rh/processamento',
            data_alerta: `${ano}-${String(mesNatal).padStart(2, '0')}-01`, mensagem: `Processe o subsídio de Natal de ${ano}.` });

    if (e.ausenciasPendentes > 0)
        add({ id: `faltas-pendentes:${hoje}`, tipo: 'faltas_pendentes', referencia_id: null, funcionario_id: null, prioridade: 2, destinatario_perfil: 'rh', accao: '/rh/ausencias',
            mensagem: `${e.ausenciasPendentes} falta(s) aguardam justificação, documento ou aprovação.` });

    // Prazos de entrega do INSS e do IRT do mês anterior.
    const prazo = `${hoje.slice(0, 7)}-${String(Math.min(28, Math.max(1, e.parametros.prazoEntregaDia))).padStart(2, '0')}`;
    const faltaPrazo = dias(hoje, prazo);
    if (faltaPrazo >= 0 && faltaPrazo <= e.parametros.alertaPrazosDias) {
        const anterior = new Date(Date.UTC(ano, Number(hoje.slice(5, 7)) - 2, 1));
        const referencia = `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, '0')}`;
        add({ id: `prazos:${referencia}`, tipo: 'prazos', referencia_id: referencia, funcionario_id: null, prioridade: 1, destinatario_perfil: 'financeiro', accao: '/rh/processamento',
            mensagem: `Entregue o INSS e o IRT de ${MESES[anterior.getUTCMonth()]} até ${dataPt(prazo)}.` });
    }

    // BI dos clientes: expirado ou a expirar.
    for (const c of e.clientes || []) {
        if (c.deletedAt || !clienteComBI(c) || !c.expiryDate) continue;
        const s = estadoBI(c.expiryDate, hoje, e.parametros.biDiasAviso);
        if (s.estado === 'expirado' || s.estado === 'a_expirar')
            add({ id: `bi-cliente:${c.id}:${s.validade}:${s.estado}`, tipo: 'bi_cliente', referencia_id: c.id, funcionario_id: null, prioridade: s.estado === 'expirado' ? 1 : 2, destinatario_perfil: 'clientes', accao: '/clientes',
                mensagem: s.estado === 'expirado' ? `O BI do cliente ${c.name} expirou a ${dataPt(s.validade!)}. Contacte o cliente para renovar.` : `O BI do cliente ${c.name} expira a ${dataPt(s.validade!)}. Contacte o cliente para renovar.` });
    }
    return lista.sort((a, b) => a.prioridade - b.prioridade || a.data_alerta.localeCompare(b.data_alerta));
}
