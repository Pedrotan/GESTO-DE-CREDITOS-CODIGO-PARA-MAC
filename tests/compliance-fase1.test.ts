import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarKyc, entradaRisco, mascararDocumento, requisitosEmFalta, type ClienteKyc, type PerfilKyc } from '../src/bibliotecas/compliance/kyc.ts';
import { calcularRisco, CONFIGURACAO_RISCO_INICIAL, lerConfiguracao, nivelDaPontuacao, proximaRevisao, validarConfiguracao, type EntradaRisco } from '../src/bibliotecas/compliance/motor-risco.ts';
import { chaveGrupo, detectarDuplicados, motivosDoCliente, normalizarTelefone } from '../src/bibliotecas/compliance/duplicados.ts';

const HOJE = '2026-11-24';
const C = CONFIGURACAO_RISCO_INICIAL;

// Dados fictícios (nunca usar BI/NIF reais em desenvolvimento).
const cliente = (extra: Partial<ClienteKyc> = {}): ClienteKyc => ({
    id: 'c1', name: 'Maria Teste Exemplo', nif: '000000001LA001', phone: '923000001', address: 'Rua Teste, Luanda', municipality: 'Luanda',
    birthDate: '1990-05-10', expiryDate: '2030-01-01', issueDate: '2020-01-01', documentType: 'BI', clientType: 'PARTICULAR', countryCode: 'AO',
    monthlyIncome: 300_000, workPosition: 'Professora', status: 'active', createdAt: '2024-01-15', ...extra,
});
const perfilCompleto: PerfilKyc = { profissao: 'Professora', origem_fundos: 'Salário', pep: 0, estado_kyc: 'verificado', diligencia: 'normal' };

const entradaBase = (extra: Partial<EntradaRisco> = {}): EntradaRisco => ({
    particular: true, documento: 'valido', kycEmFalta: [], kycEstado: 'verificado', duplicadosPorRever: [], estrangeiro: false, pais: 'AO',
    rendimentoMensal: 300_000, origemFundos: 'Salário', profissao: 'Professora', sector: null, pep: false, exposicao: 0, creditosActivos: 0,
    maiorCredito: 0, maiorAtrasoDias: 0, creditoIncumprido: false, clienteBloqueado: false, antiguidadeMeses: 34,
    screening: 'sem_correspondencia', pepLista: false, ...extra,
});

test('KYC: cliente completo e verificado; requisitos em falta tornam-no incompleto', () => {
    const ok = avaliarKyc(cliente(), perfilCompleto, HOJE);
    assert.deepEqual([ok.estado, ok.completude, ok.emFalta.length, ok.precisaAccao], ['verificado', 100, 0, false]);
    const semPerfil = avaliarKyc(cliente(), null, HOJE);
    assert.equal(semPerfil.estado, 'incompleto');
    assert.deepEqual(semPerfil.emFalta.map(r => r.campo), ['origem_fundos', 'pep']);
    assert.equal(semPerfil.completude, 80);
    const pep = requisitosEmFalta(cliente(), { ...perfilCompleto, pep: 1 });
    assert.deepEqual(pep.map(r => r.campo), ['pep_funcao'], 'PEP declarado exige a função exercida');
});

test('KYC: documento expirado sobrepõe-se ao «verificado»; recusado mantém-se', () => {
    const exp = avaliarKyc(cliente({ expiryDate: '2026-11-01' }), perfilCompleto, HOJE);
    assert.deepEqual([exp.estado, exp.documento.estado], ['expirado', 'expirado']);
    assert.equal(avaliarKyc(cliente({ expiryDate: '2026-12-10' }), perfilCompleto, HOJE).documento.estado, 'a_expirar');
    assert.equal(avaliarKyc(cliente({ expiryDate: '2026-11-01' }), { ...perfilCompleto, estado_kyc: 'recusado' }, HOJE).estado, 'recusado');
    assert.equal(avaliarKyc(cliente(), { ...perfilCompleto, proxima_revisao: '2026-10-01' }, HOJE).revisaoVencida, true);
});

test('KYC: empresa exige registo comercial, representante e beneficiário efectivo; reforçada exige comprovativos', () => {
    const empresa = cliente({ clientType: 'EMPRESA', nif: '5000000001', expiryDate: null, birthDate: null, monthlyIncome: 2_000_000 });
    assert.deepEqual(requisitosEmFalta(empresa, { origem_fundos: 'Vendas', pep: 0 }).map(r => r.campo),
        ['commercialRegistry', 'legalRepresentative', 'beneficiario_efectivo', 'profissao']);
    assert.deepEqual(requisitosEmFalta(cliente(), { ...perfilCompleto }, 'reforcada').map(r => r.campo), ['comprovativo_morada', 'comprovativo_rendimentos']);
    assert.deepEqual(requisitosEmFalta(cliente(), { ...perfilCompleto, documentos_entregues: '["comprovativo_morada","comprovativo_rendimentos"]' }, 'reforcada'), []);
});

test('mascarar BI/NIF', () => {
    assert.equal(mascararDocumento('000000001LA001'), '0000•••••001');
    assert.equal(mascararDocumento(''), '—');
});

test('risco: cliente sem factores fica baixo; pesos da especificação somam 100', () => {
    assert.deepEqual(validarConfiguracao(C), []);
    const r = calcularRisco(entradaBase(), C);
    assert.deepEqual([r.pontuacao, r.nivel, r.decisao, r.requerRevisao, r.regras.length], [0, 'baixo', 'diligencia_normal', false, 0]);
    assert.equal(r.factores.length, 5);
    const semScreening = calcularRisco(entradaBase({ screening: 'nao_verificado' }), C).factores.find(f => f.id === 'pep_sancoes')!;
    assert.ok(semScreening.notas[0].includes('não verificadas'), 'sanções por verificar ficam registadas, nunca como «sem correspondência»');
});

test('risco: média ponderada e escalões 0–29 / 30–59 / 60–100', () => {
    assert.deepEqual([nivelDaPontuacao(29, C), nivelDaPontuacao(30, C), nivelDaPontuacao(59, C), nivelDaPontuacao(60, C)], ['baixo', 'medio', 'medio', 'elevado']);
    // Sem rendimento (50) nem origem (30) → actividade 80 × 20% = 16; não verificado (20) → identificação 20 × 20% = 4.
    const r = calcularRisco(entradaBase({ rendimentoMensal: null, origemFundos: null, kycEstado: 'pendente' }), C);
    assert.equal(r.pontuacaoPonderada, 20);
    assert.equal(r.nivel, 'baixo');
});

test('risco: PEP não se dilui na média — nível elevado, diligência reforçada e revisão humana', () => {
    const r = calcularRisco(entradaBase({ pep: true }), C);
    assert.equal(r.pontuacaoPonderada, 20, 'PEP sozinho daria 100 × 20% = 20 (baixo)');
    assert.deepEqual([r.nivel, r.pontuacao, r.decisao, r.requerRevisao], ['elevado', 60, 'diligencia_reforcada', true]);
    assert.ok(r.regras.some(x => x.id === 'pep'));
});

test('risco: documento expirado e duplicado por rever impõem nível médio e revisão', () => {
    const r = calcularRisco(entradaBase({ documento: 'expirado' }), C);
    assert.deepEqual([r.nivel, r.requerRevisao], ['medio', true]);
    const d = calcularRisco(entradaBase({ duplicadosPorRever: ['Mesmo BI/NIF'] }), C);
    assert.deepEqual([d.nivel, d.pontuacao >= 30], ['medio', true]);
    const pais = calcularRisco(entradaBase({ estrangeiro: true, pais: 'KP' }), C);
    assert.equal(pais.nivel, 'elevado');
});

test('risco: exposição face ao rendimento e atrasos', () => {
    const r = calcularRisco(entradaBase({ exposicao: 4_000_000, creditosActivos: 3, maiorAtrasoDias: 95, creditoIncumprido: true }), C);
    const fin = r.factores.find(f => f.id === 'financeiro')!;
    const hist = r.factores.find(f => f.id === 'historico')!;
    assert.equal(fin.valor, 70, '13,3 meses de rendimento (50) + 3 créditos (20)');
    assert.equal(hist.valor, 100, 'incumprimento (60) + atraso > 90 dias (50), limitado a 100');
    assert.equal(r.pontuacaoPonderada, Math.round(70 * 0.25 + 100 * 0.15));
});

test('modelo: validação, leitura de versões antigas e próxima revisão', () => {
    assert.ok(validarConfiguracao({ ...C, pesos: { ...C.pesos, historico: 20 } })[0].includes('somar 100'));
    assert.ok(validarConfiguracao({ ...C, limiares: { medio: 60, elevado: 30 } }).length > 0);
    assert.deepEqual(lerConfiguracao('{"pesos":{"historico":15}}').limiares, C.limiares);
    assert.deepEqual(lerConfiguracao('não é json').pesos, C.pesos);
    assert.equal(proximaRevisao('2026-11-24', 'elevado', C), '2027-05-24');
    assert.equal(proximaRevisao('2026-08-31', 'elevado', C), '2027-02-28');
    assert.equal(proximaRevisao('2026-11-24', 'baixo', C), '2028-11-24');
});

test('entrada do motor a partir do cadastro, perfil e créditos', () => {
    const e = entradaRisco({
        cliente: cliente(), perfil: perfilCompleto, duplicadosPorRever: [], hoje: HOJE,
        creditos: [
            { clientId: 'c1', status: 'active', currentBalance: 500_000, principalAmount: 600_000, daysOverdue: 0 },
            { clientId: 'c1', status: 'overdue', currentBalance: 200_000, principalAmount: 300_000, daysOverdue: 40 },
            { clientId: 'c1', status: 'paid', currentBalance: 0, principalAmount: 900_000, daysOverdue: 12 },
            { clientId: 'outro', status: 'active', currentBalance: 9_000_000, principalAmount: 9_000_000, daysOverdue: 0 },
        ],
    });
    assert.deepEqual([e.exposicao, e.creditosActivos, e.maiorCredito, e.maiorAtrasoDias, e.pep, e.antiguidadeMeses], [700_000, 2, 600_000, 40, false, 34]);
});

test('duplicados: mesmo BI, IBAN, telefone e nome+nascimento; revistos saem da lista', () => {
    const clientes = [
        { id: 'a', name: 'João Teste', nif: '000000002LA002', phone: '+244 923 000 002', birthDate: '1985-01-01', bankCoordinates: [{ iban: 'AO06 0000 0000 0000 0000 0000 1' }] },
        { id: 'b', name: 'JOÃO  TESTE', nif: '000000002-LA-002', phone: '923000002', birthDate: '1985-01-01', bankCoordinates: [] },
        { id: 'c', name: 'Ana Teste', nif: '000000003LA003', phone: '923000003', bankCoordinates: [{ iban: 'AO06000000000000000000001' }] },
        { id: 'd', name: 'Removido', nif: '000000003LA003', deletedAt: '2026-01-01' },
    ];
    const grupos = detectarDuplicados(clientes);
    assert.deepEqual(grupos.map(g => [g.motivo, g.clientes.join(',')]).sort(), [
        ['documento', 'a,b'], ['iban', 'a,c'], ['nome_nascimento', 'a,b'], ['telefone', 'a,b'],
    ].sort());
    assert.equal(grupos[0].gravidade, 'alta');
    assert.ok(!grupos.some(g => g.valor.includes('000000002LA002')), 'o valor mostrado vai mascarado');
    const revistos = detectarDuplicados(clientes, [{ chave: chaveGrupo('documento', ['b', 'a']) }]);
    assert.equal(revistos.some(g => g.motivo === 'documento'), false);
    assert.deepEqual(motivosDoCliente('c', grupos), ['Mesmo IBAN']);
    assert.equal(normalizarTelefone('00244923000002'), '923000002');
});
