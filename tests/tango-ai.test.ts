import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseTangoAI } from '../src/bibliotecas/tango-ai.ts';

const clients = [{ id: 'isaac', name: 'Isaac Daniel Antonio' }, { id: 'joana', name: 'JOANA SEGUNDA DA COSTA PAULINO' }];
const credit = (id: string, clientId: string, status = 'active') => ({ id, clientId, status, principalAmount: 50_000, currentBalance: 50_000, totalDue: 55_000 });
const installment = (creditId: string, dueDate: string, paid = 0, paidAt: string | null = null) => ({
    creditId, dueDate: `${dueDate}T12:00:00Z`, principalMinor: 25_000_00, interestMinor: 2_500_00, paidPrincipalMinor: paid ? 25_000_00 : 0, paidInterestMinor: paid ? 2_500_00 : 0, status: paid ? 'paid' : 'pending', paidAt,
});
const run = (credits: any[], installments: any[], todayKey = '2026-10-24') => analyseTangoAI({ clients, credits, payments: [], installments, todayKey, canManage: true });

test('créditos acabados de conceder, sem nada vencido: nenhum alerta de cobrança', () => {
    const insights = run([credit('c1', 'isaac'), credit('c2', 'joana')], [installment('c1', '2026-11-20'), installment('c2', '2026-12-21')]);
    assert.ok(!insights.some(item => item.kind === 'cobranca'), 'sem prestações vencidas não há cobrança');
    assert.ok(insights.some(item => item.kind === 'lucro'), 'mostra o lucro previsto por receber');
});

test('prestação vencida e por pagar: alerta de cobrança com o valor e os dias de atraso', () => {
    const insights = run([credit('c1', 'isaac'), credit('c2', 'joana')], [installment('c1', '2026-10-10'), installment('c2', '2026-10-01', 1, '2026-09-30T10:00:00Z'), installment('c2', '2026-11-01')]);
    const cobranca = insights.find(item => item.kind === 'cobranca');
    assert.ok(cobranca);
    assert.match(cobranca!.message, /^1 cliente\(s\)/);
    assert.match(cobranca!.details![0], /Isaac Daniel Antonio · 14 dia\(s\) · 27\.500,00 Kz/);
    assert.ok(!cobranca!.details!.some(line => line.includes('JOANA')), 'quem pagou não aparece');
});

test('o alerta volta a aparecer se a dívida mudar (identificador muda)', () => {
    const a = run([credit('c1', 'isaac')], [installment('c1', '2026-10-10')]).find(item => item.kind === 'cobranca')!;
    const b = run([credit('c1', 'isaac'), credit('c2', 'joana')], [installment('c1', '2026-10-10'), installment('c2', '2026-10-15')]).find(item => item.kind === 'cobranca')!;
    assert.notEqual(a.id, b.id);
});

test('vencimentos dos próximos 7 dias e carteira vazia', () => {
    assert.ok(run([credit('c1', 'isaac')], [installment('c1', '2026-10-28')]).some(item => item.kind === 'vencimentos'));
    const empty = analyseTangoAI({ clients, credits: [], payments: [], installments: [], todayKey: '2026-10-24', canManage: true });
    assert.deepEqual(empty.map(item => item.kind), ['inicio']);
});
