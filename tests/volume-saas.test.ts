import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMetrics, overdueRate, summarizeUsage, usageToCsv, variation, type CompanyUsage } from '../src/bibliotecas/volume-saas.ts';

const company = (partial: Partial<CompanyUsage>): CompanyUsage => ({
    tenantId: 'T', name: 'Empresa', status: 'active', expiresAt: null, createdAt: null, lastSyncAt: null, reportedAt: null,
    appVersion: null, metrics: null, previousMetrics: null, syncOperations: 0, activeDevices: 0, ...partial,
});

test('soma as métricas de todas as empresas e conta as que reportaram e as activas', () => {
    const summary = summarizeUsage([
        company({ metrics: { ...emptyMetrics(), creditsCount: 2, creditsVolumeMinor: 50_000, portfolioMinor: 40_000 },
            previousMetrics: { ...emptyMetrics(), creditsVolumeMinor: 25_000 }, syncOperations: 10, activeDevices: 2 }),
        company({ metrics: { ...emptyMetrics(), paymentsCount: 1, paymentsVolumeMinor: 7_000 } }),
        company({}),
    ]);
    assert.equal(summary.companies, 3);
    assert.equal(summary.reportingCompanies, 2);
    assert.equal(summary.activeCompanies, 2);
    assert.equal(summary.creditsVolumeMinor, 50_000);
    assert.equal(summary.paymentsVolumeMinor, 7_000);
    assert.equal(summary.previousCreditsVolumeMinor, 25_000);
    assert.equal(summary.activeDevices, 2);
    assert.equal(variation(summary.creditsVolumeMinor, summary.previousCreditsVolumeMinor), 100);
});

test('variação sem base é null e a taxa de atraso é proporcional à carteira', () => {
    assert.equal(variation(10, 0), null);
    assert.equal(variation(75, 100), -25);
    assert.equal(overdueRate({ overdueMinor: 1_500, portfolioMinor: 10_000 }), 15);
    assert.equal(overdueRate({ overdueMinor: 5, portfolioMinor: 0 }), 0);
});

test('o CSV usa ";" e vírgula decimal, e neutraliza fórmulas em nomes', () => {
    const csv = usageToCsv([company({ name: '=HYPERLINK("x")', metrics: { ...emptyMetrics(), creditsVolumeMinor: 123_456 } })], '2026-10');
    const [header, row] = csv.replace('﻿', '').split('\r\n');
    assert.match(header, /^Período;Empresa;/);
    assert.match(row, /^2026-10;"'=HYPERLINK\(""x""\)";T;active;0;1234,56;/);
    assert.match(row, /Sem relatório$/);
});
