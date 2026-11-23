import test from 'node:test';
import assert from 'node:assert/strict';
import {
    detectarAlertas, lerParametrosMonitorizacao, PARAMETROS_MONITORIZACAO_INICIAIS, transicaoPermitida, validarParametrosMonitorizacao,
    type ControloClienteMon, type CreditoMon, type PagamentoMon,
} from '../src/bibliotecas/compliance/monitorizacao.ts';
import { calcularRisco, CONFIGURACAO_RISCO_INICIAL, lerConfiguracao, validarConfiguracao, type EntradaRisco } from '../src/bibliotecas/compliance/motor-risco.ts';

const HOJE = '2026-11-24';
const P = PARAMETROS_MONITORIZACAO_INICIAIS;
// Dados fictícios.
const clientes = [{ id: 'c1', name: 'Cliente Um', monthlyIncome: 200_000 }, { id: 'c2', name: 'Cliente Dois', monthlyIncome: 0 }, { id: 'c3', name: 'Cliente Três', monthlyIncome: 1_000_000 }];
const cred = (id: string, clientId: string, principalAmount: number, extra: Partial<CreditoMon> = {}): CreditoMon => ({ id, clientId, principalAmount, status: 'active', createdAt: '2026-11-10T10:00:00Z', ...extra });
const pag = (id: string, creditId: string, amount: number, paymentDate: string, extra: Partial<PagamentoMon> = {}): PagamentoMon => ({ id, creditId, amount, paymentDate, method: 'cash', status: 'confirmed', processedBy: 'caixa1', ...extra });
const detectar = (o: Partial<Parameters<typeof detectarAlertas>[0]> = {}) => detectarAlertas({
    hoje: HOJE, parametros: P, clientes, creditos: [], pagamentos: [], reforcos: [], taxasManuais: [], controlos: new Map(), controlosDesde: '2026-11-01T00:00:00Z', ...o,
});
const regras = (a: ReturnType<typeof detectarAlertas>) => a.map(x => x.regra).sort();

test('crédito desproporcionado face ao rendimento e sem rendimento declarado', () => {
    const a = detectar({ creditos: [cred('k1', 'c1', 3_000_000), cred('k2', 'c2', 1_500_000), cred('k3', 'c3', 500_000)] });
    assert.deepEqual(regras(a), ['desembolso_rendimento', 'desembolso_sem_rendimento']);
    const d = a.find(x => x.regra === 'desembolso_rendimento')!;
    assert.deepEqual([d.id, d.gravidade, d.clientId, d.operacaoId, (d.evidencias as { multiplo: number }).multiplo], ['desembolso_rendimento:k1', 'media', 'c1', 'k1', 15]);
    assert.equal(detectar({ creditos: [cred('k1', 'c1', 3_000_000, { status: 'pending_approval' })] }).length, 0, 'pedidos ainda não concedidos não são desembolsos');
    assert.equal(detectar({ creditos: [cred('k1', 'c1', 3_000_000, { createdAt: '2026-01-01T00:00:00Z' })] }).length, 0, 'fora da janela retroactiva');
});

test('ids determinísticos: repetir a análise devolve os mesmos alertas', () => {
    const o = { creditos: [cred('k1', 'c1', 3_000_000)], pagamentos: [pag('p1', 'k1', 6_000_000, '2026-11-20')] };
    assert.deepEqual(detectar(o).map(a => a.id), detectar(o).map(a => a.id));
});

test('numerário elevado e fraccionamento em numerário', () => {
    const creditos = [cred('k3', 'c3', 500_000)];
    const elevado = detectar({ creditos, pagamentos: [pag('p1', 'k3', 5_000_000, '2026-11-20'), pag('p2', 'k3', 5_000_000, '2026-11-21', { method: 'transfer' })] });
    assert.deepEqual(regras(elevado), ['numerario_elevado', 'pagamentos_rendimento'], '10 M Kz em 2 dias também é 10 vezes o rendimento');
    assert.equal(elevado.filter(x => x.regra === 'numerario_elevado').length, 1, 'a transferência não é numerário');
    const fracc = detectar({ creditos, pagamentos: [
        pag('f1', 'k3', 1_800_000, '2026-11-15'), pag('f2', 'k3', 1_800_000, '2026-11-17'), pag('f3', 'k3', 1_800_000, '2026-11-20'), pag('f4', 'k3', 100_000, '2026-11-28'),
    ] });
    const f = fracc.filter(x => x.regra === 'fraccionamento');
    assert.equal(f.length, 1);
    assert.equal((f[0].evidencias as { total: number }).total, 5_400_000);
    assert.equal(detectar({ creditos, pagamentos: [pag('f1', 'k3', 1_800_000, '2026-11-01'), pag('f2', 'k3', 1_800_000, '2026-11-10'), pag('f3', 'k3', 1_800_000, '2026-11-20')] })
        .filter(x => x.regra === 'fraccionamento').length, 0, 'espaçados mais de 7 dias não são fraccionamento');
    assert.equal(detectar({ creditos, pagamentos: [pag('f1', 'k3', 1_800_000, '2026-11-15', { status: 'cancelled' }), pag('f2', 'k3', 1_800_000, '2026-11-17'), pag('f3', 'k3', 1_800_000, '2026-11-20')] })
        .filter(x => x.regra === 'fraccionamento').length, 0, 'anulados não contam');
});

test('pagamentos acima do rendimento (baixa) e liquidação antecipada não é suspeita por si', () => {
    const creditos = [cred('k1', 'c1', 1_000_000, { status: 'paid', startDate: '2026-11-01', paidAt: '2026-11-20T10:00:00Z' })];
    const a = detectar({ creditos, pagamentos: [pag('p1', 'k1', 1_000_000, '2026-11-20', { method: 'transfer' })] });
    assert.deepEqual(regras(a), ['pagamentos_rendimento']);
    assert.equal(a[0].gravidade, 'baixa');
    assert.ok(a[0].descricao.includes('liquidação antecipada legítima'));
    const rapida = detectar({ creditos: [cred('k3', 'c3', 6_000_000, { status: 'paid', startDate: '2026-11-01', paidAt: '2026-11-20T10:00:00Z' })],
        pagamentos: [pag('p1', 'k3', 3_000_000, '2026-11-19'), pag('p2', 'k3', 3_000_000, '2026-11-20')] });
    assert.ok(regras(rapida).includes('liquidacao_rapida_numerario'));
    const lenta = detectar({ creditos: [cred('k3', 'c3', 6_000_000, { status: 'paid', startDate: '2026-08-01', paidAt: '2026-11-20T10:00:00Z' })],
        pagamentos: [pag('p1', 'k3', 3_000_000, '2026-11-19', { method: 'transfer' }), pag('p2', 'k3', 3_000_000, '2026-11-20', { method: 'transfer' })] });
    assert.equal(lenta.filter(x => x.regra === 'liquidacao_rapida_numerario').length, 0);
});

test('fraude interna: anulações, pagamento sem confirmação, taxa manual e crédito duplicado', () => {
    const creditos = [cred('k3', 'c3', 500_000), cred('k4', 'c3', 500_000, { createdAt: '2026-11-11T09:00:00Z' })];
    const anul = (id: string, dia: string, extra: Partial<PagamentoMon> = {}) => pag(id, 'k3', 10_000, dia, { status: 'cancelled', cancelledAt: `${dia}T15:00:00Z`, cancelledBy: 'chefe', cancelReason: 'erro', ...extra });
    const a = detectar({
        creditos,
        pagamentos: [anul('a1', '2026-11-02'), anul('a2', '2026-11-05'), anul('a3', '2026-11-09', { processedBy: 'chefe' }),
            pag('t1', 'k3', 80_000, '2026-11-15', { method: 'transfer', status: 'pending', registeredAt: '2026-11-15T10:00:00Z' })],
        taxasManuais: [{ auditId: 'au1', creditId: 'k3', taxaTabela: 10, taxaUsada: 5, em: '2026-11-10T10:00:00Z', por: 'gestor' }],
    });
    assert.deepEqual(regras(a), ['anulacao_propria', 'anulacoes_utilizador', 'credito_duplicado', 'pagamento_sem_confirmacao', 'taxa_manual']);
    assert.equal(a.find(x => x.regra === 'anulacoes_utilizador')!.clientId, null, 'alerta sobre o utilizador, não sobre um cliente');
    assert.equal(a.find(x => x.regra === 'taxa_manual')!.gravidade, 'media', 'redução de 50% da taxa');
    assert.equal(a.find(x => x.regra === 'pagamento_sem_confirmacao')!.gravidade, 'media', '9 dias pendente (≥ 3 × 3)');
});

test('reforços sucessivos e crédito concedido sem controlos de Compliance', () => {
    const reforcos = [{ id: 'r1', creditId: 'k3', amount: 100_000, createdAt: '2026-10-01T10:00:00Z' }, { id: 'r2', creditId: 'k3', amount: 200_000, createdAt: '2026-11-05T10:00:00Z' }];
    assert.deepEqual(regras(detectar({ creditos: [cred('k3', 'c3', 500_000)], reforcos })), ['reforcos_sucessivos']);
    const controlos = new Map<string, ControloClienteMon>([['c3', { kycVerificado: false, screening: 'confirmada' }]]);
    const a = detectar({ creditos: [cred('k3', 'c3', 500_000)], controlos }).find(x => x.regra === 'desembolso_sem_controlos')!;
    assert.equal(a.gravidade, 'alta');
    assert.ok(a.descricao.includes('CONFIRMADA'));
    assert.equal(detectar({ creditos: [cred('k3', 'c3', 500_000, { createdAt: '2026-10-15T00:00:00Z' })], controlos }).length, 0, 'créditos anteriores à activação não contam');
    assert.equal(detectar({ creditos: [cred('k3', 'c3', 500_000)], controlos: new Map([['c3', { kycVerificado: true, screening: 'sem_correspondencia' }]]) }).length, 0);
});

test('ciclo de vida do alerta e parâmetros versionados com o modelo', () => {
    assert.ok(transicaoPermitida('NEW', 'IN_REVIEW'));
    assert.ok(!transicaoPermitida('NEW', 'SUBSTANTIATED'), 'não se conclui sem análise');
    assert.ok(transicaoPermitida('INFORMATION_REQUESTED', 'NOT_SUBSTANTIATED'));
    assert.ok(!transicaoPermitida('SUBSTANTIATED', 'NOT_SUBSTANTIATED'), 'a conclusão não se altera');
    assert.ok(!transicaoPermitida('CLOSED', 'IN_REVIEW'));
    assert.deepEqual(lerConfiguracao('{"pesos":{"historico":15}}').monitorizacao, P, 'o modelo v1 (sem parâmetros) recebe os iniciais');
    assert.equal(lerParametrosMonitorizacao({ fraccionamento: { dias: 3 } as never }).fraccionamento.minPagamentos, 3);
    assert.ok(validarParametrosMonitorizacao({ ...P, numerarioElevadoKz: 0 }).length > 0);
    assert.ok(validarConfiguracao({ ...CONFIGURACAO_RISCO_INICIAL, monitorizacao: { ...P, diasRetroactivos: 1000 } }).some(e => e.includes('730')));
});

test('risco: alertas fundamentados sobem o histórico e impõem nível médio', () => {
    const e: EntradaRisco = {
        particular: true, documento: 'valido', kycEmFalta: [], kycEstado: 'verificado', duplicadosPorRever: [], estrangeiro: false, pais: 'AO',
        rendimentoMensal: 300_000, origemFundos: 'Salário', profissao: 'Professora', sector: null, pep: false, exposicao: 0, creditosActivos: 0,
        maiorCredito: 0, maiorAtrasoDias: 0, creditoIncumprido: false, clienteBloqueado: false, antiguidadeMeses: 34, screening: 'sem_correspondencia', pepLista: false,
        alertasFundamentados: 2,
    };
    const r = calcularRisco(e, CONFIGURACAO_RISCO_INICIAL);
    assert.equal(r.factores.find(f => f.id === 'historico')!.valor, 50);
    assert.deepEqual([r.nivel, r.requerRevisao], ['medio', true]);
});

test('processo principal: permissão e autor dos comandos dos alertas', async () => {
    const P = await import('../src/bibliotecas/compliance/permissoes-compliance.ts');
    const colunaDoAutor = (sql: string, autor: number) => {
        const insert = sql.match(/\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/u);
        const colunas = insert
            ? insert[1].split(',').map(c => c.trim()).filter((_, i) => insert[2].split(',')[i].trim() === '?')
            : sql.match(/SET (.*) WHERE/u)![1].split(',').filter(c => c.includes('?')).map(c => c.split('=')[0].trim());
        return colunas[autor];
    };
    const casos: Array<[string, string, string]> = [
        [P.SQL_ALERTA_REGISTAR, 'compliance_manage', 'detectado_por'],
        [P.SQL_ALERTA_ANALISAR, 'compliance_manage', 'responsavel_id'],
        [P.SQL_ALERTA_PEDIR_INFO, 'compliance_manage', 'actualizado_por'],
        [P.SQL_ALERTA_CONCLUIR, 'compliance_approve', 'concluido_por'],
        [P.SQL_ALERTA_ENCERRAR, 'compliance_approve', 'encerrado_por'],
        [P.SQL_ALERTA_HISTORICO, 'compliance_manage', 'por'],
    ];
    for (const [sql, permissao, coluna] of casos) {
        const regra = P.regraEscritaCompliance(sql)!;
        assert.equal(regra.permissao, permissao, sql.slice(0, 50));
        assert.equal(colunaDoAutor(sql, regra.autor!), coluna, sql.slice(0, 50));
    }
    assert.ok(/estado = 'IN_REVIEW'/u.test(P.SQL_ALERTA_ANALISAR) && /estado = 'CLOSED'/u.test(P.SQL_ALERTA_ENCERRAR), 'os estados que só exigem «Registar» estão fixos no comando');
});
