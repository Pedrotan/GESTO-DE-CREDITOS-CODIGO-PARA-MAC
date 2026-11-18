// Quiosque do ponto (F3.4): tablet fixo à entrada. O funcionário escreve o seu PIN, escolhe a marcação e vê a
// confirmação durante 3 segundos. A sessão é de um administrador; o quiosque não dá acesso a outras áreas.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Delete, LogIn, LogOut, Pause, Play, X } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { cn } from '@/bibliotecas/utils';
import { configDosParametros, type TipoMarcacao } from '@/bibliotecas/rh/ponto-calculo';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoPontoRH, agoraLuanda } from '@/servicos/rh/ServicoPontoRH';
import { ServicoRH, type Funcionario } from '@/servicos/rh/ServicoRH';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { CapturaFoto } from '@/componentes/rh/ponto/PortalPonto';

const ROTULO: Record<TipoMarcacao, string> = { entrada: 'Entrada', saida: 'Saída', inicio_pausa: 'Início de pausa', fim_pausa: 'Fim de pausa' };
const ICONE: Record<TipoMarcacao, typeof LogIn> = { entrada: LogIn, saida: LogOut, inicio_pausa: Pause, fim_pausa: Play };
const idDispositivo = () => {
    try {
        let id = localStorage.getItem('ponto_quiosque_id');
        if (!id) { id = `quiosque-${crypto.randomUUID().slice(0, 8)}`; localStorage.setItem('ponto_quiosque_id', id); }
        return id;
    } catch { return 'quiosque'; }
};

export default function QuiosquePonto() {
    const { actor } = useActorRH();
    const navigate = useNavigate();
    const [relogio, setRelogio] = useState(agoraLuanda());
    const [pin, setPin] = useState('');
    const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
    const [accoes, setAccoes] = useState<TipoMarcacao[]>([]);
    const [foto, setFoto] = useState<string | null>(null);
    const [exigeFoto, setExigeFoto] = useState(false);
    const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
    useEffect(() => { const t = window.setInterval(() => setRelogio(agoraLuanda()), 1000); return () => window.clearInterval(t); }, []);
    useEffect(() => { void ServicoRH.parametros().then(p => setExigeFoto(configDosParametros(p, luandaTodayKey()).exigir_selfie)); }, []);
    useEffect(() => {
        if (!mensagem) return;
        const t = window.setTimeout(() => { setMensagem(null); setFuncionario(null); setPin(''); setFoto(null); }, 3000);
        return () => window.clearTimeout(t);
    }, [mensagem]);

    const premir = async (tecla: string) => {
        if (mensagem || funcionario) return;
        const novo = tecla === 'apagar' ? pin.slice(0, -1) : (pin + tecla).slice(0, 6);
        setPin(novo);
        if (novo.length >= 4) {
            const f = await ServicoPontoRH.identificarPorPin(novo);
            if (f) {
                setFuncionario(f);
                setAccoes(ServicoPontoRH.proximasAccoes(await ServicoPontoRH.marcacoesDoDia(f.id, luandaTodayKey())));
            } else if (novo.length === 6) setMensagem({ texto: 'PIN não reconhecido.', erro: true });
        }
    };
    const marcar = async (tipo: TipoMarcacao) => {
        if (!funcionario || !actor) return;
        try {
            const hora = await ServicoPontoRH.marcarNoQuiosque(funcionario, tipo, foto, idDispositivo(), actor);
            setMensagem({ texto: `✅ ${ROTULO[tipo]} registada: ${funcionario.nome.split(' ')[0]}, ${hora.slice(11, 16)}` });
        } catch (error) {
            setMensagem({ texto: (error as Error).message, erro: true });
        }
    };

    return (
        <div className="fixed inset-0 z-[9000] flex flex-col items-center justify-center bg-slate-950 p-6 text-white">
            <button type="button" className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:text-white" aria-label="Sair do quiosque"
                onClick={() => { if (window.confirm('Sair do modo quiosque?')) navigate('/rh/ponto'); }}><X className="h-6 w-6" /></button>
            <p className="font-mono text-7xl font-black tabular-nums">{relogio.slice(11, 16)}</p>
            <p className="mb-8 text-lg capitalize text-slate-400">{new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            {mensagem ? (
                <p className={cn('rounded-3xl px-10 py-8 text-center text-3xl font-black', mensagem.erro ? 'bg-red-600' : 'bg-emerald-600')}>{mensagem.texto}</p>
            ) : funcionario ? (
                <div className="flex flex-col items-center gap-5">
                    <p className="text-3xl font-black">Olá, {funcionario.nome.split(' ')[0]}</p>
                    {exigeFoto && <div className="rounded-2xl bg-white p-3 text-slate-900"><CapturaFoto onFoto={setFoto} /></div>}
                    <div className="flex flex-wrap justify-center gap-4">
                        {accoes.map(tipo => {
                            const Icone = ICONE[tipo];
                            return <Button key={tipo} disabled={exigeFoto && !foto} className="h-24 min-w-[220px] text-2xl font-black" onClick={() => void marcar(tipo)}><Icone className="mr-3 h-8 w-8" /> {ROTULO[tipo]}</Button>;
                        })}
                    </div>
                    <Button variant="ghost" className="text-slate-400" onClick={() => { setFuncionario(null); setPin(''); }}>Cancelar</Button>
                </div>
            ) : (
                <div className="flex flex-col items-center">
                    <p className="mb-4 text-xl text-slate-300">Escreva o seu PIN</p>
                    <div className="mb-6 flex gap-3">{Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={cn('h-5 w-5 rounded-full border-2 border-slate-400', i < pin.length && 'bg-white')} />)}</div>
                    <div className="grid grid-cols-3 gap-3">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'apagar'].map((t, i) => t === '' ? <span key={i} /> : (
                            <button key={t} type="button" onClick={() => void premir(t)} aria-label={t === 'apagar' ? 'Apagar' : t}
                                className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 text-3xl font-black hover:bg-slate-700 active:bg-slate-600">
                                {t === 'apagar' ? <Delete className="h-7 w-7" /> : t}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
