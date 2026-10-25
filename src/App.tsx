import { Suspense, useEffect, useState } from "react";
import { isChunkLoadError, lazyWithReload, reloadForNewVersion } from "@/bibliotecas/carregamento-modulos";
import { TooltipProvider } from "@/componentes/ui/tooltip";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useData } from "@/contextos/ContextoDados";
import { useAuth } from "@/contextos/ContextoAutenticacao";
import { MaintenanceGuard } from "@/componentes/MaintenanceGuard";
import { OnboardingWizard } from "@/componentes/layout/OnboardingWizard";
import { LigacaoEmpresaWeb } from "@/componentes/layout/LigacaoEmpresaWeb";
import { GuardaSubscricaoWeb } from "@/componentes/layout/GuardaSubscricaoWeb";
import { BackupReminder } from "@/componentes/layout/BackupReminder";
import { AutoBackupManager } from "@/componentes/layout/AutoBackupManager";
import { FilaFiscalGlobal } from "@/componentes/fiscal/FilaFiscalGlobal";
import { HubCobrancaGlobal } from "@/componentes/cobranca/HubCobrancaGlobal";
import { AvisoActualizacao } from "@/componentes/layout/AvisoActualizacao";
import { SplashScreen } from "@/componentes/layout/SplashScreen";
import { isPublicWebBuild } from "@/bibliotecas/ambiente";

import Entrar from "./paginas/Entrar";
// Páginas grandes carregadas só quando são abertas (arranque mais rápido).
const Utilizadores = lazyWithReload(() => import("./paginas/Utilizadores"));

// --- Lazy Loading Routes for Performance ---
const Inicio = lazyWithReload(() => import("./paginas/Inicio"));
const Clientes = lazyWithReload(() => import("./paginas/Clientes"));
const Mercado = lazyWithReload(() => import("./paginas/Mercado"));
const PlanoMensal = lazyWithReload(() => import("./paginas/PlanoMensal"));
const Contactos = lazyWithReload(() => import("./paginas/Contactos"));
const Despesas = lazyWithReload(() => import("./paginas/Despesas"));
const Sessoes = lazyWithReload(() => import("./paginas/Sessoes"));
const Creditos = lazyWithReload(() => import("./paginas/Creditos"));
const FichaCredito = lazyWithReload(() => import("./paginas/FichaCredito"));
const Pagamentos = lazyWithReload(() => import("./paginas/Pagamentos"));
const Contratos = lazyWithReload(() => import("./paginas/Contratos"));
const Notificacoes = lazyWithReload(() => import("./paginas/Notificacoes"));
const Definicoes = lazyWithReload(() => import("./paginas/Definicoes"));
const Relatorios = lazyWithReload(() => import("./paginas/Relatorios"));
const LogsAuditoria = lazyWithReload(() => import("./paginas/LogsAuditoria"));
const CentroSeguranca = lazyWithReload(() => import("./paginas/CentroSeguranca"));
const Guia = lazyWithReload(() => import("./paginas/Guia"));
const PortaisPagamento = lazyWithReload(() => import("./paginas/PortaisPagamento"));
const EsqueciSenha = lazyWithReload(() => import("./paginas/EsqueciSenha"));
const RedefinirSenha = lazyWithReload(() => import("./paginas/RedefinirSenha"));
const ConfirmarEmail = lazyWithReload(() => import("./paginas/ConfirmarEmail"));
import { isCompanyActiveLocally } from "@/servicos/ServicoIdentidadeEmpresa";
const Aprovacoes = lazyWithReload(() => import("./paginas/Aprovacoes"));
const LimitesUtilizador = lazyWithReload(() => import("./paginas/LimitesUtilizador"));
const RelatoriosAtividadeUtilizador = lazyWithReload(() => import("./paginas/RelatoriosAtividadeUtilizador"));
const Chat = lazyWithReload(() => import("./paginas/Chat"));
const RelatoriosFiscais = lazyWithReload(() => import("./paginas/RelatoriosFiscais"));
const Contabilidade = lazyWithReload(() => import("./paginas/Contabilidade"));
const CentralWhatsApp = lazyWithReload(() => import("./paginas/CentralWhatsApp"));
const Garantias = lazyWithReload(() => import("./paginas/Garantias"));
const Contencioso = lazyWithReload(() => import("./paginas/Contencioso"));
const Fornecedores = lazyWithReload(() => import("./paginas/Fornecedores"));
const PainelRH = lazyWithReload(() => import("./paginas/rh/PainelRH"));
const FuncionariosRH = lazyWithReload(() => import("./paginas/rh/FuncionariosRH"));
const DocumentosRH = lazyWithReload(() => import("./paginas/rh/DocumentosRH"));
const ConfiguracoesRH = lazyWithReload(() => import("./paginas/rh/ConfiguracoesRH"));
const LivroPontoRH = lazyWithReload(() => import("./paginas/rh/LivroPontoRH"));
const AusenciasRH = lazyWithReload(() => import("./paginas/rh/AusenciasRH"));
const CalendarioRH = lazyWithReload(() => import("./paginas/rh/CalendarioRH"));
const ProcessamentoRH = lazyWithReload(() => import("./paginas/rh/ProcessamentoRH"));
const RecibosRH = lazyWithReload(() => import("./paginas/rh/RecibosRH"));
const FeriasRH = lazyWithReload(() => import("./paginas/rh/FeriasRH"));
const RelatoriosRH = lazyWithReload(() => import("./paginas/rh/RelatoriosRH"));
const PortalFuncionario = lazyWithReload(() => import("./paginas/rh/PortalFuncionario"));
const Scoring = lazyWithReload(() => import("./paginas/Scoring"));
const SimuladorCredito = lazyWithReload(() => import("./paginas/SimuladorCredito"));
const TermosPoliticas = lazyWithReload(() => import("./paginas/TermosPoliticas"));
const CartasTransferencia = lazyWithReload(() => import("./paginas/CartasTransferencia").then(m => ({ default: m?.CartasTransferencia })));
const LixeiraPage = lazyWithReload(() => import("./paginas/Lixeira"));
const Perfis = lazyWithReload(() => import("./paginas/Perfis"));
const NaoEncontrado = lazyWithReload(() => import("./paginas/NaoEncontrado"));

import { LicenseGuard } from "./componentes/LicenseGuard";
import Ativacao from "./paginas/Ativacao";
const LoginAdmin = lazyWithReload(() => import("./paginas/Admin/LoginAdmin"));
const DashboardAdmin = lazyWithReload(() => import("./paginas/Admin/DashboardAdmin"));
import { MasterProtectedRoute } from "./admin/MasterProtectedRoute";

const suspenseFallback = <SplashScreen />;

const ProtectedRoute = ({ children, permission }: { children: JSX.Element; permission?: string }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/entrar" replace />;
  }

  // Página com permissão própria: só a conta principal passa sempre; os outros precisam da permissão
  // (a mesma regra do menu). O acesso directo pelo endereço mostra «Acesso negado».
  if (permission && !ServicoControloAcesso.temPermissao(user, permission)) {
    return <AcessoNegado permission={permission} />;
  }

  return (
    <LicenseGuard>
      <MaintenanceGuard>
        {children}
      </MaintenanceGuard>
    </LicenseGuard>
  );
};

import { db } from "@/bibliotecas/bd";
import { ServicoControloAcesso } from "@/servicos/ServicoControloAcesso";
import { useModuloRH } from "@/ganchos/usar-modulo-rh";
import { AVAILABLE_PERMISSIONS } from "@/tipos/autenticacao";

/** Páginas de RH: só com o módulo incluído na licença da empresa. */
const GuardaModuloRH = ({ children }: { children: JSX.Element }) => {
  const { activo, aCarregar } = useModuloRH();
  if (aCarregar) return suspenseFallback;
  return activo ? children : <Navigate to="/" replace />;
};

/** Ecrã mostrado quando o utilizador abre uma página para a qual não tem permissão. */
const AcessoNegado = ({ permission }: { permission: string }) => {
  const label = AVAILABLE_PERMISSIONS.find(item => item.id === permission)?.label || permission;
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm dark:border-red-900/40 dark:bg-slate-900">
        <p className="text-5xl font-black text-red-600">403</p>
        <h1 className="mt-3 text-xl font-black text-slate-900 dark:text-white">Acesso negado</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Não tem permissão para abrir esta página ({label}). Peça ao Super Administrador principal para lhe atribuir a permissão.
        </p>
        <a href="#/" className="mt-5 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Voltar ao painel</a>
      </div>
    </div>
  );
};



const AppContent = () => {
  const { companySettings, isDataLoading } = useData();
  const [tenantAuthorized, setTenantAuthorized] = useState(() => {
    return localStorage.getItem('tango_company_status') === 'ACTIVE' ||
           localStorage.getItem('tango_active_tenant_authorized') === 'true' ||
           !isPublicWebBuild;
  });

  useEffect(() => {
    const handleAuth = () => {
      setTenantAuthorized(
        localStorage.getItem('tango_company_status') === 'ACTIVE' ||
        localStorage.getItem('tango_active_tenant_authorized') === 'true' ||
        !isPublicWebBuild
      );
    };
    window.addEventListener('tango_tenant_authorized', handleAuth);
    window.addEventListener('tango_company_status_changed', handleAuth);
    window.addEventListener('storage', handleAuth);
    return () => {
      window.removeEventListener('tango_tenant_authorized', handleAuth);
      window.removeEventListener('tango_company_status_changed', handleAuth);
      window.removeEventListener('storage', handleAuth);
    };
  }, []);

  useEffect(() => {
    // Database initialization is now handled centrally by providers with singleton safety.
    document.title = "Tango Gestão de Creditos ERP";

    // Global listener for chunk load errors
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = 'message' in event ? event.message : (event as PromiseRejectionEvent).reason;
      if (isChunkLoadError(error)) {
        console.warn("Ficheiro de uma versão anterior: a recarregar a aplicação.", error);
        reloadForNewVersion();
      }
    };
    // O Vite avisa quando o pré-carregamento de um ficheiro falha (típico depois de um deploy).
    // Não se cancela o evento: cancelado, o import() resolvia com undefined e o React.lazy mostrava
    // "Cannot read properties of undefined (reading 'default')". O erro segue para o lazyWithReload.
    const handlePreloadError = () => {
      reloadForNewVersion();
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);
    window.addEventListener('vite:preloadError', handlePreloadError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
      window.removeEventListener('vite:preloadError', handlePreloadError);
    };
  }, []);

  useEffect(() => {
    const updateFavicon = () => {
      const logo = companySettings?.logo;
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");

      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }

      if (logo) {
        link.href = logo;
      } else {
        // Fallback to default favicon if no logo exists
        link.href = '/favicon.png';
      }
    };

    updateFavicon();
  }, [companySettings?.logo]);

  // O fornecedor de dados já tem recuperação e timeout; não abrir páginas com dados ainda incompletos.
  if (isDataLoading) {
    return <SplashScreen />;
  }

  return (
    <TooltipProvider>
      <LigacaoEmpresaWeb />
      <HubCobrancaGlobal />
      {isPublicWebBuild && tenantAuthorized && <GuardaSubscricaoWeb />}
      {!isCompanyActiveLocally() && tenantAuthorized && <OnboardingWizard />}
      <HashRouter>
        <BackupReminder />
        <AutoBackupManager />
        <FilaFiscalGlobal />
        <AvisoActualizacao />
        <Suspense fallback={suspenseFallback}>
          <Routes>
            <Route path="/login" element={<Navigate to="/entrar" replace />} />
            <Route path="/entrar" element={<Entrar />} />
            <Route
              path="/onboarding"
              element={
                isCompanyActiveLocally()
                  ? <Navigate to="/entrar" replace />
                  : <OnboardingWizard forceShow={true} />
              }
            />
            <Route path="/esqueci-senha" element={<EsqueciSenha />} />
            <Route path="/reset-password" element={<RedefinirSenha />} />
            <Route path="/verify-company-email" element={<ConfirmarEmail />} />
            <Route
              path="/ativacao"
              element={
                isPublicWebBuild ? (
                  <Navigate to="/entrar" replace />
                ) : (
                  <Suspense fallback={suspenseFallback}>
                    <Ativacao />
                  </Suspense>
                )
              }
            />

            {/* Módulo Mestre (Tango Master) */}
            <Route
              path="/tango-master"
              element={
                <Suspense fallback={suspenseFallback}>
                  <LoginAdmin />
                </Suspense>
              }
            />
            <Route
              path="/tango-master/dashboard"
              element={
                <Suspense fallback={suspenseFallback}>
                  <MasterProtectedRoute>
                    <DashboardAdmin />
                  </MasterProtectedRoute>
                </Suspense>
              }
            />
            <Route
              path="/"
              element={
                <Suspense fallback={suspenseFallback}>
                  <ProtectedRoute>
                    <Inicio />
                  </ProtectedRoute>
                </Suspense>
              }
            />
            <Route
              path="/clientes"
              element={
                <ProtectedRoute permission="manage_clients">
                  <Clientes category="COMUM" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/plano-mensal"
              element={
                <ProtectedRoute permission="view_credits">
                  <PlanoMensal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contactos"
              element={
                <ProtectedRoute permission="manage_clients">
                  <Contactos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/despesas"
              element={
                <ProtectedRoute permission="manage_fiscal">
                  <Despesas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sessoes"
              element={
                <ProtectedRoute permission="manage_users">
                  <Sessoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mercado"
              element={
                <ProtectedRoute>
                  <Mercado />
                </ProtectedRoute>
              }
            />
            <Route
              path="/aposentados"
              element={
                <ProtectedRoute permission="manage_clients">
                  <Clientes category="APOSENTADO" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/estrangeiros"
              element={
                <ProtectedRoute permission="manage_clients">
                  <Clientes category="ESTRANGEIRO" />
                </ProtectedRoute>
              }
            />
            {[
              { path: '/rh', page: <PainelRH /> },
              { path: '/rh/painel', page: <PainelRH /> },
              { path: '/rh/funcionarios', page: <FuncionariosRH /> },
              { path: '/rh/documentos', page: <DocumentosRH /> },
              { path: '/rh/configuracoes', page: <ConfiguracoesRH /> },
              { path: '/rh/ponto', page: <LivroPontoRH /> },
              { path: '/rh/ausencias', page: <AusenciasRH /> },
              { path: '/rh/calendario', page: <CalendarioRH /> },
              { path: '/rh/processamento', page: <ProcessamentoRH /> },
              { path: '/rh/recibos', page: <RecibosRH /> },
              { path: '/rh/ferias', page: <FeriasRH /> },
            ].map(({ path, page }) => (
              <Route key={path} path={path} element={<ProtectedRoute permission="hr_view"><GuardaModuloRH>{page}</GuardaModuloRH></ProtectedRoute>} />
            ))}
            <Route path="/rh/relatorios" element={<ProtectedRoute permission="hr_view"><GuardaModuloRH><RelatoriosRH /></GuardaModuloRH></ProtectedRoute>} />
            <Route path="/rh/portal" element={<ProtectedRoute permission="hr_self"><GuardaModuloRH><PortalFuncionario /></GuardaModuloRH></ProtectedRoute>} />
            <Route
              path="/fornecedores"
              element={
                <ProtectedRoute permission="manage_suppliers">
                  {companySettings.enableSuppliersModule !== false ? <Fornecedores /> : <Navigate to="/" replace />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/creditos"
              element={
                <ProtectedRoute permission="view_credits">
                  <Creditos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/creditos/:id"
              element={
                <ProtectedRoute permission="view_credits">
                  <FichaCredito />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pagamentos"
              element={
                <ProtectedRoute permission="manage_payments">
                  <Pagamentos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contratos"
              element={
                <ProtectedRoute permission="view_credits">
                  <Contratos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cartas-transferencia"
              element={
                <ProtectedRoute permission="view_credits">
                  <CartasTransferencia />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notificacoes"
              element={
                <ProtectedRoute>
                  <Notificacoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/definicoes"
              element={
                <ProtectedRoute permission="manage_settings">
                  <Definicoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/utilizadores"
              element={
                <ProtectedRoute permission="manage_users">
                  <Utilizadores />
                </ProtectedRoute>
              }
            />
            <Route
              path="/perfis"
              element={
                <ProtectedRoute permission="manage_users">
                  <Perfis />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorios"
              element={
                <ProtectedRoute permission="view_reports">
                  <Relatorios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/seguranca"
              element={
                <ProtectedRoute permission="view_audit_logs">
                  <CentroSeguranca />
                </ProtectedRoute>
              }
            />
            {/* Todos os utilizadores: a página mostra a auditoria completa ao Super Administrador e ao Auditor Interno e, aos restantes, só a própria atividade. */}
            <Route
              path="/logs-auditoria"
              element={
                <ProtectedRoute permission="view_audit_logs">
                  <LogsAuditoria />
                </ProtectedRoute>
              }
            />
            <Route
              path="/aprovacoes"
              element={
                <ProtectedRoute permission="approve_loans">
                  <Aprovacoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/limites-utilizador"
              element={
                <ProtectedRoute permission="manage_limits">
                  <LimitesUtilizador />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorios-atividade"
              element={
                <ProtectedRoute permission="view_user_reports">
                  <RelatoriosAtividadeUtilizador />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute permission="view_chat">
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portais-pagamento"
              element={
                <ProtectedRoute permission="manage_gateways">
                  {companySettings.enableGatewaysModule !== false ? <PortaisPagamento /> : <Navigate to="/" replace />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/guia"
              element={
                <ProtectedRoute>
                  <Guia />
                </ProtectedRoute>
              }
            />
            <Route
              path="/termos-e-politicas"
              element={
                <ProtectedRoute>
                  <TermosPoliticas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorios-fiscais"
              element={
                <ProtectedRoute permission="manage_fiscal">
                  <RelatoriosFiscais />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contabilidade"
              element={
                <ProtectedRoute permission="manage_fiscal">
                  <Contabilidade />
                </ProtectedRoute>
              }
            />
            <Route
              path="/hub-whatsapp"
              element={
                <ProtectedRoute permission="manage_payments">
                  <CentralWhatsApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contencioso"
              element={
                <ProtectedRoute permission="manage_legal">
                  {companySettings.enableLegalModule !== false ? <Contencioso /> : <Navigate to="/" replace />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/garantias"
              element={
                <ProtectedRoute permission="manage_warranties">
                  {companySettings.enableWarrantiesModule !== false ? <Garantias /> : <Navigate to="/" replace />}
                </ProtectedRoute>
              }
            />
            <Route
              path="/simulador"
              element={
                <ProtectedRoute>
                  <Suspense fallback={suspenseFallback}>
                    <SimuladorCredito />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/scoring"
              element={
                <ProtectedRoute permission="view_reports">
                  {companySettings.enableScoringModule !== false ? (
                    <Scoring />
                  ) : (
                    <Navigate to="/" replace />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="/lixeira"
              element={
                <ProtectedRoute permission="manage_settings">
                  <LixeiraPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NaoEncontrado />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </TooltipProvider>
  );
};

// --- REFACTOR: Moved Providers to main.tsx for singleton isolation ---
export default AppContent;
