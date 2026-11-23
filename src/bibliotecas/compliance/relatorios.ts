// Relatórios de Compliance (especificação, secção 3.7): KYC, risco, PEP, sanções, alertas, casos, documentos
// expirados e auditoria. Funções puras: recebem os dados já reunidos e devolvem a tabela (colunas tipadas e linhas),
// a mesma para o ecrã, o CSV e o PDF. O BI/NIF sai mascarado, salvo com a permissão de exportar documentos.

import { mascararDocumento } from './kyc.ts';

export type TipoRelatorio = 'kyc' | 'risco' | 'pep' | 'sancoes' | 'alertas' | 'casos' | 'documentos' | 'auditoria';
export type TipoColuna = 'texto' | 'kz' | 'numero' | 'data' | 'pct';
export type Coluna = { titulo: string; tipo: TipoColuna };
export type Celula = string | number | null;
export type TabelaRelatorio = { titulo: string; subtitulo: string; colunas: Coluna[]; linhas: Celula[][]; nota?: string };

export const RELATORIOS: Record<TipoRelatorio, { titulo: string; descricao: string; periodo: boolean }> = {
    kyc: { titulo: 'Clientes e estado KYC', descricao: 'Estado da identificação, completude, diligência e quem verificou.', periodo: false },
    risco: { titulo: 'Avaliações de risco', descricao: 'Avaliações no período, pontuação, nível calculado e revisão humana.', periodo: true },
    pep: { titulo: 'Pessoas politicamente expostas', descricao: 'Clientes PEP declarados ou confirmados na lista interna.', periodo: false },
    sancoes: { titulo: 'Screening de sanções', descricao: 'Último screening por cliente, correspondências por decidir e confirmadas.', periodo: false },
    alertas: { titulo: 'Alertas de operações', descricao: 'Alertas detectados no período, estado, responsável e conclusão.', periodo: true },
    casos: { titulo: 'Investigações', descricao: 'Casos abertos no período, prazos, conclusão interna e decisão sobre a UIF.', periodo: true },
    documentos: { titulo: 'Documentos expirados ou a expirar', descricao: 'Clientes com o documento de identificação expirado, a expirar ou sem validade.', periodo: false },
    auditoria: { titulo: 'Auditoria do Compliance', descricao: 'Acções registadas no módulo (quem, quando e o quê) no período.', periodo: true },
};

export type ClienteRel = {
    nome: string; numero: string | null; documento: string | null; estadoKyc: string; completude: number; documentoEstado: string; documentoValidade: string | null;
    diligencia: string; verificadoPor: string | null; verificadoEm: string | null; nivel: string | null; pontuacao: number | null; proximaRevisao: string | null;
    pepDeclarado: boolean | null; pepFuncao: string | null; pepConfirmado: boolean; screeningEstado: string; screeningEm: string | null;
    screeningPendentes: number; documentoCodigo: 'valido' | 'a_expirar' | 'expirado' | 'sem_data';
};
export type DadosRelatorio = {
    clientes: ClienteRel[];
    avaliacoes: Array<{ cliente: string; data: string; versao: number; pontuacao: number; nivel: string; decisao: string; por: string | null; revistoPor: string | null; nivelFinal: string | null }>;
    alertas: Array<{ data: string; titulo: string; gravidade: string; cliente: string | null; estado: string; responsavel: string | null; resultado: string | null; conclusao: string | null }>;
    casos: Array<{ numero: string; cliente: string; tipo: string; prioridade: string; estado: string; abertoEm: string; prazo: string | null; conclusao: string | null; uif: string | null; encerradoEm: string | null }>;
    auditoria: Array<{ data: string; utilizador: string | null; accao: string; detalhes: string }>;
};
export type OpcoesRelatorio = { de: string; ate: string; mostrarDocumento: boolean; empresa?: string };

const noPeriodo = (data: string | null | undefined, o: OpcoesRelatorio) => !!data && data.slice(0, 10) >= o.de && data.slice(0, 10) <= o.ate;
const doc = (v: string | null, o: OpcoesRelatorio) => (o.mostrarDocumento ? v || '' : mascararDocumento(v));
const dataPt = (v: string) => v.split('-').reverse().join('/');

export function gerarRelatorio(tipo: TipoRelatorio, d: DadosRelatorio, o: OpcoesRelatorio): TabelaRelatorio {
    const def = RELATORIOS[tipo];
    const subtitulo = def.periodo ? `Período de ${dataPt(o.de)} a ${dataPt(o.ate)}` : `Situação em ${dataPt(o.ate)}`;
    const base = { titulo: def.titulo, subtitulo };
    const col = (titulo: string, t: TipoColuna = 'texto'): Coluna => ({ titulo, tipo: t });
    switch (tipo) {
        case 'kyc':
            return { ...base, colunas: [col('Cliente'), col('N.º'), col('Documento'), col('Estado KYC'), col('Completude', 'pct'), col('Situação do documento'), col('Diligência'), col('Verificado por'), col('Verificado em', 'data')],
                linhas: d.clientes.map(c => [c.nome, c.numero, doc(c.documento, o), c.estadoKyc, c.completude, c.documentoEstado, c.diligencia, c.verificadoPor, c.verificadoEm]) };
        case 'risco':
            return { ...base, colunas: [col('Data', 'data'), col('Cliente'), col('Modelo'), col('Pontuação', 'numero'), col('Nível'), col('Decisão'), col('Pedida por'), col('Revista por'), col('Nível final')],
                linhas: d.avaliacoes.filter(a => noPeriodo(a.data, o)).map(a => [a.data, a.cliente, `v${a.versao}`, a.pontuacao, a.nivel, a.decisao, a.por, a.revistoPor, a.nivelFinal]) };
        case 'pep':
            return { ...base, colunas: [col('Cliente'), col('N.º'), col('Documento'), col('PEP declarado'), col('Função'), col('Confirmado na lista interna'), col('Nível de risco'), col('Próxima revisão', 'data')],
                linhas: d.clientes.filter(c => c.pepDeclarado || c.pepConfirmado).map(c => [c.nome, c.numero, doc(c.documento, o), c.pepDeclarado ? 'Sim' : 'Não', c.pepFuncao, c.pepConfirmado ? 'Sim' : 'Não', c.nivel, c.proximaRevisao]),
                nota: 'Clientes PEP exigem diligência reforçada e decisão de um responsável autorizado.' };
        case 'sancoes':
            return { ...base, colunas: [col('Cliente'), col('N.º'), col('Estado do screening'), col('Último screening', 'data'), col('Por decidir', 'numero')],
                linhas: d.clientes.map(c => [c.nome, c.numero, c.screeningEstado, c.screeningEm, c.screeningPendentes]),
                nota: '«Não verificado» e «Erro» nunca equivalem a «sem correspondência».' };
        case 'alertas':
            return { ...base, colunas: [col('Data', 'data'), col('Alerta'), col('Gravidade'), col('Cliente'), col('Estado'), col('Responsável'), col('Resultado'), col('Conclusão')],
                linhas: d.alertas.filter(a => noPeriodo(a.data, o)).map(a => [a.data, a.titulo, a.gravidade, a.cliente, a.estado, a.responsavel, a.resultado, a.conclusao]) };
        case 'casos':
            return { ...base, colunas: [col('N.º'), col('Cliente'), col('Tipo'), col('Prioridade'), col('Estado'), col('Aberto em', 'data'), col('Prazo', 'data'), col('Conclusão interna'), col('UIF'), col('Encerrado em', 'data')],
                linhas: d.casos.filter(c => noPeriodo(c.abertoEm, o)).map(c => [c.numero, c.cliente, c.tipo, c.prioridade, c.estado, c.abertoEm, c.prazo, c.conclusao, c.uif, c.encerradoEm]),
                nota: 'CONFIDENCIAL: a existência de investigações e de comunicações à UIF não pode ser revelada ao cliente.' };
        case 'documentos':
            return { ...base, colunas: [col('Cliente'), col('N.º'), col('Documento'), col('Situação'), col('Validade', 'data')],
                linhas: d.clientes.filter(c => c.documentoCodigo !== 'valido').sort((a, b) => String(a.documentoValidade || '').localeCompare(String(b.documentoValidade || '')))
                    .map(c => [c.nome, c.numero, doc(c.documento, o), c.documentoEstado, c.documentoValidade]) };
        case 'auditoria':
            return { ...base, colunas: [col('Data'), col('Utilizador'), col('Acção'), col('Detalhes')],
                linhas: d.auditoria.filter(a => noPeriodo(a.data, o)).map(a => [a.data.slice(0, 16).replace('T', ' '), a.utilizador, a.accao, a.detalhes]) };
    }
}

/** Texto CSV (separador «;», com BOM para o Excel reconhecer os acentos). */
export function tabelaParaCsv(t: TabelaRelatorio): string {
    const esc = (v: Celula) => `"${String(v ?? '').replace(/"/gu, '""')}"`;
    return '﻿' + [t.colunas.map(c => esc(c.titulo)).join(';'), ...t.linhas.map(l => l.map(esc).join(';'))].join('\r\n');
}
