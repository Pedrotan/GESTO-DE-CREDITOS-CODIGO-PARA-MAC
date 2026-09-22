import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Badge } from '@/componentes/ui/badge';
import { Checkbox } from '@/componentes/ui/checkbox';
import {
    AlertTriangle,
    AtSign,
    CalendarClock,
    CheckCircle2,
    Clock,
    FileDown,
    Gavel,
    Hash,
    Mail,
    MessageCircle,
    Phone,
    Search,
    Send,
    ShieldAlert,
    Smartphone,
    Users,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { generateDebtCollectionNoticePDF } from '@/bibliotecas/pdf';
import { useToast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';
import { Client, Credit, MessageTemplate } from '@/tipos/credito';
import { db } from '@/bibliotecas/bd';

const DEFAULT_TEMPLATE_ID = '__debt_collection_notice__';

const DEFAULT_COLLECTION_TEMPLATE = `Prezado(a) {nome_cliente},

Consta em nosso sistema uma divida vencida junto da {empresa}.

Valor total a regularizar: {valor}
Data de vencimento mais antiga: {data_vencimento}
Maior atraso: {dias_atraso} dias

Detalhe dos creditos:
{detalhe_dividas}

Foi emitida uma nota de cobranca em PDF com a discriminacao dos valores. Caso ja tenha efetuado o pagamento, por favor envie o comprovativo para atualizacao do processo.

Atenciosamente,
{empresa}`;

type DebtRow = {
    client: Client;
    credits: Credit[];
    totalPrincipal: number;
    totalBalance: number;
    totalLateInterest: number;
    totalDue: number;
    maxDaysOverdue: number;
    earliestDueDate?: Date;
    hasActiveDebt: boolean;
};

type CollectionMessage = {
    id: string;
    clientId: string;
    clientName: string;
    creditIds: string;
    channel: 'whatsapp' | 'email' | 'pdf';
    message: string;
    attemptNumber: number;
    totalDue: number;
    sentAt: string;
    sentBy?: string;
    legalTriggered?: number;
};

const inactiveCreditStatuses = new Set<Credit['status']>(['paid', 'cancelled', 'rejected', 'pending_approval']);

const getDebtDays = (credit: Credit): number => {
    const dueDate = new Date(credit.dueDate);
    if (Number.isNaN(dueDate.getTime())) return Number(credit.daysOverdue || 0);
    const diff = Math.floor((Date.now() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(Number(credit.daysOverdue || 0), diff, 0);
};

const isDebtCredit = (credit: Credit): boolean => {
    if (inactiveCreditStatuses.has(credit.status)) return false;
    const amountOpen = Number(credit.totalDue || credit.currentBalance || 0);
    if (amountOpen <= 0) return false;

    const dueDate = new Date(credit.dueDate);
    const isPastDue = !Number.isNaN(dueDate.getTime()) && dueDate.getTime() <= Date.now();
    return credit.status === 'overdue' || credit.status === 'defaulted' || isPastDue;
};

const makeFallbackClient = (credit: Credit): Client => ({
    id: credit.clientId,
    name: credit.clientName || 'Cliente sem cadastro',
    nif: '',
    phone: '',
    email: '',
    address: '',
    creditLimit: 0,
    usedCredit: 0,
    availableCredit: 0,
    defaultInterestRate: 0,
    lateInterestRate: 0,
    toleranceDays: 0,
    status: 'active',
    riskLevel: 'medium',
    documents: [],
    bankCoordinates: [],
    receiveMethod: 'cash',
    createdAt: new Date(),
});

const buildNoticeFileName = (clientName: string): string => {
    const safeName = (clientName || 'Cliente')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `Nota-Cobranca-${safeName || 'Cliente'}-${new Date().toISOString().slice(0, 10)}.pdf`;
};

const buildEmptyDebtRow = (client: Client): DebtRow => ({
    client,
    credits: [],
    totalPrincipal: 0,
    totalBalance: 0,
    totalLateInterest: 0,
    totalDue: 0,
    maxDaysOverdue: 0,
    earliestDueDate: undefined,
    hasActiveDebt: false,
});

const normalizeSearch = (value?: string | number | null) => String(value || '').toLowerCase().trim();

const clientMatchesSearch = (client: Client, term: string, digits: string) => {
    if (!term && !digits) return true;
    const searchableText = [
        client.name,
        client.nif,
        client.id,
        client.email,
        client.phone,
        client.address,
    ].map(normalizeSearch).join(' ');
    const searchableDigits = [
        client.nif,
        client.id,
        client.phone,
    ].map(value => String(value || '').replace(/\D/g, '')).join(' ');

    return searchableText.includes(term) || (!!digits && searchableDigits.includes(digits));
};

export default function WhatsAppHub() {
    const {
        clients,
        allClients,
        credits,
        messageTemplates,
        companySettings,
        updateClient,
        legalCases,
        addLegalCase,
        addNotification,
    } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_TEMPLATE_ID);
    const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'recent' | 'contacted' | 'missingContact'>('all');
    const [isSending, setIsSending] = useState(false);
    const [collectionMessages, setCollectionMessages] = useState<CollectionMessage[]>([]);
    const searchableClients = allClients?.length ? allClients : clients;

    const collectionTemplates = useMemo<MessageTemplate[]>(() => [
        {
            id: DEFAULT_TEMPLATE_ID,
            name: 'Nota de cobranca detalhada',
            type: 'collection',
            content: DEFAULT_COLLECTION_TEMPLATE,
            isDefault: true,
        },
        ...messageTemplates,
    ], [messageTemplates]);

    const loadCollectionMessages = async () => {
        await db.run(`
            CREATE TABLE IF NOT EXISTS collection_messages (
                id TEXT PRIMARY KEY,
                clientId TEXT NOT NULL,
                clientName TEXT NOT NULL,
                creditIds TEXT NOT NULL,
                channel TEXT NOT NULL,
                message TEXT NOT NULL,
                attemptNumber INTEGER DEFAULT 1,
                totalDue REAL DEFAULT 0,
                sentAt TEXT NOT NULL,
                sentBy TEXT,
                legalTriggered INTEGER DEFAULT 0
            )
        `);
        const rows = await db.all<CollectionMessage>('SELECT * FROM collection_messages ORDER BY sentAt DESC');
        setCollectionMessages(rows.map(row => ({
            ...row,
            attemptNumber: Number(row.attemptNumber || 1),
            totalDue: Number(row.totalDue || 0),
            legalTriggered: Number(row.legalTriggered || 0),
        })));
    };

    useEffect(() => {
        loadCollectionMessages().catch(error => console.error('[Cobranca] Falha ao carregar historico:', error));
    }, []);

    const debtRows = useMemo<DebtRow[]>(() => {
        const clientMap = new Map(searchableClients.map(client => [client.id, client]));
        const groups = new Map<string, DebtRow>();

        credits
            .filter(isDebtCredit)
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
            .forEach((credit) => {
                const client = clientMap.get(credit.clientId) || makeFallbackClient(credit);
                const existing = groups.get(client.id);
                const row = existing || {
                    client,
                    credits: [],
                    totalPrincipal: 0,
                    totalBalance: 0,
                    totalLateInterest: 0,
                    totalDue: 0,
                    maxDaysOverdue: 0,
                    earliestDueDate: undefined,
                    hasActiveDebt: true,
                };

                row.credits.push(credit);
                row.totalPrincipal += Number(credit.principalAmount || 0);
                row.totalBalance += Number(credit.currentBalance || 0);
                row.totalLateInterest += Number(credit.lateInterest || 0);
                row.totalDue += Number(credit.totalDue || credit.currentBalance || 0);
                row.maxDaysOverdue = Math.max(row.maxDaysOverdue, getDebtDays(credit));

                const dueDate = new Date(credit.dueDate);
                if (!Number.isNaN(dueDate.getTime())) {
                    if (!row.earliestDueDate || dueDate < row.earliestDueDate) row.earliestDueDate = dueDate;
                }

                groups.set(client.id, row);
            });

        return Array.from(groups.values()).sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue || b.totalDue - a.totalDue);
    }, [searchableClients, credits]);

    const filteredRows = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const cleanDigits = searchTerm.replace(/\D/g, '');
        const debtRowByClient = new Map(debtRows.map(row => [row.client.id, row]));

        const sourceRows = term || cleanDigits
            ? searchableClients
                .filter(client => clientMatchesSearch(client, term, cleanDigits))
                .map(client => debtRowByClient.get(client.id) || buildEmptyDebtRow(client))
            : debtRows;

        return sourceRows.filter(row => {
            const matchesSearch = !term && !cleanDigits ? true : (
                clientMatchesSearch(row.client, term, cleanDigits) ||
                row.credits.some(credit =>
                    credit.id.toLowerCase().includes(term) ||
                    String(credit.creditNumber || '').includes(cleanDigits)
                ) ||
                (!!cleanDigits && String(Math.round(row.totalDue)).includes(cleanDigits))
            );

            if (!matchesSearch) return false;
            if (statusFilter === 'critical') return row.maxDaysOverdue >= 30 || row.credits.some(credit => credit.status === 'defaulted');
            if (statusFilter === 'recent') return row.maxDaysOverdue < 30;
            if (statusFilter === 'contacted') return Boolean(row.client.lastContacted);
            if (statusFilter === 'missingContact') return !row.client.phone && !row.client.email;
            return true;
        });
    }, [searchableClients, debtRows, searchTerm, statusFilter]);

    const totals = useMemo(() => {
        return debtRows.reduce((acc, row) => ({
            clients: acc.clients + 1,
            credits: acc.credits + row.credits.length,
            due: acc.due + row.totalDue,
            lateInterest: acc.lateInterest + row.totalLateInterest,
            critical: acc.critical + (row.maxDaysOverdue >= 30 || row.credits.some(credit => credit.status === 'defaulted') ? 1 : 0),
        }), { clients: 0, credits: 0, due: 0, lateInterest: 0, critical: 0 });
    }, [debtRows]);

    const selectedRows = filteredRows.filter(row => selectedClients.includes(row.client.id) && row.hasActiveDebt);

    const getCollectionAttempts = (clientId: string) => {
        return collectionMessages.filter(message => message.clientId === clientId).length;
    };

    const getLastCollectionDate = (clientId: string) => {
        return collectionMessages.find(message => message.clientId === clientId)?.sentAt;
    };

    const hasOpenLegalCase = (row: DebtRow) => {
        return row.credits.some(credit => legalCases.some(item => (
            item.creditId === credit.id &&
            item.stage !== 'closed' &&
            !item.deletedAt
        )));
    };

    const triggerLegalRecovery = async (row: DebtRow, reason: string) => {
        if (!row.hasActiveDebt) return false;
        let created = 0;

        for (const credit of row.credits) {
            const alreadyOpen = legalCases.some(item => (
                item.creditId === credit.id &&
                item.stage !== 'closed' &&
                !item.deletedAt
            ));
            if (alreadyOpen) continue;

            await addLegalCase({
                clientId: row.client.id,
                creditId: credit.id,
                stage: 'interpellated',
                priority: getDebtDays(credit) >= 60 ? 'critical' : 'high',
                debtAmount: Number(credit.totalDue || credit.currentBalance || 0),
                lastAction: reason,
                notes: `Acionado automaticamente depois de 3 tentativas de cobranca sem deteccao de pagamento. Cliente: ${row.client.name}.`,
                updatedAt: new Date().toISOString(),
                usuario_id: credit.usuario_id || user?.id,
            }, { id: user?.id || 'system', name: user?.name || 'Sistema de Cobranca' });
            created += 1;
        }

        if (created > 0) {
            await addNotification({
                id: crypto.randomUUID(),
                title: 'Cobranca enviada para juridico',
                message: `${row.client.name} atingiu 3 tentativas de cobranca sem pagamento detectado. ${created} credito(s) foram enviados ao contencioso.`,
                type: 'warning',
                read: false,
                timestamp: new Date(),
            });
            return true;
        }

        return false;
    };

    const registerCollectionMessage = async (row: DebtRow, channel: CollectionMessage['channel'], message: string) => {
        const attemptNumber = getCollectionAttempts(row.client.id) + 1;
        const shouldTriggerLegal = attemptNumber >= 3 && row.hasActiveDebt;
        const record: CollectionMessage = {
            id: crypto.randomUUID(),
            clientId: row.client.id,
            clientName: row.client.name,
            creditIds: JSON.stringify(row.credits.map(credit => credit.id)),
            channel,
            message,
            attemptNumber,
            totalDue: row.totalDue,
            sentAt: new Date().toISOString(),
            sentBy: user?.name || user?.email || 'Sistema',
            legalTriggered: shouldTriggerLegal ? 1 : 0,
        };

        await db.run(
            `INSERT INTO collection_messages (id, clientId, clientName, creditIds, channel, message, attemptNumber, totalDue, sentAt, sentBy, legalTriggered)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.id,
                record.clientId,
                record.clientName,
                record.creditIds,
                record.channel,
                record.message,
                record.attemptNumber,
                record.totalDue,
                record.sentAt,
                record.sentBy,
                record.legalTriggered,
            ]
        );
        setCollectionMessages(prev => [record, ...prev]);

        if (shouldTriggerLegal) {
            const triggered = await triggerLegalRecovery(row, `3a tentativa de cobranca enviada por ${channel}.`);
            if (triggered) {
                toast({
                    title: 'Mecanismo juridico acionado',
                    description: `${row.client.name} atingiu 3 tentativas de cobranca sem pagamento detectado.`,
                });
            }
        }

        return attemptNumber;
    };

    const ensureCanContact = async (row: DebtRow) => {
        if (!row.hasActiveDebt) {
            toast({
                title: 'Cliente sem divida ativa',
                description: 'Este cliente foi encontrado no cadastro, mas nao possui cobranca pendente.',
            });
            return false;
        }

        if (getCollectionAttempts(row.client.id) >= 3) {
            const triggered = await triggerLegalRecovery(row, 'Limite de 3 tentativas de cobranca atingido.');
            toast({
                title: triggered || hasOpenLegalCase(row) ? 'Cliente em recuperacao juridica' : 'Limite de cobrancas atingido',
                description: 'Este cliente ja foi contactado 3 vezes sem pagamento detectado. O proximo passo e o contencioso.',
                variant: triggered || hasOpenLegalCase(row) ? 'default' : 'destructive',
            });
            return false;
        }

        return true;
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectedClients(checked ? filteredRows.filter(row => row.hasActiveDebt).map(row => row.client.id) : []);
    };

    const handleSelectClient = (clientId: string, checked: boolean) => {
        setSelectedClients(prev => checked ? [...new Set([...prev, clientId])] : prev.filter(id => id !== clientId));
    };

    const getDebtDetailsText = (row: DebtRow): string => {
        return row.credits.map((credit, index) => {
            const total = formatCurrency(credit.totalDue || credit.currentBalance || 0, companySettings.currency);
            return `- Credito No ${index + 1}: ref. ${credit.id}, vencimento ${formatDate(credit.dueDate)}, atraso ${getDebtDays(credit)} dias, total ${total}`;
        }).join('\n');
    };

    const getTemplateContent = (row: DebtRow): string => {
        const template = collectionTemplates.find(t => t.id === selectedTemplate) || collectionTemplates[0];
        const oldestDue = row.earliestDueDate ? formatDate(row.earliestDueDate) : 'Imediato';

        return template.content
            .replace(/{nome_cliente}/g, row.client.name || '')
            .replace(/{empresa}/g, companySettings.name || 'Nossa Empresa')
            .replace(/{valor}/g, formatCurrency(row.totalDue, companySettings.currency))
            .replace(/{data_vencimento}/g, oldestDue)
            .replace(/{limite_credito}/g, formatCurrency(row.client.creditLimit || 0, companySettings.currency))
            .replace(/{numero_creditos}/g, String(row.credits.length))
            .replace(/{dias_atraso}/g, String(row.maxDaysOverdue))
            .replace(/{detalhe_dividas}/g, getDebtDetailsText(row))
            .replace(/{email_cliente}/g, row.client.email || '')
            .replace(/{telefone_cliente}/g, row.client.phone || '')
            .replace(/{client_name}/g, row.client.name || '')
            .replace(/{company_name}/g, companySettings.name || 'Nossa Empresa')
            .replace(/{amount}/g, formatCurrency(row.totalDue, companySettings.currency))
            .replace(/{due_date}/g, oldestDue)
            .replace(/{credit_limit}/g, formatCurrency(row.client.creditLimit || 0, companySettings.currency))
            .replace(/{credit_count}/g, String(row.credits.length))
            .replace(/{days_overdue}/g, String(row.maxDaysOverdue))
            .replace(/{debt_details}/g, getDebtDetailsText(row))
            .replace(/{client_email}/g, row.client.email || '')
            .replace(/{client_phone}/g, row.client.phone || '');
    };

    const markClientContacted = async (client: Client) => {
        if (!searchableClients.some(c => c.id === client.id)) return;
        await updateClient(client.id, { lastContacted: new Date() });
    };

    const handleDownloadNotice = (row: DebtRow) => {
        if (!row.hasActiveDebt) {
            toast({
                title: 'Sem nota de cobranca',
                description: 'Este cliente nao possui divida ativa para emissao de nota.',
            });
            return;
        }

        generateDebtCollectionNoticePDF(row.client, row.credits, companySettings, user?.name);
        toast({
            title: 'Nota de cobranca emitida',
            description: `O PDF de ${row.client.name} foi gerado com os detalhes da divida.`,
        });
    };

    const handleWhatsApp = async (row: DebtRow) => {
        if (!(await ensureCanContact(row))) return;
        if (!row.client.phone) {
            toast({
                title: 'WhatsApp indisponivel',
                description: 'Este cliente nao tem telefone registado no cadastro.',
                variant: 'destructive',
            });
            return;
        }

        generateDebtCollectionNoticePDF(row.client, row.credits, companySettings, user?.name);
        const message = getTemplateContent(row);
        openWhatsApp(row.client.phone, message);
        const attemptNumber = await registerCollectionMessage(row, 'whatsapp', message);
        await markClientContacted(row.client);
        toast({
            title: 'Cobranca preparada',
            description: `Tentativa ${attemptNumber}/3 registada. A nota PDF foi gerada e o WhatsApp foi aberto com a mensagem pronta.`,
        });
    };

    const handleEmail = async (row: DebtRow) => {
        if (!(await ensureCanContact(row))) return;
        if (!row.client.email) {
            toast({
                title: 'Email indisponivel',
                description: 'Este cliente nao tem email registado no cadastro.',
                variant: 'destructive',
            });
            return;
        }

        const subject = `Nota de cobranca - ${companySettings.name || 'Tango Gestao'}`;
        const body = getTemplateContent(row);
        const pdfBase64 = generateDebtCollectionNoticePDF(
            row.client,
            row.credits,
            companySettings,
            user?.name,
            'datauristring'
        ) as string;
        const attachment = {
            filename: buildNoticeFileName(row.client.name),
            content: pdfBase64.split(',')[1],
            encoding: 'base64',
        };

        try {
            const electronApi = (window as any).electronAPI;
            const hasSmtp = companySettings.smtpHost && companySettings.smtpUser && companySettings.smtpPassword;

            if (hasSmtp && electronApi?.sendEmail) {
                const result = await electronApi.sendEmail({
                    smtpSettings: {
                        host: companySettings.smtpHost,
                        port: companySettings.smtpPort,
                        user: companySettings.smtpUser,
                        pass: companySettings.smtpPassword,
                        secure: companySettings.smtpSecure,
                        fromName: companySettings.smtpFromName || companySettings.name,
                    },
                    emailOptions: {
                        to: row.client.email,
                        subject,
                        text: body,
                        attachments: [attachment],
                    },
                });

                if (!result.success) throw new Error(result.error || 'Falha ao enviar email.');
            } else if (electronApi?.composeNativeEmail) {
                await electronApi.composeNativeEmail({
                    to: row.client.email,
                    subject,
                    body,
                    attachment,
                });
            } else {
                generateDebtCollectionNoticePDF(row.client, row.credits, companySettings, user?.name);
                window.location.href = `mailto:${row.client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            }

            const attemptNumber = await registerCollectionMessage(row, 'email', body);
            await markClientContacted(row.client);
            toast({
                title: 'Email de cobranca preparado',
                description: `Tentativa ${attemptNumber}/3 registada. A nota de cobranca foi anexada quando o canal de email suportou anexo.`,
            });
        } catch (error: any) {
            toast({
                title: 'Erro no email',
                description: error?.message || 'Nao foi possivel preparar o email de cobranca.',
                variant: 'destructive',
            });
        }
    };

    const handleMassSend = async () => {
        if (selectedRows.length === 0) {
            toast({
                title: 'Nenhum cliente selecionado',
                description: 'Selecione pelo menos um cliente em cobranca.',
                variant: 'destructive',
            });
            return;
        }

        const rowsWithPhone = selectedRows.filter(row => row.client.phone && getCollectionAttempts(row.client.id) < 3);
        if (rowsWithPhone.length === 0) {
            toast({
                title: 'Sem clientes aptos para WhatsApp',
                description: 'Os selecionados nao possuem telefone ou ja atingiram 3 tentativas de cobranca.',
                variant: 'destructive',
            });
            return;
        }

        setIsSending(true);
        for (const row of rowsWithPhone) {
            const message = getTemplateContent(row);
            openWhatsApp(row.client.phone, message);
            await registerCollectionMessage(row, 'whatsapp', message);
            await markClientContacted(row.client);
            await new Promise(resolve => setTimeout(resolve, 800));
        }
        setIsSending(false);

        toast({
            title: 'Envio de cobrancas iniciado',
            description: `Foram abertas mensagens de WhatsApp para ${rowsWithPhone.length} cliente(s).`,
        });
    };

    const selectableRows = filteredRows.filter(row => row.hasActiveDebt);
    const allFilteredSelected = selectableRows.length > 0 && selectableRows.every(row => selectedClients.includes(row.client.id));

    return (
        <MainLayout title="Cobrancas de Dividas" subtitle="Alertas, notas PDF e contacto direto de clientes em incumprimento">
            <div className="space-y-6">
                <Card className="border-amber-200 bg-amber-50/80 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                    <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                                <ShieldAlert className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-black uppercase tracking-wide text-amber-900 dark:text-amber-200">
                                    Alerta de cobranca
                                </p>
                                <p className="text-sm text-amber-800 dark:text-amber-100">
                                    {totals.clients > 0
                                        ? `${totals.clients} cliente(s) possuem dividas vencidas, somando ${formatCurrency(totals.due, companySettings.currency)}.`
                                        : 'Nao existem dividas vencidas no momento.'}
                                </p>
                            </div>
                        </div>
                        <Button
                            className="gap-2"
                            onClick={handleMassSend}
                            disabled={isSending || selectedRows.length === 0}
                        >
                            <Send className="h-4 w-4" />
                            Enviar selecionados
                        </Button>
                    </CardContent>
                </Card>

                {/* Cards Estilo Pastel Arredondado */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {/* 1. Clientes em dívida (Azul Céu #82C9FF) */}
                    <div className="card-kpi-sky">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Users className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Clientes em dívida
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {totals.clients}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Titulares com pendências
                        </p>
                    </div>

                    {/* 2. Créditos em cobrança (Dourado / Âmbar #FED771) */}
                    <div className="card-kpi-amber">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Clock className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Créditos em cobrança
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {totals.credits}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Contratos com prazo expirado
                        </p>
                    </div>

                    {/* 3. Valor em aberto (Verde Menta #86EFAC) */}
                    <div className="card-kpi-mint">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Valor em aberto
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totals.due, companySettings.currency)}>
                                {formatCurrency(totals.due, companySettings.currency)}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Total exigível em atraso
                        </p>
                    </div>

                    {/* 4. Casos críticos (Coral / Rosa #FDA4AF) */}
                    <div className="card-kpi-coral">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                    <Gavel className="h-5 w-5" />
                                </div>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                    Casos críticos
                                </p>
                            </div>
                        </div>

                        <div className="my-2">
                            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                {totals.critical}
                            </p>
                        </div>

                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                            Encaminhados para judicial
                        </p>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <Card className="h-fit shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <MessageCircle className="h-5 w-5 text-primary" />
                                Operacao de cobranca
                            </CardTitle>
                            <CardDescription>Pesquise, filtre e escolha o modelo usado no WhatsApp/email.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pesquisar</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Nome, BI/NIF, cadastro, telefone, email ou valor..."
                                        className="pl-10"
                                        value={searchTerm}
                                        onChange={(event) => setSearchTerm(event.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Estado</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                                >
                                    <option value="all">Todos em cobranca</option>
                                    <option value="critical">Criticos / D+30</option>
                                    <option value="recent">Atraso inferior a 30 dias</option>
                                    <option value="contacted">Ja contactados</option>
                                    <option value="missingContact">Sem telefone e email</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Modelo de mensagem</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={selectedTemplate}
                                    onChange={(event) => setSelectedTemplate(event.target.value)}
                                >
                                    {collectionTemplates.map(template => (
                                        <option key={template.id} value={template.id}>{template.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="rounded-xl border bg-muted/30 p-3">
                                <p className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">Esteira de recuperacao</p>
                                <div className="space-y-2 text-xs text-muted-foreground">
                                    <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2">
                                        <span>Contactos permitidos</span>
                                        <Badge variant="secondary">3 tentativas</Badge>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2">
                                        <span>Sem pagamento detectado</span>
                                        <Badge variant="destructive" className="gap-1">
                                            <Gavel className="h-3 w-3" />
                                            Juridico
                                        </Badge>
                                    </div>
                                    <p className="leading-relaxed">
                                        O sistema guarda cada cobranca enviada e cria processo no contencioso ao atingir a terceira tentativa sem liquidacao.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="font-black">Clientes para cobranca ({filteredRows.length})</h3>
                                    <p className="text-xs text-muted-foreground">Cada cliente aparece uma vez; os creditos ficam numerados por baixo.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                                <Checkbox
                                    id="select-all-debtors"
                                    checked={allFilteredSelected}
                                    onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                                />
                                <label htmlFor="select-all-debtors" className="cursor-pointer text-xs font-bold uppercase">
                                    Selecionar todos
                                </label>
                            </div>
                        </div>

                        {filteredRows.length > 0 ? (
                            filteredRows.map(row => {
                                const attempts = getCollectionAttempts(row.client.id);
                                const lastCollectionDate = getLastCollectionDate(row.client.id);
                                const legalActive = hasOpenLegalCase(row);
                                const contactLimitReached = attempts >= 3;

                                return (
                                <Card
                                    key={row.client.id}
                                    className={cn(
                                        'overflow-hidden shadow-sm transition-all',
                                        selectedClients.includes(row.client.id) ? 'ring-2 ring-primary/60' : ''
                                    )}
                                >
                                    <CardContent className="space-y-4 p-4">
                                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                            <div className="flex min-w-0 gap-3">
                                                <Checkbox
                                                    checked={selectedClients.includes(row.client.id)}
                                                    onCheckedChange={(checked) => handleSelectClient(row.client.id, Boolean(checked))}
                                                    className="mt-1"
                                                    disabled={!row.hasActiveDebt}
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="truncate text-lg font-black">{row.client.name}</h4>
                                                        <Badge variant={!row.hasActiveDebt ? 'outline' : row.maxDaysOverdue >= 30 ? 'destructive' : 'secondary'}>
                                                            {!row.hasActiveDebt ? 'Sem divida' : row.maxDaysOverdue >= 30 ? 'Critico' : 'Em atraso'}
                                                        </Badge>
                                                        <Badge variant={contactLimitReached ? 'destructive' : 'outline'}>
                                                            Cobrancas {attempts}/3
                                                        </Badge>
                                                        {legalActive && (
                                                            <Badge variant="destructive" className="gap-1">
                                                                <Gavel className="h-3 w-3" />
                                                                Juridico ativo
                                                            </Badge>
                                                        )}
                                                        {lastCollectionDate && (
                                                            <Badge variant="outline">Ultima cobranca {formatDate(lastCollectionDate)}</Badge>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1.5">
                                                            <Hash className="h-3.5 w-3.5" />
                                                            Cadastro {row.client.id}
                                                        </span>
                                                        <span className="flex items-center gap-1.5">
                                                            <Phone className="h-3.5 w-3.5" />
                                                            {row.client.phone || 'Sem telefone'}
                                                        </span>
                                                        <span className="flex items-center gap-1.5">
                                                            <AtSign className="h-3.5 w-3.5" />
                                                            {row.client.email || 'Sem email'}
                                                        </span>
                                                        <span className="flex items-center gap-1.5">
                                                            <Clock className="h-3.5 w-3.5" />
                                                            {row.maxDaysOverdue} dias de maior atraso
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[440px]">
                                                <div className="rounded-lg border bg-muted/30 p-3">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground">Total a cobrar</p>
                                                    <p className="text-sm font-black">{formatCurrency(row.totalDue, companySettings.currency)}</p>
                                                </div>
                                                <div className="rounded-lg border bg-muted/30 p-3">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground">Juros mora</p>
                                                    <p className="text-sm font-black">{formatCurrency(row.totalLateInterest, companySettings.currency)}</p>
                                                </div>
                                                <div className="rounded-lg border bg-muted/30 p-3">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground">Creditos</p>
                                                    <p className="text-sm font-black">{row.credits.length}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {row.hasActiveDebt ? (
                                        <div className="rounded-xl border">
                                            <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.9fr] gap-3 border-b bg-muted/40 px-3 py-2 text-[11px] font-black uppercase text-muted-foreground max-md:hidden">
                                                <span>Credito</span>
                                                <span>Vencimento</span>
                                                <span>Atraso</span>
                                                <span className="text-right">Valor a devolver</span>
                                            </div>
                                            <div className="divide-y">
                                                {row.credits.map((credit, index) => (
                                                    <div key={credit.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1.1fr_1fr_0.8fr_0.9fr] md:items-center">
                                                        <div>
                                                            <p className="font-black">Credito No {index + 1}</p>
                                                            <p className="text-xs text-muted-foreground">Ref. {credit.id}</p>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <CalendarClock className="h-3.5 w-3.5" />
                                                            {formatDate(credit.dueDate)}
                                                        </div>
                                                        <Badge variant={getDebtDays(credit) >= 30 ? 'destructive' : 'outline'} className="w-fit">
                                                            {getDebtDays(credit)} dias
                                                        </Badge>
                                                        <div className="text-left md:text-right">
                                                            <p className="font-black">{formatCurrency(credit.totalDue || credit.currentBalance || 0, companySettings.currency)}</p>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                Mora {Number(credit.lateInterestRate || 0)}%: {formatCurrency(credit.lateInterest || 0, companySettings.currency)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        ) : (
                                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                                                Cliente encontrado no cadastro, sem divida vencida ou incumprida neste momento.
                                            </div>
                                        )}

                                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                                            <Button variant="outline" className="gap-2" onClick={() => handleDownloadNotice(row)} disabled={!row.hasActiveDebt}>
                                                <FileDown className="h-4 w-4" />
                                                Nota PDF
                                            </Button>
                                            <Button variant="outline" className="gap-2" onClick={() => handleEmail(row)} disabled={!row.hasActiveDebt || !row.client.email || contactLimitReached}>
                                                <Mail className="h-4 w-4" />
                                                Enviar email
                                            </Button>
                                            <Button className="gap-2" onClick={() => handleWhatsApp(row)} disabled={!row.hasActiveDebt || !row.client.phone || contactLimitReached}>
                                                <Smartphone className="h-4 w-4" />
                                                PDF + WhatsApp
                                            </Button>
                                            {row.hasActiveDebt && contactLimitReached && !legalActive && (
                                                <Button
                                                    variant="destructive"
                                                    className="gap-2"
                                                    onClick={() => triggerLegalRecovery(row, 'Acionado manualmente apos 3 tentativas de cobranca.')}
                                                >
                                                    <Gavel className="h-4 w-4" />
                                                    Acionar juridico
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                                );
                            })
                        ) : (
                            <Card className="border-dashed py-12 text-center shadow-none">
                                <CardContent>
                                    <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500/40" />
                                    <h3 className="text-lg font-black">Sem cobrancas pendentes</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Nao existem clientes com dividas que correspondam aos filtros atuais.
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/20">
                            <CardContent className="flex gap-3 p-4">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
                                <p className="text-xs leading-relaxed text-orange-800 dark:text-orange-200">
                                    Para WhatsApp, o sistema abre a conversa com a mensagem pronta e baixa a nota PDF. O anexo deve ser selecionado na conversa, porque links wa.me nao permitem anexar ficheiros automaticamente.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
