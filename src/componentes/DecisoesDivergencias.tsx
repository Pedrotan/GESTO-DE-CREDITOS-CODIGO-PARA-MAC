import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from 'jspdf-autotable';
import { applyBranding, getCompanySettings } from '@/bibliotecas/pdf';
import { useData } from '@/contextos/ContextoDados';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { ServicoDivergencias, type DivergenceDecision, type DivergenceState } from '@/servicos/ServicoDivergencias';
export type DivergenceItem = { id: string; source: string; description: string };
const labels: Record<DivergenceState,string> = { pending: 'Pendente', justified: 'Justificada', resolved: 'Resolvida' };
export function DecisoesDivergencias({ items }: { items: DivergenceItem[] }) {
    const { user } = useAuth();
    const { companySettings } = useData();
    const [events,setEvents] = useState<DivergenceDecision[]>([]);
    const [reasons,setReasons] = useState<Record<string,string>>({});
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const load = async () => setEvents(await ServicoDivergencias.list());
    useEffect(() => { void load().catch(e=>setError(e.message)); }, []);
    const latest = new Map<string,DivergenceDecision>();
    for (const event of events) if (!latest.has(event.issueKey)) latest.set(event.issueKey,event);
    const allowed = ['admin','super_admin'].includes(user?.role || '');
    const decide = async (item: DivergenceItem,state: DivergenceState) => {
        if (!user || !allowed || busy) return;
        setBusy(true); setError('');
        try {
            await ServicoDivergencias.decide({ issueKey:item.id, previousId:latest.get(item.id)?.id || '', source:item.source,
                description:item.description, state, reason:reasons[item.id] || '', actorId:user.id,actorName:user.name });
            await load();
            setReasons(prev=>({...prev,[item.id]:''}));
        } catch(e:any) { setError(e.message || 'Não foi possível guardar a decisão. Atualize o histórico antes de tentar novamente.'); }
        finally { setBusy(false); }
    };
    const exportRows = () => events.map(event=>[new Date(event.createdAt).toLocaleString('pt-AO'),event.source==='bank'?'Reconciliação bancária':'Integridade',event.description,labels[event.state],event.actorName,event.reason]);
    const headers=['Data','Origem','Divergência','Estado','Responsável','Justificação'];
    const exportPdf = () => {
        const doc=new jsPDF({orientation:'landscape'});
        applyBranding(doc,getCompanySettings(companySettings));
        doc.setFontSize(14); doc.text('Histórico de decisões sobre divergências',15,48);
        autoTable(doc,{startY:56,head:[headers],body:exportRows(),margin:{top:48,bottom:24},
            didDrawPage:hook=>{if(hook.pageNumber>1) applyBranding(doc,getCompanySettings(companySettings));}});
        doc.save('historico-divergencias.pdf');
    };
    const exportExcel = async () => {
        try {
            const XLSX=await import('xlsx'), book=XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...exportRows()]),'Decisões');
            XLSX.writeFile(book,'historico-divergencias.xlsx');
        } catch(e:any) {setError(e.message || 'Não foi possível exportar.');}
    };
    const currentIds = new Set(items.map(item=>item.id));
    return <div className="space-y-3">
        <p className="text-sm text-muted-foreground">As decisões são guardadas com utilizador, motivo e data. Justificar ou resolver uma divergência não altera saldos nem elimina os alertas que a verificação continuar a detetar.</p>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button variant="outline" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Atualizar histórico de decisões</Button>
        {items.map(item=>{
            const last=latest.get(item.id);
            return <div key={item.id} className="rounded-lg border p-3 space-y-2">
                <p className="font-medium">{item.description}</p><p className="text-sm">Estado: {labels[last?.state || 'pending']}</p>
                {last && <p className="text-sm text-muted-foreground">{last.actorName} · {new Date(last.createdAt).toLocaleString('pt-AO')} · {last.reason}</p>}
                {allowed && <><Input aria-label={'Justificação: '+item.description} placeholder="Motivo da decisão (mínimo 10 caracteres)" value={reasons[item.id] || ''} onChange={e=>setReasons(prev=>({...prev,[item.id]:e.target.value}))} />
                    <div className="flex flex-wrap gap-2">{(['pending','justified','resolved'] as const).map(state=><Button key={state} variant="outline" disabled={busy || (reasons[item.id] || '').trim().length<10} onClick={()=>void decide(item,state)}>{labels[state]}</Button>)}</div></>}
            </div>;
        })}
        {[...latest.values()].filter(event=>!currentIds.has(event.issueKey)).length>0 && <p className="font-semibold">Decisões sobre ocorrências anteriores</p>}
        {[...latest.values()].filter(event=>!currentIds.has(event.issueKey)).map(event=><div key={event.id} className="border-t py-2 text-sm"><strong>{labels[event.state]}</strong> · {event.description}<p>{event.actorName} · {new Date(event.createdAt).toLocaleString('pt-AO')} · {event.reason}</p><p className="text-muted-foreground">Fora da lista atual; a ausência não confirma, por si só, a resolução.</p></div>)}
        {events.length>0 && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportPdf}>Histórico em PDF</Button><Button variant="outline" onClick={()=>void exportExcel()}>Histórico em Excel</Button></div>}
        {events.length>0 && <details><summary className="cursor-pointer font-medium">Histórico completo ({events.length} decisões)</summary>{events.map(event=><p key={event.id} className="border-t py-2 text-sm">{new Date(event.createdAt).toLocaleString('pt-AO')} · {event.actorName} · {event.description} · {labels[event.state]} · {event.reason}</p>)}</details>}
    </div>;
}