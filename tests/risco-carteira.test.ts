import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isDisbursedCredit, isOpenCredit, daysPastDue, agingBucketFor, computePortfolioRisk,
    eligibleCollateralValue, needsInspection, appendTimelineEntry, parseTimeline,
    legalCandidates, legalCaseMetrics, nextLegalStage, upcomingDue, paymentTrend, buildRiskAlerts,
} from '../src/bibliotecas/risco-carteira.ts';

const today = new Date('2026-10-16T10:00:00');
const credit = (over: Record<string, unknown>) => ({ id: 'c1', clientId: 'a', status: 'active', currentBalance: 100_000, totalDue: 110_000, principalAmount: 100_000, daysOverdue: 0, ...over }) as any;

test('pedidos pendentes, rejeitados e apagados não contam como desembolsados', () => {
    assert.equal(isDisbursedCredit(credit({ status: 'pending_approval' })), false);
    assert.equal(isDisbursedCredit(credit({ status: 'rejected' })), false);
    assert.equal(isDisbursedCredit(credit({ deletedAt: '2026-10-01' })), false);
    assert.equal(isDisbursedCredit(credit({ status: 'paid' })), true);
    assert.equal(isOpenCredit(credit({ status: 'paid' })), false);
    assert.equal(isOpenCredit(credit({ currentBalance: 0 })), false);
});

test('atraso usa o maior entre o valor guardado e o próximo vencimento', () => {
    assert.equal(daysPastDue(credit({ daysOverdue: 5 }), today), 5);
    assert.equal(daysPastDue(credit({ daysOverdue: 5, nextDueDate: '2026-09-16T00:00:00' }), today), 30);
    assert.equal(daysPastDue(credit({ status: 'overdue' }), today), 1);
    assert.equal(daysPastDue(credit({ status: 'paid', daysOverdue: 40 }), today), 0);
    assert.equal(agingBucketFor(0).key, 'em_dia');
    assert.equal(agingBucketFor(31).key, '31_60');
    assert.equal(agingBucketFor(400).key, '180_mais');
});

test('PAR, provisões e cobertura por garantias', () => {
    const credits = [
        credit({ id: 'c1', clientId: 'a', currentBalance: 600_000, daysOverdue: 0 }),
        credit({ id: 'c2', clientId: 'b', currentBalance: 300_000, daysOverdue: 45 }),
        credit({ id: 'c3', clientId: 'b', currentBalance: 100_000, daysOverdue: 120 }),
        credit({ id: 'p', clientId: 'c', status: 'pending_approval', currentBalance: 999_999 }),
    ];
    const warranties = [{ id: 'w', clientId: 'b', creditId: 'c3', type: 'Imóvel', marketValue: 100_000, status: 'active', createdAt: '2026-01-01' }] as any;
    const r = computePortfolioRisk({ credits, warranties, clients: [{ id: 'a', name: 'A', creditLimit: 500_000 }, { id: 'b', name: 'B' }] }, today);
    assert.equal(r.totalExposure, 1_000_000);
    assert.equal(r.openCredits, 3);
    assert.equal(r.par30Amount, 400_000);
    assert.ok(Math.abs(r.par30 - 0.4) < 1e-9);
    assert.equal(r.nplAmount, 100_000);
    // c3: 70k elegível (haircut 30%) → 30k descoberto × 50%
    assert.equal(r.perCredit.get('c3')?.collateralEligible, 70_000);
    assert.ok(Math.abs((r.perCredit.get('c3')?.provision ?? 0) - 15_000) < 1e-6);
    assert.ok(Math.abs(r.provisionNet - (6_000 + 30_000 + 15_000)) < 1e-6);
    assert.equal(r.perClient.get('a')?.overLimit, true);
    assert.ok(Math.abs(r.concentration.top1Share - 0.6) < 1e-9);
});

test('garantias: haircut, vistoria e histórico em notas', () => {
    const w = { id: 'w', clientId: 'a', type: 'Veículo', marketValue: 1_000_000, status: 'active', createdAt: '2025-01-01T00:00:00Z' } as any;
    assert.equal(eligibleCollateralValue(w), 600_000);
    assert.equal(eligibleCollateralValue({ ...w, status: 'released' }), 0);
    assert.equal(needsInspection(w, today), true);
    const notes = appendTimelineEntry('Nota antiga', { date: '2026-10-10', kind: 'vistoria', author: 'Ana|X', text: 'Bom estado\nsem danos' });
    const parsed = parseTimeline(notes);
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.entries[0].kind, 'VISTORIA');
    assert.equal(parsed.entries[0].author, 'Ana X');
    assert.equal(parsed.freeText, 'Nota antiga');
    assert.equal(needsInspection({ ...w, notes }, today), false);
});

test('contencioso: candidatos, métricas e fases', () => {
    const credits = [credit({ id: 'x', daysOverdue: 100 }), credit({ id: 'y', daysOverdue: 95 }), credit({ id: 'z', daysOverdue: 10 })];
    const cases = [
        { id: 'L1', clientId: 'a', creditId: 'y', stage: 'court', priority: 'critical', debtAmount: 50_000, createdAt: '2026-08-01', updatedAt: '2026-08-01' },
        { id: 'L2', clientId: 'a', creditId: 'k', stage: 'closed', debtAmount: 20_000, createdAt: '2026-07-01', closedAt: '2026-10-02' },
    ];
    assert.deepEqual(legalCandidates(credits, cases, today).map(r => r.credit.id), ['x']);
    const m = legalCaseMetrics(cases, today);
    assert.equal(m.openCount, 1);
    assert.equal(m.criticalCount, 1);
    assert.equal(m.recoveredThisMonth, 20_000);
    assert.equal(m.staleIds.has('L1'), true);
    assert.equal(nextLegalStage('interpellated'), 'mediation');
    assert.equal(nextLegalStage('closed'), null);
});

test('vencimentos próximos, tendência e alertas', () => {
    const credits = [credit({ id: 'v', nextDueDate: '2026-10-19T00:00:00' }), credit({ id: 'w', nextDueDate: '2026-11-30T00:00:00' })];
    assert.deepEqual(upcomingDue(credits, today, 7).map(r => [r.credit.id, r.inDays]), [['v', 3]]);
    const ids = new Set(['v']);
    const pay = (date: string, due: string) => ({ creditId: 'v', paymentDate: date, dueDate: due, status: 'confirmed' });
    const payments = [pay('2026-09-01', '2026-09-05'), pay('2026-10-01', '2026-10-05'), pay('2026-05-20', '2026-05-05'), pay('2026-06-20', '2026-06-05')];
    assert.equal(paymentTrend(ids, payments, today), 'up');
    assert.equal(paymentTrend(ids, payments.slice(0, 1), today), 'insufficient');
    const input = { credits: [credit({ id: 'n', daysOverdue: 120 }), credit({ id: 'q', status: 'pending_approval' })], payments: [{ creditId: 'n', amount: 5, paymentDate: '2026-10-01', status: 'pending' }] };
    const alerts = buildRiskAlerts(input, computePortfolioRisk(input, today), today);
    assert.equal(alerts[0].id, 'npl-sem-contencioso');
    assert.ok(alerts.some(a => a.id === 'aprovacoes-pendentes'));
    assert.ok(alerts.some(a => a.id === 'pagamentos-por-validar'));
});

test('encerramentos incobráveis não contam como recuperação', async () => {
    const { isLegalCaseRecovered } = await import('../src/bibliotecas/risco-carteira.ts');
    const base = { id: 'L', clientId: 'a', creditId: 'c', stage: 'closed', debtAmount: 10_000, createdAt: '2026-09-01', closedAt: '2026-10-05' };
    const writeOff = { ...base, id: 'W', notes: appendTimelineEntry('', { date: '2026-10-05', kind: 'ENCERRAMENTO', author: 'Ana', text: 'Incobrável (abate) — devedor insolvente' }) };
    const paid = { ...base, id: 'P', notes: appendTimelineEntry('', { date: '2026-10-05', kind: 'ENCERRAMENTO', author: 'Ana', text: 'Recuperado integralmente — recibo RC 2026/1' }) };
    assert.equal(isLegalCaseRecovered(writeOff), false);
    assert.equal(isLegalCaseRecovered(paid), true);
    assert.equal(isLegalCaseRecovered(base), true);
    const m = legalCaseMetrics([writeOff, paid], today);
    assert.equal(m.recoveredThisMonth, 10_000);
    assert.equal(m.recoveryRate, 0.5);
});
