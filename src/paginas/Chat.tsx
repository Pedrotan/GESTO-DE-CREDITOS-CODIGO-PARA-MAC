import { useState, useEffect, useRef, useMemo } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Avatar, AvatarFallback } from '@/componentes/ui/avatar';
import { ScrollArea } from '@/componentes/ui/scroll-area';
import { Send, User as UserIcon, Search, MoreVertical, Trash2, X } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import { cn, formatDateSafe } from '@/bibliotecas/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Chat() {
    const { user: currentUser, users } = useAuth();
    const { messages, sendMessage, markMessageAsRead, deleteMessage, clearMessages } = useData();

    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [messageText, setMessageText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);

    // Filtrar utilizadores para a barra lateral (excluir utilizador atual)
    const otherUsers = useMemo(() => {
        return users.filter(u => u.id !== currentUser?.id &&
            (u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                u.email.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [users, currentUser, searchTerm]);

    const selectedUser = useMemo(() => {
        return users.find(u => u.id === selectedUserId);
    }, [users, selectedUserId]);

    // Filtrar mensagens para a conversa atual
    const chatMessages = useMemo(() => {
        if (!selectedUserId || !currentUser) return [];
        return messages.filter(m =>
            (m.senderId === currentUser.id && m.receiverId === selectedUserId) ||
            (m.senderId === selectedUserId && m.receiverId === currentUser.id)
        );
    }, [messages, selectedUserId, currentUser]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Mark messages as read when opening a chat
    useEffect(() => {
        if (selectedUserId && currentUser) {
            messages.forEach(m => {
                if (m.senderId === selectedUserId && m.receiverId === currentUser.id && !m.read) {
                    markMessageAsRead(m.id);
                }
            });
        }
    }, [selectedUserId, messages, currentUser, markMessageAsRead]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageText.trim() || !selectedUserId || !currentUser) return;

        sendMessage({
            senderId: currentUser.id,
            senderName: currentUser.name,
            receiverId: selectedUserId,
            receiverName: selectedUser?.name || 'Utilizador',
            content: messageText.trim()
        });

        setMessageText('');
    };

    const getUnreadCount = (userId: string) => {
        return messages.filter(m => m.senderId === userId && m.receiverId === currentUser?.id && !m.read).length;
    };

    return (
        <MainLayout title="Chat Interno" subtitle="Comunicação em tempo real entre a equipa">
            <div className="flex h-[calc(100vh-12rem)] rounded-xl border border-border bg-card shadow-sm overflow-hidden">

                {/* Users Sidebar */}
                <div className="w-80 border-r border-border flex flex-col bg-muted/10">
                    <div className="p-4 border-b border-border bg-card/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Procurar utilizador..."
                                className="pl-9 bg-background"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {otherUsers.map(u => {
                                const unread = getUnreadCount(u.id);
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => setSelectedUserId(u.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group",
                                            selectedUserId === u.id ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted"
                                        )}
                                    >
                                        <Avatar className="h-10 w-10 border border-border/50">
                                            <AvatarFallback className={cn(
                                                selectedUserId === u.id ? "bg-primary-foreground/20 text-white" : "bg-primary/10 text-primary"
                                            )}>
                                                {u.name.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{u.name}</p>
                                            <p className={cn(
                                                "text-xs truncate",
                                                selectedUserId === u.id ? "text-primary-foreground/70" : "text-muted-foreground"
                                            )}>
                                                {u.role === 'super_admin' ? 'Super Admin' : u.role === 'admin' ? 'Administrador' : 'Gestor'}
                                            </p>
                                        </div>
                                        {unread > 0 && selectedUserId !== u.id && (
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white animate-pulse">
                                                {unread}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </div>

                {/* Chat Window */}
                <div className="flex-1 flex flex-col bg-card">
                    {selectedUser ? (
                        <>
                            {/* Header */}
                            <div className="p-4 border-b border-border flex items-center justify-between bg-card/50">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 border border-border">
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                            {selectedUser.name.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h3 className="font-bold">{selectedUser.name}</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-success" />
                                            <span className="text-xs text-muted-foreground">Online</span>
                                        </div>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                            <MoreVertical className="h-5 w-5 text-muted-foreground" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            className="text-destructive focus:text-destructive gap-2"
                                            onClick={async () => {
                                                if (window.confirm("Tem a certeza que deseja limpar todo o histórico com este utilizador?")) {
                                                    await clearMessages(currentUser!.id, selectedUserId!);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Limpar Histórico
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Messages Area */}
                            <ScrollArea className="flex-1 p-6" ref={scrollRef as any}>
                                <div className="space-y-4">
                                    {chatMessages.map((m, idx) => {
                                        const isMe = m.senderId === currentUser?.id;
                                        return (
                                            <div
                                                key={m.id}
                                                className={cn(
                                                    "flex flex-col max-w-[70%] group",
                                                    isMe ? "ml-auto items-end" : "mr-auto items-start"
                                                )}
                                            >
                                                <div className="flex items-center gap-2 max-w-full">
                                                    {isMe && (
                                                        <button
                                                            onClick={() => deleteMessage(m.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-danger transition-all bg-muted rounded-full"
                                                            title="Eliminar mensagem"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    <div className={cn(
                                                        "px-4 py-2 rounded-2xl shadow-sm text-sm break-words",
                                                        isMe
                                                            ? "bg-primary text-primary-foreground rounded-tr-none"
                                                            : "bg-muted text-foreground rounded-tl-none border border-border/50"
                                                    )}>
                                                        {m.content}
                                                    </div>
                                                    {!isMe && (
                                                        <button
                                                            onClick={() => deleteMessage(m.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-danger transition-all bg-muted rounded-full"
                                                            title="Eliminar mensagem"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-muted-foreground mt-1 px-1">
                                                    {formatDateSafe(m.timestamp, "HH:mm")}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </ScrollArea>

                            {/* Input Area */}
                            <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-card/50">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Escreva a sua mensagem..."
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Button type="submit" size="icon" disabled={!messageText.trim()}>
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-muted/5">
                            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                                <UserIcon className="h-10 w-10 text-primary" />
                            </div>
                            <h2 className="text-xl font-bold mb-2">Selecione um utilizador</h2>
                            <p className="text-muted-foreground max-w-xs">
                                Inicie uma conversa privada com qualquer membro da sua equipa administrativa.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}




