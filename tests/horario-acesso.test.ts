import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_ACCESS_SCHEDULE, describeDenial, evaluateAccess, formatAccessMoment, nextOpening,
    normalizeAccessSchedule, validateAccessSchedule, type AccessSchedule,
} from '../src/bibliotecas/horario-acesso.ts';

// Segunda a sexta das 08:00 às 15:00; sábado e domingo sem acesso.
const schedule: AccessSchedule = { ...DEFAULT_ACCESS_SCHEDULE, enabled: true };
const operador = { id: 'u1', role: 'operator' };
// 2026-10-05 é segunda-feira; 2026-10-10 é sábado.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

test('dentro do horário o acesso é permitido até à hora de fim', () => {
    const decision = evaluateAccess(schedule, operador, at(5, 10));
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.allowed && decision.endsAt, at(5, 15));
});

test('fora do horário diz o motivo e quando pode voltar', () => {
    const early = evaluateAccess(schedule, operador, at(5, 7, 30));
    assert.equal(early.allowed, false);
    assert.deepEqual(!early.allowed && early.nextAccessAt, at(5, 8));

    const late = evaluateAccess(schedule, operador, at(9, 15)); // sexta às 15:00 em ponto
    assert.equal(late.allowed, false);
    assert.deepEqual(!late.allowed && late.nextAccessAt, at(12, 8)); // segunda seguinte

    const saturday = evaluateAccess(schedule, operador, at(10, 11));
    assert.equal(saturday.allowed, false);
    assert.match(!saturday.allowed ? saturday.reason : '', /ao sábado/);
    assert.equal(!saturday.allowed && describeDenial(saturday, at(10, 11)), 'Não há acesso ao sistema ao sábado. Pode voltar a entrar segunda-feira, 12/10 às 08:00.');
});

test('feriados e meses fechados também bloqueiam', () => {
    const holiday = { ...schedule, blockedDates: ['2026-10-05'] };
    const decision = evaluateAccess(holiday, operador, at(5, 10));
    assert.equal(decision.allowed, false);
    assert.deepEqual(!decision.allowed && decision.nextAccessAt, at(6, 8));

    const noOctober = { ...schedule, allowedMonths: schedule.allowedMonths.filter(month => month !== 9) };
    assert.deepEqual(nextOpening(noOctober, at(5, 10)), new Date(2026, 10, 2, 8)); // 2 de novembro, segunda
});

test('super administrador e utilizadores com acesso livre nunca ficam bloqueados; bloqueados nunca entram', () => {
    assert.equal(evaluateAccess(schedule, { id: 'admin', role: 'super_admin' }, at(10, 23)).allowed, true);
    const modes = { ...schedule, userModes: { u1: 'always' as const, u2: 'blocked' as const } };
    assert.equal(evaluateAccess(modes, operador, at(10, 23)).allowed, true);
    const blocked = evaluateAccess(modes, { id: 'u2', role: 'operator' }, at(5, 10));
    assert.equal(blocked.allowed, false);
    assert.equal(!blocked.allowed && blocked.nextAccessAt, null);
    // Regras desligadas: ninguém é afectado.
    assert.equal(evaluateAccess({ ...schedule, enabled: false }, operador, at(10, 23)).allowed, true);
});

test('as regras gravadas são lidas com tolerância e validadas', () => {
    const read = normalizeAccessSchedule(JSON.stringify({ enabled: true, warnMinutes: 999, days: [{ allowed: true, start: '25:00', end: '12:00' }] }));
    assert.equal(read.warnMinutes, 120);
    assert.equal(read.days[0].start, '08:00');
    assert.equal(read.days.length, 7);
    assert.deepEqual(normalizeAccessSchedule('lixo'), DEFAULT_ACCESS_SCHEDULE);
    const invalid = { ...schedule, days: schedule.days.map((day, index) => index === 1 ? { ...day, start: '16:00' } : day) };
    assert.match(validateAccessSchedule(invalid) || '', /Segunda-feira/);
    assert.equal(validateAccessSchedule(schedule), null);
    assert.equal(formatAccessMoment(at(6, 8), at(5, 16)), 'amanhã às 08:00');
});
