// Verificador de sobreposições em todos os PDFs: gera cada relatório com dados de exemplo (textos longos,
// muitas linhas), regista a caixa de cada texto/imagem e acusa qualquer sobreposição entre textos, com o
// cabeçalho/rodapé/molduras da marca, ou fora da página.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(process.argv[2] || '.');
const only = process.argv[3] || '';
const outdir = mkdtempSync(path.join(tmpdir(), 'verificar-pdfs-'));
const outfile = path.join(outdir, 'pdfs.mjs');
await build({
    stdin: {
        contents: `
            export { default as jsPDF } from '@/bibliotecas/pdf-documento';
            export * as pdf from '@/bibliotecas/pdf';
            export * as economic from '@/bibliotecas/economicReportGenerator';
            export * as fiscal from '@/bibliotecas/fiscalPdfGenerator';
            export * as lixeira from '@/bibliotecas/lixeiraReportGenerator';
            export * as ficha from '@/bibliotecas/ficha-simulacao-pdf';
            export * as termos from '@/bibliotecas/termos-legais';
            export * as exportar from '@/componentes/contabilidade/exportar';
            export { simulateCredit } from '@/bibliotecas/simulador-credito';
            export { normalizeSimulatorConfig } from '@/bibliotecas/config-simulador';
            export * as reciboPag from '@/bibliotecas/recibo-pagamento';
            export * as relPag from '@/bibliotecas/relatorios-pagamentos';
            export * as anPag from '@/bibliotecas/pagamentos-analise';
            export * as matriz from '@/bibliotecas/matriz-permissoes-pdf';
            export * as relAud from '@/bibliotecas/relatorios-auditoria';
            export * as relAlc from '@/bibliotecas/relatorios-alcadas';
            export * as alc from '@/bibliotecas/alcadas';
            export * as anAud from '@/bibliotecas/auditoria-analise';
            export { PERFIS_PREDEFINIDOS } from '@/tipos/controlo-acesso';
        `,
        resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'test', DEV: false, PROD: true }) },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
    plugins: [{ name: 'alias', setup(b) {
        b.onResolve({ filter: /^@\// }, async args => b.resolve(path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
        b.onResolve({ filter: /^xlsx$/ }, () => ({ path: 'xlsx', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const utils = {}; export const writeFile = () => {}; export default {};', loader: 'js' }));
    } }],
});
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const M = await import(pathToFileURL(outfile).href);
rmSync(outdir, { recursive: true, force: true });
const { jsPDF } = M;
globalThis.window = Object.assign(globalThis, { open: () => null, location: { origin: 'http://localhost', href: 'http://localhost/' } });

// ── Registo das caixas ───────────────────────────────────────────────────────────────
const docs = [];
const DEFAULT_BASELINE = 'alphabetic';
function boxesForText(doc, text, x, y, options = {}) {
    if (options && (options.angle || options.rotationDirection)) return [];
    const k = doc.internal.scaleFactor;
    const size = doc.getFontSize();
    const lh = size * doc.getLineHeightFactor() / k;
    const asc = size * 0.70 / k, desc = size * 0.18 / k;
    let lines = Array.isArray(text) ? text.flatMap(t => String(t).split(/\r?\n/)) : String(text ?? '').split(/\r?\n/);
    if (options.maxWidth) lines = lines.flatMap(l => doc.splitTextToSize(l, options.maxWidth));
    const baseline = options.baseline || DEFAULT_BASELINE;
    const boxes = [];
    lines.forEach((line, i) => {
        if (!String(line).trim()) return;
        const w = doc.getTextWidth(String(line));
        let base = y + i * lh;
        if (baseline === 'top' || baseline === 'hanging') base = y + i * lh + asc;
        else if (baseline === 'middle') base = y + i * lh + (asc - desc) / 2;
        else if (baseline === 'bottom') base = y + i * lh - desc;
        let x0 = x;
        if (options.align === 'center') x0 = x - w / 2; else if (options.align === 'right') x0 = x - w;
        boxes.push({ kind: 'text', text: String(line), x0, x1: x0 + w, y0: base - asc, y1: base + desc, size });
    });
    return boxes;
}
const SHAPES = ['rect', 'triangle', 'circle', 'roundedRect', 'line', 'ellipse'];
function instrument(doc) {
    doc.__items = [];
    const push = (item) => doc.__items.push({ ...item, page: doc.getCurrentPageInfo().pageNumber });
    const text = doc.text.bind(doc);
    doc.text = function (t, x, y, options, transform) {
        if (typeof x === 'number' && typeof y === 'number') for (const b of boxesForText(doc, t, x, y, options || {})) push(b);
        return text(t, x, y, options, transform);
    };
    const addImage = doc.addImage.bind(doc);
    doc.addImage = function (...args) {
        const [, , x, y, w, h] = typeof args[1] === 'string' ? args : [args[0], 'PNG', ...args.slice(1)];
        if ([x, y, w, h].every(v => typeof v === 'number')) push({ kind: 'image', x0: x, y0: y, x1: x + w, y1: y + h });
        return addImage(...args);
    };
    for (const name of SHAPES) {
        const fn = doc[name].bind(doc);
        doc[name] = function (...a) {
            let box = null;
            if (name === 'rect' || name === 'roundedRect') box = { x0: Math.min(a[0], a[0] + a[2]), y0: Math.min(a[1], a[1] + a[3]), x1: Math.max(a[0], a[0] + a[2]), y1: Math.max(a[1], a[1] + a[3]) };
            else if (name === 'triangle') box = { x0: Math.min(a[0], a[2], a[4]), y0: Math.min(a[1], a[3], a[5]), x1: Math.max(a[0], a[2], a[4]), y1: Math.max(a[1], a[3], a[5]) };
            else if (name === 'circle') box = { x0: a[0] - a[2], y0: a[1] - a[2], x1: a[0] + a[2], y1: a[1] + a[2] };
            else if (name === 'ellipse') box = { x0: a[0] - a[2], y0: a[1] - a[3], x1: a[0] + a[2], y1: a[1] + a[3] };
            else if (name === 'line') box = { x0: Math.min(a[0], a[2]), y0: Math.min(a[1], a[3]) - 0.1, x1: Math.max(a[0], a[2]), y1: Math.max(a[1], a[3]) + 0.1 };
            if (box) push({ kind: 'shape', shape: name, ...box });
            return fn(...a);
        };
    }
}
jsPDF.API.events.push(['initialized', function () { instrument(this); docs.push(this); }]);
jsPDF.API.save = function () { return this; };

// ── Assinatura da marca (cabeçalho, rodapé e molduras) ────────────────────────────────
const png = 'data:image/png;base64,' + readFileSync(path.join(root, 'public/favicon.png')).toString('base64');
const settings = {
    name: 'MICROCRÉDITO EXEMPLO ANGOLA, COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, LDA', nif: '5000000000',
    address: 'Rua Comandante Gika, Edifício Garden Towers, 12.º andar', location: 'Luanda, Angola',
    phone: '+244 941 537 486', whatsapp: '+244 900 000 000', email: 'geral.financeiro@microcreditoexemplo.co.ao',
    website: 'www.microcreditoexemplo.co.ao', currency: 'AOA', logo: png, reportLogo: png, primaryColor: '#F37021',
    bankingInfo: JSON.stringify([{ id: 'b1', bankName: 'Banco de Fomento Angola (BFA)', iban: 'AO06 0006 0000 1234 5678 9012 3', holder: 'MICROCRÉDITO EXEMPLO ANGOLA, LDA', isDefault: true }]),
    authorizedSigners: '[]', contractTemplates: '[]', customClauses: '',
};
const USER = 'Operador de Crédito Exemplo';

// ── Verificação ──────────────────────────────────────────────────────────────────────
const inter = (a, b) => ({ w: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h: Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) });
function analyse(doc) {
    const issues = [];
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const pages = new Map();
    for (const item of doc.__items) { if (!pages.has(item.page)) pages.set(item.page, []); pages.get(item.page).push(item); }
    if (!doc.__receiptSlip) for (let p = 1; p <= doc.getNumberOfPages(); p++) if (!(pages.get(p) || []).some(i => i.kind === 'shape' && i.shape === 'ellipse')) issues.push({ page: p, type: 'página sem contactos com ícones no rodapé', a: '', at: [0, 0] });
    for (const [page, items] of pages) {
        const texts = items.filter(i => i.kind === 'text');
        const solids = items.filter(i => i.kind === 'image' || (i.kind === 'shape' && i.isBrand));
        const boxes = items.filter(i => i.kind === 'shape' && !i.isBrand && (i.shape === 'rect' || i.shape === 'roundedRect') && (i.x1 - i.x0) > 4 && (i.y1 - i.y0) > 3);
        const lines = items.filter(i => i.kind === 'shape' && !i.isBrand && i.shape === 'line');
        for (const t of texts) {
            if (t.brand) continue;
            const midTop = t.y0 + (t.y1 - t.y0) * 0.3, midBottom = t.y1 - (t.y1 - t.y0) * 0.35;
            for (const b of boxes) {
                const o = inter(t, b);
                if (o.w <= 0.3 || o.h <= 0.3) continue;
                const inside = t.x0 >= b.x0 - 0.3 && t.x1 <= b.x1 + 0.3 && t.y0 >= b.y0 - 0.6 && t.y1 <= b.y1 + 0.6;
                const verticallyInside = t.y0 >= b.y0 - 0.6 && t.y1 <= b.y1 + 0.6;
                if (!inside && verticallyInside && (t.x1 > b.x1 + 0.3 || t.x0 < b.x0 - 0.3) && (t.x0 < b.x1 - 0.5 && t.x1 > b.x0 + 0.5)) issues.push({ page, type: 'texto sai da caixa', a: t.text, at: [t.x0, t.y0, t.x1, t.y1], s: [b.x0, b.y0, b.x1, b.y1] });
            }
            for (const l of lines) {
                const horizontal = (l.y1 - l.y0) < 0.5;
                if (horizontal && l.y0 + 0.1 > midTop && l.y0 + 0.1 < midBottom && Math.min(t.x1, l.x1) - Math.max(t.x0, l.x0) > 1) issues.push({ page, type: 'linha corta texto', a: t.text, at: [t.x0, t.y0], s: [l.x0, l.y0, l.x1, l.y1] });
                const vertical = (l.x1 - l.x0) < 0.5;
                if (vertical && l.x0 > t.x0 + 0.5 && l.x0 < t.x1 - 0.5 && Math.min(t.y1, l.y1) - Math.max(t.y0, l.y0) > 0.8) issues.push({ page, type: 'linha corta texto', a: t.text, at: [t.x0, t.y0], s: [l.x0, l.y0, l.x1, l.y1] });
            }
        }
        for (let i = 0; i < texts.length; i++) {
            const a = texts[i];
            if (a.x0 < 2 || a.x1 > W - 2 || a.y1 > H - 0.5 || a.y0 < 0.5) issues.push({ page, type: 'fora da página', a: a.text, at: [a.x0, a.y0, a.x1, a.y1] });
            for (let j = i + 1; j < texts.length; j++) {
                const b = texts[j];
                if (a.text === b.text && Math.abs(a.x0 - b.x0) < 0.05 && Math.abs(a.y0 - b.y0) < 0.05) continue;
                const o = inter(a, b);
                if (o.w > 0.4 && o.h > 0.3 * Math.min(a.y1 - a.y0, b.y1 - b.y0)) issues.push({ page, type: 'texto sobre texto', a: a.text, b: b.text, at: [a.x0, a.y0] });
            }
            for (const s of solids) {
                if (a.brand && s.isBrand) continue;
                const o = inter(a, s);
                if (o.w > 0.3 && o.h > 0.3) issues.push({ page, type: s.kind === 'image' ? 'texto sobre imagem' : `texto sobre moldura (${s.shape})`, a: a.text, at: [a.x0, a.y0], s: [s.x0, s.y0, s.x1, s.y1] });
            }
        }
    }
    return issues;
}

// Marca os elementos desenhados por applyBranding: corremos applyBranding num documento em branco igual
// e guardamos as caixas; no documento real, item igual = marca.
const brandCache = new Map();
function brandSignature(landscape, full) {
    const key = `${landscape}|${full}`;
    if (!brandCache.has(key)) {
        const d = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });
        docs.pop();
        M.pdf.applyBranding(d, M.pdf.getCompanySettings(settings), USER, !full);
        brandCache.set(key, d.__items.map(i => `${i.kind}|${i.shape || ''}|${i.text || ''}|${i.x0.toFixed(2)}|${i.y0.toFixed(2)}`));
    }
    return brandCache.get(key);
}
function markBrand(doc) {
    const landscape = doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight();
    const sigs = new Set([...brandSignature(landscape, true), ...brandSignature(landscape, false)]);
    for (const item of doc.__items) {
        const sig = `${item.kind}|${item.shape || ''}|${item.text || ''}|${item.x0.toFixed(2)}|${item.y0.toFixed(2)}`;
        if (sigs.has(sig)) { item.brand = true; if (item.kind === 'shape') item.isBrand = true; }
    }
    // Só as formas da marca contam como "moldura"; as formas do conteúdo (fundos de tabelas, caixas) não.
    for (const item of doc.__items) if (item.kind === 'shape' && !item.brand) item.isBrand = false;
    // Imagens da marca (logótipo) também contam: o texto do conteúdo não pode ficar por cima.
}

// ── Dados de exemplo ─────────────────────────────────────────────────────────────────
const d = (s) => new Date(s);
const client = {
    id: 'c1', name: 'Maria da Conceição Fernandes dos Santos Pereira', nif: '004567890LA041', phone: '+244 923 456 789', email: 'maria.fernandes.santos@exemplo.co.ao',
    address: 'Bairro Maianga, Rua Rainha Ginga n.º 123, Casa 45, Município de Luanda', creditLimit: 5_000_000, usedCredit: 1_500_000, availableCredit: 3_500_000,
    monthlyIncome: 450_000, defaultInterestRate: 10, lateInterestRate: 1, toleranceDays: 3, status: 'active', riskLevel: 'medium', documents: [],
    bankCoordinates: [{ id: 'b1', bankName: 'Banco Angolano de Investimentos (BAI)', iban: 'AO06 0040 0000 1234 5678 9012 3', holder: 'Maria Fernandes' }],
    receiveMethod: 'transfer', birthDate: '1985-04-12', age: 41, issueDate: '2020-01-10', expiryDate: '2030-01-10', gender: 'Feminino', maritalStatus: 'Casada',
    clientType: 'PARTICULAR', fatherName: 'José Fernandes dos Santos', motherName: 'Ana Maria Pereira', createdAt: d('2025-01-10'), creditScore: 720,
    blockReason: 'Atraso superior a 90 dias no crédito anterior e falta de contacto', blockedAt: '2026-05-01', blockedBy: 'Administrador do Sistema',
};
const credits = Array.from({ length: 14 }, (_, i) => ({
    id: `CR-${(10_000_000 + i * 7919).toString(16)}-4f2a-9c1e-${i}abcde12345`, clientId: 'c1', clientName: i % 2 ? client.name : 'João Manuel António da Silva Kiala', principalAmount: 250_000 * (i + 1),
    currentBalance: 120_000 * (i + 1), interestRate: 10 + i, lateInterestRate: 1, installments: 12, paidInstallments: i % 12, startDate: d(`2026-0${(i % 9) + 1}-05`),
    dueDate: d(`2027-0${(i % 9) + 1}-05`), nextDueDate: d('2026-11-05'), status: ['active', 'overdue', 'paid', 'pending_approval', 'defaulted', 'renegotiated'][i % 6], daysOverdue: i * 3,
    accruedInterest: 25_000 * (i + 1), lateInterest: 1_500 * i, totalDue: 140_000 * (i + 1), amortizationMethod: 'FLAT', creditNumber: i + 1, createdAt: d('2026-01-05'),
    requestedBy: 'Operador de Crédito Exemplo', approvedBy: 'Administrador', supplierId: i % 3 ? undefined : 's1', supplierProfitRate: 5,
}));
const payments = Array.from({ length: 30 }, (_, i) => ({
    id: `PG-${i}-a1b2c3d4e5f6`, creditId: credits[i % credits.length].id, clientName: credits[i % credits.length].clientName, amount: 31_250 + i * 1000,
    allocatedToLateInterest: 0, allocatedToInterest: 5_000, allocatedToPrincipal: 26_250 + i * 1000, method: ['cash', 'transfer', 'reference'][i % 3], reference: `REF-2026-${1000 + i}`,
    paymentDate: d(`2026-${String((i % 9) + 1).padStart(2, '0')}-1${i % 9}`), dueDate: d(`2026-${String((i % 9) + 1).padStart(2, '0')}-05`), processedBy: 'Operador de Crédito Exemplo',
    status: i % 7 ? 'confirmed' : 'pending', installmentNumber: (i % 12) + 1,
}));
const credit = { ...credits[0], status: 'active' };
const logs = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, action: ['create', 'update', 'delete', 'login'][i % 4], entity: ['client', 'credit', 'payment', 'user'][i % 4],
    details: `Operação de auditoria n.º ${i} com descrição longa para testar a quebra de linha dentro da célula da tabela do relatório de auditoria do sistema`,
    userId: 'u1', userName: 'Administrador do Sistema Tango', timestamp: d('2026-10-05T10:00:00'), metadata: JSON.stringify({ ip: '192.168.1.10' }) }));
const notifications = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, title: `Prestação vencida do cliente ${client.name}`, message: 'O cliente tem uma prestação vencida há mais de 15 dias. Contacte-o com urgência para regularizar a situação e evitar juros de mora.', type: ['warning', 'info', 'error', 'success'][i % 4], timestamp: d('2026-10-01'), read: i % 2 === 0 }));
const config = M.normalizeSimulatorConfig({});
const legal = M.termos.legalContextFrom(settings, config);
const sim = M.simulateCredit({ principal: 1_500_000, months: 24, annualRate: 24, system: 'price', startDate: '2026-10-05T12:00:00', dueDay: 10, graceMonths: 2, graceType: 'capital', openingFee: { mode: 'percent', value: 2 }, processingFee: 500, insuranceRate: 0.05 });
const planInstallments = Array.from({ length: 24 }, (_, i) => ({ number: i + 1, dueDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-10`, principalMinor: 6_250_000, interestMinor: 1_200_000, totalMinor: 7_450_000, balanceAfterMinor: 150_000_000 - 6_250_000 * (i + 1), paidMinor: i < 5 ? 7_450_000 : 0, status: i < 5 ? 'paid' : i < 7 ? 'overdue' : 'pending', paidAt: i < 5 ? '2026-05-10' : null }));

const contract = { id: credit.id, clientName: client.name, clientNif: client.nif, clientPhone: client.phone, clientAddress: client.address, defaultInterestRate: 10, interestRate: 10, principalAmount: 1_500_000, value: 1_500_000, receiveMethod: 'transfer', installments: 12, startDate: d('2026-10-05'), endDate: d('2027-10-05'), dueDate: d('2027-10-05'), clientId: 'c1' };

const jobs = {
    recibo: () => M.pdf.generatePaymentReceipt(payments[0], credit, settings, USER),
    avisoCobranca: () => M.pdf.generateDebtCollectionNoticePDF(client, credits.slice(0, 6), settings, USER),
    contrato: () => M.pdf.generateContractPDF(contract, settings, payments.slice(0, 3), 'save', USER),
    // Contrato curto (caso real): cada via com a assinatura na mesma página.
    contratoCurto: () => M.pdf.generateContractPDF({ id: 'CR-bc61b816-4aa6-4eb7-936a-1cd129f4e588', clientName: 'Pedro de Morais Tango', clientNif: '000000000LA000', principalAmount: 100_000, value: 100_000, installments: 1, receiveMethod: 'transfer', startDate: d('2026-10-01'), endDate: d('2026-11-01') }, { ...settings, bankingInfo: '[]' }, [], 'save', USER),
    promessa: () => M.pdf.generatePromessaContractPDF(contract, settings, USER, { fatherName: client.fatherName, motherName: client.motherName, birthPlace: 'Luanda', province: 'Luanda', municipality: 'Maianga', street: 'Rua Rainha Ginga', biIssueDate: '2020-01-10', documentType: 'BI', documentNumber: client.nif }),
    auditoria: () => M.pdf.generateAuditLogPDF(logs, settings, { name: USER, role: 'Administrador' }),
    perfilCliente: () => M.pdf.generateClientProfilePDF(client, credits, payments, settings, USER),
    auditoriaFinanceira: () => M.pdf.generateFinancialAuditPDF(Array.from({ length: 10 }, (_, i) => ({ type: 'divergencia', severity: ['high', 'medium', 'low'][i % 3], title: `Divergência ${i} no saldo do crédito`, description: 'O saldo registado no razão difere do saldo calculado pelas prestações em 1 234,56 Kz.', creditId: credits[i].id, clientName: client.name, amount: 1234.56 })), { totalCredits: 14, totalPayments: 30, totalIssues: 10, score: 87, totalPrincipal: 52_500_000, totalReceived: 12_000_000 }, settings, USER, { start: '2026-01-01', end: '2026-10-05' }),
    analitico: () => M.pdf.generateAnalyticalReportPDF({ summary: [{ label: 'Capital aplicado', value: '52 500 000,00 Kz' }, { label: 'Juros previstos', value: '5 250 000,00 Kz' }, { label: 'Taxa de recuperação', value: '87,50%' }, { label: 'Créditos em atraso', value: '4' }], credits, title: 'Relatório Analítico da Carteira de Crédito — Outubro de 2026' }, settings, USER),
    generico: () => M.pdf.generateGenericReportPDF('Relatório Genérico de Operações do Mês', Array.from({ length: 60 }, (_, i) => `Linha ${i}: descrição detalhada da operação com texto suficientemente longo para testar a quebra automática de linha no relatório genérico.`), settings, USER),
    notificacao: () => M.pdf.generateNotificationPDF(notifications[0], settings, USER),
    historicoCredito: () => M.pdf.generateCreditPaymentHistoryPDF(credit, payments, settings, USER),
    historicoCliente: () => M.pdf.generateClientGeneralPaymentHistoryPDF(client, credits, payments, settings, USER),
    caixaDiario: () => M.pdf.generateDailyCashFlowPDF('2026-10-05', credits.slice(0, 8).map(c => ({ clientName: c.clientName, creditId: c.id, amount: c.principalAmount, method: 'transfer', time: '10:30' })), payments.slice(0, 12).map(p => ({ clientName: p.clientName, receiptId: p.id, amount: p.amount, method: p.method, time: '11:45' })), { totalOut: 9_000_000, totalIn: 600_000, net: -8_400_000 }, settings, USER),
    actividadeUtilizador: () => M.pdf.generateUserActivityPDF('u1', 'Administrador do Sistema Tango', logs, settings, USER),
    perfilUtilizador: () => M.pdf.generateUserProfilePDF({ name: 'Administrador do Sistema Tango Gestão', email: 'administrador.sistema@microcreditoexemplo.co.ao', role: 'super_admin', status: 'active', createdAt: d('2025-01-01'), lastLogin: d('2026-10-05'), ip: '192.168.1.10', permissions: ['manage_clients', 'view_credits', 'manage_payments', 'approve_loans', 'view_reports', 'manage_settings', 'manage_users', 'view_audit_logs'] }, settings, USER),
    notificacoes: () => M.pdf.generateNotificationsReportPDF(notifications, settings, USER, 'Relatório de Notificações do Sistema'),
    listaClientes: () => M.pdf.generateClientListReport(Array.from({ length: 25 }, (_, i) => ({ client: { ...client, id: `c${i}`, name: i % 2 ? client.name : 'Empresa de Comércio Geral e Prestação de Serviços Kwanza Sul, Lda' }, scoreData: { score: 700 - i * 10, rating: ['Excelente', 'Bom', 'Risco'][i % 3], metrics: { totalContracts: 9, paymentsOnTime: 40, totalCredits: 12, paidCredits: 8, latePayments: 3, onTimeRate: 87.5, totalBorrowed: 12_345_678.9, activeCredits: 2 } } })), settings, USER),
    clientesActivos: () => M.pdf.generateActiveClientsReport(Array.from({ length: 20 }, (_, i) => ({ client: { ...client, id: `c${i}` }, activeCredits: credits.slice(0, 2), totalDue: 1_234_567.89, nextDueDate: d('2026-11-05'), oldestCreditDate: d('2026-01-05'), hasOverdue: i % 2 === 0 })), settings, USER),
    clientesBloqueados: () => M.pdf.generateBlockedClientsReport(Array.from({ length: 15 }, (_, i) => ({ ...client, id: `c${i}`, status: 'blocked' })), settings, USER),
    fichaCliente: () => M.pdf.generateClientInfoSheetPDF(client, settings, USER),
    consolidacaoMensal: () => M.pdf.generateMonthlyConsolidationReport({ id: '2026-09', month: 9, year: 2026, capitalApplied: 52_500_000, projectedProfit: 5_250_000, realizedProfit: 3_100_000, overdueAmount: 1_250_000, liquidationRate: 87.5, closedAt: '2026-10-01', closedBy: 'Administrador do Sistema Tango' }, credits, settings, USER),
    anual: () => M.pdf.generateAnnualReportPDF(2026, Array.from({ length: 12 }, (_, i) => ({ month: i + 1, monthName: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][i], capitalApplied: 12_345_678.9, projectedProfit: 1_234_567.89, realizedProfit: 987_654.32, overdueAmount: 123_456.78, liquidationRate: 85.5, credits: 12, totalCredits: 12 })), credits, settings, USER),
    periodo: () => M.pdf.generatePeriodReportPDF('1 de Janeiro de 2026 a 30 de Setembro de 2026', credits, payments, settings, USER),
    fornecedor: () => M.pdf.generateSupplierReportPDF({ id: 's1', name: 'Fornecedor de Capital Investimentos e Participações Angola, S.A.', nif: '5417000000', phone: '+244 922 000 000', email: 'contabilidade@fornecedorcapital.co.ao' }, credits, payments, 'Setembro de 2026', settings, USER),
    cartaBanco: () => M.pdf.generatePermanentTransferLetterPDF({ clientName: client.name, clientNif: client.nif, clientIban: 'AO06 0040 0000 1234 5678 9012 3', bankDestinationName: 'Banco Angolano de Investimentos (BAI)', destinationBranch: 'Agência Maianga — Luanda', companyBank: 'Banco de Fomento Angola (BFA)', companyIban: 'AO06 0006 0000 1234 5678 9012 3', companyAccountName: settings.name, creditReference: credit.id, dayOfMonth: 25, installmentAmount: 131_250, subject: 'Pedido de transferência bancária permanente para liquidação de prestações de crédito' }, settings, USER, 'blob'),
    credenciais: () => M.pdf.exportCompanyCredentialsPDF({ name: settings.name, nif: settings.nif, accessCode: 'ABCD-EFGH-IJKL-MNOP', expiresAt: '2027-10-05', webUrl: 'https://tango-gestao-creditos.vercel.app' }),
    planoPagamento: () => M.pdf.generatePaymentPlanPDF({ clientName: client.name, clientNif: client.nif, creditReference: credit.id, plan: { principalMinor: 150_000_000, ratePercent: 24, months: 24, interestMinor: 28_800_000, totalMinor: 178_800_000, installmentMinor: 7_450_000, firstDueDate: '2026-11-10', lastDueDate: '2028-10-10', installments: planInstallments }, progress: { paidCount: 5, overdueCount: 2, paidMinor: 37_250_000, remainingMinor: 141_550_000, percent: 20.8, nextDue: { number: 6, dueDate: '2027-06-10' } } }, settings, USER),
    licenca: () => M.pdf.generateLicenseCertificatePDF({ clientName: settings.name, clientNif: settings.nif, clientPhone: settings.phone, clientEmail: settings.email, machineId: 'MID-9F8E7D6C5B4A3928-ABCDEF0123456789', planLabel: 'Anual Profissional', tierLabel: 'Empresa (até 10 dispositivos)', devices: 10, issuedAt: '2026-10-05', expiresAt: '2027-10-05', key: 'TANGO-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z0123-45678', verificationCode: 'VER-1234-5678', companyNif: settings.nif }, { name: 'DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA', logo: png, phone: '+244 941 537 486', email: 'pedro@exemplo.ao', address: 'Cuanza Norte, N´dalatando', signerName: 'Director Geral' }),
    aprovacoes: () => M.pdf.generateApprovalsReportPDF(Array.from({ length: 20 }, (_, i) => ({ clientName: client.name, creditId: credits[i % 14].id, amount: 1_500_000 + i, rate: 24, installments: 12, status: ['pending', 'approved', 'rejected'][i % 3], requestedBy: 'Operador de Crédito Exemplo', requestedAt: d('2026-10-01'), decidedBy: i % 3 ? 'Administrador do Sistema' : null, decidedAt: i % 3 ? d('2026-10-02') : null, reason: i % 3 === 2 ? 'Taxa de esforço acima do limite e histórico de atrasos superiores a 30 dias' : null })), { periodLabel: 'Outubro de 2026', filterLabel: 'Todos os estados' }, settings, USER),
    economico: () => M.economic.generateEconomicReport({ clients: [client], credits, payments, logs, companySettings: settings, userName: USER }),
    factura: () => M.fiscal.generateInvoicePDF({ invoiceNo: 'FT 2026/000123', credit, client, companySettings: settings, userName: USER }),
    saft: () => M.fiscal.generateSaftReportPDF(settings, { fiscalYear: 2026, startDate: '2026-01-01', endDate: '2026-09-30' }, { clients: 125, invoices: 1234, payments: 5678 }),
    lixeira: () => M.lixeira.generateLixeiraReport({ deletedClients: [{ ...client, deletedAt: d('2026-09-01'), deletedBy: 'u1' }], deletedCredits: credits.slice(0, 5).map(c => ({ ...c, deletedAt: d('2026-09-02'), deletedBy: 'u1' })), deletedPayments: payments.slice(0, 5).map(p => ({ ...p, deletedAt: d('2026-09-03'), deletedBy: 'u1' })), deletedLegalCases: [], deletedWarranties: [], users: [{ id: 'u1', name: 'Administrador do Sistema Tango' }], companySettings: settings, userName: USER }),
    tabelaContabil: () => M.exportar.exportTablePdf({ title: 'Diário geral de lançamentos contabilísticos', subtitle: 'Outubro de 2026 · Todas as contas', fileName: 'diario', numericColumns: [4, 5], head: ['Data', 'Lançamento', 'Conta', 'Descrição', 'Débito', 'Crédito'], body: Array.from({ length: 60 }, (_, i) => ['05/10/2026', `LC-${i}`, '45.1 Caixa', 'Recebimento de prestação do crédito com descrição longa para testar a quebra de linha na célula', '1 234 567,89', '0,00']), footer: [['', '', '', 'Totais', '74 074 073,40', '0,00']] }, settings, USER),
    fichaSimulacao: () => M.ficha.generateSimulationSheetPdf({ number: 'SIM-2026-7KQ2M9', verificationCode: '4F7K-QM2X', issuedAt: d('2026-10-05T10:00:00'), expiresAt: d('2026-10-20T10:00:00'), client: { name: client.name, nif: client.nif, phone: client.phone, email: client.email, registered: true, income: 450_000, otherDebts: 25_000 }, productName: 'Crédito Pessoal', params: { principal: 1_500_000, months: 24, system: 'price', startDate: '2026-10-05', dueDay: 10, graceMonths: 2, graceType: 'capital', rateType: 'variable', indexName: 'LUIBOR a 3 meses', indexValue: 17, spread: 7, baseRate: 24, riskAdjustment: 0, annualRate: 24, feePayment: 'deducted', openingFee: { mode: 'percent', value: 2 }, processingFee: 500, insuranceRate: 0.05 }, result: sim, effortRate: 24.7, effortLimit: 33, risk: { level: 'medium', overridden: true, justification: 'Cliente com garantia hipotecária ainda não registada no sistema, conforme documentação entregue.' }, lateSurcharge: 2, validityDays: 15 }, settings, USER, legal, 'bytes'),
    termos: () => M.ficha.generateTermsPdf(legal, M.termos.buildTermsArticles(legal), settings, USER),
};

// Pagamentos: recibos (A4, anulado, 2.ª via e talão de 80 mm) e os oito relatórios da página.
const paymentRows = M.anPag.buildPaymentRows({
    payments: payments.map((p, i) => ({ ...p, receiptYear: 2026, receiptSeq: i + 1, registeredAt: p.paymentDate, balanceAfterMinor: 98_765_432 - i * 100_000,
        allocationDetail: JSON.stringify([{ n: (i % 12) + 1, principalMinor: Math.round(p.allocatedToPrincipal * 100), interestMinor: 500_000, lateMinor: 0, settled: true }, { n: (i % 12) + 2, principalMinor: 0, interestMinor: 0, lateMinor: 0, settled: false }]),
        status: i % 7 === 3 ? 'cancelled' : p.status, cancelledAt: '2026-10-05T10:00:00Z', cancelledBy: 'Director Financeiro do Grupo', cancelReason: 'Valor registado em duplicado no mesmo dia pelo operador de caixa', cancelApprovedBy: 'Administrador do Sistema Tango' })),
    credits, clients: [client], users: [{ id: 'u1', name: 'Gestor de Conta Sénior' }],
});
const paymentSchedule = credits.flatMap((c, ci) => Array.from({ length: 3 }, (_, n) => ({ creditId: c.id, clientId: 'c1', clientName: c.clientName, number: n + 1, dueDate: `2026-0${(n % 9) + 7}-1${ci % 9}T11:00:00Z`, principalMinor: 2_500_000, interestMinor: 500_000, lateInterestMinor: n * 10_000, paidPrincipalMinor: n ? 0 : 2_500_000, paidInterestMinor: n ? 0 : 500_000, paidLateInterestMinor: 0 })));
const reportInput = { rows: paymentRows, schedule: paymentSchedule, range: { start: '2026-01-01', end: '2026-10-31' }, previousRange: { start: '2025-03-04', end: '2025-12-31' }, lastYearRange: { start: '2025-01-01', end: '2025-10-31' },
    periodLabel: '1 de Janeiro de 2026 a 31 de Outubro de 2026', filters: ['Método: Transferência bancária', 'Gestor: Gestor de Conta Sénior', 'Produto: Crédito pessoal'], today: '2026-10-06',
    numbers: M.anPag.contractNumbers(credits), phones: new Map([['c1', client.phone]]), managers: new Map([['c1', 'Gestor de Conta Sénior']]), statement: { clientId: 'c1', label: `Cliente ${client.name}` } };
const receiptClient = { name: client.name, nif: client.nif, phone: client.phone, address: client.address };
jobs.reciboPagamentoA4 = () => M.reciboPag.generateReceiptA4(paymentRows[0], receiptClient, settings, USER, 'save');
jobs.reciboPagamentoAnulado = () => M.reciboPag.generateReceiptA4(paymentRows[3], receiptClient, settings, USER, 'save');
jobs.reciboPagamento2Via = () => M.reciboPag.generateReceiptA4(paymentRows[1], receiptClient, settings, USER, 'save', true);
jobs.reciboTalao80mm = () => M.reciboPag.generateReceiptThermal(paymentRows[3], receiptClient, settings, USER, 'save');
for (const report of M.relPag.REPORTS) jobs[`relatorioPagamentos_${report.key}`] = () => M.relPag.renderReportPdf(M.relPag.buildReport(report.key, reportInput), settings, USER, 'none');

// Controlo de acessos: matriz de utilizadores e permissões e relatórios da auditoria.
const sampleUsers = ['super_admin', 'credit_director', 'manager', 'cashier', 'accountant', 'internal_auditor'].map((role, i) => ({
    id: `u${i}`, name: ['Pedro de Morais Tango Administrador Geral', 'Director de Crédito Exemplo', 'Gestora de Crédito Sénior da Agência Maianga', 'Operador de Caixa', 'Contabilista Certificada', 'Auditor Interno'][i],
    email: `utilizador.numero${i}.com.email.longo@microcreditoexemplo.co.ao`, role, status: i === 3 ? 'blocked' : 'active', twoFactorEnabled: i % 2 === 0,
    approvalLimits: { aprovacaoCreditoKz: 500_000 * i }, dataScope: i === 2 ? 'carteira_propria' : 'todos', lastLogin: '2026-10-06T08:15:00Z',
    permissionExceptions: i === 2 ? [{ id: 'e1', permissionId: 'creditos.aprovar', tipo: 'conceder', motivo: 'Substituição temporária', atribuidoPor: 'Pedro', atribuidoEm: '2026-10-01' }] : [],
}));
jobs.matrizPermissoes = () => M.matriz.generateUsersPermissionsMatrixPDF(sampleUsers, user => { const base = (M.PERFIS_PREDEFINIDOS.find(p => p.id === user.role) || M.PERFIS_PREDEFINIDOS[0]).permissoesBase; const extra = (user.permissionExceptions || []).map(e => e.permissionId); return { permissoes: [...new Set([...base, ...extra])], origemPorPermissao: Object.fromEntries(extra.map(id => [id, { origem: 'excecao_concedida' }])) }; }, settings, USER, 'save');
const auditRows = Array.from({ length: 60 }, (_, i) => ({
    id: `a${i}`, seq: i + 1, timestamp: new Date(Date.UTC(2026, 9, 1 + (i % 6), (i * 5) % 24, i % 60, 7)).toISOString(), userId: `u${i % 6}`, userName: sampleUsers[i % 6].name,
    action: ['login', 'login_failure', 'update', 'create', 'delete', 'security_alert'][i % 6], entity: ['user', 'user', 'system', 'payment', 'payment', 'system'][i % 6],
    details: [`Login efetuado com sucesso para utilizador: ${sampleUsers[i % 6].name}`, 'Tentativa de login falhada (2/3) para utilizador com nome muito longo para testar a quebra de linha', 'Atualizou definições: Taxa de juro por omissão do simulador', `Pagamento registado no crédito cr-${i} (RC 2026/0000${10 + i})`, `Anulação e estorno do pagamento RC 2026/0000${10 + i}`, 'Acesso negado ao módulo de Contabilidade por falta de permissão'][i % 6],
    previousState: i % 6 === 2 ? JSON.stringify({ defaultSimulationInterestRate: 3.5, days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ allowed: d > 0 && d < 6, start: '07:00', end: '19:00' })) }) : null,
    newState: i % 6 === 2 ? JSON.stringify({ defaultSimulationInterestRate: 2, days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ allowed: d > 0 && d < 6, start: '06:00', end: '22:00' })) }) : null,
    metadata: JSON.stringify({ ip: `192.168.1.${i % 9}`, paymentId: i % 6 >= 3 ? `p${i}` : undefined, justification: i % 6 === 4 ? 'Pagamento lançado no contrato errado pelo operador' : undefined }), integrityHash: 'f'.repeat(64),
}));
const auditEvents = M.anAud.assignSessions(auditRows.map(row => M.anAud.toAuditEvent(row)));
for (const report of M.relAud.AUDIT_REPORTS) jobs[`auditoria_${report.key}`] = () => M.relPag.renderReportPdf(M.relAud.buildAuditReport(report.key, {
    events: auditEvents, periodLabel: 'Últimos 30 dias', filters: ['Módulo: Pagamentos', 'Gravidade: Alta'],
    alerts: [{ title: 'Logins falhados seguidos', severity: 'high', status: 'Aberto', occurredAt: '2026-10-05T10:00:00Z', originUserName: 'Operador de Caixa', description: '5 logins falhados seguidos de Operador de Caixa a partir de 192.168.1.4.' }],
    integrity: { ok: true, checked: 60, message: 'Íntegra', verifiedAt: '2026-10-06T10:00:00Z', hmac: { detail: '60 registo(s) selados (chave a1b2c3d4e5f6)' } },
}), settings, USER, 'none');

// Alçadas: utilização de limites, operações escaladas, exceções temporárias e histórico de versões.
const limitsPolicy = M.alc.defaultPolicy();
const limitsUsers = sampleUsers.map((user, i) => ({ id: user.id, name: user.name, role: ['super_admin', 'credit_director', 'manager', 'cashier', 'accountant', 'admin'][i], branchId: i % 2 ? 'ag-maianga' : 'ag-talatona', branchName: i % 2 ? 'Agência Maianga (Luanda)' : 'Agência Talatona Business Center' }));
const limitsLedger = Array.from({ length: 80 }, (_, i) => ({ id: `l${i}`, operationType: ['credit_approval', 'disbursement', 'cash_receipt', 'payment_reversal', 'client_export'][i % 5], userId: limitsUsers[i % 6].id, userName: limitsUsers[i % 6].name,
    profileId: limitsUsers[i % 6].role, branchId: limitsUsers[i % 6].branchId, amountMinor: (i % 5 === 4 ? 0 : 25_000_000 + i * 1_250_000), count: 1, dayKey: `2026-10-${String(1 + (i % 6)).padStart(2, '0')}`, monthKey: '2026-10', createdAt: '2026-10-03T10:00:00Z' }));
const limitsEscalations = Array.from({ length: 14 }, (_, i) => ({ id: `e${i}`, operationType: 'credit_approval', entityId: `CR-${i}`, amountMinor: 80_000_000 + i * 75_000_000, requestedByName: limitsUsers[2].name,
    reason: `Acima da alçada de ${limitsUsers[2].name} (Gestor) — requer ${i % 3 === 2 ? 'Dupla aprovação (Diretor)' : 'Administrador'}`, requiredLevelName: i % 3 === 2 ? 'Dupla aprovação (Diretor)' : 'Administrador', dual: i % 3 === 2,
    status: ['approved', 'rejected', 'pending'][i % 3], createdAt: `2026-10-0${1 + (i % 6)}T08:${String(10 + i).padStart(2, '0')}:00Z`, decidedAt: i % 3 === 2 ? null : `2026-10-0${1 + (i % 6)}T1${i % 10}:05:00Z`, decidedByName: i % 3 === 2 ? null : limitsUsers[5].name, escalationCount: i % 4 === 0 ? 1 : 0 }));
const limitsApprovals = limitsEscalations.filter(item => item.status !== 'pending').map(item => ({ escalationId: item.id, approverName: limitsUsers[5].name, decision: item.status === 'approved' ? 'approved' : 'rejected', decidedAt: item.decidedAt }));
const limitsExceptions = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, userId: limitsUsers[2].id, userName: limitsUsers[2].name, operationType: 'credit_approval', perOperationMinor: 90_000_000, dailyMinor: i % 2 ? 300_000_000 : null, monthlyMinor: null, dailyCount: null,
    startsAt: '2026-10-01T08:00:00Z', endsAt: `2026-10-${String(5 + i * 5).padStart(2, '0')}T17:00:00Z`, reason: 'Substituição da gestora titular da carteira de empresas durante as férias anuais', status: ['approved', 'pending', 'rejected', 'revoked', 'approved', 'approved'][i],
    requestedBy: limitsUsers[5].id, requestedByName: limitsUsers[5].name, requestedAt: '2026-10-01T07:30:00Z', decidedByName: i % 2 ? null : limitsUsers[0].name, decidedAt: '2026-10-01T07:45:00Z' }));
const limitsVersions = Array.from({ length: 5 }, (_, i) => ({ version: i + 1, status: ['approved', 'approved', 'rejected', 'approved', 'pending'][i], effectiveFrom: `2026-10-0${1 + i}T08:00:00Z`, createdByName: limitsUsers[5].name, createdAt: `2026-10-0${1 + i}T07:00:00Z`,
    decidedByName: i % 2 ? limitsUsers[0].name : null, decidedAt: i % 2 ? `2026-10-0${1 + i}T07:30:00Z` : null, reason: 'Revisão mensal das alçadas aprovada pela comissão executiva de crédito e risco',
    summary: Array.from({ length: 4 + i * 4 }, (_, j) => `Gestor de Crédito — Aprovação de crédito, por operação: ${500 + j * 10} 000,00 Kz → ${750 + j * 10} 000,00 Kz`), requiresSecondApproval: i % 2 === 1, restoredFrom: i === 3 ? 'v1' : null }));
for (const report of M.relAlc.LIMITS_REPORTS) jobs[`limites_${report.key}`] = () => M.relPag.renderReportPdf(M.relAlc.buildLimitsReport(report.key, {
    periodLabel: 'Mês atual (01/10/2026 a 31/10/2026)', fromKey: '2026-10-01', toKey: '2026-10-31', policy: limitsPolicy, users: limitsUsers, ledger: limitsLedger,
    escalations: limitsEscalations, approvals: limitsApprovals, exceptions: limitsExceptions, versions: limitsVersions, profileName: id => ({ manager: 'Gestor de Crédito', admin: 'Administrador', credit_director: 'Diretor de Crédito', super_admin: 'Super Administrador', cashier: 'Operador de Caixa', accountant: 'Contabilista' }[id] || id),
}), settings, USER, 'none');

const results = [];
jobs.marcaRetrato = () => { const x = new jsPDF(); M.pdf.applyBranding(x, M.pdf.getCompanySettings(settings), USER, false); x.__skipBrand = true; };
jobs.marcaPaisagem = () => { const x = new jsPDF({ orientation: 'landscape' }); M.pdf.applyBranding(x, M.pdf.getCompanySettings(settings), USER, false); x.__skipBrand = true; };
// PDF_OUT=<pasta> grava os PDFs gerados, para inspecção visual.
const shotsDir = process.env.PDF_OUT ? path.resolve(process.env.PDF_OUT) : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
for (const [name, job] of Object.entries(jobs)) {
    if (only && !only.split(',').includes(name)) continue;
    const before = docs.length;
    try { await job(); } catch (error) { results.push({ name, error: String(error?.stack || error).split('\n').slice(0, 3).join(' | ') }); continue; }
    const made = docs.slice(before);
    if (!made.length) { results.push({ name, error: 'nenhum documento criado' }); continue; }
    for (const doc of made) {
        if (!doc.__skipBrand) markBrand(doc); else for (const it of doc.__items) if (it.kind === 'shape') it.isBrand = true;
        const issues = analyse(doc);
        results.push({ name, pages: doc.getNumberOfPages(), issues });
        if (shotsDir) writeFileSync(path.join(shotsDir, `${name}.pdf`), Buffer.from(doc.output('arraybuffer')));
    }
}
let total = 0;
for (const r of results) {
    if (r.error) { console.log(`✖ ${r.name}: ERRO ${r.error}`); continue; }
    total += r.issues.length;
    console.log(`${r.issues.length ? '⚠' : '✔'} ${r.name} (${r.pages} pág.): ${r.issues.length} problema(s)`);
    const seen = new Set();
    for (const i of r.issues) {
        const key = `${i.type}|${i.a}|${i.b || ''}`;
        if (seen.has(key)) continue; seen.add(key);
        if (seen.size > 12) { console.log('    …'); break; }
        console.log(`    p${i.page} ${i.type}: «${String(i.a).slice(0, 60)}»${i.b ? ` × «${String(i.b).slice(0, 60)}»` : ''} @${i.at.map(v => v.toFixed(1)).join(',')}${i.s ? ` vs [${i.s.map(v => v.toFixed(1)).join(',')}]` : ''}`);
    }
}
const errors = results.filter(r => r.error).length;
console.log(`\nTOTAL: ${total} problema(s) e ${errors} erro(s) em ${results.length} documento(s)`);
process.exitCode = total || errors ? 1 : 0;
