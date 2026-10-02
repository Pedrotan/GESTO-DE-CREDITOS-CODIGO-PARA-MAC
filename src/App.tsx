import { Suspense, lazy, useEffect, useState } from "react";
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
const Inicio = lazy(() => import("./paginas/Inicio"));
const Clientes = lazy(() => import("./paginas/Clientes"));
const Mercado = lazy(() => import("./paginas/Mercado"));
const PlanoMensal = lazy(() => import("./paginas/PlanoMensal"));
const Contactos = lazy(() => import("./paginas/Contactos"));
const Despesas = lazy(() => import("./paginas/Despesas"));
const Sessoes = lazy(() => import("./paginas/Sessoes"));
const Creditos = lazy(() => import("./paginas/Creditos"));
const Pagamentos = lazy(() => import("./paginas/Pagamentos"));
const Contratos = lazy(() => import("./paginas/Contratos"));
const Notificacoes = lazy(() => import("./paginas/Notificacoes"));
const Definicoes = lazy(() => import("./paginas/Definicoes"));
const Relatorios = lazy(() => import("./paginas/Relatorios"));
const LogsAuditoria = lazy(() => import("./paginas/LogsAuditoria"));
const Guia = lazy(() => import("./paginas/Guia"));
const PortaisPagamento = lazy(() => import("./paginas/PortaisPagamento"));
const EsqueciSenha = lazy(() => import("./paginas/EsqueciSenha"));
const Aprovacoes = lazy(() => import("./paginas/Aprovacoes"));
const LimitesUtilizador = lazy(() => import("./paginas/LimitesUtilizador"));
const RelatoriosAtividadeUtilizador = lazy(() => import("./paginas/RelatoriosAtividadeUtilizador"));
const Chat = lazy(() => import("./paginas/Chat"));
const RelatoriosFiscais = lazy(() => import("./paginas/RelatoriosFiscais"));
const Contabilidade = lazy(() => import("./paginas/Contabilidade"));
const CentralWhatsApp = lazy(() => import("./paginas/CentralWhatsApp"));
const Garantias = lazy(() => import("./paginas/Garantias"));
const Contencioso = lazy(() => import("./paginas/Contencioso"));
const Fornecedores = lazy(() => import("./paginas/Fornecedores"));
const Scoring = lazy(() => import("./paginas/Scoring"));
const SimuladorCredito = lazy(() => import("./paginas/SimuladorCredito"));
const CartasTransferencia = lazy(() => import("./paginas/CartasTransferencia").then(m => ({ default: m.CartasTransferencia })));
const LixeiraPage = lazy(() => import("./paginas/Lixeira"));
const NaoEncontrado = lazy(() => import("./paginas/NaoEncontrado"));

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
    return !isPublicWebBuild || localStorage.getItem('tango_active_tenant_authorized') === 'true';
  });

  useEffect(() => {
    const handleAuth = () => {
      setTenantAuthorized(!isPublicWebBuild || localStorage.getItem('tango_active_tenant_authorized') === 'true');
    };
    window.addEventListener('tango_tenant_authorized', handleAuth);
    window.addEventListener('storage', handleAuth);
    return () => {
      window.removeEventListener('tango_tenant_authorized', handleAuth);
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
      const errorMsg = 'message' in event ? event.message : (event as any).reason?.message;
      if (errorMsg && (errorMsg.includes('Failed to fetch dynamically imported module') || errorMsg.includes('Loading chunk'))) {
        console.warn("Detected chunk load error. Reloading app...", errorMsg);
        window.location.reload();
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
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
      {tenantAuthorized && <OnboardingWizard />}
      <HashRouter>
        <BackupReminder />
        <AutoBackupManager />
        <Suspense fallback={suspenseFallback}>
          <Routes>
            <Route path="/entrar" element={<Entrar />} />
            <Route
              path="/onboarding"
              element={
                !tenantAuthorized
                  ? <Navigate to="/entrar" replace />
                  : <OnboardingWizard forceShow={true} />
              }
            />
            <Route path="/esqueci-senha" element={<EsqueciSenha />} />
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
              path="/relatorios"
              element={
                <ProtectedRoute permission="view_reports">
                  <Relatorios />
                </ProtectedRoute>
              }
            />
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
