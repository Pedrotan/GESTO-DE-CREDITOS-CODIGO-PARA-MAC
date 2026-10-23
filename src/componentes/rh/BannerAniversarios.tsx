import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { useModuloRH } from '@/ganchos/usar-modulo-rh';
import { ServicoAlertasRH, type AlertaRH } from '@/servicos/rh/ServicoAlertasRH';
import { ServicoRH } from '@/servicos/rh/ServicoRH';
import { EVENTO_ALERTAS_RH } from './TarefaDiariaRH';

/** Banner do dia com os aniversariantes (nome e fotografia), visível a todos os utilizadores da empresa. */
export function BannerAniversarios() {
    const { activo } = useModuloRH();
    const [lista, setLista] = useState<Array<AlertaRH & { foto?: string | null }>>([]);
    useEffect(() => {
        if (!activo) return;
        const carregar = async () => {
            const alertas = (await ServicoAlertasRH.abertos()).filter(a => a.tipo === 'aniversario');
            const funcionarios = alertas.length ? await ServicoRH.funcionarios() : [];
            setLista(alertas.map(a => ({ ...a, foto: funcionarios.find(f => f.id === a.funcionario_id)?.foto_url })));
        };
        void carregar();
        window.addEventListener(EVENTO_ALERTAS_RH, carregar);
        return () => window.removeEventListener(EVENTO_ALERTAS_RH, carregar);
    }, [activo]);
    if (!activo || !lista.length) return null;
    return (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-pink-200 bg-gradient-to-r from-pink-50 to-amber-50 px-4 py-3 dark:border-pink-900 dark:from-pink-950/40 dark:to-amber-950/30">
            <Cake className="h-6 w-6 text-pink-500" />
            {lista.map(a => (
                <span key={a.id} className="flex items-center gap-2 text-sm font-semibold text-pink-900 dark:text-pink-200">
                    {a.foto ? <img src={a.foto} alt="" className="h-8 w-8 rounded-full object-cover" /> : null}
                    {a.mensagem}
                </span>
            ))}
        </div>
    );
}
