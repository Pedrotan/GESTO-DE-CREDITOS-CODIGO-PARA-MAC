import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn, getFileUrl } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Role } from '@/tipos/autenticacao';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { validateLicense } from '@/bibliotecas/licenciamento';
import { CaixaEletronicoIcon } from '@/componentes/ui/CaixaEletronicoIcon';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  FileText,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  Lock,
  BookOpen,
  CheckCircle,
  BarChart,
  ShieldCheck,
  MessageSquare,
  MessageCircle,
  Wallet,
  Calculator,
  Scale,
  Activity,
  Trash2,
  Handshake,
  LineChart,
  CalendarDays,
  Contact,
  ReceiptText,
  MonitorSmartphone,
  Cloud,
  ChevronDown,
  UserPlus,
  UserCog,
  PersonStanding,
  Globe,
  SlidersHorizontal,
  Blocks,
  DatabaseBackup,
  KeyRound,
  Smartphone,
  Landmark,
  ScrollText,
  Megaphone,
  Mail,
  PenTool,
  Info,
  RefreshCw,
  Gavel,
  ShieldAlert,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/componentes/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/componentes/ui/hover-card";

interface MenuItem {
  icon: any;
  label: string;
  path: string;
  roles?: Role[];
  permission?: string;
  moduleKey?: string;
  /** Submenu indisponível na licença singular (ex.: funcionalidades de rede). */
  hideWhenSingular?: boolean;
  /** Submenu só para administradores. */
  adminOnly?: boolean;
  /** Submenus. O item pai deixa de navegar e passa a abrir/fechar a lista. */
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Painel', path: '/' },
  {
    icon: Users,
    label: 'Cadastro',
    path: '/clientes',
    permission: 'manage_clients',
    children: [
      { icon: UserPlus, label: 'Clientes Comuns', path: '/clientes' },
      { icon: PersonStanding, label: 'Aposentados', path: '/aposentados' },
      { icon: Globe, label: 'Estrangeiros', path: '/estrangeiros' },
    ],
  },
  { icon: Handshake, label: 'Fornecedores', path: '/fornecedores', moduleKey: 'enableSuppliersModule' },
  { icon: LineChart, label: 'Mercado', path: '/mercado' },
  { icon: Calculator, label: 'Simulador', path: '/simulador' },
  { icon: CreditCard, label: 'Créditos', path: '/creditos', permission: 'view_credits' },
  { icon: CaixaEletronicoIcon, label: 'Pagamentos', path: '/pagamentos', permission: 'manage_payments' },
  { icon: CalendarDays, label: 'Plano Mensal', path: '/plano-mensal', permission: 'view_credits' },
  { icon: Contact, label: 'Contactos', path: '/contactos', permission: 'manage_clients' },
  { icon: ReceiptText, label: 'Despesas', path: '/despesas', permission: 'manage_fiscal' },
  { icon: FileText, label: 'Contratos', path: '/contratos', permission: 'view_credits' },
  { icon: ScrollText, label: 'Cartas Bancárias', path: '/cartas-transferencia', permission: 'view_credits' },
  { icon: MessageCircle, label: 'Hub de Cobrança', path: '/hub-whatsapp', permission: 'manage_payments' },
  { icon: Bell, label: 'Notificações', path: '/notificacoes' },
  { icon: MessageSquare, label: 'Chat Interno', path: '/chat' },
  { icon: FileText, label: 'Relatórios', path: '/relatorios', permission: 'view_reports' },
  { icon: Calculator, label: 'Contabilidade', path: '/contabilidade', permission: 'manage_fiscal' },
  { icon: ReceiptText, label: 'Relatórios Fiscais', path: '/relatorios-fiscais', permission: 'manage_fiscal' },
  { icon: CheckCircle, label: 'Aprovações', path: '/aprovacoes', permission: 'approve_loans' },
  {
    icon: UserCog,
    label: 'Utilizadores',
    path: '/utilizadores',
    children: [
      { icon: UserCog, label: 'Utilizadores', path: '/utilizadores', permission: 'manage_users' },
      { icon: ShieldCheck, label: 'Perfis de Acesso', path: '/perfis', permission: 'manage_users' },
      { icon: BarChart, label: 'Relatórios Utilizadores', path: '/relatorios-atividade', roles: ['super_admin'], moduleKey: 'enableProfileActivity' },
      { icon: Lock, label: 'Auditoria', path: '/logs-auditoria' },
      { icon: ShieldAlert, label: 'Centro de Segurança', path: '/seguranca', permission: 'view_audit_logs' },
      { icon: MonitorSmartphone, label: 'Sessões Ativas', path: '/sessoes', permission: 'manage_users' },
      { icon: ShieldCheck, label: 'Limites', path: '/limites-utilizador', permission: 'manage_limits' },
    ],
  },
  { icon: Wallet, label: 'Gateways de Pagamento', path: '/portais-pagamento', permission: 'manage_gateways', moduleKey: 'enableGatewaysModule' },
  { icon: ShieldCheck, label: 'Garantias', path: '/garantias', permission: 'manage_warranties', moduleKey: 'enableWarrantiesModule' },
  { icon: Activity, label: 'Análise de Risco', path: '/scoring', permission: 'view_reports', moduleKey: 'enableScoringModule' },
  { icon: Scale, label: 'Contencioso', path: '/contencioso', permission: 'manage_legal', moduleKey: 'enableLegalModule' },
  { icon: Trash2, label: 'Lixeira do Sistema', path: '/lixeira', permission: 'manage_settings' },
  {
    icon: Settings,
    label: 'Configurações',
    path: '/definicoes',
    permission: 'manage_settings',
    children: [
      { icon: SlidersHorizontal, label: 'Geral', path: '/definicoes?tab=general' },
      { icon: ShieldCheck, label: 'Segurança', path: '/definicoes?tab=security' },
      { icon: Blocks, label: 'Módulos', path: '/definicoes?tab=modules' },
      { icon: Smartphone, label: 'WhatsApp', path: '/definicoes?tab=whatsapp' },
      { icon: Landmark, label: 'Contas', path: '/definicoes?tab=banking' },
      { icon: ScrollText, label: 'Contratos', path: '/definicoes?tab=contracts' },
      { icon: Calculator, label: 'Simulador e Produtos', path: '/definicoes?tab=simulador' },
      { icon: Megaphone, label: 'Marketing', path: '/definicoes?tab=marketing' },
      { icon: Mail, label: 'Email (SMTP)', path: '/definicoes?tab=email' },
      { icon: Cloud, label: 'Cloud', path: '/definicoes?tab=cloud', hideWhenSingular: true },
      { icon: DatabaseBackup, label: 'Backup', path: '/definicoes?tab=backup' },
      { icon: RefreshCw, label: 'Backup Automático', path: '/definicoes?tab=auto-backup' },
      { icon: PenTool, label: 'Assinaturas', path: '/definicoes?tab=signatures' },
      { icon: KeyRound, label: 'Licença', path: '/definicoes?tab=license', adminOnly: true },
      { icon: Info, label: 'Sobre', path: '/definicoes?tab=about' },
    ],
  },
  { icon: Gavel, label: 'Termos e Políticas', path: '/termos-e-politicas' },
  { icon: BookOpen, label: 'Guia do Sistema', path: '/guia' },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed, mobileOpen = false, setMobileOpen }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const { companySettings } = useData();
  const [isSingular, setIsSingular] = useState(true);
  const [openMenus, setOpenMenus] = useState<string[]>([]);

  /**
   * Um submenu pode apontar para uma aba (ex.: /definicoes?tab=backup).
   * Nesses casos a rota activa tem de incluir a query, senão todas as abas
   * apareceriam activas ao mesmo tempo.
   */
  const matchPath = useCallback((path: string) => {
    if (path.includes('?')) return location.pathname + location.search === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }, [location.pathname, location.search]);

  /**
   * Regras de acesso (módulo, papel, permissão) partilhadas entre os itens de
   * topo e os subitens — necessário porque grupos como "Usuários" juntam
   * subitens com permissões diferentes entre si (ex.: Limites exige
   * manage_limits, Auditoria exige view_audit_logs).
   */
  const isAllowed = useCallback((item: MenuItem): boolean => {
    if (item.moduleKey) {
      const isEnabled = companySettings[item.moduleKey as keyof typeof companySettings];
      if (isEnabled !== undefined && isEnabled !== null && !Boolean(isEnabled)) return false;

      const adminOnlyKey = `${item.moduleKey}AdminOnly` as keyof typeof companySettings;
      const isAdminOnly = companySettings[adminOnlyKey];
      if (isAdminOnly && user?.role !== 'admin' && user?.role !== 'super_admin') return false;
    }

    if (user?.role === 'super_admin') return true;
    if (item.roles && !item.roles.includes(user?.role as Role)) return false;
    if (item.permission) return ServicoControloAcesso.temPermissao(user, item.permission);

    const serverRelatedPaths = ['/definicoes?tab=network', '/chat'];
    if (isSingular && (serverRelatedPaths.some(p => item.path.startsWith(p)) || item.label.includes('Chat'))) {
      return false;
    }

    return true;
  }, [companySettings, isSingular, user]);

  /**
   * Submenus visíveis para este utilizador.
   * Estas restrições eram feitas pela barra de separadores da página de
   * Configurações; como ela foi removida, passam a ser aplicadas aqui.
   */
  const filhosVisiveis = useCallback((item: MenuItem): MenuItem[] =>
    (item.children || []).filter(child => {
      if (child.hideWhenSingular && isSingular) return false;
      if (child.adminOnly && user?.role !== 'admin' && user?.role !== 'super_admin') return false;
      if (!isAllowed(child)) return false;
      return true;
    }), [isAllowed, isSingular, user]);

  const isChildActive = useCallback((item: MenuItem) => filhosVisiveis(item).some(c => matchPath(c.path)), [filhosVisiveis, matchPath]);

  // Abre automaticamente o menu cuja subpágina está activa
  useEffect(() => {
    menuItems.forEach(item => {
      if (item.children && isChildActive(item)) {
        setOpenMenus(prev => (prev.includes(item.path) ? prev : [...prev, item.path]));
      }
    });
  }, [isChildActive]);

  const toggleMenu = (path: string) => {
    setOpenMenus(prev => (prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]));
  };

  useEffect(() => {
    const checkTier = async () => {
      const license = await validateLicense(companySettings?.licenseKey || '');
      setIsSingular(license.tier === 'singular');
    };
    checkTier();
  }, [companySettings?.licenseKey]);

  const handleMobileClick = () => {
    if (window.innerWidth < 768 && setMobileOpen) {
      setMobileOpen(false);
    }
  };

  const filteredMenu = menuItems.filter(item => {
    // Grupos sem permissão própria (ex.: "Usuários") só existem para juntar
    // subitens com regras de acesso diferentes; a visibilidade do grupo
    // depende de haver pelo menos um subitem visível para este utilizador.
    if (item.children && item.children.length > 0 && !item.permission && !item.roles && !item.moduleKey) {
      return filhosVisiveis(item).length > 0;
    }

    return isAllowed(item);
  });

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-svh flex-col bg-sidebar transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl',
        collapsed ? 'w-20' : 'w-[min(18rem,85vw)] md:w-56 lg:w-64',
        mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
      )}
    >
      {/* Header / Logo */}
      <div className={cn(
        "h-16 md:h-20 shrink-0 border-b border-sidebar-border/80 transition-all duration-300 relative bg-gradient-to-b from-sidebar-accent/20 to-transparent",
        collapsed ? "flex items-center justify-center px-0" : "flex items-center justify-between px-3.5"
      )}>
        <div 
          className={cn(
            "flex items-center min-w-0 transition-all duration-300",
            collapsed ? "justify-center w-full" : "gap-3 flex-1 overflow-hidden"
          )}
          onClick={() => {
            if (collapsed) setCollapsed(false);
          }}
          role={collapsed ? "button" : undefined}
          title={collapsed ? "Clique para expandir o menu" : undefined}
        >
          <div className={cn(
            "flex items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-white/20 overflow-hidden p-0.5 shrink-0 transition-all duration-300",
            collapsed ? "h-11 w-11 hover:scale-105 cursor-pointer" : "h-11 w-11 hover:scale-105"
          )}>
            <img
              src={companySettings?.logo ? (companySettings.logo.startsWith('data:') ? companySettings.logo : `${getFileUrl(companySettings.logo)}?t=${new Date().getTime()}`) : 'logo-app.png'}
              alt="Logo"
              className="h-full w-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.endsWith('favicon.png')) {
                  target.src = 'favicon.png';
                }
              }}
            />
          </div>

          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
              {(() => {
                const name = companySettings?.name && companySettings.name !== 'A Carregar...' && companySettings.name !== 'Provisório' && companySettings.name !== 'Empresa' ? companySettings.name : 'Tango Gestão ERP';
                const len = name.length;
                let sizeClass = 'text-sm font-bold truncate';
                if (len > 30) sizeClass = 'text-[11px] font-bold leading-tight line-clamp-2';
                else if (len > 20) sizeClass = 'text-xs font-bold truncate';

                return (
                  <span 
                    title={name} 
                    className={cn("font-display text-white tracking-tight leading-tight", sizeClass)}
                  >
                    {name}
                  </span>
                );
              })()}
              <span className="text-[9px] text-sidebar-primary font-bold uppercase tracking-wider mt-0.5 truncate">
                {companySettings?.name && companySettings.name !== 'A Carregar...' ? 'Gestão de Crédito' : 'Tango Investment'}
              </span>
            </div>
          )}
        </div>

        {/* Toggle button when Expanded */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent/50 text-sidebar-accent-foreground transition-all hover:bg-sidebar-primary hover:text-sidebar-primary-foreground shrink-0 border border-white/5 active:scale-90"
            title="Recolher menu"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Floating Toggle button on border when Collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg border border-sidebar-border hover:scale-110 hover:brightness-110 active:scale-95 transition-all duration-200 cursor-pointer"
            title="Expandir menu"
          >
            <ChevronRight className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden custom-scrollbar",
        collapsed ? "py-3 px-2 gap-1.5 items-center" : "p-3 gap-1"
      )}>
        <TooltipProvider delayDuration={0}>
          {filteredMenu.map((item) => {
            const filhos = filhosVisiveis(item);
            const hasChildren = filhos.length > 0;
            const isActive = hasChildren
              ? isChildActive(item)
              : item.path === '/'
                ? location.pathname === '/'
                : location.pathname === item.path || location.pathname.startsWith(item.path + '/');

            // --- Item com submenus (acordeão) ---
            if (hasChildren) {
              const isOpen = openMenus.includes(item.path);

              // Recolhido: mostra um painel flutuante clicável com as subpáginas ao passar o rato
              if (collapsed) {
                return (
                  <HoverCard key={item.path} openDelay={80} closeDelay={150}>
                    <HoverCardTrigger asChild>
                      <Link
                        to={filhos[0].path}
                        onClick={handleMobileClick}
                        className={cn(
                          'relative w-11 h-11 flex items-center justify-center rounded-xl shrink-0 transition-all duration-200 font-medium group/parent',
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-gold scale-105 font-bold'
                            : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/80 hover:text-white hover:scale-105'
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />

                        {/* Com o menu recolhido não se veem os submenus, por isso
                            um distintivo no canto avisa que este item abre mais opções.
                            O número diz quantas. */}
                        <span
                          className={cn(
                            'absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black leading-none ring-2 ring-sidebar transition-transform duration-200 group-hover/parent:scale-110',
                            isActive
                              ? 'bg-sidebar text-sidebar-primary'
                              : 'bg-sidebar-primary text-sidebar-primary-foreground'
                          )}
                        >
                          {filhos.length}
                        </span>
                      </Link>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="right"
                      align="start"
                      sideOffset={12}
                      className="w-56 rounded-2xl border border-white/10 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur-md"
                    >
                      <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-sidebar-primary">
                        {item.label}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {filhos.map(child => {
                          const childActive = matchPath(child.path);
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              onClick={handleMobileClick}
                              className={cn(
                                'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                                childActive
                                  ? 'bg-white/10 text-white font-semibold'
                                  : 'text-white/70 hover:bg-white/10 hover:text-white'
                              )}
                            >
                              <child.icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              }

              return (
                <div key={item.path} className="w-full">
                  <button
                    type="button"
                    onClick={() => toggleMenu(item.path)}
                    aria-expanded={isOpen}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 font-medium',
                      isActive || isOpen
                        ? 'bg-sidebar-accent text-white font-semibold'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 transition-transform duration-200',
                        isOpen ? 'rotate-180' : 'rotate-0'
                      )}
                    />
                  </button>

                  {/* Lista de submenus: guia vertical à esquerda e um ícone por entrada */}
                  <div
                    className={cn(
                      'grid transition-all duration-200 ease-in-out',
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-[1.55rem] mt-1 flex flex-col gap-0.5 border-l border-sidebar-border/70 pl-3 py-1">
                        {filhos.map(child => {
                          const childActive = matchPath(child.path);
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              onClick={handleMobileClick}
                              className={cn(
                                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all duration-200',
                                childActive
                                  ? 'bg-sidebar-primary/15 text-sidebar-primary font-semibold'
                                  : 'text-sidebar-foreground/70 font-medium hover:bg-sidebar-accent/60 hover:text-white'
                              )}
                            >
                              <child.icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const content = (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleMobileClick}
                className={cn(
                  'transition-all duration-200 font-medium',
                  collapsed
                    ? cn(
                        'w-11 h-11 flex items-center justify-center rounded-xl shrink-0',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-gold scale-105 font-bold'
                          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/80 hover:text-white hover:scale-105'
                      )
                    : cn(
                        'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-gold'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    {content}
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={12} className="bg-slate-950/95 text-white border border-white/15 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-2xl backdrop-blur-md z-50">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return content;
          })}
        </TooltipProvider>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="shrink-0 border-t border-sidebar-border/60 p-3">
          <div className="rounded-xl bg-sidebar-accent/30 backdrop-blur-md p-3 border border-white/5">
            <p className="text-[11px] font-bold text-sidebar-primary uppercase tracking-wider mb-0.5">Versão 3.0.2</p>
            <p className="text-[10px] text-sidebar-foreground/50 font-medium truncate">
              © 2026 Tango Gestão ERP
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
