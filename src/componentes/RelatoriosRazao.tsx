import { useMemo, useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { buildJournal, accountLedger, trialBalanceForPeriod, incomeStatement, cashFlow } from '@/bibliotecas/relatorios-contabeis';
import { accountDefinition } from '@/bibliotecas/plano-contas';
import { formatCurrency } from '@/bibliotecas/formatters';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from 'jspdf-autotable';
import { applyBranding, getCompanySettings } from '@/bibliotecas/pdf';
import type { ServicoIntegridadeContabilistica } from '@/servicos/ServicoIntegridadeContabilistica';
type Snapshot=Awaited<ReturnType<typeof ServicoIntegridadeContabilistica.scan>>;
const titles:Record<string,string>={journal:'Diário',ledger:'Razão por conta',balance:'Balancete',income:'Demonstração interna de resultados',cash:'Fluxo de caixa'};
export function RelatoriosRazao({report,from,to}:{report:Snapshot|null;from:string;to:string}) {
    const {companySettings}=useData();const [kind,setKind]=useState('balance'),[account,setAccount]=useState('cash'),[error,setError]=useState('');
    const journal=useMemo(()=>report?buildJournal(report.entries,report.transactions,report.lines):[],[report]);
    const range={start:new Date(from+'T00:00:00+01:00'),end:new Date(to+'T23:59:59.999+01:00')};
    const money=(minor:number)=>formatCurrency(minor/100);
    const selected=journal.filter(e=>new Date(e.timestamp)>=range.start && new Date(e.timestamp)<=range.end);
    const data=(()=>{
        if(kind==='journal') return {head:['N.º','Data','Lançamento','Conta','Débito','Crédito'],body:selected.flatMap(e=>e.lines.map(l=>[String(e.sequence),new Date(e.timestamp).toLocaleString('pt-AO'),e.description,accountDefinition(l.account).name,l.side==='debit'?money(l.amountMinor):'',l.side==='credit'?money(l.amountMinor):'']))};
        if(kind==='ledger') {const result=accountLedger(journal,account,range);return {head:['Data','Descrição','Débito','Crédito','Saldo'],body:[['','Saldo inicial','','',money(result.openingMinor)],...result.movements.map(m=>[new Date(m.timestamp).toLocaleString('pt-AO'),m.description,money(m.debitMinor),money(m.creditMinor),money(m.balanceMinor)]),['','Saldo final','','',money(result.closingMinor)]]};}
        if(kind==='income') {const result=incomeStatement(journal,range);return {head:['Grupo','Conta','Valor'],body:[...result.revenue.map(r=>['Receitas',accountDefinition(r.account).name,money(r.amountMinor)]),...result.expenses.map(r=>['Despesas',accountDefinition(r.account).name,money(r.amountMinor)]),['Total','Receitas',money(result.revenueMinor)],['Total','Despesas',money(result.expensesMinor)],['Resultado','Receitas menos despesas',money(result.resultMinor)]]};}
        if(kind==='cash') {const result=cashFlow(journal,range);return {head:['Rubrica','Valor'],body:[['Saldo inicial',money(result.openingMinor)],...result.items.map(r=>[r.label,money(r.amountMinor)]),['Entradas',money(result.inflowMinor)],['Saídas',money(result.outflowMinor)],['Saldo final',money(result.closingMinor)]]};}
        const result=trialBalanceForPeriod(journal,range);return {head:['Conta','Saldo inicial','Débito','Crédito','Saldo final'],body:result.rows.map(r=>[r.name,money(r.openingMinor),money(r.debitMinor),money(r.creditMinor),money(r.closingMinor)])};
    })();
    const exportPdf=()=>{
        try{const doc=new jsPDF({orientation:'landscape'});applyBranding(doc,getCompanySettings(companySettings));doc.setFontSize(14);doc.text(titles[kind]+' · '+from+' a '+to,15,48);
            autoTable(doc,{startY:56,head:[data.head],body:data.body,margin:{top:48,bottom:24},didDrawPage:hook=>{if(hook.pageNumber>1)applyBranding(doc,getCompanySettings(companySettings));}});doc.save('relatorio-'+kind+'-'+to+'.pdf');}
        catch(e:any){setError(e.message || 'Não foi possível exportar o PDF.');}
    };
    const exportExcel=async()=>{try{const XLSX=await import('xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[titles[kind],from,to],data.head,...data.body]),'Relatório');XLSX.writeFile(book,'relatorio-'+kind+'-'+to+'.xlsx');}catch(e:any){setError(e.message || 'Não foi possível exportar.');}};
    return <div className="space-y-3"><div className="flex flex-wrap gap-3"><select className="rounded border bg-background p-2" aria-label="Relatório contabilístico" value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(titles).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select>
        {kind==='ledger' && <select className="rounded border bg-background p-2" aria-label="Conta do razão" value={account} onChange={e=>setAccount(e.target.value)}>{Array.from(new Set(['cash','bank',...journal.flatMap(e=>e.lines.map(l=>l.account))])).map(id=><option key={id} value={id}>{accountDefinition(id).name}</option>)}</select>}
        <Button disabled={!report || from>to} onClick={exportPdf}>PDF</Button><Button variant="outline" disabled={!report || from>to} onClick={()=>void exportExcel()}>Excel</Button></div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <p className="text-sm text-muted-foreground">Relatórios a partir das linhas do razão. Saldos iniciais incluem os movimentos anteriores ao período. Lançamentos históricos ainda sem linhas exigem migração antes de obter um relatório completo. A demonstração interna não substitui documentos regulamentares validados pelo contabilista.</p>
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{data.head.map(h=><th className="p-2 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{data.body.map((row,i)=><tr className="border-t" key={i}>{row.map((cell,j)=><td className="p-2" key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
    </div>;
}