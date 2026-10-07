import { useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';

export default function MarcaAguaMaster() {
    const [image,setImage]=useState(()=>localStorage.getItem('tango_master_watermark') || '');
    const [message,setMessage]=useState('');
    const upload=async(file?:File)=>{
        if(!file)return;
        try{
            if(!['image/png','image/jpeg'].includes(file.type) || file.size>2*1024*1024)throw new Error('Escolha PNG ou JPG até 2 MB.');
            const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});
            await new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error('Imagem inválida.'));img.src=data;});
            localStorage.setItem('tango_master_watermark',data);setImage(data);setMessage('Marca de água guardada. Será aplicada em todas as páginas dos PDFs do Master.');
            window.dispatchEvent(new Event('tango-master-watermark-changed'));
        }catch(e:any){setMessage(e.message);}
    };
    return <section className="space-y-4 rounded-2xl border bg-card p-6"><div><h2 className="text-xl font-bold">Marca de água do Master</h2><p className="mt-2 text-sm text-muted-foreground">Carregue o logótipo ou imagem. Os PDFs recebem a marca centrada, com transparência para manter o contrato legível.</p></div><Input aria-label="Adicionar marca de água" type="file" accept="image/png,image/jpeg" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>{image?<div className="flex h-52 items-center justify-center rounded-xl border bg-white p-6"><img src={image} alt="Marca de água configurada" className="max-h-full max-w-full object-contain"/></div>:<p className="text-sm text-muted-foreground">Nenhuma marca de água configurada.</p>}{message&&<p role="status" className="text-sm">{message}</p>}<Button variant="outline" disabled={!image} onClick={()=>{localStorage.removeItem('tango_master_watermark');setImage('');setMessage('Marca de água removida.');window.dispatchEvent(new Event('tango-master-watermark-changed'));}}>Remover marca de água</Button></section>;
}
