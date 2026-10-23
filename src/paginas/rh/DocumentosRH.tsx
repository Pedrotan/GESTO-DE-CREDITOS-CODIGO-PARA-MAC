import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { CATEGORIAS_DOCUMENTO, ServicoRH, type DocumentoRH } from '@/servicos/rh/ServicoRH';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { addDaysToKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { ArquivoDocumentos } from '@/componentes/rh/ArquivoDocumentos';
import { Indicador, NavegacaoRH, useCarregar } from '@/componentes/rh/comum-rh';
import { useBaseRH } from './FuncionariosRH';

const TODOS = '__todos__';

/** Arquivo digital de todos os funcionários, com pesquisa por categoria e por validade. */
export default function DocumentosRH() {
    const { actor, gerir, confidencial } = useActorRH();
    const base = useBaseRH();
    const documentos = useCarregar(() => ServicoRH.documentos(), [] as DocumentoRH[]);
    const [funcionario, setFuncionario] = useState(TODOS);
    const [categoria, setCategoria] = useState(TODOS);
    const [expiraEm, setExpiraEm] = useState('');
    const hoje = luandaTodayKey();
    const maxMb = valorNumerico(base.dados.parametros, 'documento_max_mb', hoje, 2);

    const activos = documentos.dados.filter(d => d.estado === 'activo' && (confidencial || !d.confidencial));
    const limite = expiraEm ? addDaysToKey(hoje, Number(expiraEm)) : null;
    const filtrados = useMemo(() => documentos.dados.filter(d => (funcionario === TODOS || d.funcionario_id === funcionario) &&
        (categoria === TODOS || d.categoria === categoria) && (!limite || (d.estado === 'activo' && d.data_validade && d.data_validade <= limite))),
    [documentos.dados, funcionario, categoria, limite]);

    return (
        <MainLayout title="Documentos de RH" subtitle="Arquivo digital por funcionário, com validade e alertas">
            <NavegacaoRH />
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Indicador titulo="Documentos activos" valor={activos.length} />
                <Indicador titulo="Expiram em 30 dias" tom="orange" valor={activos.filter(d => d.data_validade && d.data_validade >= hoje && d.data_validade <= addDaysToKey(hoje, 30)).length} />
                <Indicador titulo="Expirados" tom="red" valor={activos.filter(d => d.data_validade && d.data_validade < hoje).length} />
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Select value={funcionario} onValueChange={setFuncionario}>
                    <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={TODOS}>Todos os funcionários</SelectItem>{base.dados.funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={categoria} onValueChange={setCategoria}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={TODOS}>Todas as categorias</SelectItem>{CATEGORIAS_DOCUMENTO.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    Expiram nos próximos <Input className="w-20" type="number" min={0} value={expiraEm} placeholder="dias" onChange={e => setExpiraEm(e.target.value)} /> dias
                </div>
            </div>
            <ArquivoDocumentos documentos={filtrados} funcionarios={base.dados.funcionarios} actor={actor} podeGerir={gerir} podeConfidencial={confidencial}
                maxMb={maxMb} mostrarFuncionario onChange={() => void documentos.recarregar()} />
            <p className="mt-2 text-xs text-slate-500">Para carregar um documento novo, abra a ficha do funcionário (separador Documentos).</p>
        </MainLayout>
    );
}
