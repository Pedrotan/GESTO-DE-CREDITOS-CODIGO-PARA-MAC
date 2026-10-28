import { useState, useEffect, useRef, useMemo, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/componentes/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { useToast } from '@/componentes/ui/use-toast';
import {
    ArrowLeft, Check, CheckCheck, Contact, Download, FileText, Loader2, MessageSquare, MoreVertical, Paperclip, Search, Send, Trash2, UploadCloud, X,
} from 'lucide-react';
import { cn, formatDateSafe } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { ServicoPresenca, type RemotePresence } from '@/servicos/ServicoPresenca';
import { lojaAvisos } from '@/bibliotecas/avisos-mensagens';
import {
    CHAT_ACCEPT, CHAT_MAX_MESSAGE_BYTES, estadoPresenca, fichaCliente, lerAnexo, problemaFicheiro, resumoMensagem, rotuloDia, tamanhoLegivel,
} from '@/bibliotecas/chat-interno';
import type { ChatAttachment, ChatClientCard, ChatMessage } from '@/tipos/credito';

const iniciais = (nome: string) => nome.split(/\s+/u).filter(Boolean).slice(0, 2).map(parte => parte[0]).join('').toUpperCase() || '?';
const perfil = (role: string) => role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Administrador' : role === 'manager' ? 'Gestor' : 'Utilizador';
const hora = (data: Date | string) => formatDateSafe(data, 'HH:mm');

/** Fotografia ou iniciais, com o ponto de presença (verde só com sinal recente do servidor). */
function AvatarPessoa({ nome, foto, online, className }: { nome: string; foto?: string; online?: boolean; className?: string }) {
    return (
        <div className={cn('relative shrink-0', className)}>
            <Avatar className="h-11 w-11 border border-border/60">
                {foto && <AvatarImage src={foto} alt={nome} />}
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 font-bold text-primary">{iniciais(nome)}</AvatarFallback>
            </Avatar>
            {online !== undefined && (
                <span className={cn('absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-card', online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')} />
            )}
        </div>
    );
}

/** Ficha resumida de um cliente enviada no chat, com atalho para a ficha completa. */
function CartaoCliente({ ficha, minha, onAbrir }: { ficha: ChatClientCard; minha: boolean; onAbrir: () => void }) {
    return (
        <div className={cn('w-72 max-w-full rounded-xl border p-3 text-left text-foreground shadow-sm', minha ? 'border-primary-foreground/20 bg-background' : 'bg-background')}>
            <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Contact className="h-5 w-5" /></span>
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{ficha.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{[ficha.nif, ficha.phone].filter(Boolean).join(' · ') || 'Cliente'}</p>
                </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                {([['Limite', ficha.creditLimit], ['Utilizado', ficha.usedCredit], ['Disponível', ficha.availableCredit]] as const).map(([rotulo, valor]) => (
                    <div key={rotulo} className="rounded-lg bg-muted/60 px-1.5 py-1">
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">{rotulo}</p>
                        <p className="truncate text-[11px] font-bold">{formatCurrency(Number(valor) || 0)}</p>
                    </div>
                ))}
            </div>
            <Button type="button" size="sm" variant="outline" className="mt-2.5 h-8 w-full text-xs" onClick={onAbrir}>Abrir ficha do cliente</Button>
        </div>
    );
}

export default function Chat() {
    const { user: currentUser, users } = useAuth();
    const { messages, sendMessage, markMessageAsRead, deleteMessage, clearMessages, clients } = useData();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [selectedUserId, setSelectedUserId] = useState<string | null>(() => searchParams.get('com'));
    const [searchTerm, setSearchTerm] = useState('');
    const [texto, setTexto] = useState('');
    const [anexos, setAnexos] = useState<ChatAttachment[]>([]);
    const [ficha, setFicha] = useState<ChatClientCard | null>(null);
    const [aLer, setALer] = useState(false);
    const [aEnviar, setAEnviar] = useState(false);
    const [arrastar, setArrastar] = useState(false);
    const [escolherCliente, setEscolherCliente] = useState(false);
    const [clienteEscolhido, setClienteEscolhido] = useState('');
    const [preview, setPreview] = useState<ChatAttachment | null>(null);
    const [presencas, setPresencas] = useState<Map<string, RemotePresence> | null>(null);
    const [agora, setAgora] = useState(() => Date.now());
    const fimRef = useRef<HTMLDivElement>(null);
    const ficheiroRef = useRef<HTMLInputElement>(null);
    const textoRef = useRef<HTMLTextAreaElement>(null);

    // Vindo de um aviso de mensagem («?com=<utilizador>»): abre essa conversa.
    useEffect(() => { const com = searchParams.get('com'); if (com) setSelectedUserId(com); }, [searchParams]);
    // A conversa aberta não gera avisos (as mensagens dela ficam logo lidas).
    useEffect(() => {
        lojaAvisos.definirConversaAberta(selectedUserId);
        return () => lojaAvisos.definirConversaAberta(null);
    }, [selectedUserId]);

    // Presença real: o servidor diz quem enviou sinal nos últimos 150 s (em qualquer computador ou navegador).
    useEffect(() => {
        let vivo = true;
        const ids = users.map(u => u.id);
        const actualizar = async () => {
            const resultado = await ServicoPresenca.resolve(ids);
            if (vivo) { setPresencas(resultado); setAgora(Date.now()); }
        };
        void ServicoPresenca.refresh().finally(() => void actualizar());
        const sair = ServicoPresenca.subscribe(() => void actualizar());
        const relogio = setInterval(() => void actualizar(), 30_000);
        return () => { vivo = false; sair(); clearInterval(relogio); };
    }, [users]);
    const presencaDe = (id: string) => id === currentUser?.id ? { online: true, texto: 'Online' } : estadoPresenca(presencas?.get(id), Boolean(presencas), agora);

    const conversas = useMemo(() => {
        if (!currentUser) return [];
        const ultima = new Map<string, ChatMessage>();
        const porLer = new Map<string, number>();
        for (const m of messages) {
            const outro = m.senderId === currentUser.id ? m.receiverId : m.receiverId === currentUser.id ? m.senderId : null;
            if (!outro) continue;
            const anterior = ultima.get(outro);
            if (!anterior || new Date(m.timestamp).getTime() >= new Date(anterior.timestamp).getTime()) ultima.set(outro, m);
            if (m.receiverId === currentUser.id && !m.read) porLer.set(outro, (porLer.get(outro) || 0) + 1);
        }
        const termo = searchTerm.trim().toLowerCase();
        return users
            .filter(u => u.id !== currentUser.id && (!termo || u.name.toLowerCase().includes(termo) || (u.email || '').toLowerCase().includes(termo)))
            .map(u => ({ user: u, ultima: ultima.get(u.id) || null, porLer: porLer.get(u.id) || 0 }))
            // Conversa mais recente primeiro; quem ainda não tem conversa, por nome.
            .sort((a, b) => (b.ultima ? new Date(b.ultima.timestamp).getTime() : 0) - (a.ultima ? new Date(a.ultima.timestamp).getTime() : 0)
                || a.user.name.localeCompare(b.user.name));
    }, [messages, users, currentUser, searchTerm]);

    const selectedUser = useMemo(() => users.find(u => u.id === selectedUserId), [users, selectedUserId]);
    const conversa = useMemo(() => {
        if (!selectedUserId || !currentUser) return [];
        return messages
            .filter(m => (m.senderId === currentUser.id && m.receiverId === selectedUserId) || (m.senderId === selectedUserId && m.receiverId === currentUser.id))
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [messages, selectedUserId, currentUser]);

    useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [conversa.length, selectedUserId]);

    // Ao abrir a conversa, as mensagens recebidas ficam lidas (o remetente vê o visto duplo).
    useEffect(() => {
        if (!selectedUserId || !currentUser) return;
        for (const m of messages) {
            if (m.senderId === selectedUserId && m.receiverId === currentUser.id && !m.read) void markMessageAsRead(m.id);
        }
    }, [selectedUserId, messages, currentUser, markMessageAsRead]);

    // Ao mudar de conversa, o rascunho e os anexos ficam por enviar só na conversa onde foram escritos.
    useEffect(() => { setTexto(''); setAnexos([]); setFicha(null); }, [selectedUserId]);

    const aviso = (title: string, description: string) => toast({ title, description, variant: 'destructive' });

    const adicionarFicheiros = async (lista: FileList | File[]) => {
        const ficheiros = Array.from(lista);
        if (!ficheiros.length) return;
        setALer(true);
        let actuais = [...anexos];
        try {
            for (const ficheiro of ficheiros) {
                const problema = problemaFicheiro(ficheiro, actuais.length);
                if (problema) { aviso('Ficheiro não anexado', problema); continue; }
                const anexo = await lerAnexo(ficheiro);
                if (actuais.reduce((soma, item) => soma + item.size, 0) + anexo.size > CHAT_MAX_MESSAGE_BYTES) {
                    aviso('Ficheiro não anexado', `A mensagem passaria de ${tamanhoLegivel(CHAT_MAX_MESSAGE_BYTES)}. Envie «${ficheiro.name}» numa mensagem à parte.`);
                    continue;
                }
                actuais = [...actuais, anexo];
            }
        } catch (error) {
            aviso('Ficheiro não anexado', error instanceof Error ? error.message : 'Não foi possível ler o ficheiro.');
        } finally {
            setAnexos(actuais);
            setALer(false);
        }
    };

    const enviar = async () => {
        if (!selectedUser || !currentUser || aEnviar) return;
        const conteudo = texto.trim();
        if (!conteudo && !anexos.length && !ficha) return;
        // Autorização (uma vez) para os avisos do sistema quando chegar resposta com a janela fora de vista.
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
        setAEnviar(true);
        try {
            await sendMessage({
                senderId: currentUser.id, senderName: currentUser.name, receiverId: selectedUser.id, receiverName: selectedUser.name,
                content: conteudo, attachments: anexos, clientCard: ficha,
            });
            setTexto(''); setAnexos([]); setFicha(null);
            textoRef.current?.focus();
        } catch (error) {
            aviso('Mensagem não enviada', error instanceof Error ? error.message : 'Tente de novo.');
        } finally {
            setAEnviar(false);
        }
    };

    const teclas = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void enviar(); }
    };
    const colar = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        if (event.clipboardData.files.length) { event.preventDefault(); void adicionarFicheiros(event.clipboardData.files); }
    };
    const largar = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setArrastar(false);
        if (selectedUser && event.dataTransfer.files.length) void adicionarFicheiros(event.dataTransfer.files);
    };

    const opcoesClientes = useMemo(() => clients.map(c => ({
        value: c.id, label: c.name, subLabel: [c.nif, c.phone].filter(Boolean).join(' · '), keywords: `${c.nif || ''} ${c.phone || ''}`,
    })), [clients]);
    const anexarCliente = () => {
        const cliente = clients.find(c => c.id === clienteEscolhido);
        if (!cliente) return;
        setFicha(fichaCliente(cliente));
        setEscolherCliente(false);
        setClienteEscolhido('');
        textoRef.current?.focus();
    };
    const abrirFicha = (cartao: ChatClientCard) => navigate(`/clientes?search=${encodeURIComponent(cartao.nif || cartao.name)}`);

    const estadoSeleccionado = selectedUser ? presencaDe(selectedUser.id) : null;
    const podeEnviar = Boolean(texto.trim() || anexos.length || ficha) && !aLer && !aEnviar;

    return (
        <MainLayout title="Chat Interno" subtitle="Conversas da equipa, com ficheiros e fichas de clientes">
            <div className="flex h-[calc(100vh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">

                {/* Conversas */}
                <aside className={cn('w-full flex-col border-r border-border bg-muted/20 md:flex md:w-80', selectedUser ? 'hidden' : 'flex')}>
                    <div className="border-b border-border p-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Procurar utilizador..." className="h-10 rounded-xl bg-background pl-9" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} />
                        </div>
                    </div>
                    <div className="flex-1 space-y-1 overflow-y-auto p-2">
                        {conversas.map(({ user: u, ultima, porLer }) => {
                            const estado = presencaDe(u.id);
                            const activo = selectedUserId === u.id;
                            return (
                                <button key={u.id} type="button" onClick={() => setSelectedUserId(u.id)}
                                    className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all', activo ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-muted')}>
                                    <AvatarPessoa nome={u.name} foto={u.avatar} online={estado.online} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className="truncate font-semibold">{u.name}</p>
                                            {ultima && <span className={cn('shrink-0 text-[10px]', activo ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{hora(ultima.timestamp)}</span>}
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={cn('truncate text-xs', activo ? 'text-primary-foreground/75' : porLer ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                                                {ultima ? `${ultima.senderId === currentUser?.id ? 'Você: ' : ''}${resumoMensagem(ultima)}` : `${perfil(u.role)} · ${estado.texto}`}
                                            </p>
                                            {porLer > 0 && !activo && (
                                                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{porLer}</span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        {!conversas.length && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum utilizador encontrado.</p>}
                    </div>
                </aside>

                {/* Conversa */}
                <section className={cn('relative min-w-0 flex-1 flex-col bg-card md:flex', selectedUser ? 'flex' : 'hidden')}
                    onDragOver={event => { if (selectedUser) { event.preventDefault(); setArrastar(true); } }}
                    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setArrastar(false); }}
                    onDrop={largar}>
                    {selectedUser && estadoSeleccionado ? (
                        <>
                            <header className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedUserId(null)} aria-label="Voltar às conversas">
                                        <ArrowLeft className="h-5 w-5" />
                                    </Button>
                                    <AvatarPessoa nome={selectedUser.name} foto={selectedUser.avatar} online={estadoSeleccionado.online} />
                                    <div className="min-w-0">
                                        <h3 className="truncate font-bold">{selectedUser.name}</h3>
                                        <p className={cn('text-xs', estadoSeleccionado.online ? 'font-semibold text-emerald-600' : 'text-muted-foreground')}>
                                            {estadoSeleccionado.texto} · {perfil(selectedUser.role)}
                                        </p>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button type="button" variant="ghost" size="icon" aria-label="Mais opções"><MoreVertical className="h-5 w-5 text-muted-foreground" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={async () => {
                                            if (window.confirm('Tem a certeza que deseja limpar todo o histórico com este utilizador?')) await clearMessages(currentUser!.id, selectedUser.id);
                                        }}>
                                            <Trash2 className="h-4 w-4" /> Limpar histórico
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </header>

                            <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted))_1px,transparent_0)] bg-[length:22px_22px] px-4 py-5 md:px-8">
                                {!conversa.length && (
                                    <div className="mx-auto mt-16 max-w-sm rounded-2xl border bg-card/90 p-6 text-center shadow-sm">
                                        <MessageSquare className="mx-auto h-8 w-8 text-primary" />
                                        <p className="mt-3 font-semibold">Ainda não há mensagens com {selectedUser.name.split(' ')[0]}.</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Escreva uma mensagem, arraste ficheiros para aqui ou partilhe a ficha de um cliente.</p>
                                    </div>
                                )}
                                {conversa.map((m, index) => {
                                    const minha = m.senderId === currentUser?.id;
                                    const anterior = conversa[index - 1];
                                    const novoDia = !anterior || rotuloDia(new Date(anterior.timestamp)) !== rotuloDia(new Date(m.timestamp));
                                    const seguida = !novoDia && anterior?.senderId === m.senderId
                                        && new Date(m.timestamp).getTime() - new Date(anterior.timestamp).getTime() < 5 * 60_000;
                                    const imagens = (m.attachments || []).filter(a => a.mime.startsWith('image/'));
                                    const outros = (m.attachments || []).filter(a => !a.mime.startsWith('image/'));
                                    return (
                                        <div key={m.id}>
                                            {novoDia && (
                                                <div className="my-4 flex justify-center">
                                                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">{rotuloDia(new Date(m.timestamp))}</span>
                                                </div>
                                            )}
                                            <div className={cn('group flex items-end gap-2', minha ? 'justify-end' : 'justify-start', seguida ? 'mt-1' : 'mt-3')}>
                                                {minha && (
                                                    <button type="button" onClick={() => deleteMessage(m.id)} title="Eliminar mensagem"
                                                        className="mb-1 rounded-full p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                                <div className={cn('max-w-[78%] space-y-2 rounded-2xl px-3.5 py-2 text-sm shadow-sm md:max-w-[65%]',
                                                    minha ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border/60 bg-card text-foreground')}>
                                                    {imagens.length > 0 && (
                                                        <div className={cn('grid gap-1.5', imagens.length > 1 && 'grid-cols-2')}>
                                                            {imagens.map(imagem => (
                                                                <button key={imagem.id} type="button" onClick={() => setPreview(imagem)} className="overflow-hidden rounded-xl">
                                                                    <img src={imagem.dataUrl} alt={imagem.name} className="max-h-60 w-full object-cover transition hover:scale-[1.02]" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {outros.map(ficheiro => (
                                                        <a key={ficheiro.id} href={ficheiro.dataUrl} download={ficheiro.name}
                                                            className={cn('flex items-center gap-3 rounded-xl border p-2.5 transition', minha ? 'border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-muted/50 hover:bg-muted')}>
                                                            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', minha ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary')}><FileText className="h-5 w-5" /></span>
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-xs font-semibold">{ficheiro.name}</span>
                                                                <span className={cn('block text-[10px]', minha ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{tamanhoLegivel(ficheiro.size)}</span>
                                                            </span>
                                                            <Download className="h-4 w-4 shrink-0 opacity-80" />
                                                        </a>
                                                    ))}
                                                    {m.clientCard && <CartaoCliente ficha={m.clientCard} minha={minha} onAbrir={() => abrirFicha(m.clientCard!)} />}
                                                    {m.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>}
                                                    <div className={cn('flex items-center justify-end gap-1 text-[10px]', minha ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                                                        <span>{hora(m.timestamp)}</span>
                                                        {minha && (m.read
                                                            ? <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Lida" />
                                                            : <Check className="h-3.5 w-3.5" aria-label="Enviada" />)}
                                                    </div>
                                                </div>
                                                {!minha && (
                                                    <button type="button" onClick={() => deleteMessage(m.id)} title="Eliminar mensagem"
                                                        className="mb-1 rounded-full p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={fimRef} />
                            </div>

                            {/* Escrever */}
                            <div className="border-t border-border bg-card/90 p-3 backdrop-blur md:p-4">
                                {(anexos.length > 0 || ficha || aLer) && (
                                    <div className="mb-2.5 flex flex-wrap gap-2">
                                        {anexos.map(anexo => (
                                            <span key={anexo.id} className="flex max-w-[220px] items-center gap-2 rounded-xl border bg-muted/50 py-1 pl-1 pr-2 text-xs">
                                                {anexo.mime.startsWith('image/')
                                                    ? <img src={anexo.dataUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                                                    : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>}
                                                <span className="min-w-0 truncate">{anexo.name}<span className="block text-[10px] text-muted-foreground">{tamanhoLegivel(anexo.size)}</span></span>
                                                <button type="button" onClick={() => setAnexos(prev => prev.filter(item => item.id !== anexo.id))} aria-label={`Retirar ${anexo.name}`} className="rounded-full p-0.5 hover:bg-muted">
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </span>
                                        ))}
                                        {ficha && (
                                            <span className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-1 pl-2 pr-2 text-xs">
                                                <Contact className="h-4 w-4 text-primary" /> <span className="max-w-[160px] truncate font-semibold">{ficha.name}</span>
                                                <button type="button" onClick={() => setFicha(null)} aria-label="Retirar a ficha do cliente" className="rounded-full p-0.5 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                                            </span>
                                        )}
                                        {aLer && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A preparar ficheiros…</span>}
                                    </div>
                                )}
                                <div className="flex items-end gap-2">
                                    <input ref={ficheiroRef} type="file" multiple accept={CHAT_ACCEPT} className="hidden"
                                        onChange={event => { if (event.target.files) void adicionarFicheiros(event.target.files); event.target.value = ''; }} />
                                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-xl" title="Anexar ficheiros (imagens, PDF, Word, Excel)" onClick={() => ficheiroRef.current?.click()}>
                                        <Paperclip className="h-5 w-5" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-xl" title="Partilhar a ficha de um cliente" onClick={() => setEscolherCliente(true)}>
                                        <Contact className="h-5 w-5" />
                                    </Button>
                                    <Textarea ref={textoRef} rows={1} value={texto} onChange={event => setTexto(event.target.value)} onKeyDown={teclas} onPaste={colar}
                                        placeholder="Escreva uma mensagem… (Enter envia, Shift+Enter muda de linha)"
                                        className="max-h-36 min-h-10 flex-1 resize-none rounded-xl bg-background py-2.5" />
                                    <Button type="button" size="icon" className="h-10 w-10 shrink-0 rounded-xl" disabled={!podeEnviar} onClick={() => void enviar()} aria-label="Enviar">
                                        {aEnviar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            {arrastar && (
                                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary bg-primary/5 text-primary backdrop-blur-[1px]">
                                    <UploadCloud className="h-10 w-10" />
                                    <p className="font-semibold">Largue os ficheiros para anexar</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center bg-muted/10 p-10 text-center">
                            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10"><MessageSquare className="h-10 w-10 text-primary" /></div>
                            <h2 className="mb-2 text-xl font-bold">Escolha uma conversa</h2>
                            <p className="max-w-xs text-sm text-muted-foreground">Fale com a equipa, envie ficheiros e partilhe fichas de clientes. O ponto verde mostra quem está ligado agora.</p>
                        </div>
                    )}
                </section>
            </div>

            <Dialog open={escolherCliente} onOpenChange={setEscolherCliente}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Partilhar a ficha de um cliente</DialogTitle>
                        <DialogDescription>Vai o nome, BI/NIF, contactos e os valores de crédito do cliente (sem documentos nem coordenadas bancárias).</DialogDescription>
                    </DialogHeader>
                    <SearchableSelect options={opcoesClientes} value={clienteEscolhido} onValueChange={setClienteEscolhido}
                        placeholder="Escolher cliente" searchPlaceholder="Nome, BI/NIF ou telefone..." emptyMessage="Nenhum cliente encontrado." />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEscolherCliente(false)}>Cancelar</Button>
                        <Button type="button" disabled={!clienteEscolhido} onClick={anexarCliente}>Anexar ficha</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle className="truncate">{preview?.name}</DialogTitle>
                        <DialogDescription>{preview ? tamanhoLegivel(preview.size) : ''}</DialogDescription>
                    </DialogHeader>
                    {preview && <img src={preview.dataUrl} alt={preview.name} className="max-h-[70vh] w-full rounded-lg object-contain" />}
                    <DialogFooter>
                        {preview && <Button asChild variant="outline"><a href={preview.dataUrl} download={preview.name}><Download className="mr-2 h-4 w-4" /> Descarregar</a></Button>}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
