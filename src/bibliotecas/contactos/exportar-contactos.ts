// Ficheiros da agenda de contactos: PDF (lista e ficha individual), Excel, CSV e vCard. Reutiliza o jsPDF/autoTable,
// os dados da empresa (getCompanySettings) e o xlsx que o resto do sistema já usa.
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { getCompanySettings } from '@/bibliotecas/pdf';
import { luandaParts, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import {
    dataCurta, formatarTelefone, numeroWhatsApp, ROTULO_CAMPO, ROTULO_ORDENAR, ROTULO_TIPO, type CampoExportacao, type FiltrosContactos,
    type LinhaExportacao, type PedidoExportacao,
} from './agenda-contactos';
import { colunasTabela, gerarCsv, gerarVcard, nomeFicheiro, valorCampo } from './formatos-contactos';
import { descreverFiltros, filtrosDaExportacao } from './agenda-contactos';

const VERDE: [number, number, number] = [11, 74, 47];
const TEXTO: [number, number, number] = [16, 24, 40];
const CINZA: [number, number, number] = [71, 84, 103];
const pad = (n: number) => String(n).padStart(2, '0');

export type OpcoesFicheiro = { orientacao?: 'vertical' | 'horizontal'; cabecalhoEmpresa?: boolean; utilizador: string; empresa?: unknown };

function agoraTexto() {
    const p = luandaParts(new Date())!;
    return `${pad(p.day)}/${pad(p.month + 1)}/${p.year}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Cabeçalho da empresa (logótipo, nome, NIF, email, localização) e, à direita, quem gerou e quando. Devolve o y seguinte. */
function cabecalho(doc: jsPDF, opcoes: OpcoesFicheiro): number {
    const largura = doc.internal.pageSize.getWidth();
    const margem = 14;
    let y = 14;
    if (opcoes.cabecalhoEmpresa !== false) {
        const empresa: any = getCompanySettings(opcoes.empresa);
        let x = margem;
        if (empresa.logo && String(empresa.logo).startsWith('data:image')) {
            try { doc.addImage(empresa.logo, margem, y - 2, 13, 13); x += 16; } catch { /* logótipo ilegível: só o texto */ }
        }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
        doc.text(String(empresa.name || '').toUpperCase(), x, y + 3);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA);
        doc.text([empresa.nif ? `NIF ${empresa.nif}` : '', empresa.email || '', empresa.location || empresa.address || ''].filter(Boolean).join(' · '), x, y + 8);
        doc.text([`Gerado a ${agoraTexto()}`, `por ${opcoes.utilizador}`], largura - margem, y + 3, { align: 'right' });
        y += 14;
    } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA);
        doc.text(`Gerado a ${agoraTexto()} por ${opcoes.utilizador}`, largura - margem, y + 3, { align: 'right' });
        y += 6;
    }
    doc.setFillColor(...VERDE);
    doc.rect(margem, y, largura - margem * 2, 0.9, 'F');
    return y + 8;
}

function rodapes(doc: jsPDF) {
    const total = doc.getNumberOfPages();
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= total; i += 1) {
        doc.setPage(i);
        doc.setDrawColor(228, 231, 236); doc.setLineWidth(0.2);
        doc.line(14, altura - 12, largura - 14, altura - 12);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
        doc.text('Documento interno · contém dados pessoais de clientes', 14, altura - 7.5);
        doc.text(`Página ${i} de ${total}`, largura - 14, altura - 7.5, { align: 'right' });
    }
}

function chips(doc: jsPDF, textos: string[], y: number): number {
    let x = 14;
    const largura = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    for (const [i, t] of textos.entries()) {
        const w = doc.getTextWidth(t) + 6;
        if (x + w > largura - 14) { x = 14; y += 7; }
        if (i === textos.length - 1) { doc.setFillColor(242, 244, 247); doc.setTextColor(52, 64, 84); } else { doc.setFillColor(236, 253, 243); doc.setTextColor(8, 93, 58); }
        doc.roundedRect(x, y - 3.8, w, 5.6, 2.8, 2.8, 'F');
        doc.text(t, x + 3, y);
        x += w + 2;
    }
    return y + 7;
}

/** PDF da lista: título, chips dos filtros, tabela com cabeçalho repetido e rodapé em todas as páginas. */
export function pdfLista(linhas: LinhaExportacao[], pedido: PedidoExportacao, opcoes: OpcoesFicheiro): Blob {
    const doc = new jsPDF({ orientation: opcoes.orientacao === 'horizontal' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    let y = cabecalho(doc, opcoes);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(11, 46, 30);
    doc.text('Lista de contactos de clientes', 14, y + 2);
    const filtros = filtrosDaExportacao(pedido);
    const ordem = ROTULO_ORDENAR[filtros.ordenar || 'nome_asc'];
    y = chips(doc, [...descreverFiltros(filtros).filter(t => !/^Pesquisa/u.test(t) || pedido.ambito === 'filtro'), `${linhas.length} cliente${linhas.length === 1 ? '' : 's'}`, `Ordenado por ${ordem.toLowerCase()}`], y + 10);
    const extra = colunasTabela(pedido.campos).filter(c => !['nome', 'tipo', 'telefone', 'email', 'morada'].includes(c));
    const base: CampoExportacao[] = (['telefone', 'email', 'morada'] as CampoExportacao[]).filter(c => pedido.campos.includes(c));
    const cols = [...base, ...extra];
    autoTable(doc, {
        startY: y,
        head: [['#', 'Cliente', ...cols.map(c => ROTULO_CAMPO[c])]],
        body: linhas.map((l, i) => [String(i + 1), `${l.nome}${pedido.campos.includes('tipo') ? `\n${ROTULO_TIPO[l.tipo]}` : ''}`, ...cols.map(c => valorCampo(l, c) || '—')]),
        theme: 'striped', showHead: 'everyPage',
        styles: { fontSize: 8, cellPadding: 2, textColor: TEXTO, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
            0: { cellWidth: 8, textColor: CINZA }, 1: { fontStyle: 'bold', cellWidth: opcoes.orientacao === 'horizontal' ? 60 : 42 },
            // Telefone, NIF e datas numa só linha.
            ...Object.fromEntries(cols.map((c, i) => [i + 2, c === 'telefone' ? { cellWidth: 29 } : c === 'nif' ? { cellWidth: 30 } : c === 'data_cadastro' ? { cellWidth: 19 } : {}])),
        },
        margin: { left: 14, right: 14, bottom: 18 },
    });
    rodapes(doc);
    return doc.output('blob');
}

/** Ficha individual A4: nome em destaque, contactos, morada, identificação (se permitida), observações e QR opcional. */
export async function pdfFicha(l: LinhaExportacao, pedido: PedidoExportacao, opcoes: OpcoesFicheiro): Promise<Blob> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = cabecalho(doc, opcoes);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(11, 46, 30);
    doc.text(doc.splitTextToSize(l.nome, 150) as string[], 14, y + 4);
    y += 4 + 7 * (doc.splitTextToSize(l.nome, 150) as string[]).length;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...CINZA);
    doc.text([`Cliente ${ROTULO_TIPO[l.tipo].toLowerCase()}`, l.cadastradoEm ? `Cliente desde ${dataCurta(l.cadastradoEm)}` : ''].filter(Boolean).join(' · '), 14, y);
    y += 8;
    const bloco = (titulo: string, pares: Array<[string, string]>) => {
        const visiveis = pares.filter(([, v]) => v);
        if (!visiveis.length) return;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(71, 84, 103);
        doc.text(titulo.toUpperCase(), 14, y); y += 2;
        autoTable(doc, {
            startY: y, body: visiveis, theme: 'plain',
            styles: { fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 0, right: 2 }, textColor: TEXTO },
            columnStyles: { 0: { cellWidth: 45, textColor: CINZA }, 1: { fontStyle: 'bold' } },
            margin: { left: 14, right: 70 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
    };
    const tem = (c: CampoExportacao) => pedido.campos.includes(c);
    bloco('Contactos', [['Telefone', tem('telefone') ? formatarTelefone(l.telefone) : ''], ['Email', tem('email') ? l.email : '']]);
    bloco('Morada', [['Morada', tem('morada') ? l.morada : ''], ['Município', tem('morada') ? l.municipio : ''], ['Província', tem('morada') ? l.provincia : '']]);
    bloco('Identificação', [['NIF / BI', tem('nif') ? l.nif || '' : ''], ['Cadastrado em', tem('data_cadastro') ? dataCurta(l.cadastradoEm) : '']]);
    if (tem('observacoes') && l.observacoes) bloco('Observações', [['Notas', l.observacoes]]);
    const wa = numeroWhatsApp(l.telefone);
    if (tem('qr_whatsapp') && wa) {
        const qr = await QRCode.toDataURL(`https://wa.me/${wa}`, { margin: 1, width: 240 });
        const x = doc.internal.pageSize.getWidth() - 14 - 42;
        doc.addImage(qr, 'PNG', x, 60, 42, 42);
        doc.setFontSize(8); doc.setTextColor(...CINZA);
        doc.text('WhatsApp', x + 21, 106, { align: 'center' });
    }
    rodapes(doc);
    return doc.output('blob');
}

/** Excel: folha «Contactos» (telefones e NIF como texto, datas reais, cabeçalho fixo e filtros) e folha «Info». */
export function excel(linhas: LinhaExportacao[], pedido: PedidoExportacao, opcoes: OpcoesFicheiro): Blob {
    const cols = colunasTabela(pedido.campos);
    const cabecalhoLinha = cols.map(c => ROTULO_CAMPO[c]);
    const dados = linhas.map(l => cols.map(c => {
        if (c === 'data_cadastro') {
            const p = l.cadastradoEm ? luandaParts(l.cadastradoEm) : null;
            return p ? new Date(Date.UTC(p.year, p.month, p.day)) : '';
        }
        return valorCampo(l, c);
    }));
    const folha = XLSX.utils.aoa_to_sheet([cabecalhoLinha, ...dados], { cellDates: true });
    // Telefone e NIF como texto; datas com formato dd/mm/aaaa.
    dados.forEach((linha, i) => cols.forEach((c, j) => {
        const ref = XLSX.utils.encode_cell({ r: i + 1, c: j });
        const celula = folha[ref];
        if (!celula) return;
        if (c === 'data_cadastro' && linha[j] instanceof Date) { celula.t = 'd'; celula.z = 'dd/mm/yyyy'; }
        else { celula.t = 's'; celula.v = String(linha[j] ?? ''); celula.z = '@'; }
    }));
    cabecalhoLinha.forEach((_, j) => { const c = folha[XLSX.utils.encode_cell({ r: 0, c: j })]; if (c) c.s = { font: { bold: true } }; });
    folha['!cols'] = cols.map((c, j) => ({ wch: Math.min(60, Math.max(ROTULO_CAMPO[c].length, ...dados.map(l => String(l[j] instanceof Date ? '00/00/0000' : l[j] ?? '').length)) + 2) }));
    folha['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, dados.length), c: Math.max(0, cols.length - 1) } }) };
    folha['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
    (folha as any)['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }];
    const empresa: any = getCompanySettings(opcoes.empresa);
    const info = XLSX.utils.aoa_to_sheet([
        ['Empresa', String(empresa.name || '')], ['NIF', String(empresa.nif || '')], ['Gerado a', agoraTexto()], ['Utilizador', opcoes.utilizador],
        ['Filtros', descreverFiltros(filtrosDaExportacao(pedido)).join(' · ')], ['Total', linhas.length], ['Nota', 'Documento interno · contém dados pessoais de clientes'],
    ]);
    info['!cols'] = [{ wch: 14 }, { wch: 80 }];
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, folha, 'Contactos');
    XLSX.utils.book_append_sheet(livro, info, 'Info');
    const bytes = XLSX.write(livro, { bookType: 'xlsx', type: 'array', cellStyles: true });
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Gera o ficheiro do pedido; devolve o blob e o nome. */
export async function gerarFicheiro(linhas: LinhaExportacao[], pedido: PedidoExportacao, opcoes: OpcoesFicheiro, filtrosPagina?: FiltrosContactos): Promise<{ blob: Blob; nome: string }> {
    const hoje = luandaTodayKey();
    const empresa: any = getCompanySettings(opcoes.empresa);
    const nome = (ext: string) => nomeFicheiro(pedido.ambito, filtrosPagina && pedido.ambito === 'filtro' ? { ...filtrosPagina, ...filtrosDaExportacao(pedido) } : filtrosDaExportacao(pedido), ext, hoje, pedido.ambito === 'um' ? linhas[0]?.nome : undefined);
    switch (pedido.formato) {
        case 'pdf': return { blob: pedido.ambito === 'um' && linhas.length === 1 ? await pdfFicha(linhas[0], pedido, opcoes) : pdfLista(linhas, pedido, opcoes), nome: nome('pdf') };
        case 'xlsx': return { blob: excel(linhas, pedido, opcoes), nome: nome('xlsx') };
        case 'csv': return { blob: new Blob([gerarCsv(linhas, pedido.campos)], { type: 'text/csv;charset=utf-8' }), nome: nome('csv') };
        default: return { blob: new Blob([gerarVcard(linhas, String(empresa.name || ''), pedido.campos)], { type: 'text/vcard;charset=utf-8' }), nome: nome('vcf') };
    }
}

export function descarregar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
