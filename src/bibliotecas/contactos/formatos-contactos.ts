// Formatos de texto da agenda de contactos: CSV (UTF-8 com BOM, «;») e vCard 3.0. Sem dependências do navegador.

import { dataCurta, formatarTelefone, linhaTexto, ROTULO_CAMPO, ROTULO_TIPO, telefoneLocal, type AmbitoExportacao, type CampoExportacao, type FiltrosContactos, type LinhaExportacao } from './agenda-contactos.ts';

/** Colunas de texto/tabela pela ordem do ecrã (o QR só existe no PDF). */
export const colunasTabela = (campos: CampoExportacao[]) => (['nome', 'tipo', 'nif', 'telefone', 'email', 'morada', 'data_cadastro', 'observacoes'] as CampoExportacao[]).filter(c => campos.includes(c));

export function valorCampo(l: LinhaExportacao, campo: CampoExportacao): string {
    switch (campo) {
        case 'nome': return l.nome;
        case 'tipo': return ROTULO_TIPO[l.tipo];
        case 'nif': return l.nif || '';
        case 'telefone': return formatarTelefone(l.telefone);
        case 'email': return l.email;
        case 'morada': return l.morada;
        case 'data_cadastro': return dataCurta(l.cadastradoEm);
        case 'observacoes': return l.observacoes || '';
        default: return '';
    }
}

const aspas = (v: string) => `"${v.replace(/"/gu, '""').replace(/\r?\n/gu, ' ')}"`;

/** CSV para o Excel: BOM UTF-8, separador «;», aspas em todos os campos de texto, cabeçalho na 1.ª linha. */
export function gerarCsv(linhas: LinhaExportacao[], campos: CampoExportacao[]): string {
    const cols = colunasTabela(campos);
    const corpo = [cols.map(c => aspas(ROTULO_CAMPO[c])).join(';'), ...linhas.map(l => cols.map(c => aspas(valorCampo(l, c))).join(';'))];
    return `\uFEFF${corpo.join('\r\n')}\r\n`;
}

/** Escapa um valor de vCard (\\ , ; e quebras de linha). */
export const escaparVcard = (v: string) => v.replace(/\\/gu, '\\\\').replace(/\r?\n/gu, '\\n').replace(/,/gu, '\\,').replace(/;/gu, '\\;');

/** Dobra as linhas a 75 octetos (RFC 2425), sem partir caracteres. */
function dobrar(linha: string): string {
    const enc = new TextEncoder();
    if (enc.encode(linha).length <= 75) return linha;
    const partes: string[] = [];
    let actual = '';
    for (const ch of linha) {
        const limite = partes.length ? 74 : 75;
        if (enc.encode(actual + ch).length > limite) { partes.push(actual); actual = ''; }
        actual += ch;
    }
    partes.push(actual);
    return partes.join('\r\n ');
}

/** vCard 3.0, um cartão por cliente. `empresa` vai em ORG («Cliente — EMPRESA»). */
export function gerarVcard(linhas: LinhaExportacao[], empresa: string, campos?: CampoExportacao[]): string {
    const tem = (c: CampoExportacao) => !campos || campos.includes(c);
    return linhas.map(l => {
        const partes = l.nome.trim().split(/\s+/u);
        const apelido = partes.length > 1 ? partes[partes.length - 1] : '';
        const proprios = partes.length > 1 ? partes.slice(0, -1).join(' ') : partes[0] || '';
        const local = telefoneLocal(l.telefone);
        const telefone = local ? `+244${local}` : l.telefone.replace(/[^\d+]/gu, '');
        const out = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escaparVcard(apelido)};${escaparVcard(proprios)};;;`, `FN:${escaparVcard(l.nome)}`];
        if (tem('telefone') && telefone) out.push(`TEL;TYPE=CELL:${telefone}`);
        if (tem('email') && l.email) out.push(`EMAIL;TYPE=INTERNET:${escaparVcard(l.email)}`);
        if (tem('morada') && (l.morada || l.provincia)) out.push(`ADR;TYPE=HOME:;;${escaparVcard(l.morada)};${escaparVcard(l.municipio)};${escaparVcard(l.provincia)};;Angola`);
        if (empresa) out.push(`ORG:${escaparVcard(`Cliente — ${empresa}`)}`);
        const nota = [tem('tipo') ? `Cliente ${ROTULO_TIPO[l.tipo].toLowerCase()}` : '', l.nif && tem('nif') ? `NIF/BI ${l.nif}` : '', l.observacoes || ''].filter(Boolean).join('. ');
        if (nota) out.push(`NOTE:${escaparVcard(nota)}`);
        out.push('END:VCARD');
        return out.map(dobrar).join('\r\n');
    }).join('\r\n') + '\r\n';
}

/** Texto para colar numa mensagem: um cliente por linha. */
export const gerarTexto = (linhas: LinhaExportacao[]) => linhas.map(l => linhaTexto(l)).join('\n');

/** Ficha de um cliente em texto («Copiar tudo»). */
export function fichaTexto(c: { nome: string; tipo: keyof typeof ROTULO_TIPO; telefone: string; telefoneAlternativo?: string; email: string; morada: string; cadastradoEm?: string | null }): string {
    return [
        c.nome, `Tipo: ${ROTULO_TIPO[c.tipo]}`, c.telefone ? `Telefone: ${formatarTelefone(c.telefone)}` : '',
        c.telefoneAlternativo ? `Telefone alternativo: ${formatarTelefone(c.telefoneAlternativo)}` : '',
        c.email ? `Email: ${c.email}` : '', c.morada ? `Morada: ${c.morada}` : '', c.cadastradoEm ? `Cliente desde ${dataCurta(c.cadastradoEm)}` : '',
    ].filter(Boolean).join('\n');
}

const semAcentos = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
export const slug = (v: string) => semAcentos(v).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 60) || 'contactos';

/** contactos-clientes_{ambito}_{AAAA-MM-DD}.ext ou contacto_{nome}.ext para um cliente. */
export function nomeFicheiro(ambito: AmbitoExportacao, filtros: FiltrosContactos, extensao: string, hoje: string, nomeCliente?: string): string {
    if (ambito === 'um' && nomeCliente) return `contacto_${slug(nomeCliente)}.${extensao}`;
    const parte = ambito === 'todos' ? 'todos' : ambito === 'seleccionados' ? 'seleccionados' : filtros.periodo && filtros.periodo !== 'qualquer' ? filtros.periodo.replace(/_/gu, '-') : 'filtro';
    return `contactos-clientes_${parte}_${hoje}.${extensao}`;
}
