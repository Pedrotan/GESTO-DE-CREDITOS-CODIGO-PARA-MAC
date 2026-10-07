// Matriz Geral de Utilizadores e Permissões em PDF (paisagem): resumo, tabela de utilizadores e acessos,
// matriz de permissões efetivas de cada utilizador (cores: ativa, crítica, exceção) e conflitos de
// segregação de funções. Páginas numeradas e "Gerado por".
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, contentBottom, ensurePdfSpace, getCompanySettings, resolveBrandDark, resolveBrandPrimary } from './pdf';
import { formatLuandaDateTime } from './fuso-angola';
import { ROLES, type User } from '@/tipos/autenticacao';
import { DESCRICOES_ACOES, MODULOS_SISTEMA, ROTULOS_AREAS, comporPermissao, type AcaoModulo } from '@/tipos/controlo-acesso';

export type EffectivePermissions = (user: User) => { permissoes: string[]; origemPorPermissao: Record<string, { origem: string }> };
import { segregationConflicts } from './permissoes-analise';

const STANDARD: AcaoModulo[] = ['ver', 'criar', 'editar', 'eliminar', 'aprovar', 'exportar'];
const STATUS: Record<string, string> = { active: 'Ativo', blocked: 'Bloqueado', pending_activation: 'Pendente', offline: 'Ativo (offline)', inactive: 'Inativo' };
const SCOPE: Record<string, string> = { todos: 'Todos os clientes', agencia: 'Agência', carteira_propria: 'Carteira própria' };
const safe = (value: string) => Array.from(String(value ?? ''), char => {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x2014 || code === 0x2013 || code === 0x2212) return '-';
    if (code === 0x2192) return '->';
    return code > 0xFF ? '' : char;
}).join('');
const kz = (value: number) => `${Math.round(value).toLocaleString('pt-AO').replace(/\s/g, ' ')} Kz`;

export function generateUsersPermissionsMatrixPDF(users: User[], effectiveOf: EffectivePermissions, settings: any, userName?: string, output: 'save' | 'none' = 'save') {
    const doc = new jsPDF({ orientation: 'landscape' });
    const config = getCompanySettings(settings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = resolveBrandDark(config.secondaryColor);
    applyBranding(doc, config, userName, false, { tagline: 'CONTROLO DE ACESSOS' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const redraw = (hook: any) => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); };
    let y = brandingHeaderBottom(doc) + 9;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('MATRIZ GERAL DE UTILIZADORES E PERMISSÕES', margin, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor(71, 85, 105);
    doc.text(safe(`Registo oficial de controlo de acessos, alçadas e perfis · Gerado por ${userName || 'Sistema'} em ${formatLuandaDateTime(new Date())} (hora de Angola)`), margin, y);
    y += 5;

    const effective = users.map(user => {
        const result = effectiveOf(user);
        return { user, permissions: new Set(result.permissoes), origin: result.origemPorPermissao, conflicts: segregationConflicts(result.permissoes) };
    });

    // Resumo
    const count = (fn: (user: User) => boolean) => String(users.filter(fn).length);
    autoTable(doc, {
        startY: y, margin: { left: margin, right: margin }, theme: 'grid',
        body: [
            ['Utilizadores', String(users.length), 'Ativos', count(user => user.status === 'active' || user.status === 'offline'), 'Bloqueados', count(user => user.status === 'blocked'), 'Sem 2FA', count(user => !user.twoFactorEnabled)],
            ['Super Administradores', count(user => user.role === 'super_admin'), 'Com exceções', count(user => (user.permissionExceptions || []).length > 0),
                'Com conflitos', String(effective.filter(item => item.conflicts.length).length), 'Perfis em uso', String(new Set(users.map(user => user.role)).size)],
        ],
        styles: { fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59] },
        columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252] }, 2: { fontStyle: 'bold', fillColor: [248, 250, 252] }, 4: { fontStyle: 'bold', fillColor: [248, 250, 252] }, 6: { fontStyle: 'bold', fillColor: [248, 250, 252] },
            1: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' }, 7: { halign: 'right' } },
        didDrawPage: redraw,
    });
    y = (doc as any).lastAutoTable.finalY + 7;

    // 1. Utilizadores e acessos
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text('1. Utilizadores, perfis e alçadas', margin, y);
    autoTable(doc, {
        startY: y + 2.5, margin: { left: margin, right: margin }, theme: 'striped',
        head: [['Utilizador', 'Email', 'Perfil', 'Alçada de aprovação', 'Âmbito dos dados', '2FA', 'Estado', 'Último acesso', 'Permissões', 'Exceções']],
        body: effective.map(({ user, permissions }) => [
            safe(user.name || '-'), safe(user.email || '-'), safe(ROLES[user.role]?.label || user.role),
            user.role === 'super_admin' ? 'Ilimitada' : kz(Number(user.approvalLimits?.aprovacaoCreditoKz) || 0),
            SCOPE[String(user.dataScope || 'todos')] || String(user.dataScope), user.twoFactorEnabled ? 'Ativo' : 'Não', STATUS[String(user.status)] || String(user.status || '-'),
            user.lastLogin ? formatLuandaDateTime(user.lastLogin) : 'Nunca', String(permissions.size), String((user.permissionExceptions || []).length),
        ]),
        styles: { fontSize: 7.4, cellPadding: 1.6, overflow: 'linebreak', textColor: [30, 41, 59] },
        headStyles: { fillColor: [dark[0], dark[1], dark[2]], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' }, 1: { cellWidth: 46 }, 3: { halign: 'right' }, 5: { halign: 'center' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
        didParseCell: hook => {
            if (hook.section !== 'body') return;
            if (hook.column.index === 5 && hook.cell.raw === 'Não') hook.cell.styles.textColor = [185, 28, 28];
            if (hook.column.index === 6 && hook.cell.raw === 'Bloqueado') hook.cell.styles.textColor = [185, 28, 28];
        },
        didDrawPage: redraw,
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // 2. Matriz de permissões efetivas por utilizador
    for (const { user, permissions, origin, conflicts } of effective) {
        y = ensurePdfSpace(doc, y, 40, config, userName, 34);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(primary[0], primary[1], primary[2]);
        doc.text(safe(`2. Permissões de ${user.name} · ${ROLES[user.role]?.label || user.role}`), margin, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(100, 116, 139);
        doc.text(safe(`${permissions.size} permissões efetivas · ${(user.permissionExceptions || []).length} exceção(ões) individual(is)${conflicts.length ? ` · ${conflicts.length} conflito(s) de segregação` : ''}`), margin, y + 4);
        const body = MODULOS_SISTEMA.map(module => {
            const special = module.acoesDisponiveis.filter(action => !STANDARD.includes(action));
            const specials = special.filter(action => permissions.has(comporPermissao(module.id, action))).map(action => DESCRICOES_ACOES[action]?.nome || action);
            return [ROTULOS_AREAS[module.area]?.nome || module.area, module.nome,
                ...STANDARD.map(action => !module.acoesDisponiveis.includes(action) ? '' : permissions.has(comporPermissao(module.id, action)) ? 'Sim' : 'Não'),
                specials.join(', ') || '-'];
        }).filter(row => row.slice(2, 8).includes('Sim') || row[8] !== '-');
        autoTable(doc, {
            startY: y + 6.5, margin: { left: margin, right: margin }, theme: 'grid',
            head: [['Área', 'Módulo', 'Ver', 'Criar', 'Editar', 'Eliminar', 'Aprovar', 'Exportar', 'Ações especiais']],
            body: body.length ? body : [[{ content: 'Sem permissões efetivas.', colSpan: 9, styles: { halign: 'center', textColor: [100, 116, 139] } } as any]],
            styles: { fontSize: 7, cellPadding: 1.3, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
            headStyles: { fillColor: [dark[0], dark[1], dark[2]], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 46, fontStyle: 'bold' }, 2: { halign: 'center', cellWidth: 16 }, 3: { halign: 'center', cellWidth: 16 }, 4: { halign: 'center', cellWidth: 16 },
                5: { halign: 'center', cellWidth: 18 }, 6: { halign: 'center', cellWidth: 18 }, 7: { halign: 'center', cellWidth: 18 } },
            didParseCell: hook => {
                if (hook.section !== 'body' || hook.column.index < 2 || hook.column.index > 7) return;
                const module = MODULOS_SISTEMA.find(item => item.nome === (hook.row.raw as string[])[1]);
                const action = STANDARD[hook.column.index - 2];
                if (hook.cell.raw === 'Sim') {
                    const id = module ? comporPermissao(module.id, action) : '';
                    const granted = origin[id]?.origem === 'excecao_concedida';
                    const critical = DESCRICOES_ACOES[action]?.critica;
                    hook.cell.styles.fillColor = granted ? [209, 250, 229] : critical ? [254, 243, 199] : [219, 234, 254];
                    hook.cell.styles.textColor = granted ? [6, 95, 70] : critical ? [146, 64, 14] : [30, 64, 175];
                    hook.cell.styles.fontStyle = 'bold';
                } else if (hook.cell.raw === 'Não') {
                    hook.cell.styles.textColor = [148, 163, 184];
                }
            },
            didDrawPage: redraw,
        });
        y = (doc as any).lastAutoTable.finalY + 3;
        if (conflicts.length) {
            autoTable(doc, {
                startY: y, margin: { left: margin, right: margin }, theme: 'plain',
                body: conflicts.map(conflict => [safe(`Conflito de segregação: ${conflict.nome}`), safe(conflict.descricao)]),
                styles: { fontSize: 7.2, cellPadding: 1.3, textColor: [146, 64, 14], fillColor: [255, 251, 235] },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
                didDrawPage: redraw,
            });
            y = (doc as any).lastAutoTable.finalY + 3;
        }
        y += 5;
    }

    // Legenda
    y = ensurePdfSpace(doc, y, 22, config, userName, 34);
    autoTable(doc, {
        startY: y, margin: { left: margin, right: margin }, theme: 'grid',
        head: [['Legenda', '']],
        body: [['Sim (azul)', 'Permissão ativa herdada do perfil'], ['Sim (amarelo)', 'Ação crítica ativa (eliminar, aprovar ou ação especial crítica)'],
            ['Sim (verde)', 'Exceção individual concedida além do perfil'], ['Não', 'Ação disponível no módulo mas não atribuída'], ['(vazio)', 'Ação que não existe no módulo']],
        styles: { fontSize: 7.2, cellPadding: 1.3 }, headStyles: { fillColor: [dark[0], dark[1], dark[2]], textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
        didParseCell: hook => {
            if (hook.section !== 'body' || hook.column.index !== 0) return;
            const fill = [[219, 234, 254], [254, 243, 199], [209, 250, 229], [255, 255, 255], [255, 255, 255]][hook.row.index];
            hook.cell.styles.fillColor = fill as [number, number, number];
        },
        didDrawPage: redraw,
    });

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        doc.text(`Página ${page} de ${pages}`, pageWidth - margin, contentBottom(doc) + 5.4, { align: 'right' });
    }
    if (output === 'save') doc.save(`Matriz_Utilizadores_Permissoes_${new Date().toISOString().slice(0, 10)}.pdf`);
    return doc;
}
