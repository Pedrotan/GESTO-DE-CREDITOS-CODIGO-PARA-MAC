// Portal do funcionário › Os meus documentos: a própria pasta (só os não confidenciais), em leitura, e carregamento
// nas subpastas permitidas (Identificação e Formação e certificados). O processo principal confirma tudo.
import { useRef, useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Download, Upload } from 'lucide-react';
import { ServicoRH, type ActorRH, type DocumentoRH, type Funcionario, type CategoriaDocumento } from '@/servicos/rh/ServicoRH';
import { PASTAS_PESSOAIS, pastaDoDocumento } from '@/servicos/rh/ServicoDocumentosRH';
import { PORTAL_PASTAS_CARREGAMENTO } from '@/bibliotecas/rh/permissoes-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { abrirDataUrl, dataPt, executar, lerFicheiro, useCarregar, Vazio } from './comum-rh';

export function MeusDocumentos({ f, actor }: { f: Funcionario; actor: ActorRH }) {
    const docs = useCarregar(() => ServicoRH.documentos(f.id), [] as DocumentoRH[], [f.id]);
    const [pasta, setPasta] = useState(Object.keys(PORTAL_PASTAS_CARREGAMENTO)[1]);
    const [validade, setValidade] = useState('');
    const ficheiro = useRef<HTMLInputElement>(null);
    const visiveis = docs.dados.filter(d => d.estado === 'activo' && !d.confidencial);
    const nomePasta = (p: string) => PASTAS_PESSOAIS.find(x => `sys:${x.chave}` === p)?.nome || 'Outros documentos';
    const carregar = async (fx: File | undefined) => {
        if (!fx) return;
        await executar(async () => {
            // Nome único (com a data e a hora) para não substituir documentos já validados pelo RH.
            const nome = `${fx.name.replace(/\.[^.]+$/u, '')} (${dataPt(luandaTodayKey())} ${new Date().toTimeString().slice(0, 5)})`;
            await ServicoRH.carregarDocumento({ funcionario_id: f.id, categoria: PORTAL_PASTAS_CARREGAMENTO[pasta] as CategoriaDocumento, nome, ficheiro_nome: fx.name,
                data_url: await lerFicheiro(fx), data_validade: validade || null, confidencial: false, pasta_id: pasta, origem: 'portal' }, 5, actor);
        }, 'Documento enviado para a sua pasta');
        setValidade('');
        void docs.recarregar();
    };
    return (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 font-black">Os meus documentos</h2>
            {visiveis.length === 0 ? <Vazio>Ainda não há documentos na sua pasta.</Vazio> : (
                <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1">Documento</th><th>Pasta</th><th>Validade</th><th /></tr></thead>
                    <tbody>{visiveis.map(d => (
                        <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="py-1.5 font-semibold">{d.nome}</td><td>{nomePasta(pastaDoDocumento(d))}</td><td>{dataPt(d.data_validade)}</td>
                            <td className="text-right"><Button size="icon" variant="ghost" aria-label={`Abrir ${d.nome}`} onClick={() => void ServicoRH.ficheiroDocumento(d.id).then(u => u && abrirDataUrl(u, d.ficheiro_nome)).catch(e => executar(() => Promise.reject(e), ''))}><Download className="h-4 w-4" /></Button></td>
                        </tr>
                    ))}</tbody>
                </table>
            )}
            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div><label htmlFor="md-pasta" className="text-xs font-bold">Enviar para</label>
                    <Select value={pasta} onValueChange={setPasta}>
                        <SelectTrigger id="md-pasta" className="mt-1 w-56"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.keys(PORTAL_PASTAS_CARREGAMENTO).map(p => <SelectItem key={p} value={p}>{nomePasta(p)}</SelectItem>)}</SelectContent>
                    </Select></div>
                <div><label htmlFor="md-val" className="text-xs font-bold">Validade (opcional)</label><Input id="md-val" type="date" className="mt-1" value={validade} onChange={e => setValidade(e.target.value)} /></div>
                <Button onClick={() => ficheiro.current?.click()}><Upload className="mr-1.5 h-4 w-4" /> Enviar documento</Button>
                <input ref={ficheiro} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={e => { void carregar(e.target.files?.[0]); e.target.value = ''; }} />
                <p className="w-full text-xs text-slate-500">PDF ou imagem até 5 MB. Ex.: certificados, diplomas, novo BI. O RH vê o documento na sua pasta.</p>
            </div>
        </section>
    );
}
