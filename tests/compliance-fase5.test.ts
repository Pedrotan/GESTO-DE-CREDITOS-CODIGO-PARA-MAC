import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarControloCredito, decidirControlo, mensagemControlo, type EntradaControlo } from '../src/bibliotecas/compliance/controlo-credito.ts';
import { POLITICA_BLOQUEIO_INICIAL, efeitoDe, lerPoliticaBloqueio, validarPoliticaBloqueio, type PoliticaBloqueio } from '../src/bibliotecas/compliance/politica-bloqueio.ts';
import { CONFIGURACAO_RISCO_INICIAL, lerConfiguracao, validarConfiguracao } from '../src/bibliotecas/compliance/motor-risco.ts';

const BLOQUEIO: PoliticaBloqueio = { ...POLITICA_BLOQUEIO_INICIAL, modo: 'bloqueio', validacaoJuridica: { referencia: 'Parecer 1/2026 (teste)', data: '2026-11-20', responsavel: 'Jurídico (teste)' } };
const limpo = (extra: Partial<EntradaControlo> = {}): EntradaControlo => ({
    hoje: '2026-11-24', politica: BLOQUEIO, montante: 500_000, kycProcesso: 'verificado', documento: 'valido', screening: 'sem_correspondencia', pep: false,
    nivelRisco: 'baixo', avaliacaoPorRever: false, medidasBloqueio: 0, casosAbertos: 0, autorizacoes: [], ...extra,
});

test('cliente com todos os controlos em dia: permitido', () => {
    const r = decidirControlo(limpo());
    assert.deepEqual([r.decisao, r.impede, r.motivos.length], ['permitido', false, 0]);
});

test('sanção confirmada, medida de bloqueio e KYC recusado bloqueiam sempre (efeito fixo)', () => {
    for (const extra of [{ screening: 'confirmada' as const }, { medidasBloqueio: 1 }, { kycProcesso: 'recusado' as const }]) {
        const r = decidirControlo(limpo({ ...extra, politica: { ...BLOQUEIO, efeitos: { sancao_confirmada: 'permitir' } as never } }));
        assert.deepEqual([r.decisao, r.impede], ['bloqueado', true], JSON.stringify(extra));
    }
});

test('falha do screening nunca equivale a aprovação; possível correspondência fica pendente', () => {
    assert.equal(decidirControlo(limpo({ screening: 'erro' })).decisao, 'pendente');
    assert.equal(decidirControlo(limpo({ screening: 'possivel' })).decisao, 'pendente');
    assert.equal(decidirControlo(limpo({ screening: 'nao_verificado' })).decisao, 'requer_revisao');
    assert.equal(decidirControlo(limpo({ kycProcesso: 'em_verificacao' })).decisao, 'pendente');
    assert.equal(decidirControlo(limpo({ kycProcesso: null })).decisao, 'requer_revisao');
});

test('autorização de Compliance cobre os motivos «rever» até ao montante e à validade', () => {
    const aut = { id: 'a1', decisao: 'autorizado' as const, montanteMaximo: 1_000_000, validoAte: '2026-12-31', motivos: ['pep', 'risco_elevado'], autorizadoEm: '2026-11-20T10:00:00Z' };
    const base = { pep: true, nivelRisco: 'elevado' as const };
    assert.equal(decidirControlo(limpo(base)).decisao, 'requer_revisao');
    const r = decidirControlo(limpo({ ...base, autorizacoes: [aut] }));
    assert.deepEqual([r.decisao, r.autorizacao?.id, r.motivos.every(m => m.autorizado)], ['permitido', 'a1', true]);
    assert.equal(decidirControlo(limpo({ ...base, montante: 2_000_000, autorizacoes: [aut] })).decisao, 'requer_revisao', 'acima do montante autorizado');
    assert.equal(decidirControlo(limpo({ ...base, autorizacoes: [{ ...aut, validoAte: '2026-11-01' }] })).decisao, 'requer_revisao', 'autorização caducada');
    assert.equal(decidirControlo(limpo({ ...base, casosAbertos: 1, autorizacoes: [aut] })).decisao, 'requer_revisao', 'motivo novo não coberto');
    assert.equal(decidirControlo(limpo({ ...base, screening: 'possivel', autorizacoes: [aut] })).decisao, 'pendente', 'a autorização não cobre pendentes');
    assert.equal(decidirControlo(limpo({ autorizacoes: [{ ...aut, decisao: 'recusado' }] })).decisao, 'bloqueado', 'recusa do Compliance bloqueia');
});

test('modos: «aviso» calcula mas não impede; «bloqueio» exige validação jurídica', () => {
    const aviso = decidirControlo(limpo({ politica: POLITICA_BLOQUEIO_INICIAL, screening: 'confirmada' }));
    assert.deepEqual([aviso.decisao, aviso.impede, aviso.modo], ['bloqueado', false, 'aviso']);
    assert.ok(mensagemControlo(aviso, 'aprovar o crédito').startsWith('Bloqueado pelo Compliance: não é possível aprovar o crédito.'));
    assert.ok(validarPoliticaBloqueio({ ...POLITICA_BLOQUEIO_INICIAL, modo: 'bloqueio' })[0].includes('validação jurídica'));
    assert.deepEqual(validarPoliticaBloqueio(BLOQUEIO), []);
    assert.equal(POLITICA_BLOQUEIO_INICIAL.modo, 'aviso', 'nunca bloqueia por omissão');
    assert.equal(efeitoDe({ ...BLOQUEIO, efeitos: { kyc_nao_verificado: 'bloquear' } }, 'kyc_nao_verificado'), 'bloquear');
    assert.equal(efeitoDe({ ...BLOQUEIO, efeitos: { pep: 'permitir' } }, 'pep'), 'rever', 'opção não permitida volta ao padrão');
    assert.equal(decidirControlo(limpo({ politica: { ...BLOQUEIO, efeitos: { sem_avaliacao: 'permitir' } }, nivelRisco: null })).decisao, 'permitido');
    assert.deepEqual(lerConfiguracao('{}').bloqueios, POLITICA_BLOQUEIO_INICIAL);
    assert.ok(validarConfiguracao({ ...CONFIGURACAO_RISCO_INICIAL, bloqueios: { ...BLOQUEIO, validacaoJuridica: null } }).some(e => e.includes('validação jurídica')));
    assert.equal(lerPoliticaBloqueio({ modo: 'outro' as never }).modo, 'aviso');
});

test('leitura da base: tabelas em falta contam como «sem dados» e o screening por fazer não é aprovação', async () => {
    const vazio = { todos: async () => { throw new Error('no such table'); }, um: async () => { throw new Error('no such table'); } };
    const r = await avaliarControloCredito(vazio as never, 'c1', 100, '2026-11-24');
    assert.equal(r.modo, 'aviso');
    assert.deepEqual(r.motivos.map(m => m.codigo).sort(), ['kyc_nao_verificado', 'screening_por_fazer', 'sem_avaliacao']);
    assert.equal(r.impede, false);
});
