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
import { SplashScreen } from "@/componentes/layout/SplashScreen";
import { isPublicWebBuild } from "@/bibliotecas/ambiente";

import Entrar from "./paginas/Entrar";
import Utilizadores from "./paginas/Utilizadores";

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
const Scoring = lazyWithReload(() => import("./paginas/Scoring"));
const SimuladorCredito = lazyWithReload(() => import("./paginas/SimuladorCredito"));
const TermosPoliticas = lazyWithReload(() => import("./paginas/TermosPoliticas"));
const CartasTransferencia = lazyWithReload(() => import("./paginas/CartasTransferencia").then(m => ({ default: m.CartasTransferencia })));
const LixeiraPage = lazyWithReload(() => import("./paginas/Lixeira"));
const Perfis = lazyWithReload(() => import("./paginas/Perfis"));
const NaoEncontrado = lazyWithReload(() => import("./paginas/NaoEncontrado"));

import { LicenseGuard } from "./componentes/LicenseGuard";
import Ativacao from "./paginas/Ativacao";
import LoginAdmin from "./paginas/Admin/LoginAdmin";
import DashboardAdmin from "./paginas/Admin/DashboardAdmin";
import { MasterProtectedRoute } from "./admin/MasterProtectedRoute";

const suspenseFallback = <SplashScreen />;

const ProtectedRoute = ({ children, permission }: { children: JSX.Element; permission?: string }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/entrar" replace />;
  }

  // Se exigir uma permissão específica e o usuário não for super_admin
  if (permission && user?.role !== 'super_admin') {
    const hasPermission = user?.permissions?.includes(permission);
    if (!hasPermission) {
      console.warn(`Acesso negado à rota protegida por: ${permission}`);
      return <Navigate to="/" replace />;
    }
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



const AppContent = () => {
  const { companySettings, isDataLoading } = useData();
  const [forceReady, setForceReady] = useState(false);
  const [tenantAuthorized, setTenantAuthorized] = useState(() => {
    return localStorage.getItem('tango_company_status') === 'ACTIVE' ||
           localStorage.getItem('tango_active_tenant_authorized') === 'true' ||
           (!isPublicWebBuild && isCompanyActiveLocally());
  });

  useEffect(() => {
    const handleAuth = () => {
      setTenantAuthorized(
        localStorage.getItem('tango_company_status') === 'ACTIVE' ||
        localStorage.getItem('tango_active_tenant_authorized') === 'true' ||
        (!isPublicWebBuild && isCompanyActiveLocally())
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
    const timer = setTimeout(() => {
      setForceReady(true);
    }, 2000);
    return () => clearTimeout(timer);
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
    const handlePreloadError = (event: Event) => {
      if (reloadForNewVersion()) event.preventDefault();
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

  // Splash Screen para evitar a tela branca durante o carregamento inicial intenso
  if (isDataLoading && !forceReady) {
    return <SplashScreen />;
  }

  return (
    <TooltipProvider>
      <LigacaoEmpresaWeb />
      {isPublicWebBuild && tenantAuthorized && <GuardaSubscricaoWeb />}
      {!isCompanyActiveLocally() && tenantAuthorized && <OnboardingWizard />}
      <HashRouter>
        <BackupReminder />
        <AutoBackupManager />
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
            <Route
              path="/fornecedores"
              element={
                <ProtectedRoute>
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
                <ProtectedRoute>
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
                <ProtectedRoute>
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
