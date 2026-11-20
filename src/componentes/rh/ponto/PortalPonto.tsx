// Portal do funcionário: «Marcar ponto» (F3.1–F3.3, com área permitida, fotografia e funcionamento sem internet),
// «O meu ponto» do mês e a justificação de faltas com documento (F3.7).
import { useEffect, useRef, useState } from 'react';
import { Camera, LogIn, LogOut, MapPin, Pause, Play, Send, WifiOff } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { cn } from '@/bibliotecas/utils';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { distanciaMetros, formatarMinutos, horaDe, type TipoMarcacao } from '@/bibliotecas/rh/ponto-calculo';
import { nomeDoMes } from '@/bibliotecas/rh/ponto-relatorios';
import { MOTIVOS_JUSTIFICACAO, ServicoPontoRH, agoraLuanda, type Justificacao } from '@/servicos/rh/ServicoPontoRH';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { executar, lerFicheiro, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { codigoCelula, COR_ESTADO, NOME_ESTADO, TIPO_MARCACAO } from './ponto-ui';

const ICONE: Record<TipoMarcacao, typeof LogIn> = { entrada: LogIn, saida: LogOut, inicio_pausa: Pause, fim_pausa: Play };
const ROTULO_BOTAO: Record<TipoMarcacao, string> = { entrada: 'Marcar entrada', saida: 'Marcar saída', inicio_pausa: 'Iniciar pausa', fim_pausa: 'Terminar pausa' };

/** Fotografia tirada no momento com a câmara (sem escolher da galeria). */
export function CapturaFoto({ onFoto }: { onFoto: (dataUrl: string | null) => void }) {
    const video = useRef<HTMLVideoElement>(null);
    const [erro, setErro] = useState('');
    const [foto, setFoto] = useState<string | null>(null);
    useEffect(() => {
        let fluxo: MediaStream | null = null;
        navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: 320 } })
            .then(s => { fluxo = s; if (video.current) { video.current.srcObject = s; void video.current.play(); } })
            .catch(() => setErro('Não foi possível usar a câmara. Autorize o acesso à câmara.'));
        return () => fluxo?.getTracks().forEach(t => t.stop());
    }, []);
    const tirar = () => {
        const v = video.current;
        if (!v) return;
        const c = document.createElement('canvas');
        c.width = 320; c.height = Math.round((v.videoHeight / (v.videoWidth || 1)) * 320) || 240;
        c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.6);
        setFoto(url); onFoto(url);
    };
    if (erro) return <p className="text-xs text-red-600">{erro}</p>;
    return (
        <div className="flex items-center gap-3">
            {foto ? <img src={foto} alt="Fotografia" className="h-24 w-24 rounded-xl object-cover" /> : <video ref={video} muted playsInline className="h-24 w-24 rounded-xl bg-slate-200 object-cover" />}
            <Button type="button" size="sm" variant="outline" onClick={() => (foto ? (setFoto(null), onFoto(null)) : tirar())}><Camera className="mr-1.5 h-4 w-4" /> {foto ? 'Tirar outra' : 'Tirar fotografia'}</Button>
        </div>
    );
}

export function MarcarPonto({ f, actor }: { f: Funcionario; actor: ActorRH }) {
    const hoje = luandaTodayKey();
    const [relogio, setRelogio] = useState(agoraLuanda());
    const [local, setLocal] = useState<{ lat: number; lon: number } | null>(null);
    const [erroLocal, setErroLocal] = useState('');
    const [foto, setFoto] = useState<string | null>(null);
    const [aMarcar, setAMarcar] = useState(false);
    const dados = useCarregar(async () => {
        const [marcacoes, mes] = await Promise.all([ServicoPontoRH.marcacoesDoDia(f.id, hoje), ServicoPontoRH.meuMes(f, Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)))]);
        return { marcacoes, mes };
    }, null as null | { marcacoes: Awaited<ReturnType<typeof ServicoPontoRH.marcacoesDoDia>>; mes: Awaited<ReturnType<typeof ServicoPontoRH.meuMes>> }, [f.id]);
    useEffect(() => { const t = window.setInterval(() => setRelogio(agoraLuanda()), 1000); return () => window.clearInterval(t); }, []);
    const config = dados.dados?.mes.config;
    useEffect(() => {
        if (!config?.exigir_geolocalizacao || !navigator.geolocation) return;
        const id = navigator.geolocation.watchPosition(p => { setLocal({ lat: p.coords.latitude, lon: p.coords.longitude }); setErroLocal(''); }, () => setErroLocal('Active a localização do dispositivo.'), { enableHighAccuracy: true });
        return () => navigator.geolocation.clearWatch(id);
    }, [config?.exigir_geolocalizacao]);
    if (!dados.dados || !config) return <Vazio>A carregar…</Vazio>;
    if (!config.autoregisto_app) return null;
    const accoes = ServicoPontoRH.proximasAccoes(dados.dados.marcacoes);
    const horario = dados.dados.mes.horario;
    const distancia = local && config.local_latitude != null && config.local_longitude != null ? distanciaMetros(local.lat, local.lon, config.local_latitude, config.local_longitude) : null;
    const dentro = !config.exigir_geolocalizacao || (distancia !== null && distancia <= config.raio_permitido_m);
    const semana = dados.dados.mes.dias.filter(d => d.data <= hoje).slice(-7);
    const marcar = async (tipo: TipoMarcacao) => {
        setAMarcar(true);
        const ok = await executar(() => ServicoPontoRH.marcarPeloPortal(f, tipo, { latitude: local?.lat ?? null, longitude: local?.lon ?? null, foto, offline: !navigator.onLine }, actor),
            `${TIPO_MARCACAO[tipo]} registada às ${relogio.slice(11, 16)}`);
        setAMarcar(false);
        if (ok) { setFoto(null); await dados.recarregar(); }
    };
    const saudacao = Number(relogio.slice(11, 13)) < 12 ? 'Bom dia' : Number(relogio.slice(11, 13)) < 19 ? 'Boa tarde' : 'Boa noite';
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-lg font-black">{saudacao}, {f.nome.split(' ')[0]}</p>
            <p className="text-sm capitalize text-slate-500">{new Date(`${hoje}T12:00:00Z`).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}</p>
            <p className="my-3 font-mono text-4xl font-black tabular-nums">{relogio.slice(11, 16)}<span className="text-xl text-slate-400">:{String(new Date().getSeconds()).padStart(2, '0')}</span></p>
            <p className="text-sm">Horário: {horario.entrada} – {horario.saida}</p>
            <p className="mb-3 text-sm text-slate-500">{dados.dados.marcacoes.filter(m => !m.anulada).length ? `Hoje: ${dados.dados.marcacoes.filter(m => !m.anulada).map(m => `${TIPO_MARCACAO[m.tipo || 'entrada']} ${horaDe(m.data_hora)}`).join(' · ')}` : 'Hoje: ainda sem marcações'}</p>
            {config.exigir_selfie && <div className="mb-3 flex justify-center"><CapturaFoto onFoto={setFoto} /></div>}
            <div className="flex flex-wrap justify-center gap-2">
                {accoes.map((tipo, i) => {
                    const Icone = ICONE[tipo];
                    return <Button key={tipo} size="lg" variant={i === 0 ? 'default' : 'outline'} className="min-w-[200px] text-base font-black" disabled={aMarcar || !dentro || (config.exigir_selfie && !foto)} onClick={() => void marcar(tipo)}>
                        <Icone className="mr-2 h-5 w-5" /> {ROTULO_BOTAO[tipo].toUpperCase()}
                    </Button>;
                })}
            </div>
            {config.exigir_geolocalizacao && (
                <p className={cn('mt-3 flex items-center justify-center gap-1.5 text-sm', dentro ? 'text-emerald-600' : 'text-red-600')}>
                    <MapPin className="h-4 w-4" /> {erroLocal || (distancia === null ? 'A obter a localização…' : dentro ? 'Dentro da área permitida' : `Fora da área permitida (${Math.round(distancia)} m; máximo ${config.raio_permitido_m} m)`)}
                </p>
            )}
            {typeof navigator !== 'undefined' && !navigator.onLine && <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-amber-700"><WifiOff className="h-3.5 w-3.5" /> Sem internet: a marcação fica guardada neste dispositivo e é enviada quando voltar a ligação (fica para revisão do RH).</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-1">
                {semana.map(d => <span key={d.data} title={NOME_ESTADO[d.estado]} className={cn('rounded-md px-2 py-1 text-xs font-bold', COR_ESTADO[d.estado] || 'bg-slate-50')}>{d.data.slice(8)} {codigoCelula(d) || '·'}{d.minutos_trabalhados ? ` ${formatarMinutos(d.minutos_trabalhados)}` : ''}</span>)}
            </div>
        </section>
    );
}

/** O ponto do mês do funcionário e a justificação de faltas e dias sem registo. */
export function MeuPonto({ f, actor }: { f: Funcionario; actor: ActorRH }) {
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
    const [pedido, setPedido] = useState<{ inicio: string; fim: string; motivo_codigo: string; motivo: string; anexo: { nome: string; dataUrl: string } | null } | null>(null);
    const dados = useCarregar(async () => ({ mes: await ServicoPontoRH.meuMes(f, ano, mes), justificacoes: await ServicoPontoRH.justificacoes(f.id) }),
        null as null | { mes: Awaited<ReturnType<typeof ServicoPontoRH.meuMes>>; justificacoes: Justificacao[] }, [f.id, ano, mes]);
    const mover = (delta: number) => { const x = new Date(Date.UTC(ano, mes - 1 + delta, 1)); setAno(x.getUTCFullYear()); setMes(x.getUTCMonth() + 1); };
    if (!dados.dados) return null;
    const { dias, totais } = dados.dados.mes;
    const porJustificar = dias.filter(d => (d.estado === 'F' || (d.estado === 'SEM_REGISTO' && d.data < hoje)) && !d.ausencia_pendente);
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">O meu ponto</h2>
                <div className="flex items-center gap-2 text-sm"><Button size="sm" variant="ghost" onClick={() => mover(-1)}>‹</Button><b>{nomeDoMes(ano, mes)}</b><Button size="sm" variant="ghost" onClick={() => mover(1)}>›</Button></div>
            </div>
            <div className="grid grid-cols-7 gap-1 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
                {dias.map(d => <span key={d.data} title={`${d.data.split('-').reverse().join('/')}: ${NOME_ESTADO[d.estado]}${d.primeira_entrada ? ` ${horaDe(d.primeira_entrada)}–${horaDe(d.ultima_saida) || '?'}` : ''}`}
                    className={cn('flex h-10 flex-col items-center justify-center rounded-md text-[10px] font-black', COR_ESTADO[d.estado] || 'bg-slate-50 text-slate-300 dark:bg-slate-800')}>
                    <span className="text-[9px] font-semibold opacity-70">{d.data.slice(8)}</span>{codigoCelula(d)}
                </span>)}
            </div>
            <p className="mt-3 text-sm">Presenças <b>{totais.presencas}</b> · Faltas <b>{totais.faltas}</b> · FJ <b>{totais.faltas_just}</b> · Horas <b>{formatarMinutos(totais.minutos_trabalhados)}</b> · Atraso <b>{totais.minutos_atraso} min</b> · Extra <b>{formatarMinutos(totais.minutos_extra)}</b></p>
            {dados.dados.mes.banco && (
                <p className="mt-1 text-sm">Banco de horas: saldo <b className={dados.dados.mes.banco.saldo < 0 ? 'text-red-600' : ''}>{dados.dados.mes.banco.saldo < 0 ? '−' : ''}{formatarMinutos(Math.abs(dados.dados.mes.banco.saldo))}</b>
                    {dados.dados.mes.banco.a_expirar_30d > 0 && <span className="text-orange-600"> · {formatarMinutos(dados.dados.mes.banco.a_expirar_30d)} expiram nos próximos 30 dias</span>}</p>
            )}

            {porJustificar.length > 0 && (
                <div className="mt-4">
                    <p className="mb-1.5 text-xs font-black uppercase text-slate-500">Faltas e dias sem registo que pode justificar</p>
                    <div className="flex flex-wrap gap-1.5">
                        {porJustificar.map(d => <Button key={d.data} size="sm" variant="outline" className={d.estado === 'F' ? 'text-red-600' : 'text-orange-600'}
                            onClick={() => setPedido({ inicio: d.data, fim: d.data, motivo_codigo: 'doenca', motivo: '', anexo: null })}>{d.data.split('-').reverse().join('/')} ({codigoCelula(d)})</Button>)}
                    </div>
                </div>
            )}
            {pedido && (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <div><Label className="text-xs font-bold">De</Label><Input className="mt-1" type="date" max={hoje} value={pedido.inicio} onChange={e => setPedido({ ...pedido, inicio: e.target.value })} /></div>
                        <div><Label className="text-xs font-bold">Até</Label><Input className="mt-1" type="date" max={hoje} min={pedido.inicio} value={pedido.fim} onChange={e => setPedido({ ...pedido, fim: e.target.value })} /></div>
                        <div><Label className="text-xs font-bold">Motivo</Label>
                            <Select value={pedido.motivo_codigo} onValueChange={v => setPedido({ ...pedido, motivo_codigo: v })}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{MOTIVOS_JUSTIFICACAO.map(m => <SelectItem key={m.codigo} value={m.codigo}>{m.nome}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div><Label className="text-xs font-bold">Explicação</Label><Textarea className="mt-1" rows={2} value={pedido.motivo} onChange={e => setPedido({ ...pedido, motivo: e.target.value })} /></div>
                    <div><Label className="text-xs font-bold">Documento (fotografia ou PDF, até 5 MB)</Label>
                        <Input className="mt-1" type="file" accept="image/*,.pdf" capture="environment" onChange={async e => { const ficheiro = e.target.files?.[0]; setPedido({ ...pedido, anexo: ficheiro ? { nome: ficheiro.name, dataUrl: await lerFicheiro(ficheiro) } : null }); }} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setPedido(null)}>Cancelar</Button>
                        <Button disabled={pedido.motivo.trim().length < 5} onClick={() => void executar(() => ServicoPontoRH.pedirJustificacao(f, { data_inicio: pedido.inicio, data_fim: pedido.fim, motivo_codigo: pedido.motivo_codigo, motivo: pedido.motivo, anexo: pedido.anexo }, actor),
                            'Justificação enviada ao chefe').then(ok => { if (ok) { setPedido(null); void dados.recarregar(); } })}><Send className="mr-1.5 h-4 w-4" /> Enviar para aprovação</Button>
                    </div>
                </div>
            )}
            {dados.dados.justificacoes.length > 0 && (
                <div className="mt-4">
                    <p className="mb-1.5 text-xs font-black uppercase text-slate-500">As minhas justificações</p>
                    {dados.dados.justificacoes.slice(0, 10).map(j => (
                        <p key={j.id} className="border-t border-slate-100 py-1.5 text-sm dark:border-slate-800">{j.data_inicio.split('-').reverse().join('/')}{j.data_fim !== j.data_inicio ? ` a ${j.data_fim.split('-').reverse().join('/')}` : ''} · {MOTIVOS_JUSTIFICACAO.find(m => m.codigo === j.motivo_codigo)?.nome} ·{' '}
                            <b className={j.estado === 'aprovada' ? 'text-emerald-600' : j.estado === 'rejeitada' ? 'text-red-600' : 'text-amber-600'}>{j.estado === 'pendente' ? 'aguarda decisão' : j.estado}</b>{j.comentario ? ` — ${j.comentario}` : ''}</p>
                    ))}
                </div>
            )}
        </section>
    );
}
