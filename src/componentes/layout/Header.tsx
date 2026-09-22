import { useState, useEffect } from 'react';
import { Bell, Search, User, LogOut, MessageSquare, AlertCircle, X, Wifi, WifiOff, Sun, Moon, Cloud, CloudOff, Server, Menu, Download, UserCircle, BookOpen, Shield, History, Calendar, Mail, Globe, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Badge } from '@/componentes/ui/badge';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatDateTime } from '@/bibliotecas/formatters';
import { cn, getFileUrl } from '@/bibliotecas/utils';
import { ROLES } from '@/tipos/autenticacao';
import { AccountSwitcher } from '@/componentes/contas/AccountSwitcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import { ProfileModal } from '@/componentes/modals/ProfileModal';
import { ModulesModal } from '@/componentes/modals/ModulesModal';
import { ActivityModal } from '@/componentes/modals/ActivityModal';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMobileMenuToggle?: () => void;
}

export function Header({ title, subtitle, onMobileMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const {
    notifications,
    clients,
    allClients,
    credits,
    payments,
    markNotificationAsRead,
    markMessageAsRead,
    deleteNotification,
    markAllAsRead,
    clearNotifications,
    serverInfo,
    connectedClients,
    companySettings,
    users,
    activeContextUserId,
    setContextUserId,
    dbAdapterMode
  } = useData();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{
    clients: typeof clients;
    credits: typeof credits;
    payments: typeof payments;
  }>({ clients: [], credits: [], payments: [] });
  const [showResults, setShowResults] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [isModulesOpen, setIsModulesOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>((window as any).__tangoInstallPrompt || null);
  const [isInstalledPwa, setIsInstalledPwa] = useState(
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
  );
  const userInitials = user?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';

  useEffect(() => {
    // Sync state with DOM in case it changed externally
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      (window as any).__tangoInstallPrompt = event;
      setInstallPrompt(event);
    };
    const handleInstallReady = () => setInstallPrompt((window as any).__tangoInstallPrompt || null);
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalledPwa(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('tango-pwa-install-ready', handleInstallReady);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('tango-pwa-install-ready', handleInstallReady);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    (window as any).__tangoInstallPrompt = null;
    setInstallPrompt(null);
  };

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.avatar]);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check periodically (every 5s) and on focus
    const interval = setInterval(() => {
      setIsOnline(navigator.onLine);
    }, 5000);

    const handleFocus = () => setIsOnline(navigator.onLine);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, []);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults({ clients: [], credits: [], payments: [] });
      setShowResults(false);
      return;
    }

    const lowTerm = term.toLowerCase();
    const searchSource = (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'manager') ? (allClients || clients) : clients;

    setSearchResults({
      clients: searchSource.filter(c =>
        c.name.toLowerCase().includes(lowTerm) ||
        c.nif.includes(term) ||
        c.phone.includes(term)
      ).slice(0, 5),
      credits: credits.filter(cr =>
        cr.id.toLowerCase().includes(lowTerm) ||
        cr.clientName.toLowerCase().includes(lowTerm)
      ).slice(0, 5),
      payments: payments.filter(p =>
        p.id.toLowerCase().includes(lowTerm) ||
        p.reference?.toLowerCase().includes(lowTerm) ||
        p.clientName.toLowerCase().includes(lowTerm)
      ).slice(0, 5)
    });
    setShowResults(true);
  };

  const hasResults = searchResults.clients.length > 0 || searchResults.credits.length > 0 || searchResults.payments.length > 0;


  const unreadCount = notifications.filter(n => !n.read && n.source !== 'chat').length;
  // Get chat notifications specifically for the current user
  const chatNotifications = notifications.filter(n => n.source === 'chat' && n.userId === user?.id);
  const unreadChatCount = chatNotifications.filter(n => !n.read).length;

  // Data/hora actual exibida no cabeçalho, tal como no cabeçalho dos documentos
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Faz o sino "tocar" periodicamente enquanto houver notificações por ler
  const [isBellRinging, setIsBellRinging] = useState(false);
  useEffect(() => {
    if (unreadCount === 0) return;
    const interval = setInterval(() => {
      setIsBellRinging(true);
      setTimeout(() => setIsBellRinging(false), 800);
    }, 10000);
    return () => clearInterval(interval);
  }, [unreadCount]);

  return (
    <header className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 py-2 backdrop-blur-xl transition-all md:min-h-20 md:px-6">
      <div className="flex min-w-0 shrink items-center gap-3">
        { /* Mobile Menu Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-muted-foreground mr-1"
          onClick={onMobileMenuToggle}
        >
          <Menu className="h-6 w-6" />
        </Button>

        {/* Logótipo e nome da empresa, compactos, no mesmo alinhamento do título */}
        <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-border">
            <img
              src={companySettings?.logo ? (companySettings.logo.startsWith('data:') ? companySettings.logo : `${getFileUrl(companySettings.logo)}?t=${new Date().getTime()}`) : 'logo-app.png'}
              alt="Logótipo"
              className="h-full w-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.endsWith('favicon.png')) target.src = 'favicon.png';
              }}
            />
          </div>
          <span className="hidden max-w-[360px] text-sm font-black uppercase leading-tight tracking-tight text-foreground lg:inline-block">
            {companySettings?.name && companySettings.name !== 'A Carregar...' && companySettings.name !== 'Provisório' && companySettings.name !== 'Empresa' ? companySettings.name : 'A Sua Empresa'}
          </span>
        </div>
      </div>

      <div className="flex flex-1 justify-end items-center gap-2 md:gap-3">
        {/* Identificação da empresa, encostada ao cartão da data.
            Todos os valores vêm das Configurações; o que não estiver
            preenchido não aparece, em vez de mostrar um marcador vazio. */}
        <div className="hidden min-w-0 items-center gap-6 text-xs text-foreground/85 xl:flex">
          {companySettings?.nif && (
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-bold text-emerald-700 dark:text-emerald-400">NIF:</span>
              <span className="font-bold tabular-nums">{companySettings.nif}</span>
            </span>
          )}

          {(companySettings?.email || companySettings?.website) && (
            <div className="flex min-w-0 flex-col gap-1.5 leading-none">
              {companySettings?.email && (
                <span className="flex min-w-0 items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  <span className="truncate">{companySettings.email}</span>
                </span>
              )}
              {companySettings?.website && (
                <span className="flex min-w-0 items-center gap-2">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  <span className="truncate">{companySettings.website}</span>
                </span>
              )}
            </div>
          )}

          {(companySettings?.location || companySettings?.address) && (
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span className="truncate">{companySettings.location || companySettings.address}</span>
            </span>
          )}

          <div className="h-9 w-px shrink-0 bg-border" />
        </div>

        {/* Data actual, tal como no cabeçalho dos documentos */}
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 shadow-sm shrink-0">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <div className="leading-tight">
            <p className="text-xs font-bold text-foreground tabular-nums">{format(now, 'dd/MM/yyyy')}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-primary">{format(now, 'EEEE', { locale: ptBR })}</p>
          </div>
        </div>

        {installPrompt && !isInstalledPwa && !(window as any).electronAPI && (
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={handleInstallPwa}>
            <Download className="mr-2 h-4 w-4" />
            Instalar App
          </Button>
        )}
        {/* Search - Responsive */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-muted-foreground"
            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
          >
            <Search className="h-5 w-5" />
          </Button>

          <div className={cn(
            "md:block",
            isMobileSearchOpen ? "absolute top-12 right-0 w-[80vw] bg-background border p-2 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2" : "hidden"
          )}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground hidden md:block" />
              <Input
                placeholder="Pesquisar..."
                className="w-full bg-muted/50 md:w-[220px] md:pl-10 lg:w-[250px] xl:w-[280px] 2xl:w-[320px] focus:bg-card transition-all duration-300"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
                autoFocus={isMobileSearchOpen}
              />
            </div>
          </div>

          {showResults && searchTerm.length >= 2 && (
            <div
              className="absolute top-full mt-2 w-full max-h-[400px] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2 p-2 z-50"
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss when clicking results
            >
              {!hasResults && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Nenhum resultado encontrado para "{searchTerm}"
                </div>
              )}
              {searchResults.clients.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-1">Clientes</p>
                  {searchResults.clients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/clientes?search=${encodeURIComponent(c.name)}`)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted text-left"
                    >
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">{c.nif}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.credits.length > 0 && (
                <div className="mb-2 pt-2 border-t">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-1">Créditos</p>
                  {searchResults.credits.map(cr => (
                    <button
                      key={cr.id}
                      onClick={() => navigate(`/creditos?search=${encodeURIComponent(cr.id)}`)}
                      className="w-full flex flex-col px-3 py-2 rounded-lg hover:bg-muted text-left"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{cr.id}</span>
                        <span className="text-[10px] font-bold">{cr.principalAmount} AOA</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{cr.clientName}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.payments.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-1">Pagamentos</p>
                  {searchResults.payments.map(p => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/pagamentos?search=${encodeURIComponent(p.reference || p.id)}`)}
                      className="w-full flex flex-col px-3 py-2 rounded-lg hover:bg-muted text-left"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{p.reference || p.id}</span>
                        <span className="text-[10px] font-bold">{p.amount} AOA</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{p.clientName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {companySettings?.enableMultiTenant !== false && (
          <div className="hidden lg:block">
            <AccountSwitcher compact />
          </div>
        )}

        {/* Multi-tenancy Context Switcher (Admin & Super Admin) */}
        {(user?.role === 'super_admin' || user?.role === 'admin') && (
          <div className="hidden 2xl:flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeContextUserId ? "destructive" : "outline"}
                  size="sm"
                  className={cn(
                    "gap-2 h-10 px-4 font-bold border-2 transition-all duration-500",
                    activeContextUserId ? "animate-pulse border-danger shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "border-primary/20 hover:border-primary/40"
                  )}
                >
                  <User className="h-4 w-4" />
                  <span className="truncate max-w-[150px]">
                    {activeContextUserId
                      ? `Modo: ${users.find(u => u.id === activeContextUserId)?.name || '...'}`
                      : "Visão Global"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-h-[400px] overflow-y-auto p-1 shadow-2xl border-primary/10">
                <div className="px-3 py-2 border-b bg-muted/30 mb-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Alternar Contexto de Dados</p>
                </div>
                <DropdownMenuItem
                  onClick={() => setContextUserId(null)}
                  className={cn(
                    "gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-1",
                    !activeContextUserId ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted"
                  )}
                >
                  <Wifi className="h-5 w-5" />
                  <div className="flex flex-col">
                    <span className="text-sm">Visão Global (Todos os Dados)</span>
                    <span className="text-[10px] opacity-70">Acesso total a todos os registos do sistema</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
                {users.filter(u => {
                  if (u.id === user?.id) return false; // Exclude self from list (already on Visão Global)
                  if (user?.role === 'super_admin') return true; // Super Admin sees everyone
                  if (user?.role === 'admin') return u.role === 'manager'; // Admin only sees managers
                  return false; // Others see no one
                }).length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">Nenhum outro utilizador permitido</div>
                ) : (
                  users.filter(u => {
                    if (u.id === user?.id) return false;
                    if (user?.role === 'super_admin') return true;
                    if (user?.role === 'admin') return u.role === 'manager';
                    return false;
                  }).map(u => (
                    <DropdownMenuItem
                      key={u.id}
                      onClick={() => setContextUserId(u.id)}
                      className={cn(
                        "gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-1",
                        activeContextUserId === u.id ? "bg-danger/10 text-danger font-bold" : "hover:bg-muted"
                      )}
                    >
                      <User className="h-5 w-5" />
                      <div className="flex flex-col">
                        <span className="text-sm">{u.name}</span>
                        <span className="text-[10px] text-muted-foreground">{ROLES[u.role]?.label || u.role}</span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Indicadores de Estado */}
        <div className="hidden items-center gap-2 xl:flex 2xl:gap-3">
          {/* Indicador de Internet */}
          <div className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2 transition-all duration-300 2xl:px-3",
            isOnline
              ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400'
              : 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400 animate-pulse'
          )}>
            {isOnline ? <Wifi className="h-5 w-5 2xl:h-6 2xl:w-6" /> : <WifiOff className="h-5 w-5 2xl:h-6 2xl:w-6" />}
            <span className="hidden whitespace-nowrap text-[10px] font-semibold 2xl:inline">
              {isOnline ? 'Internet Online' : 'Internet Offline'}
            </span>
          </div>

          {/* Indicador de Sincronização */}
          <div className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2 transition-all duration-300 2xl:px-3",
            serverInfo?.isRunning
              ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400"
              : dbAdapterMode === 'remote' || companySettings?.syncEnabled
                ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
                : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-600 grayscale opacity-60 hover:opacity-100 hover:grayscale-0"
          )}>
            {serverInfo?.isRunning ? (
              <>
                <Server className="h-5 w-5 2xl:h-6 2xl:w-6" />
                <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase 2xl:inline">
                  Servidor ({connectedClients.length})
                </span>
              </>
            ) : (dbAdapterMode === 'remote' || companySettings?.syncEnabled) ? (
              <>
                <Cloud className="h-5 w-5 2xl:h-6 2xl:w-6" />
                <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase 2xl:inline">
                  Modo Cliente
                </span>
              </>
            ) : (
              <>
                <CloudOff className="h-5 w-5 2xl:h-6 2xl:w-6" />
                <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase 2xl:inline">
                  Modo Local
                </span>
              </>
            )}
          </div>
        </div>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-primary hover:bg-primary/10"
          title={isDark ? "Mudar para Modo Claro" : "Mudar para Modo Escuro"}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Chat Interno (Popover) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-primary hover:bg-primary/10"
              title="Chat Interno"
            >
              <MessageSquare className="h-5 w-5" />
              {unreadChatCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-bounce border-2 border-background">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0 shadow-2xl border-primary/10">
            <div className="p-4 border-b bg-primary/5 flex items-center justify-between">
              <h3 className="font-bold text-sm text-primary flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mensagens Recentes
              </h3>
              {unreadChatCount > 0 && <Badge variant="primary" className="text-[10px]">{unreadChatCount} novas</Badge>}
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {chatNotifications.filter(n => !n.read).length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">Sem novas mensagens</div>
              ) : (
                chatNotifications.filter(n => !n.read).slice(0, 5).map(msg => (
                  <div
                    key={msg.id}
                    className="p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors bg-primary/5 border-l-2 border-l-primary group relative"
                  >
                    <div
                      className="flex-1"
                      onClick={async () => {
                        await markNotificationAsRead(msg.id);
                        navigate('/chat');
                      }}
                    >
                      <div className="flex justify-between items-start mb-1 pr-6">
                        <span className="font-bold text-xs truncate">{msg.title}</span>
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">{formatDateTime(msg.timestamp)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{msg.message}</p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteNotification(msg.id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex border-t">
              <Button
                variant="ghost"
                className="flex-1 rounded-none h-10 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                onClick={async () => {
                  const chatIds = chatNotifications.filter(n => !n.read).map(n => n.id);
                  for (const id of chatIds) await markNotificationAsRead(id);
                }}
              >
                Lidas
              </Button>
              <Button
                variant="ghost"
                className="flex-1 rounded-none h-10 text-[10px] font-bold text-primary hover:bg-primary/5 border-l"
                onClick={() => navigate('/chat')}
              >
                Ver Todas
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notificações (Popover) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" title="Notificações">
              <Bell className={cn("h-5 w-5 origin-top", isBellRinging && "animate-bell-ring")} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-danger-foreground animate-pulse border-2 border-background">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0 shadow-2xl border-danger/10">
            <div className="p-4 border-b bg-danger/5 flex items-center justify-between">
              <h3 className="font-bold text-sm text-danger flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notificações do Sistema
              </h3>
              {unreadCount > 0 && <Badge variant="destructive" className="text-[10px]">{unreadCount} novas</Badge>}
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.filter(n => n.source !== 'chat' && !n.read).length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">Sem novas notificações</div>
              ) : (
                notifications.filter(n => n.source !== 'chat' && !n.read).slice(0, 5).map(notif => {
                  let colorClass = "text-info";
                  if (notif.type === 'warning' || notif.type === 'error') colorClass = "text-danger";
                  if (notif.type === 'success') colorClass = "text-success";

                  return (
                    <div
                      key={notif.id}
                      className="p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors flex gap-3 bg-danger/5 border-l-2 border-l-danger group relative"
                    >
                      <div
                        className="flex-1 flex gap-3 min-w-0"
                        onClick={async () => {
                          await markNotificationAsRead(notif.id);
                          navigate('/notificacoes');
                        }}
                      >
                        <div className={cn("mt-1", colorClass)}>
                          <AlertCircle className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex justify-between items-start mb-1">
                            <span className={cn("font-bold text-[11px] truncate pr-1", colorClass)}>{notif.title}</span>
                            <span className="text-[9px] text-muted-foreground whitespace-nowrap">{formatDateTime(notif.timestamp)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{notif.message}</p>
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await deleteNotification(notif.id);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex border-t">
              <Button
                variant="ghost"
                className="flex-1 rounded-none h-10 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                onClick={async () => await markAllAsRead()}
              >
                Marcar Lidas
              </Button>
              <Button
                variant="ghost"
                className="flex-1 rounded-none h-10 text-[10px] font-bold text-danger hover:bg-danger/5 border-l"
                onClick={() => navigate('/notificacoes')}
              >
                Ver Todas
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white font-black overflow-hidden ring-2 ring-primary/10">
                {user?.avatar && !avatarLoadFailed ? (
                  <img
                    src={user.avatar.startsWith('data:') ? user.avatar : `${getFileUrl(user.avatar)}${user.avatar.includes('?') ? '&' : '?'}t=${new Date().getTime()}`}
                    alt="User"
                    className="h-full w-full object-cover"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <span className="text-xs">
                    {userInitials}
                  </span>
                )}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground">{user?.name || 'Usuário'}</p>
                <p className="text-xs text-muted-foreground">
                  {user ? ROLES[user.role].label : 'Visitante'}
                </p>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={12}
            className="w-64 rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-white/10 dark:bg-[#242424]"
          >
            {/* Cabeçalho: rótulo discreto + acção principal em destaque */}
            <div className="px-4 pt-4 pb-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Definições de Perfil
              </p>
              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                className="mt-2 text-[15px] font-bold text-slate-900 transition-colors hover:text-primary dark:text-white dark:hover:text-white/80"
              >
                Ver Perfil
              </button>
            </div>

            <DropdownMenuSeparator className="mx-0 my-0 bg-slate-200 dark:bg-white/10" />

            {/* Atalhos */}
            <div className="p-2">
              <DropdownMenuItem
                className="gap-3 rounded-lg px-2.5 py-2.5 text-[13px] font-medium text-slate-600 focus:bg-slate-100 focus:text-slate-900 dark:text-slate-300 dark:focus:bg-white/5 dark:focus:text-white"
                onClick={() => setIsProfileOpen(true)}
              >
                <UserCircle className="h-4 w-4 shrink-0" />
                Editar a minha conta
              </DropdownMenuItem>

              <DropdownMenuItem
                className="gap-3 rounded-lg px-2.5 py-2.5 text-[13px] font-medium text-slate-600 focus:bg-slate-100 focus:text-slate-900 dark:text-slate-300 dark:focus:bg-white/5 dark:focus:text-white"
                onClick={() => setIsModulesOpen(true)}
              >
                <Shield className="h-4 w-4 shrink-0" />
                Ver Meus Módulos
              </DropdownMenuItem>

              <DropdownMenuItem
                className="gap-3 rounded-lg px-2.5 py-2.5 text-[13px] font-medium text-slate-600 focus:bg-slate-100 focus:text-slate-900 dark:text-slate-300 dark:focus:bg-white/5 dark:focus:text-white"
                onClick={() => setIsActivityOpen(true)}
              >
                <History className="h-4 w-4 shrink-0" />
                Atividade Recente
              </DropdownMenuItem>

              <DropdownMenuItem
                className="gap-3 rounded-lg px-2.5 py-2.5 text-[13px] font-medium text-slate-600 focus:bg-slate-100 focus:text-slate-900 dark:text-slate-300 dark:focus:bg-white/5 dark:focus:text-white"
                onClick={() => navigate('/notificacoes')}
              >
                <Bell className="h-4 w-4 shrink-0" />
                Notificações
              </DropdownMenuItem>

              <DropdownMenuItem
                className="gap-3 rounded-lg px-2.5 py-2.5 text-[13px] font-medium text-slate-600 focus:bg-slate-100 focus:text-slate-900 dark:text-slate-300 dark:focus:bg-white/5 dark:focus:text-white"
                onClick={() => navigate('/guia')}
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                Guia do Sistema
              </DropdownMenuItem>
            </div>

            <DropdownMenuSeparator className="mx-0 my-0 bg-slate-200 dark:bg-white/10" />

            <div className="p-2">
              <DropdownMenuItem
                className="rounded-lg px-2.5 py-2.5 text-[13px] font-medium text-slate-600 focus:bg-rose-50 focus:text-rose-600 dark:text-slate-300 dark:focus:bg-rose-500/10 dark:focus:text-rose-400"
                onClick={logout}
              >
                Terminar Sessão
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <ModulesModal isOpen={isModulesOpen} onClose={() => setIsModulesOpen(false)} />
      <ActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} />
    </header>
  );
}
