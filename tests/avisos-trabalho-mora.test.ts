// Aviso de backup e de fecho partilhados pela empresa, local de trabalho do cliente e cálculo da mora perdoada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_REMINDER_TITLE, backupDoneToday, backupReminderId, remindersToClear } from '../src/bibliotecas/aviso-backup.ts';
import { monthClosureState } from '../src/bibliotecas/fecho-mes.ts';
import { describeWorkplace, fieldsToClearOnSectorChange, validateWorkplace } from '../src/bibliotecas/local-trabalho.ts';
import { buildMoraPlan, calculateLateInterest } from '../src/bibliotecas/juros-mora.ts';

test('backup feito noutro dispositivo: os lembretes saem, lidos ou não, e os outros avisos ficam', () => {
    const list = [
        { id: 'a', title: BACKUP_REMINDER_TITLE, read: false },
        { id: 'b', title: BACKUP_REMINDER_TITLE, read: true },
        { id: 'c', title: 'Novo Crédito', read: false },
    ];
    assert.deepEqual(remindersToClear(list, '2026-11-08T10:00:00.000Z', false).map(item => item.id), ['a', 'b']);
});

test('sem data de backup ou ainda em atraso, não se apaga nenhum lembrete', () => {
    const list = [{ id: 'a', title: BACKUP_REMINDER_TITLE }];
    assert.deepEqual(remindersToClear(list, '', false), []);
    assert.deepEqual(remindersToClear(list, '2026-10-01T10:00:00.000Z', true), []);
    assert.deepEqual(remindersToClear(null, '2026-11-08T10:00:00.000Z', false), []);
});

test('dois dispositivos atrasados criam o mesmo lembrete', () => {
    assert.equal(backupReminderId('2026-10-01T08:00:00.000Z'), backupReminderId('2026-10-01T18:00:00.000Z'));
    assert.notEqual(backupReminderId('2026-10-01T08:00:00.000Z'), backupReminderId('2026-10-12T08:00:00.000Z'));
});

test('o backup diário não é pedido quando alguém já o fez hoje', () => {
    const now = new Date('2026-11-08T15:00:00.000Z');
    assert.equal(backupDoneToday('2026-11-08T02:00:00.000Z', now), true);
    assert.equal(backupDoneToday('2026-11-07T15:00:00.000Z', now), false);
    assert.equal(backupDoneToday('', now), false);
    assert.equal(backupDoneToday('data inválida', now), false);
});

test('o fecho recebido de outro dispositivo termina o aviso do fecho', () => {
    const today = new Date(2026, 10, 8);
    assert.equal(monthClosureState(today, [], '2026-10').kind, 'overdue');
    assert.equal(monthClosureState(today, ['2026-10'], '2026-10').kind, 'none');
    const lastDay = new Date(2026, 10, 30);
    assert.equal(monthClosureState(lastDay, ['2026-10'], '2026-10').kind, 'due-today');
    assert.equal(monthClosureState(lastDay, ['2026-10', '2026-11'], '2026-10').kind, 'none');
});

test('local de trabalho: o sector decide os campos obrigatórios', () => {
    assert.deepEqual(validateWorkplace({}), []);
    assert.deepEqual(validateWorkplace({ employmentSector: 'PUBLICO' }).map(([field]) => field), ['ministry', 'workInstitution']);
    assert.deepEqual(validateWorkplace({ employmentSector: 'PRIVADO' }).map(([field]) => field), ['workInstitution']);
    assert.deepEqual(validateWorkplace({ employmentSector: 'PUBLICO', ministry: 'Ministério da Saúde', workInstitution: 'Hospital' }), []);
    assert.deepEqual(validateWorkplace({ employmentSector: 'PRIVADO', workInstitution: 'Empresa' }), []);
});

test('mudar de sector limpa só os campos do sector anterior', () => {
    assert.deepEqual(fieldsToClearOnSectorChange('PUBLICO'), ['employerNif']);
    assert.deepEqual(fieldsToClearOnSectorChange('PRIVADO'), ['ministry']);
});

test('local de trabalho nas fichas e relatórios', () => {
    assert.equal(describeWorkplace({ employmentSector: 'PUBLICO', ministry: 'Ministério da Saúde', workInstitution: 'Hospital', workPosition: 'Enfermeiro' }),
        'Enfermeiro — Hospital · Ministério da Saúde (Instituição pública)');
    assert.equal(describeWorkplace({ employmentSector: 'PRIVADO', workInstitution: 'Empresa', employerNif: '5000000000' }),
        'Empresa · NIF 5000000000 (Instituição privada)');
});

const installment = { id: 'p1', number: 1, dueDate: '2026-10-26', principalMinor: 1_000_000, interestMinor: 0 };

test('a mora perdoada não volta no recálculo e a prestação em atraso continua a gerar mora', () => {
    const base = { installments: [installment], payments: [], dailyRatePercent: 1 };
    const before = calculateLateInterest({ ...base, asOf: '2026-11-05' });
    assert.equal(before.owedMinor, 100_000);
    const waivers = [{ date: '2026-11-05', amountMinor: 100_000 }];
    const same = calculateLateInterest({ ...base, asOf: '2026-11-05', waivers });
    assert.deepEqual({ owed: same.owedMinor, accrued: same.accruedMinor, waived: same.waivedMinor }, { owed: 0, accrued: 0, waived: 100_000 });
    assert.equal(calculateLateInterest({ ...base, asOf: '2026-11-06', waivers }).owedMinor, 10_000, 'um dia depois');
    assert.equal(calculateLateInterest({ ...base, asOf: '2026-11-04', waivers }).waivedMinor, 0, 'antes da data do perdão');
});

test('o perdão só retira o que ainda não foi pago', () => {
    const summary = calculateLateInterest({
        installments: [installment, { ...installment, id: 'p2', number: 2 }], dailyRatePercent: 1, asOf: '2026-11-05',
        payments: [{ date: '2026-11-05', principalMinor: 0, interestMinor: 0, lateMinor: 100_000 }],
        waivers: [{ date: '2026-11-05', amountMinor: 60_000 }],
    });
    assert.deepEqual(summary.installments.map(item => [item.paidLateMinor, item.waivedMinor, item.owedMinor]), [[100_000, 0, 0], [0, 60_000, 40_000]]);
    assert.equal(summary.owedMinor, 40_000);
});

test('plano da mora renegociada: soma exacta e datas mensais', () => {
    assert.deepEqual(buildMoraPlan(100_000, 3, '2026-12-31'), [
        { dueDateKey: '2026-12-31', amountMinor: 33_333 },
        { dueDateKey: '2027-01-31', amountMinor: 33_333 },
        { dueDateKey: '2027-02-28', amountMinor: 33_334 },
    ]);
    assert.throws(() => buildMoraPlan(0, 1, '2026-12-01'));
    assert.throws(() => buildMoraPlan(100, 25, '2026-12-01'));
    assert.throws(() => buildMoraPlan(100, 1, ''));
});
