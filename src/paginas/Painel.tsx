import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { MetricCard } from '@/componentes/dashboard/MetricCard';
import { CashFlowChart } from '@/componentes/dashboard/CashFlowChart';
import { RevenueChart } from '@/componentes/dashboard/RevenueChart';
import { RiskDistributionChart } from '@/componentes/dashboard/RiskDistributionChart';
import { AgingChart } from '@/componentes/dashboard/AgingChart';
import { RecentCredits } from '@/componentes/dashboard/RecentCredits';
import { ClientDetailsModal } from '@/componentes/dashboard/ClientDetailsModal';
import { ActiveClientsModal } from '@/componentes/dashboard/ActiveClientsModal';
import { BlockedClientsModal } from '@/componentes/dashboard/BlockedClientsModal';
import { LicenseRenewalModal } from '@/componentes/dashboard/LicenseRenewalModal';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { formatCurrencyCompact } from '@/bibliotecas/formatters';
import { calculateClientScore } from '@/bibliotecas/clientScoring';
import {
  generateClientListReport,
  generateActiveClientsReport,
  generateBlockedClientsReport
} from '@/bibliotecas/pdf';
import {
  Wallet,
  TrendingUp,
  Users,
  AlertTriangle,
  CreditCard,
  Clock,
  CheckCircle2,
  Ban,
  ShieldPlus,
} from 'lucide-react';
import { startOfMonth, subMonths, isWithinInterval, endOfMonth } from 'date-fns';
import { toast } from '@/componentes/ui/use-toast';

const openCreditStatuses = new Set(['active', 'overdue', 'renegotiated', 'defaulted']);
const isOpenCredit = (credit: { status: string; currentBalance?: number }) => (
  openCreditStatuses.has(credit.status) && (Number(credit.currentBalance) || 0) > 0.1
);

export default function Dashboard() {
  const { clients, credits, payments, companySettings, refreshData } = useData();
  const { user } = useAuth();

  // Modal states
  const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false);
  const [isActiveClientsOpen, setIsActiveClientsOpen] = useState(false);
  const [isBlockedClientsOpen, setIsBlockedClientsOpen] = useState(false);
  const [isLicenseRenewalOpen, setIsLicenseRenewalOpen] = useState(false);

  // Auxiliar para cálculo de tendência
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return current > 0 ? { value: 100, isPositive: true } : null;
    const diff = ((current - previous) / previous) * 100;

    // Retorna nulo se a diferença for 0 e o atual for 0 (para ocultar tendência em sistema vazio)
    if (diff === 0 && current === 0) return null;

    return { value: Math.abs(Math.round(diff * 10) / 10), isPositive: diff >= 0 };
  };

  const now = new Date();
  const currentMonthInterval = { start: startOfMonth(now), end: endOfMonth(now) };
  const lastMonthInterval = { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };

  // Dados do Mês Atual
  const currentPayments = payments.filter(p => isWithinInterval(new Date(p.paymentDate), currentMonthInterval));
  const currentRevenue = currentPayments.reduce((acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest, 0);

  // Dados do Mês Anterior
  const lastPayments = payments.filter(p => isWithinInterval(new Date(p.paymentDate), lastMonthInterval));
  const lastRevenue = lastPayments.reduce((acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest, 0);

  // Tendências de Clientes
  const currentNewClients = clients.filter(c => isWithinInterval(new Date(c.createdAt), currentMonthInterval)).length;
  const lastNewClients = clients.filter(c => isWithinInterval(new Date(c.createdAt), lastMonthInterval)).length;

  // Calcular métricas em tempo real
  const metrics = {
    globalPlafond: clients.reduce((acc, d) => acc + d.creditLimit, 0),
    availablePlafond: clients.reduce((acc, d) => acc + d.availableCredit, 0),
    totalRevenue: payments.reduce((acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest, 0),
    interestRevenue: payments.reduce((acc, p) => acc + p.allocatedToInterest, 0),
    lateInterestRevenue: payments.reduce((acc, p) => acc + p.allocatedToLateInterest, 0),
    activeClients: clients.filter(client => credits.some(c => c.clientId === client.id && isOpenCredit(c))).length,
    totalClients: clients.length,
    blockedClients: clients.filter(d => d.blocked === true).length,
    defaultedAmount: credits.filter(c => c.status === 'overdue' || c.status === 'defaulted').reduce((acc, c) => acc + c.totalDue, 0),
    overdueCredits: credits.filter(c => c.status === 'overdue').length,
    activeCredits: credits.filter(isOpenCredit).length,
    paidCredits: credits.filter(c => c.status === 'paid').length,
  };

  // Preparar dados para modais
  const clientsWithScores = clients.map(client => ({
    client,
    scoreData: calculateClientScore(client, credits, payments),
  }));

  // Handler para desbloquear cliente
  const handleUnblockClient = async (clientId: string) => {
    // TODO: Implementar função updateClient na API
    toast({
      title: "Funcionalidade em desenvolvimento",
      description: "A função de desbloquear cliente será implementada em breve.",
      variant: "default",
    });
  };

  // Handlers para exportar PDFs
  const handleExportClientList = () => {
    generateClientListReport(clientsWithScores, companySettings, user?.name);
  };

  const handleExportActiveClients = () => {
    const activeClientsData = clients
      .filter(client => credits.some(c =>
        c.clientId === client.id &&
        isOpenCredit(c)
      ))
      .map(client => {
        const clientCredits = credits.filter(c =>
          c.clientId === client.id &&
          isOpenCredit(c)
        );

        return {
          client,
          activeCredits: clientCredits,
          totalDue: clientCredits.reduce((sum, c) => sum + c.totalDue, 0),
          nextDueDate: clientCredits.reduce((earliest: Date | null, c) => {
            if (!c.nextDueDate) return earliest;
            const dueDate = new Date(c.nextDueDate);
            return !earliest || dueDate < earliest ? dueDate : earliest;
          }, null),
          oldestCreditDate: clientCredits.reduce((oldest: Date | null, c) => {
            const creditDate = new Date(c.createdAt);
            return !oldest || creditDate < oldest ? creditDate : oldest;
          }, null),
          hasOverdue: clientCredits.some(c => c.status === 'overdue'),
        };
      });

    generateActiveClientsReport(activeClientsData, companySettings, user?.name);
  };

  const handleExportBlockedClients = () => {
    const blockedClients = clients.filter(c => c.blocked === true);
    generateBlockedClientsReport(blockedClients, companySettings, user?.name);
  };

  return (
    <MainLayout
      title="Painel Geral"
      subtitle="Visão geral do sistema de crédito"
    >
      <div className="flex justify-end mb-6 -mt-2">
        <Button
          onClick={() => setIsLicenseRenewalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 gap-2 font-bold px-6 h-11"
        >
          <ShieldPlus className="h-5 w-5" />
          Renovar Licença
        </Button>
      </div>

      {/* Primary Metrics */}
      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Plafond Global"
          value={formatCurrencyCompact(metrics.globalPlafond)}
          subtitle={`Disponível: ${formatCurrencyCompact(metrics.availablePlafond)}`}
          icon={<Wallet className="h-6 w-6" />}
          variant="primary"
        />
        <MetricCard
          title="Rendimentos Totais"
          value={formatCurrencyCompact(metrics.totalRevenue)}
          subtitle={`Juros: ${formatCurrencyCompact(metrics.interestRevenue)}`}
          icon={<TrendingUp className="h-6 w-6" />}
          variant="success"
          trend={calculateTrend(currentRevenue, lastRevenue) || undefined}
        />
        <MetricCard
          title="Total de Clientes"
          value={metrics.totalClients}
          subtitle={`Ativos: ${metrics.activeClients} | Bloqueados: ${metrics.blockedClients}`}
          icon={<Users className="h-6 w-6" />}
          variant="purple"
          trend={calculateTrend(currentNewClients, lastNewClients) || undefined}
          onAction={() => setIsClientDetailsOpen(true)}
          actionLabel="Ver Detalhes dos Clientes"
        />
        <MetricCard
          title="Valor em Incumprimento"
          value={formatCurrencyCompact(metrics.defaultedAmount)}
          subtitle={`${metrics.overdueCredits} créditos em atraso`}
          icon={<AlertTriangle className="h-6 w-6" />}
          variant="danger"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Clientes Activos"
          value={metrics.activeClients}
          icon={<CreditCard className="h-5 w-5" />}
          variant="success"
          subtitle="Com contratos em aberto"
          onAction={() => setIsActiveClientsOpen(true)}
          actionLabel="Ver Clientes Ativos"
        />
        <MetricCard
          title="Créditos em Atraso"
          value={metrics.overdueCredits}
          icon={<Clock className="h-5 w-5" />}
          variant="warning"
          subtitle="Aguardando regularização"
        />
        <MetricCard
          title="Créditos Liquidados"
          value={metrics.paidCredits}
          icon={<CheckCircle2 className="h-5 w-5" />}
          variant="primary"
          subtitle="Totalmente amortizados"
        />
        <MetricCard
          title="Clientes Bloqueados"
          value={metrics.blockedClients}
          icon={<Ban className="h-5 w-5" />}
          variant="danger"
          subtitle="Contas suspensas"
          onAction={() => setIsBlockedClientsOpen(true)}
          actionLabel="Ver Clientes Bloqueados"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <CashFlowChart />
        <RevenueChart />
      </div>

      {/* Charts Row 2 */}
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <RiskDistributionChart />
        <AgingChart />
        <RecentCredits />
      </div>

      {/* Modals */}
      <ClientDetailsModal
        isOpen={isClientDetailsOpen}
        onClose={() => setIsClientDetailsOpen(false)}
        clients={clients}
        credits={credits}
        payments={payments}
        onExportPDF={handleExportClientList}
      />

      <ActiveClientsModal
        isOpen={isActiveClientsOpen}
        onClose={() => setIsActiveClientsOpen(false)}
        clients={clients}
        credits={credits}
        onExportPDF={handleExportActiveClients}
      />

      <BlockedClientsModal
        isOpen={isBlockedClientsOpen}
        onClose={() => setIsBlockedClientsOpen(false)}
        clients={clients}
        onUnblockClient={handleUnblockClient}
        onExportPDF={handleExportBlockedClients}
      />

      <LicenseRenewalModal
        isOpen={isLicenseRenewalOpen}
        onClose={() => setIsLicenseRenewalOpen(false)}
      />
    </MainLayout>
  );
}
