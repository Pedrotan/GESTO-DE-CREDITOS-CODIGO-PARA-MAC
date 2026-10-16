import { useInternetStatus, useLicenseInfo } from '@/ganchos/usar-estado-rede';
import { licenseAllowsFeature } from '@/bibliotecas/licenciamento';
import { IndicadorIntranet } from './IndicadorIntranet';
import { useState, useEffect } from 'react';
import { getLastCloudSyncStatus, isCloudSyncUrl, type CloudSyncStatus } from '@/servicos/ServicoSincronizacaoCloud';
import { OPEN_CLOUD_LINK_EVENT } from '@/componentes/layout/LigacaoNuvemDesktop';
import { Bell, Search, User, LogOut, MessageSquare, AlertCircle, X, Wifi, WifiOff, Sun, Moon, Cloud, CloudOff, RefreshCw, Server, Menu, Download, UserCircle, BookOpen, Shield, History, Calendar, Mail, Globe, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Badge } from '@/componentes/ui/badge';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDateTime } from '@/bibliotecas/formatters';
import { cn, getFileUrl } from '@/bibliotecas/utils';
import { ROLES } from '@/tipos/autenticacao';
import { AccountSwitcher } from '@/componentes/contas/AccountSwitcher';
import { useWebMultiTenant } from '@/ganchos/usar-multi-empresa-web';
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
  // Internet real: pedido leve de 20 em 20 segundos (o Wi-Fi pode estar ligado sem Internet).
  const internetState = useInternetStatus();
  const isOnline = internetState !== 'offline';
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(getLastCloudSyncStatus);
  useEffect(() => {
    const handler = (event: Event) => setCloudStatus((event as CustomEvent<CloudSyncStatus>).detail);
    window.addEventListener('tango-cloud-sync-status', handler);
    return () => window.removeEventListener('tango-cloud-sync-status', handler);
  }, []);
  const webMultiTenant = useWebMultiTenant();
  // Multi-Empresas: só com a licença que o inclui (o servidor também o decide na versão web).
  const licenseInfo = useLicenseInfo(companySettings?.licenseKey);
  const multiTenantAllowed = licenseAllowsFeature(licenseInfo, 'multi_empresa');
  const cloudLinked = Boolean(companySettings?.syncEnabled && isCloudSyncUrl(companySettings?.syncUrl));
  const pendingLabel = cloudStatus.pending ? `${cloudStatus.pending} pendente${cloudStatus.pending === 1 ? '' : 's'}` : '';
  const cloudStatusLabel = cloudStatus.state === 'synced' ? 'Sincronizado'
    : cloudStatus.state === 'error' ? (pendingLabel || 'Sem sincronizar')
      : cloudStatus.state === 'syncing' ? 'A sincronizar'
        : pendingLabel || 'Modo Cloud';
  const lastSyncText = cloudStatus.at ? ` Última tentativa: ${new Date(cloudStatus.at).toLocaleTimeString('pt-AO')}.` : '';
  const syncIndicatorTitle = serverInfo?.isRunning ? 'Servidor da rede local activo'
    : dbAdapterMode === 'remote' ? 'Ligado a um servidor da rede local'
      : cloudLinked
        ? cloudStatus.state === 'error'
          ? `Sincronização com a versão web falhou: ${(cloudStatus.message || 'erro').replace(/.+$/, '')}. Vai tentar de novo automaticamente.${pendingLabel ? ` ${pendingLabel} por enviar.` : ''}${lastSyncText}`
          : cloudStatus.state === 'synced' ? `Sincronizado com a versão web.${lastSyncText}`
            : `A sincronizar com a versão web.${pendingLabel ? ` ${pendingLabel} por enviar.` : ''}`
        : window.electronAPI ? 'Modo Local: clique para ligar este computador à versão web' : 'Modo Local';
  const canOpenCloudLink = Boolean(window.electronAPI) && !serverInfo?.isRunning && dbAdapterMode !== 'remote' && !cloudLinked;
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

  const companyDisplayName = companySettings?.name && !['A Carregar...', 'Provisório', 'Empresa'].includes(companySettings.name)
    ? companySettings.name
    : 'A Sua Empresa';

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
          {/* Nome (no máximo 2 linhas, nunca uma palavra por linha) e NIF por baixo. O nome completo fica na dica. */}
          <div className="hidden min-w-[9rem] max-w-[13rem] flex-col leading-tight lg:flex xl:max-w-[16rem] min-[1800px]:max-w-[22rem]" title={companyDisplayName}>
            <span className="line-clamp-2 break-words text-[13px] font-black uppercase tracking-tight text-foreground">
              {companyDisplayName}
            </span>
            {companySettings?.nif && (
              <span className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">
                <span className="font-bold text-emerald-700 dark:text-emerald-400">NIF</span> <span className="tabular-nums">{companySettings.nif}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 justify-end items-center gap-1.5 md:gap-2 2xl:gap-3">
        {/* Contactos da empresa: só em ecrãs muito largos, onde há espaço sem apertar os outros elementos.
            Todos os valores vêm das Configurações; o que não estiver
            preenchido não aparece, em vez de mostrar um marcador vazio. */}
        <div className="hidden min-w-0 max-w-[26rem] items-center gap-5 text-xs text-foreground/85 min-[1800px]:flex">
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
        <div className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 shadow-sm shrink-0">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <div className="leading-tight">
            <p className="text-xs font-bold text-foreground tabular-nums">{format(now, 'dd/MM/yyyy')}</p>
            <p className="hidden text-[9px] font-semibold uppercase tracking-wide text-primary xl:block">{format(now, 'EEEE', { locale: ptBR })}</p>
          </div>
        </div>

        {installPrompt && !isInstalledPwa && !(window as any).electronAPI && (
          <Button variant="outline" size="sm" className="hidden shrink-0 sm:flex" onClick={handleInstallPwa} title="Instalar App">
            <Download className="h-4 w-4 min-[1800px]:mr-2" />
            <span className="hidden min-[1800px]:inline">Instalar App</span>
          </Button>
        )}
        {/* Search - Responsive */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground xl:hidden"
            title="Pesquisar"
            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
          >
            <Search className="h-5 w-5" />
          </Button>

          <div className={cn(
            "xl:block",
            isMobileSearchOpen ? "absolute top-12 right-0 w-[min(80vw,24rem)] bg-background border p-2 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2" : "hidden"
          )}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground hidden xl:block" />
              <Input
                placeholder="Pesquisar..."
                className="w-full bg-muted/50 xl:w-[210px] xl:pl-10 2xl:w-[240px] min-[1800px]:w-[300px] focus:bg-card transition-all duration-300"
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
                        <span className="text-[10px] font-bold">{formatCurrency(cr.principalAmount)}</span>
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
                        <span className="text-[10px] font-bold">{formatCurrency(p.amount)}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{p.clientName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {multiTenantAllowed && (webMultiTenant ?? companySettings?.enableMultiTenant !== false) && (
          <div className="hidden lg:block">
            <AccountSwitcher compact />
          </div>
        )}

        {/* Multi-tenancy Context Switcher (Admin & Super Admin) */}
        {(user?.role === 'super_admin' || user?.role === 'admin') && (
          <div className="hidden shrink-0 2xl:flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeContextUserId ? "destructive" : "outline"}
                  size="sm"
                  className={cn(
                    "gap-2 h-10 px-3 font-bold border-2 transition-all duration-500 min-[1800px]:px-4",
                    activeContextUserId ? "animate-pulse border-danger shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "border-primary/20 hover:border-primary/40"
                  )}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span className="hidden truncate max-w-[150px] min-[1800px]:inline">
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
        <div className="hidden shrink-0 items-center gap-2 xl:flex min-[1800px]:gap-3">
          {/* Indicador de Internet */}
          <div title={internetState === 'checking' ? 'A verificar a ligação à Internet…' : isOnline ? 'Ligado à Internet (verificado de 20 em 20 segundos)' : 'Sem acesso à Internet: os dados continuam a ser gravados neste computador.'} className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2 transition-all duration-300 min-[1800px]:px-3",
            isOnline
              ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400'
              : 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400 animate-pulse'
          )}>
            {isOnline ? <Wifi className="h-5 w-5 min-[1800px]:h-6 min-[1800px]:w-6" /> : <WifiOff className="h-5 w-5 min-[1800px]:h-6 min-[1800px]:w-6" />}
            <span className="hidden whitespace-nowrap text-[10px] font-semibold min-[1800px]:inline">
              {internetState === 'checking' ? 'A verificar…' : isOnline ? 'Internet Online' : 'Offline'}
            </span>
          </div>

          {/* Indicador de Intranet (só com licença que permite a rede local) */}
          <IndicadorIntranet />

          {/* Indicador de Sincronização */}
          <div
            role={canOpenCloudLink ? 'button' : undefined}
            tabIndex={canOpenCloudLink ? 0 : undefined}
            title={syncIndicatorTitle}
            onClick={canOpenCloudLink ? () => window.dispatchEvent(new Event(OPEN_CLOUD_LINK_EVENT)) : undefined}
            onKeyDown={canOpenCloudLink ? (event) => { if (event.key === 'Enter') window.dispatchEvent(new Event(OPEN_CLOUD_LINK_EVENT)); } : undefined}
            className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2 transition-all duration-300 min-[1800px]:px-3",
            canOpenCloudLink && "cursor-pointer",
            serverInfo?.isRunning
              ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400"
              : dbAdapterMode === 'remote'
                ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
                : cloudLinked
                  ? cloudStatus.state === 'error'
                    ? "bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
                    : cloudStatus.state === 'synced'
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                      : "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
                  : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-600 grayscale opacity-60 hover:opacity-100 hover:grayscale-0"
          )}>
            {serverInfo?.isRunning ? (
              <>
                <Server className="h-5 w-5 min-[1800px]:h-6 min-[1800px]:w-6" />
                <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase min-[1800px]:inline">
                  Servidor ({connectedClients.length})
                </span>
              </>
            ) : dbAdapterMode === 'remote' ? (
              <>
                <Cloud className="h-5 w-5 min-[1800px]:h-6 min-[1800px]:w-6" />
                <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase min-[1800px]:inline">
                  Modo Cliente
                </span>
              </>
            ) : cloudLinked ? (
              <>
                {cloudStatus.state === 'error' ? <CloudOff className="h-5 w-5 min-[1800px]:h-6 min-[1800px]:w-6" />
                  : cloudStatus.state === 'syncing' ? <RefreshCw className="h-5 w-5 animate-spin min-[1800px]:h-6 min-[1800px]:w-6" />
                    : <Cloud className="h-5 w-5 min-[1800px]:h-6 min-[1800px]:w-6" />}
                <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase min-[1800px]:inline">
                  {cloudStatusLabel}
                </span>
              </>
            ) : (
              <>
                <CloudOff className="h-5 w-5 min-[1800px]:h-6 min-[1800px]:w-6" />
                <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase min-[1800px]:inline">
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
          className="shrink-0 text-primary hover:bg-primary/10"
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
              className="relative shrink-0 text-primary hover:bg-primary/10"
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
            <Button variant="ghost" size="icon" className="relative shrink-0" title="Notificações">
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
            <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-card p-1.5 cursor-pointer hover:bg-muted/50 transition-colors min-[1800px]:px-3 min-[1800px]:py-2" title={user?.name || 'Usuário'}>
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
              <div className="hidden max-w-[9rem] text-left min-[1800px]:block">
                <p className="truncate text-sm font-medium text-foreground">{user?.name || 'Usuário'}</p>
                <p className="truncate text-xs text-muted-foreground">
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
      {isActivityOpen && <ActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} />}
    </header>
  );
}
