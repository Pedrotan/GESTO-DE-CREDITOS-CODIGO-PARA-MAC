import assert from 'node:assert/strict';
import test from 'node:test';
import { requireCompletedBackup } from '../src/bibliotecas/resultado-backup.ts';

test('backup cancelado, vazio ou sem confirmação não conta como sucesso', () => {
    for (const result of [undefined, null, {}, { success: false }, { success: false, canceled: true },
        { success: true, canceled: true, filePath: 'backup.db', size: 1024 },
        { success: true }, { success: true, filePath: 'backup.db', size: 0 },
        { success: true, filePath: ' ', size: 1024 }, { success: true, filePath: 'backup.db', size: NaN }]) {
        assert.throws(() => requireCompletedBackup(result));
    }
    assert.throws(() => requireCompletedBackup({ success: false, error: 'Disco cheio' }), /Disco cheio/);
});

test('backup confirmado preserva o caminho e tamanho reais', () => {
    assert.deepEqual(requireCompletedBackup({ success: true, filePath: 'backups/tango.db.encrypted', size: 4096 }),
        { filePath: 'backups/tango.db.encrypted', size: 4096 });
});
