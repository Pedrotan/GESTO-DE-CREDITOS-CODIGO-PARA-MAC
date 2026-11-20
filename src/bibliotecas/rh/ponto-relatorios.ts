// Relatórios do Livro de ponto (especificação, secção 8): livro mensal, resumo de assiduidade, assiduidade por
// departamento, ranking de atrasos, horas extra, faltas e auditoria (PDF e Excel pelo gerador de relatórios do
// sistema) e a folha individual mensal para assinatura (PDF próprio, um funcionário por página).
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, getCompanySettings } from '@/bibliotecas/pdf';
import type { ReportDef, Section } from '@/bibliotecas/relatorios-pagamentos';
import { formatarMinutos, horaDe, type DiaPonto } from './ponto-calculo';
import { DIAS_SEMANA, type Grelha, type LinhaGrelha } from './ponto-grelha';
import { diaSemana } from './ponto';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** «Novembro de 2026» (correcção F1.16: «de» em minúscula). */
export const nomeDoMes = (ano: number, mes: number) => `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} de ${ano}`;

/** Código curto da célula (secção 3). */
export const codigoCelula = (d: DiaPonto) => (d.estado === 'SEM_REGISTO' ? '?' : d.estado === 'FUTURO' || d.estado === 'FORA' ? '' : d.estado);
const horas = (m: number) => (m ? formatarMinutos(m) : '');
const num = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);

type Contexto = { ano: number; mes: number; departamentos: Map<string, string>; filtro?: string };
const subtitulo = (c: Contexto) => `${nomeDoMes(c.ano, c.mes)}${c.filtro ? ` · ${c.filtro}` : ''}`;

export function relatorioLivroMensal(g: Grelha, c: Contexto): ReportDef {
    const dias = g.dias.map(d => `${d.data.slice(8)} ${d.semana}`);
    const sections: Section[] = [{
        heading: 'Livro de ponto',
        head: ['Funcionário', ...dias, 'Pres.', 'F', 'FJ', 'Horas', 'Atraso', 'Extra', 'Pend.'],
        rows: g.linhas.map(l => [l.funcionario.nome, ...l.dias.map(codigoCelula), l.totais.presencas, num(l.totais.faltas), num(l.totais.faltas_just),
            horas(l.totais.minutos_trabalhados), l.totais.minutos_atraso || '', horas(l.totais.minutos_extra), l.totais.pendentes || '']),
        foot: [['Presentes / activos', ...g.dias.map(d => (g.totaisDia[d.data]?.activos ? `${g.totaisDia[d.data].presentes}/${g.totaisDia[d.data].activos}` : '–')), '', '', '', '', '', '', '']],
        numeric: [dias.length + 1, dias.length + 2, dias.length + 3, dias.length + 5, dias.length + 7],
        widths: { 0: 34 },
    }];
    return {
        key: 'ponto-livro', title: 'Livro de ponto', subtitle: subtitulo(c), orientation: 'landscape', fileBase: `livro-de-ponto-${c.ano}-${String(c.mes).padStart(2, '0')}`,
        tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO', summary: resumo(g),
        sections: [...sections, resumoAssiduidadeSeccao(g)],
    };
}

const resumo = (g: Grelha): Array<[string, string]> => [
    ['Funcionários', String(g.resumo.funcionarios)], ['Taxa de presença', `${Math.round(g.resumo.taxa_presenca * 100)}%`],
    ['Faltas', String(num(g.resumo.faltas))], ['Atraso (min)', String(g.resumo.minutos_atraso)],
    ['Horas extra', formatarMinutos(g.resumo.minutos_extra)], ['Dias por resolver', String(g.resumo.pendentes)],
];

const resumoAssiduidadeSeccao = (g: Grelha): Section => ({
    heading: 'Resumo de assiduidade',
    head: ['N.º', 'Funcionário', 'Presenças', 'Faltas', 'F. justif.', 'Horas', 'Atraso (min)', 'Saída antec. (min)', 'Extra', 'Nocturno', 'Por resolver'],
    rows: g.linhas.map(l => [l.funcionario.numero_mecanografico, l.funcionario.nome, l.totais.presencas, num(l.totais.faltas), num(l.totais.faltas_just),
        horas(l.totais.minutos_trabalhados), l.totais.minutos_atraso, l.totais.minutos_saida_antecipada, horas(l.totais.minutos_extra), horas(l.totais.minutos_noturnos), l.totais.pendentes]),
    numeric: [2, 3, 4, 6, 7, 10],
});

export function relatorioResumoAssiduidade(g: Grelha, c: Contexto): ReportDef {
    return { key: 'ponto-resumo', title: 'Resumo de assiduidade', subtitle: subtitulo(c), orientation: 'landscape', fileBase: `assiduidade-${c.ano}-${c.mes}`, tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO', summary: resumo(g), sections: [resumoAssiduidadeSeccao(g)] };
}

export function relatorioPorDepartamento(g: Grelha, c: Contexto): ReportDef {
    const grupos = new Map<string, LinhaGrelha[]>();
    for (const l of g.linhas) {
        const nome = c.departamentos.get(l.funcionario.departamento_id || '') || 'Sem departamento';
        grupos.set(nome, [...(grupos.get(nome) || []), l]);
    }
    const linhas = [...grupos].map(([nome, ls]) => {
        const dias = ls.flatMap(l => l.dias.filter(d => d.util && d.estado !== 'FORA' && d.estado !== 'FUTURO' && !['Fe', 'L', 'D'].includes(d.estado)));
        const presentes = dias.filter(d => d.estado === 'P').length;
        return [nome, ls.length, dias.length, presentes, dias.length ? `${Math.round(presentes / dias.length * 100)}%` : '—',
            num(ls.reduce((s, l) => s + l.totais.faltas, 0)), ls.reduce((s, l) => s + l.totais.minutos_atraso, 0)];
    });
    return {
        key: 'ponto-departamentos', title: 'Taxa de assiduidade por departamento', subtitle: subtitulo(c), orientation: 'portrait', fileBase: `assiduidade-departamentos-${c.ano}-${c.mes}`,
        tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO',
        chart: { title: 'Taxa de presença (%)', points: linhas.map(l => ({ label: String(l[0]), value: Number(String(l[4]).replace('%', '')) || 0, line: 0 })) },
        sections: [{ head: ['Departamento', 'Funcionários', 'Dias úteis', 'Presenças', 'Taxa', 'Faltas', 'Atraso (min)'], rows: linhas, numeric: [1, 2, 3, 5, 6] }],
    };
}

export function relatorioRankingAtrasos(g: Grelha, c: Contexto): ReportDef {
    const linhas = g.linhas.filter(l => l.totais.minutos_atraso > 0).sort((a, b) => b.totais.minutos_atraso - a.totais.minutos_atraso);
    return {
        key: 'ponto-atrasos', title: 'Ranking de atrasos', subtitle: subtitulo(c), orientation: 'portrait', fileBase: `atrasos-${c.ano}-${c.mes}`, tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO',
        sections: [{ head: ['#', 'Funcionário', 'Departamento', 'Ocorrências', 'Minutos'], rows: linhas.map((l, i) => [i + 1, l.funcionario.nome, c.departamentos.get(l.funcionario.departamento_id || '') || '—', l.totais.atrasos, l.totais.minutos_atraso]), numeric: [0, 3, 4], emptyText: 'Sem atrasos no mês.' }],
    };
}

export function relatorioHorasExtra(g: Grelha, c: Contexto): ReportDef {
    const linhas = g.linhas.filter(l => l.totais.minutos_extra > 0 || l.totais.minutos_noturnos > 0);
    return {
        key: 'ponto-extra', title: 'Horas extra', subtitle: subtitulo(c), orientation: 'portrait', fileBase: `horas-extra-${c.ano}-${c.mes}`, tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO',
        sections: [{
            head: ['Funcionário', 'Dia útil', 'Descanso', 'Feriado', 'Total', 'Nocturno'],
            rows: linhas.map(l => [l.funcionario.nome, horas(l.totais.minutos_extra_util), horas(l.totais.minutos_extra_descanso), horas(l.totais.minutos_extra_feriado), horas(l.totais.minutos_extra), horas(l.totais.minutos_noturnos)]),
            emptyText: 'Sem horas extra no mês.',
        }],
    };
}

export function relatorioFaltas(g: Grelha, c: Contexto, motivos: Map<string, string>): ReportDef {
    const linhas = g.linhas.flatMap(l => l.dias.filter(d => d.falta_tipo).map(d => [l.funcionario.nome, d.data.split('-').reverse().join('/'), d.falta_tipo === 'F' ? 'Injustificada' : 'Justificada',
        num(d.falta_fraccao), d.desconto_fraccao ? 'Sim' : 'Não', (d.ausencia_id && motivos.get(d.ausencia_id)) || '—']));
    return {
        key: 'ponto-faltas', title: 'Faltas', subtitle: subtitulo(c), orientation: 'landscape', fileBase: `faltas-${c.ano}-${c.mes}`, tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO',
        sections: [{ head: ['Funcionário', 'Dia', 'Tipo', 'Dias', 'Desconta', 'Motivo'], rows: linhas, numeric: [3], widths: { 5: 90 }, emptyText: 'Sem faltas no mês.' }],
    };
}

export function relatorioAuditoria(registos: Array<{ timestamp: string; userName: string; action: string; details: string; metadata: string | null }>, de: string, ate: string): ReportDef {
    return {
        key: 'ponto-auditoria', title: 'Auditoria do livro de ponto', subtitle: `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`, orientation: 'landscape',
        fileBase: `auditoria-ponto-${de}-${ate}`, tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO',
        sections: [{ head: ['Data e hora', 'Utilizador', 'Acção', 'Descrição', 'Motivo'], rows: registos.map(r => {
            let motivo = '';
            try { motivo = JSON.parse(r.metadata || '{}').motivo || ''; } catch { /* metadados antigos */ }
            return [new Date(r.timestamp).toLocaleString('pt-PT'), r.userName, r.action, r.details, motivo];
        }), widths: { 3: 110 } }],
    };
}

/**
 * Folha individual mensal (secção 8.2): um funcionário por página, dia a dia, com totais e espaço para as
 * assinaturas do funcionário e do responsável. Com várias linhas, um só ficheiro com todas as folhas.
 */
export function gerarFolhasIndividuais(linhas: LinhaGrelha[], c: Contexto & { cargos: Map<string, string> }, settings: unknown, userName: string, saida: 'save' | 'datauri' = 'save') {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    linhas.forEach((l, indice) => {
        if (indice > 0) doc.addPage();
        applyBranding(doc, config, userName);
        let y = brandingHeaderBottom(doc) + 10;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
        doc.text(`REGISTO DE ASSIDUIDADE: ${nomeDoMes(c.ano, c.mes).toUpperCase()}`, 105, y, { align: 'center' });
        y += 7;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(51, 65, 85);
        doc.text(`Funcionário: ${l.funcionario.nome}`, 14, y); doc.text(`N.º: ${l.funcionario.numero_mecanografico}`, 160, y);
        y += 4.5;
        doc.text(`Departamento: ${c.departamentos.get(l.funcionario.departamento_id || '') || '—'}    Cargo: ${c.cargos.get(l.funcionario.cargo_id || '') || '—'}    Horário: ${l.horario.entrada}–${l.horario.saida}`, 14, y);
        y += 3;
        autoTable(doc, {
            startY: y, theme: 'grid', margin: { left: 14, right: 14 },
            styles: { fontSize: 7, cellPadding: 0.9, halign: 'center' },
            headStyles: { fillColor: [30, 41, 59] },
            columnStyles: { 9: { halign: 'left', cellWidth: 38 } },
            head: [['Dia', 'Sem', 'Entrada', 'Saída', 'Pausa', 'Trab.', 'Atraso', 'Extra', 'Estado', 'Obs.']],
            body: l.dias.map(d => [d.data.slice(8), DIAS_SEMANA[diaSemana(d.data)], horaDe(d.primeira_entrada) || '', horaDe(d.ultima_saida) || '',
                horas(d.minutos_pausa), horas(d.minutos_trabalhados), d.minutos_atraso || '', horas(d.minutos_extra), codigoCelula(d),
                [d.feriado, l.observacoes.get(d.data), d.incompleto ? 'Incompleto' : null, d.falta_fraccao && d.falta_fraccao < 1 ? `${d.falta_tipo} ${num(d.falta_fraccao)}` : null].filter(Boolean).join(' · ')]),
            didDrawPage: () => applyBranding(doc, config, userName, true),
        });
        const fim = (doc as any).lastAutoTable?.finalY || y + 120;
        const t = l.totais;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42);
        doc.text(`TOTAIS: Presenças ${t.presencas} · Faltas ${num(t.faltas)} · FJ ${num(t.faltas_just)} · Horas ${formatarMinutos(t.minutos_trabalhados)} · Atraso ${t.minutos_atraso} min · Extra ${formatarMinutos(t.minutos_extra)}`, 14, fim + 6);
        const yAss = Math.min(282, fim + 26);
        doc.setFont('helvetica', 'normal'); doc.setDrawColor(148, 163, 184); doc.setTextColor(71, 85, 105); doc.setFontSize(8);
        doc.line(20, yAss, 90, yAss); doc.line(120, yAss, 190, yAss);
        doc.text('O Funcionário', 55, yAss + 4, { align: 'center' }); doc.text('O Responsável', 155, yAss + 4, { align: 'center' });
        doc.text('Data: ___/___/______', 55, yAss + 9, { align: 'center' }); doc.text('Data: ___/___/______', 155, yAss + 9, { align: 'center' });
    });
    const fileName = linhas.length === 1
        ? `Folha-ponto-${l0(linhas).numero_mecanografico}-${c.ano}-${String(c.mes).padStart(2, '0')}.pdf`
        : `Folhas-ponto-${c.ano}-${String(c.mes).padStart(2, '0')}.pdf`;
    if (saida === 'save') doc.save(fileName);
    return { fileName, dataUrl: doc.output('datauristring') };
}
const l0 = (linhas: LinhaGrelha[]) => linhas[0].funcionario;

/** Banco de horas (secção 8.1): saldo de cada funcionário e os movimentos do período. */
export function relatorioBancoHoras(
    funcionarios: Array<{ id: string; nome: string }>, saldos: Map<string, { saldo: number; creditos: number; debitos: number; expirados: number; a_expirar_30d: number }>,
    movimentos: Array<{ funcionario_id: string; data: string; minutos: number; tipo: string; descricao?: string | null; anulado?: number | null }>, de: string, ate: string,
): ReportDef {
    const nomes = new Map(funcionarios.map(f => [f.id, f.nome]));
    const rotulo: Record<string, string> = { extra: 'Horas extra', saida_antecipada: 'Saída antecipada', folga: 'Folga compensatória', ajuste: 'Ajuste' };
    const sinal = (m: number) => `${m > 0 ? '+' : m < 0 ? '−' : ''}${horas(Math.abs(m)) || '0:00'}`;
    const doPeriodo = movimentos.filter(m => !m.anulado && m.data >= de && m.data <= ate);
    return {
        key: 'ponto-banco', title: 'Banco de horas', subtitle: `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`, orientation: 'portrait',
        fileBase: `banco-horas-${de}-${ate}`, tagline: 'RECURSOS HUMANOS · LIVRO DE PONTO',
        sections: [
            {
                heading: 'Saldos',
                head: ['Funcionário', 'Créditos', 'Débitos', 'Expirados', 'A expirar (30 dias)', 'Saldo'],
                rows: [...saldos].filter(([id]) => nomes.has(id)).sort((a, b) => (nomes.get(a[0]) || '').localeCompare(nomes.get(b[0]) || ''))
                    .map(([id, s]) => [nomes.get(id)!, horas(s.creditos), horas(s.debitos), horas(s.expirados), horas(s.a_expirar_30d), sinal(s.saldo)]),
                emptyText: 'Sem movimentos no banco de horas.',
            },
            {
                heading: 'Movimentos do período',
                head: ['Dia', 'Funcionário', 'Tipo', 'Minutos', 'Descrição'],
                rows: doPeriodo.map(m => [m.data.split('-').reverse().join('/'), nomes.get(m.funcionario_id) || '—', rotulo[m.tipo] || m.tipo, sinal(m.minutos), m.descricao || '']),
                widths: { 4: 60 }, emptyText: 'Sem movimentos no período.',
            },
        ],
    };
}

/**
 * Cartões do quiosque com QR (F3.4): um por funcionário, tamanho de cartão bancário (85,6 × 54 mm), 8 por página A4.
 * O código só existe neste PDF (no sistema fica o hash): guarde-o bem ou emita um novo cartão.
 */
export async function gerarCartoesQr(cartoes: Array<{ nome: string; numero: string; codigo: string }>, empresa: string) {
    const QRCode = (await import('qrcode')).default;
    const doc = new jsPDF();
    const largura = 85.6;
    const altura = 54;
    for (let i = 0; i < cartoes.length; i++) {
        if (i > 0 && i % 8 === 0) doc.addPage();
        const pos = i % 8;
        const x = 14 + (pos % 2) * (largura + 10);
        const y = 14 + Math.floor(pos / 2) * (altura + 12);
        const c = cartoes[i];
        doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3);
        doc.roundedRect(x, y, largura, altura, 3, 3);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
        doc.text(empresa.toUpperCase().slice(0, 40), x + 4, y + 7);
        doc.setFontSize(11); doc.setTextColor(15, 23, 42);
        doc.text(doc.splitTextToSize(c.nome, 44).slice(0, 2), x + 4, y + 17);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text(`N.º ${c.numero}`, x + 4, y + 30);
        doc.text('Cartão do livro de ponto', x + 4, y + 46);
        doc.setFontSize(6); doc.text('Mostre o código ao quiosque', x + 4, y + 50);
        const qr = await QRCode.toDataURL(c.codigo, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
        doc.addImage(qr, 'PNG', x + largura - 40, y + 9, 36, 36);
    }
    doc.save(cartoes.length === 1 ? `Cartao-ponto-${cartoes[0].numero}.pdf` : 'Cartoes-ponto.pdf');
}
