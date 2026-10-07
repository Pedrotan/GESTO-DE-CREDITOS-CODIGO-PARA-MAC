import { useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { db } from '@/bibliotecas/bd';
import { validateReceipt } from '@/bibliotecas/comprovativo-despesa';
export function ComprovativoDespesa({entryId}:{entryId:string}) {
    const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const download=async()=>{setBusy(true);setMessage('');try{
        const receipt=await db.get<{fileName:string;mime:string;data:string;digest:string}>('SELECT fileName,mime,data,digest FROM accounting_receipts WHERE entryId = ?',[entryId]);
        if(!receipt){setMessage('Sem comprovativo anexado.');return;}
        validateReceipt({name:receipt.fileName,mime:receipt.mime,data:receipt.data});
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(receipt.data)))).map(b=>b.toString(16).padStart(2,'0')).join('');
        if(digest!==receipt.digest)throw new Error('A integridade do comprovativo falhou. Consulte a auditoria.');
        const bytes=Uint8Array.from(atob(receipt.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:receipt.mime}));
        const link=document.createElement('a');link.href=url;link.download=receipt.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e:any){setMessage(e.message || 'Não foi possível carregar.');}finally{setBusy(false);}};
    return <span className="block"><Button variant="ghost" size="sm" disabled={busy} onClick={()=>void download()}>{busy?'A carregar…':'Comprovativo'}</Button>{message && <span role="status" className="block text-xs text-muted-foreground">{message}</span>}</span>;
}