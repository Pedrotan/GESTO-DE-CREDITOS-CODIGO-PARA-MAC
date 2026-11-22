import { useEffect, useMemo, useState } from 'react';
import { Hash, ListOrdered, RefreshCw } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { cn } from '@/bibliotecas/utils';
import { ServicoRH, type ActorRH } from '@/servicos/rh/ServicoRH';
import { gerarNumeroComSigla, normalizarSigla, validarSigla, type FormatoNumero } from '@/bibliotecas/rh/numero-mecanografico';
import { executar, useCarregar } from '@/componentes/rh/comum-rh';

/** Configurações de RH › Numeração dos funcionários: formato do n.º mecanográfico e sigla da empresa. */
export function NumeracaoFuncionarios({ actor, podeEditar, nomeEmpresa, onSaved }: {
    actor: ActorRH | null; podeEditar: boolean; nomeEmpresa?: string | null; onSaved: () => void;
}) {
    const definicoes = useCarregar(() => ServicoRH.definicoesNumeracao(nomeEmpresa), null as Awaited<ReturnType<typeof ServicoRH.definicoesNumeracao>> | null, [nomeEmpresa]);
    const [formato, setFormato] = useState<FormatoNumero>('sigla');
    const [sigla, setSigla] = useState('');
    const [exemploSemente, setExemploSemente] = useState(0);
    useEffect(() => {
        if (!definicoes.dados) return;
        setFormato(definicoes.dados.formato);
        setSigla(definicoes.dados.sigla);
    }, [definicoes.dados]);

    const erroSigla = formato === 'sigla' ? validarSigla(sigla) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const exemplo = useMemo(() => (formato === 'sigla' ? gerarNumeroComSigla(erroSigla ? 'SIGLA' : sigla) : '0001, 0002, 0003…'), [formato, sigla, erroSigla, exemploSemente]);
    const alterado = definicoes.dados ? formato !== definicoes.dados.formato || (formato === 'sigla' && sigla !== definicoes.dados.sigla) || (formato === 'sigla' && !definicoes.dados.siglaGuardada) : false;

    const opcao = (valor: FormatoNumero, titulo: string, descricao: string, Icone: typeof Hash) => (
        <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
            formato === valor ? 'border-indigo-500 bg-indigo-50/60 dark:border-indigo-400 dark:bg-slate-800' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900')}>
            <input type="radio" name="formato-numero" className="mt-1" checked={formato === valor} disabled={!podeEditar} onChange={() => setFormato(valor)} />
            <Icone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span><span className="block font-bold">{titulo}</span><span className="text-xs text-slate-500">{descricao}</span></span>
        </label>
    );

    return (
        <div className="space-y-4">
            <p className="text-xs text-slate-500">
                Formato do n.º mecanográfico. Com a sigla, os funcionários já registados também passam ao formato novo e o número anterior continua a ser aceite pelo relógio de ponto. Nenhum número se repete:
                o sistema confirma na base antes de o atribuir e a base recusa números iguais, também os que chegam de outros dispositivos pela sincronização.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
                {opcao('sigla', 'Aleatório com a sigla da empresa', '4 algarismos aleatórios, a sigla e mais 4 algarismos (ex.: 4821-BRV-0937).', Hash)}
                {opcao('sequencial', 'Sequencial', 'Números seguidos com 4 algarismos (0001, 0002…), como até agora.', ListOrdered)}
            </div>
            {formato === 'sigla' && (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-start">
                    <div>
                        <Label htmlFor="sigla-empresa" className="text-xs font-bold">Sigla da empresa</Label>
                        <Input id="sigla-empresa" className="mt-1 font-mono uppercase" value={sigla} maxLength={5} disabled={!podeEditar}
                            aria-invalid={Boolean(erroSigla)} aria-describedby="sigla-ajuda" onChange={e => setSigla(normalizarSigla(e.target.value))} />
                        <p id="sigla-ajuda" className={cn('mt-1 text-xs', erroSigla ? 'text-red-600' : 'text-slate-500')}>
                            {erroSigla || (definicoes.dados && !definicoes.dados.siglaGuardada ? `Sugerida a partir do nome da empresa (${nomeEmpresa || '—'}).` : '2 a 5 letras ou algarismos.')}
                        </p>
                        {definicoes.dados && sigla !== definicoes.dados.siglaSugerida && podeEditar && (
                            <button type="button" className="mt-1 text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300" onClick={() => setSigla(definicoes.dados!.siglaSugerida)}>
                                Usar a sugestão: {definicoes.dados.siglaSugerida}
                            </button>
                        )}
                    </div>
                    <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                        <div className="text-xs text-slate-500">Exemplo do próximo número</div>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="font-mono text-lg font-bold tracking-wide" aria-live="polite">{exemplo}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Outro exemplo" onClick={() => setExemploSemente(v => v + 1)}><RefreshCw className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </div>
            )}
            {formato === 'sequencial' && <p className="rounded-xl bg-slate-50 px-3 py-2 font-mono text-sm dark:bg-slate-900">{exemplo}</p>}
            {podeEditar && actor ? (
                <Button disabled={!alterado || Boolean(erroSigla)} onClick={async () => {
                    const ok = await executar(async () => {
                        await ServicoRH.guardarNumeracao({ formato, sigla }, actor);
                        await ServicoRH.converterNumeracao(nomeEmpresa, actor);
                    }, 'Numeração guardada e aplicada aos funcionários');
                    if (ok) { void definicoes.recarregar(); onSaved(); }
                }}>Guardar numeração</Button>
            ) : (
                <p className="text-xs text-slate-500">Alterar a numeração exige a permissão «RH: Configurações legais».</p>
            )}
        </div>
    );
}
