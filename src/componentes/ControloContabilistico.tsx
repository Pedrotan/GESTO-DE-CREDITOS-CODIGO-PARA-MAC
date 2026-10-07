import { REVENUE_ACCOUNTS, EXPENSE_ACCOUNTS } from '@/bibliotecas/plano-contas';
import { profitability } from '@/bibliotecas/rentabilidade';
import { buildJournal } from '@/bibliotecas/relatorios-contabeis';
import { LancamentosTesouraria } from './LancamentosTesouraria';
import { ServicoCadeiaAuditoria } from '@/servicos/ServicoCadeiaAuditoria';
import { RelatoriosRazao } from './RelatoriosRazao';
import { ServicoExtratosBancarios, type StoredBankImport } from '@/servicos/ServicoExtratosBancarios';
import { PedidosAbate } from './PedidosAbate';
import { CobrancaOperacional } from './CobrancaOperacional';
import { DecisoesDivergencias } from './DecisoesDivergencias';
import { ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';
import { CaixaOperador } from './CaixaOperador';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { ServicoIntegridadeContabilistica } from '@/servicos/ServicoIntegridadeContabilistica';
import { agingPortfolio, trialBalance, reconcileBank, ACCOUNT_NAMES, type BankMovement } from '@/bibliotecas/controlo-contabilistico';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import { formatCurrency } from '@/bibliotecas/formatters';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from 'jspdf-autotable';
import { applyBranding, getCompanySettings } from '@/bibliotecas/pdf';
import { ServicoAutoBackup } from '@/servicos/ServicoAutoBackup';

const auditActionNames:Record<string,string>={create:'Criação',update:'Alteração',delete:'Eliminação',login:'Início de sessão',logout:'Fim de sessão',restore:'Reposição',approve:'Aprovação',reject:'Rejeição',export:'Exportação'};
const auditModuleNames:Record<string,string>={credit:'Créditos',payment:'Pagamentos',client:'Clientes',accounting_entry:'Contabilidade',system:'Sistema',user:'Utilizadores',expense:'Despesas',company_settings:'Definições',contract:'Contratos'};
export function ControloContabilistico({ onSnapshot }: { onSnapshot: (report: Awaited<ReturnType<typeof ServicoIntegridadeContabilistica.scan>>) => void }) {
    const { accountingEntries, credits, payments, companySettings, logs, users } = useData();
    const { user } = useAuth();
    const [report, setReport] = useState<Awaited<ReturnType<typeof ServicoIntegridadeContabilistica.scan>> | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('balances');
    const [profitDimension, setProfitDimension] = useState<'method' | 'agent'>('method');
    const [from, setFrom] = useState(new Date().toISOString().slice(0,7) + '-01');
    const [to, setTo] = useState(new Date().toISOString().slice(0,10));
    const [bank, setBank] = useState<BankMovement[]>([]);
    const [bankImports,setBankImports]=useState<StoredBankImport[]>([]);
    const [bankImportId,setBankImportId]=useState('');
    useEffect(()=>{void ServicoExtratosBancarios.list().then(rows=>{setBankImports(rows);if(rows[0]){setBankImportId(rows[0].id);setBank(JSON.parse(rows[0].movements));}}).catch(e=>setError(e.message));},[]);
    const [rates, setRates] = useState<number[]>(() => {
        try { return JSON.parse(getScopedLocalStorageItem('accounting_provision_rates') || '[0,0,0,0,0]'); } catch { return [0,0,0,0,0]; }
    });
    const [auditSearch, setAuditSearch] = useState('');
    const [auditUser,setAuditUser] = useState('');
    const [auditModule,setAuditModule] = useState('');
    const [auditAction,setAuditAction] = useState('');
    const [accountCatalog, setAccountCatalog] = useState<Record<string, { code: string; name: string }>>({});
    useEffect(() => { void ServicoDefinicoesPartilhadas.get('accounting_account_catalog').then(value => { if (value) setAccountCatalog(JSON.parse(value)); }).catch(() => setError('Não foi possível carregar o plano de contas.')); }, []);
    const [note, setNote] = useState('');
    const refresh = useCallback(async () => {
        setBusy(true); setError('');
        try {
            const result = await ServicoIntegridadeContabilistica.scan();
            setReport(result); onSnapshot(result);
            setScopedLocalStorageItem('accounting_last_integrity_check', result.checkedAt);
        } catch (e: any) { setError(e.message || 'Não foi possível verificar a integridade.'); }
        finally { setBusy(false); }
    }, [onSnapshot]);
    useEffect(() => {
        void refresh();
        const interval = setInterval(() => { void refresh(); }, 24 * 60 * 60 * 1000);
        return () => clearInterval(interval);
    }, [refresh, accountingEntries, payments]);
    const lines = useMemo(() => (report?.lines || []).filter(l => l.timestamp && l.timestamp.slice(0,10) >= from && l.timestamp.slice(0,10) <= to), [report, from, to]);
    const balances = useMemo(() => trialBalance(lines.filter(l => Number.isSafeInteger(l.amountMinor) && l.amountMinor > 0 && ['debit','credit'].includes(l.side))), [lines]);
    const profitRows = useMemo(() => from > to ? [] : profitability(credits, report?.installments || [], payments,
        report ? buildJournal(report.entries, report.transactions, report.lines) : [], from, to, profitDimension), [credits, payments, report, from, to, profitDimension]);
    const aging = useMemo(() => agingPortfolio(credits.filter(c=>!(report?.writeoffs || []).some(w=>w.creditId===c.id)), rates), [credits, rates, report]);
    const movements: BankMovement[] = payments.filter(p => !p.deletedAt && p.status === 'confirmed' && p.method !== 'cash')
        .map(p => ({ id: p.id, date: new Date(p.paymentDate).toISOString().slice(0,10), amountMinor: Math.round(p.amount*100), reference: p.reference || p.id }));
    const reconciliation = reconcileBank(bank, movements.filter(m => m.date >= from && m.date <= to));
    const admin = ['admin','super_admin'].includes(user?.role || '');
    const money = (minor: number) => formatCurrency(minor/100);
    const allAudit = report?.auditLogs || logs;
    const audit = allAudit.filter(l => {
        const date = new Date(l.timestamp).toISOString().slice(0,10);
        return (!auditUser || l.userId===auditUser) && (!auditModule || l.entity===auditModule) && (!auditAction || l.action===auditAction) && date >= from && date <= to && (l.userName + ' ' + l.action + ' ' + l.entity + ' ' + l.details).toLowerCase().includes(auditSearch.toLowerCase());
    });
    const rowsForExport = () => tab === 'aging'
        ? { head: ['Escalão', 'Créditos', 'Capital', 'Taxa', 'Provisão estimada'], body: aging.buckets.map(b => [b.label,b.count,money(b.principalMinor),b.rate+'%',money(b.provisionMinor)]) }
        : tab === 'profit' ? { head: ['Grupo','Créditos na base','Juros previstos','Juros recebidos','Receita no razão','Despesas/perdas','Margem'], body: profitRows.map(r => [profitDimension === 'agent' ? users.find(u => u.id === r.key)?.name || r.key : r.key,r.credits,money(r.expectedMinor),money(r.receivedMinor),money(r.revenueMinor),money(r.expenseMinor),money(r.marginMinor)]) }
        : tab === 'audit' ? { head: ['Data', 'Utilizador', 'Ação', 'Módulo', 'Detalhes'], body: audit.map(l => [new Date(l.timestamp).toLocaleString('pt-AO'),l.userName,auditActionNames[l.action] || l.action,auditModuleNames[l.entity] || l.entity,l.details]) }
        : tab === 'issues' ? { head: ['Gravidade', 'Registo', 'Divergência'], body: (report?.findings || []).map(f => [f.severity === 'error' ? 'Erro' : 'Aviso',f.entityId || '',f.message]) }
        : { head: ['Conta', 'Débito', 'Crédito', 'Saldo devedor'], body: balances.map(b => [accountCatalog[b.account]?.name || ACCOUNT_NAMES[b.account] || b.account,money(b.debitMinor),money(b.creditMinor),money(b.balanceMinor)]) };
    const exportPdf = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        applyBranding(doc, getCompanySettings(companySettings));
        doc.setFontSize(15); doc.text('Controlo contabilístico · ' + from + ' a ' + to, 15, 48);
        const data = rowsForExport();
        autoTable(doc, { startY: 57, margin: { top: 48, bottom: 24 }, head: [data.head], body: data.body,
            didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, getCompanySettings(companySettings)); } });
        doc.save('Contabilidade_' + tab + '_' + to + '.pdf');
    };
    const exportExcel = async () => {
        const XLSX = await import('xlsx');
        const data = rowsForExport(); const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([data.head,...data.body]), 'Relatório');
        XLSX.writeFile(workbook, 'Contabilidade_' + tab + '_' + to + '.xlsx');
    };
    const importBank = async (file?: File) => {
        if (!file) return;
        try {
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const items = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);
            const occurrences = new Map<string,number>();
            const parsed = items.map((row,index) => {
                const date = String(row.Data || row.data || '').trim();
                const amount = Number(String(row.Valor ?? row.valor ?? '').replace(/\s/g,'').replace(',','.'));
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (Number.isNaN(new Date(date).getTime()) || new Date(date).toISOString().slice(0,10) !== date) || !Number.isFinite(amount) || !amount ||
                    Math.abs(amount*100 - Math.round(amount*100)) > 0.000001) throw new Error('Linha ' + (index+2) + ' inválida. Use Data AAAA-MM-DD, Valor e Referencia.');
                const reference = String(row.Referencia || row.referencia || '');
                const fingerprint = JSON.stringify([date,Math.round(amount*100),reference]);
                const occurrence = occurrences.get(fingerprint) || 0; occurrences.set(fingerprint,occurrence+1);
                return { id: 'bank:'+fingerprint+':'+occurrence, date, amountMinor: Math.round(amount*100), reference };
            });
            if(!user) throw new Error('Inicie sessão para importar.');
            const savedId=await ServicoExtratosBancarios.save(parsed,file.name,{id:user.id,name:user.name});
            setBankImports(await ServicoExtratosBancarios.list());setBankImportId(savedId);
            setBank(parsed); setNote('Extrato guardado no histórico. Correspondências ambíguas exigem revisão; nenhum pagamento é criado automaticamente.');
        } catch (e: any) { setError(e.message || 'Extrato inválido.'); }
    };

    return <section className="mb-6 space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Controlos de Contabilidade e Auditoria</h2>
            <Button disabled={busy} onClick={() => void refresh()}>{busy ? 'A verificar…' : 'Verificar integridade'}</Button></div>
        <p className="text-sm text-muted-foreground">Verificação ao abrir esta página, após movimentos e a cada 24 horas enquanto estiver aberta. Última verificação: {report ? new Date(report.checkedAt).toLocaleString('pt-AO') : 'Ainda não concluída'}.</p>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">{[['month','Este mês'],['previous','Mês anterior'],['year','Este ano'],['all','Todo o histórico']].map(([key,label]) => <Button key={key} variant="outline" onClick={() => {
            const today = new Date(Date.now() + 3600000).toISOString().slice(0,10);
            const [year,month] = today.split('-').map(Number);
            if (key === 'previous') {
                const last = new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,10);
                setFrom(last.slice(0,7)+'-01'); setTo(last);
            } else { setFrom(key === 'year' ? year+'-01-01' : key === 'all' ? '1900-01-01' : today.slice(0,7)+'-01'); setTo(today); }
        }}>{label}</Button>)}</div>
        <div className="flex flex-wrap items-center gap-3"><label>De <Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>Até <Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            <Button variant="outline" disabled={!report || from > to || !['balances','aging','audit','issues','profit'].includes(tab)} onClick={exportPdf}>PDF</Button><Button variant="outline" disabled={!report || from > to || !['balances','aging','audit','issues','profit'].includes(tab)} onClick={() => void exportExcel()}>Excel</Button></div>
        <div className="flex flex-wrap gap-2">{[['balances','Balancete'],['reports','Relatórios do razão'],['accounts','Plano de contas'],['results','Resultados'],['profit','Rentabilidade'],['collection','Cobrança e gestores'],['aging','Carteira e provisões'],['forecast','Fluxo previsto'],['cash','Caixa por operador'],['treasury','Tesouraria e provisões'],['writeoffs','Abates e recuperação'],['bank','Reconciliação bancária'],['issues','Divergências ('+(report?.findings.length || 0)+')'],['audit','Auditoria'],['backup','Cópias de segurança']].map(([key,label]) =>
            <Button key={key} variant={tab === key ? 'default' : 'outline'} onClick={() => setTab(key)}>{label}</Button>)}</div>
        {tab === 'balances' && <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Conta','Débito','Crédito','Saldo devedor'].map(t => <th className="p-2 text-left" key={t}>{t}</th>)}</tr></thead><tbody>
            {balances.map(b => <tr className="border-t" key={b.account}><td className="p-2">{accountCatalog[b.account]?.name || ACCOUNT_NAMES[b.account] || b.account}</td><td>{money(b.debitMinor)}</td><td>{money(b.creditMinor)}</td><td>{money(b.balanceMinor)}</td></tr>)}
        </tbody></table><p className="mt-3 text-sm">Diferença entre débitos e créditos: {money(balances.reduce((s,b)=>s+b.debitMinor-b.creditMinor,0))}</p></div>}
        {tab === 'accounts' && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Mapeie as contas técnicas do sistema para os códigos e nomes aprovados pelo contabilista. Alterar esta nomenclatura não altera lançamentos nem saldos históricos.</p>
            {Object.entries(ACCOUNT_NAMES).map(([account,name])=><div key={account} className="grid gap-2 border-t py-2 sm:grid-cols-3">
                <span className="self-center">{name}</span><Input aria-label={'Código de '+name} disabled={!admin} placeholder="Código PGC/PCIFB a configurar" value={accountCatalog[account]?.code || ''}
                    onChange={e=>setAccountCatalog(prev=>({...prev,[account]:{code:e.target.value,name:prev[account]?.name || name}}))} />
                <Input aria-label={'Nome de '+name} disabled={!admin} value={accountCatalog[account]?.name || name}
                    onChange={e=>setAccountCatalog(prev=>({...prev,[account]:{code:prev[account]?.code || '',name:e.target.value}}))} />
            </div>)}
            {admin && <Button onClick={async()=>{
                try { await ServicoDefinicoesPartilhadas.set('accounting_account_catalog',JSON.stringify(accountCatalog),user!.name); setNote('Plano de contas guardado e partilhado pela nuvem.'); }
                catch(e:any) { setError(e.message); }
            }}>Guardar plano de contas</Button>}{note && <p>{note}</p>}
        </div>}
        {tab === 'results' && (() => {
            const income=balances.filter(b=>REVENUE_ACCOUNTS.has(b.account))
                .reduce((sum,b)=>sum+b.creditMinor-b.debitMinor,0);
            const expenses=balances.filter(b=>EXPENSE_ACCOUNTS.has(b.account)).reduce((sum,b)=>sum+b.debitMinor-b.creditMinor,0);
            const paidInPeriod=payments.filter(p=>!p.deletedAt && p.status==='confirmed' && new Date(p.paymentDate).toISOString().slice(0,10)>=from && new Date(p.paymentDate).toISOString().slice(0,10)<=to);
            const interestCash=paidInPeriod.reduce((sum,p)=>sum+(p.allocatedToInterestMinor ?? Math.round(p.allocatedToInterest*100)),0);
            const lateCash=paidInPeriod.reduce((sum,p)=>sum+(p.allocatedToLateInterestMinor ?? Math.round(p.allocatedToLateInterest*100)),0);
            return <div className="space-y-3"><p>Receita reconhecida no razão: <strong>{money(income)}</strong></p><p>Juros efetivamente recebidos no período: <strong>{money(interestCash)}</strong></p>
                <p>Mora efetivamente recebida no período: <strong>{money(lateCash)}</strong></p><p>Despesas e perdas contabilizadas: <strong>{money(expenses)}</strong></p>
                <p>Resultado contabilístico das contas incluídas: <strong>{money(income-expenses)}</strong></p>
                <p className="text-sm text-muted-foreground">O saldo reconhecido e o recebido são bases distintas. Provisões apenas estimadas não são despesas contabilizadas. A carteira em risco está no separador Carteira e provisões.</p></div>;
        })()}
        {tab === 'profit' && <div className="space-y-3">
            <label>Agrupar por<select className="ml-2 rounded border bg-background p-2" value={profitDimension} onChange={e => setProfitDimension(e.target.value as 'method' | 'agent')}><option value="method">Modalidade de amortização</option><option value="agent">Responsável pela concessão</option></select></label>
            <p className="text-sm text-muted-foreground">Previsão usa juros das prestações com vencimento no período; recebimentos usam a data efetiva do pagamento. A margem resulta das receitas menos despesas e perdas do razão. Despesas gerais ficam sem atribuição, sem rateio arbitrário. A contagem de créditos abrange a base consultada. Modalidades de amortização não substituem um catálogo comercial de produtos.</p>
            {report && <div className="grid gap-3 sm:grid-cols-3">{[
                ['Juros previstos',profitRows.reduce((sum,row)=>sum+row.expectedMinor,0)],
                ['Juros recebidos',profitRows.reduce((sum,row)=>sum+row.receivedMinor,0)],
                ['Margem contabilística',profitRows.reduce((sum,row)=>sum+row.marginMinor,0)]
            ].map(([label,value]) => <div className="rounded-lg border p-3" key={label}><p className="text-sm text-muted-foreground">{label}</p><strong>{money(Number(value))}</strong></div>)}</div>}
            {!report ? <p>A aguardar a verificação contabilística.</p> : <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{rowsForExport().head.map(label => <th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rowsForExport().body.map((row, index) => <tr className="border-t" key={index}>{row.map((value, column) => <td className="p-2" key={column}>{value}</td>)}</tr>)}</tbody></table></div>}
        </div>}
        {tab === 'collection' && <CobrancaOperacional installments={report?.installments || []} from={from} to={to} />}
        {tab === 'aging' && <div className="space-y-3"><p>PAR30: {aging.par30.toFixed(2)}% · Capital em atraso: {aging.defaultRate.toFixed(2)}%</p>
            <p className="text-sm text-muted-foreground">Percentagens de gestão configuráveis. Não constituem provisões contabilizadas nem taxas regulamentares validadas.</p>
            {aging.buckets.map((b,i) => <div key={b.label} className="flex flex-wrap items-center gap-3 border-t py-2"><span className="min-w-32">{b.label}</span><span>{b.count} créditos · {money(b.principalMinor)}</span>
                <Input aria-label={'Taxa de provisão '+b.label} type="number" min={0} max={100} disabled={!admin} value={rates[i]} className="w-24" onChange={e => {
                    const value = Number(e.target.value); if (!Number.isFinite(value) || value < 0 || value > 100) return;
                    const next = [...rates]; next[i]=value; setRates(next); setScopedLocalStorageItem('accounting_provision_rates', JSON.stringify(next));
                }} /><span>% · Provisão estimada: {money(b.provisionMinor)}</span></div>)}</div>}
        {tab === 'forecast' && <div className="grid gap-3 sm:grid-cols-4">{[7,30,60,90].map(days => {
            const today = new Date(); const end = new Date(); end.setDate(end.getDate()+days);
            const due = (report?.installments || []).filter((i:any) => new Date(i.dueDate) >= today && new Date(i.dueDate) <= end)
                .reduce((sum:number,i:any) => sum + Math.max(0,Number(i.principalMinor)+Number(i.interestMinor)+Number(i.lateInterestMinor || 0)-Number(i.paidPrincipalMinor || 0)-Number(i.paidInterestMinor || 0)-Number(i.paidLateInterestMinor || 0)),0);
            const planned = credits.filter(c=>c.status==='pending_approval').reduce((sum,c)=>sum+(c.principalAmountMinor ?? Math.round(c.principalAmount*100)),0);
            return <div key={days} className="rounded-xl border p-4"><p className="font-bold">{days} dias</p><p>Prestações: {money(due)}</p><p className="text-xs text-muted-foreground">Créditos por aprovar sem data de desembolso: {money(planned)} (não deduzidos).</p></div>;
        })}</div>}
        {tab === 'reports' && <RelatoriosRazao report={report} from={from} to={to} />}
        {tab === 'treasury' && <LancamentosTesouraria onSaved={refresh} />}
        {tab === 'cash' && <CaixaOperador />}
        {tab === 'writeoffs' && <PedidosAbate />}
        {tab === 'bank' && <div className="space-y-3"><p className="text-sm">Importe CSV/Excel com colunas Data (AAAA-MM-DD), Valor (positivo para entrada) e Referencia (ID do pagamento). Compare apenas o mesmo intervalo.</p>
            <label>Extrato guardado<select className="ml-2 rounded border bg-background p-2" value={bankImportId} onChange={e=>{setBankImportId(e.target.value);const saved=bankImports.find(x=>x.id===e.target.value);setBank(saved?JSON.parse(saved.movements):[]);}}><option value="">Selecione um extrato</option>{bankImports.map(saved=><option key={saved.id} value={saved.id}>{saved.fileName} · {new Date(saved.importedAt).toLocaleString('pt-AO')}</option>)}</select></label>
            <Input type="file" accept=".csv,.xlsx,.xls" onChange={e => void importBank(e.target.files?.[0])} />{note && <p>{note}</p>}
            {bank.length > 0 && <DecisoesDivergencias items={[
                ...reconciliation.bank.filter(r=>r.state!=='matched').map(r=>({id:r.id,source:'bank',description:r.date+' · '+money(r.amountMinor)+' · '+r.reference+' · '+(r.state==='ambiguous'?'Correspondência ambígua':'Sem registo no sistema')})),
                ...reconciliation.unmatchedSystem.map(r=>({id:'system-bank:'+r.id,source:'bank',description:r.date+' · '+money(r.amountMinor)+' · Pagamento '+r.id+' sem correspondência no extrato'}))
            ]} />}
            {bank.length > 0 && <><p>{reconciliation.bank.filter(r=>r.state==='matched').length} correspondências · {reconciliation.unmatchedSystem.length} pagamentos sem correspondência no extrato.</p>
                {reconciliation.bank.filter(r=>r.state!=='matched').map(r=><p key={r.id} className="border-t p-2">{r.date} · {money(r.amountMinor)} · {r.reference} · {r.state==='ambiguous'?'Correspondência ambígua':'Sem registo correspondente'}</p>)}</>}
        </div>}
        {tab === 'issues' && <div className="space-y-2"><DecisoesDivergencias items={(report?.findings || []).map(f=>({id:'integrity:'+f.id,source:'integrity',description:f.message+(f.entityId?' · '+f.entityId:'')}))} />{admin && <Button variant="outline" disabled={busy} onClick={async () => {
                setBusy(true); setError('');
                try { const count = await ServicoIntegridadeContabilistica.migrateHistorical(user!.id,user!.name); setNote(count + ' lançamentos históricos migrados.'); await refresh(); }
                catch (e: any) { setError(e.message); } finally { setBusy(false); }
            }}>Gerar linhas históricas comprovadas</Button>}{note && <p>{note}</p>}{!report ? <p>Verificação pendente.</p> : !report.findings.length ? <p>Sem divergências nos controlos executados.</p> :
            report.findings.map(f => <p key={f.id} className={'rounded border p-3 '+(f.severity==='error'?'text-destructive':'text-amber-700')}>{f.entityId && <strong>{f.entityId}: </strong>}{f.message}</p>)}</div>}
        {tab === 'audit' && <div className="space-y-3"><Input placeholder="Filtrar utilizador, módulo, ação ou detalhes…" value={auditSearch} onChange={e=>setAuditSearch(e.target.value)} />
            <div className="flex flex-wrap gap-3">
                <label>Utilizador<select className="ml-2 rounded border bg-background p-2" value={auditUser} onChange={e=>setAuditUser(e.target.value)}><option value="">Todos</option>{Array.from(new Set(allAudit.map(l=>String(l.userId || '')))).filter(Boolean).map(id=><option key={id} value={id}>{allAudit.find(l=>l.userId===id)?.userName || id}</option>)}</select></label>
                <label>Módulo<select className="ml-2 rounded border bg-background p-2" value={auditModule} onChange={e=>setAuditModule(e.target.value)}><option value="">Todos</option>{Array.from(new Set(allAudit.map(l=>String(l.entity || '')))).filter(Boolean).map(value=><option key={value} value={value}>{auditModuleNames[value] || value}</option>)}</select></label>
                <label>Ação<select className="ml-2 rounded border bg-background p-2" value={auditAction} onChange={e=>setAuditAction(e.target.value)}><option value="">Todas</option>{Array.from(new Set(allAudit.map(l=>String(l.action || '')))).filter(Boolean).map(value=><option key={value} value={value}>{auditActionNames[value] || value}</option>)}</select></label>
            </div>{admin && <Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const count=await ServicoCadeiaAuditoria.migrateLegacy({id:user!.id,name:user!.name,role:user!.role});setNote(count+' registos históricos encadeados. A migração cria uma referência inicial e não comprova integridade anterior.');await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>Encadear auditoria histórica</Button>}{note && <p className="text-sm">{note}</p>}
            <p className="text-xs text-muted-foreground">{report ? 'Histórico completo carregado na última verificação, filtrado pelo período selecionado.' : 'Verificação pendente; a mostrar apenas os registos da sessão.'}</p>
            {audit.map(l=><div key={l.id} className="border-t py-2 text-sm"><strong>{l.userName}</strong> · {new Date(l.timestamp).toLocaleString('pt-AO')} · {auditActionNames[l.action] || l.action} · {auditModuleNames[l.entity] || l.entity}<p>{l.details}</p></div>)}</div>}
        {tab === 'backup' && <div><p>Backup automático: {ServicoAutoBackup.getConfig().enabled?'Ativo':'Desativado'} · Última cópia: {ServicoAutoBackup.getConfig().lastAutoBackupTimestamp || 'Sem confirmação'}</p>
            <p className="text-sm text-muted-foreground">Configure o horário e a retenção em Definições. As cópias do aplicativo dependem de ele estar aberto.</p></div>}
    </section>;
}
