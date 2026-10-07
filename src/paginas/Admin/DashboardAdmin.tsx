import { useState, useEffect, useRef } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/componentes/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/componentes/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/componentes/ui/dialog";
import {
    TrendingUp,
    Key,
    Users,
    LogOut,
    BarChart as BarChartIcon,
    BarChart3,
    Settings,
    ShieldCheck,
    Smartphone,
    Image as ImageIcon,
    Shield,
    Upload,
    Save,
    LayoutDashboard,
    Search,
    Download,
    Trash2,
    ShieldAlert,
    Sun,
    Moon,
    Lock,
    CheckCircle,
    Copy,
    HelpCircle,
    BookOpen,
    ArrowLeftRight,
    XCircle,
    Info,
    LifeBuoy,
    FileText,
    Eye,
    ChevronDown,
    ChevronRight,
    Plus,
    Calendar,
    Clock,
    CreditCard,
    Cloud
} from 'lucide-react';
import GestaoEmpresasCloud, { type CloudTenant, type SubscriptionPayment } from './GestaoEmpresasCloud';
import VolumeNegocioSaas from './VolumeNegocioSaas';
import ContratosSoftware from './ContratosSoftware';
import MarcaAguaMaster from './MarcaAguaMaster';
import { validateSoftwareContract } from '@/bibliotecas/contrato-software';
import SegurancaServidor from './SegurancaServidor';
import { subscriptionState } from '@/bibliotecas/subscricao';
import { LicenseType, getLicenseTypeName } from '@/bibliotecas/licenciamento';
import { decodeLicensePayload, encodeLicensePayload } from '@/bibliotecas/payload-licenca';
import { drawContactFooter, generateLicenseCertificatePDF, getCompanySettings } from '@/bibliotecas/pdf';
import { formatDateSafe } from '@/bibliotecas/utils';
import { formatAngolanPhone, formatCurrency } from '@/bibliotecas/formatters';
import { addMonths, addYears, format, addDays, isBefore } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from '@/ganchos/usar-toast';
import { useNavigate } from 'react-router-dom';
import { Label } from '@/componentes/ui/label';
import { Badge } from '@/componentes/ui/badge';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';

interface FinanceRecord {
    id: string;
    date: string;
    clientName: string;
    clientNif: string;
    plan: string;
    value: number;
    licenseId: string;
}

interface GeneratedKeyRecord {
    id: string;
    key: string;
    type: LicenseType;
    tier: string;
    machineId: string;
    expirationDate: string;
    createdAt: string;
    value: number;
    clientName?: string;
    clientNif?: string;
    clientPhone?: string;
    clientEmail?: string;
    deviceCount?: number;
    status?: 'active' | 'migrated';
    migratedTo?: string; // ID of the new key
}

export default function DashboardAdmin() {
    const navigate = useNavigate();

    // Estado da Navegação (Sidebar)
    const [activeTab, setActiveTab] = useState<'painel' | 'licenciamento' | 'precos' | 'perfil' | 'relatorios' | 'guia' | 'suporte' | 'contabilidade' | 'empresas' | 'volume' | 'seguranca' | 'contratos' | 'marcaagua'>('painel');

    // Tema
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        return (localStorage.getItem('tango_master_theme') as 'light' | 'dark') || 'dark';
    });

    // Licenciamento
    const [planType, setPlanType] = useState<LicenseType>('monthly');
    const [planTier, setPlanTier] = useState<'singular' | 'empresarial'>('singular');
    const [deviceCount, setDeviceCount] = useState<number>(1);
    const [targetMachineId, setTargetMachineId] = useState('');
    const [expirationDate, setExpirationDate] = useState<Date>(addMonths(new Date(), 1));
    const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeyRecord[]>([]);
    const [activations, setActivations] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchActivations = async () => {
            if ((window as any).electronAPI?.getActivations) {
                const data = await (window as any).electronAPI.getActivations();
                setActivations(data || {});
            }
        };
        fetchActivations();
        const interval = setInterval(fetchActivations, 30000); // Polling cada 30s
        return () => clearInterval(interval);
    }, []);

    // Contabilidade Persistence
    const [financialRecords, setFinancialRecords] = useState<FinanceRecord[]>(() => {
        const saved = localStorage.getItem('tango_master_finance');
        return saved ? JSON.parse(saved) : [];
    });

    // Estados da Tabela Financeira
    const [financePage, setFinancePage] = useState(1);
    const [financeSearch, setFinanceSearch] = useState('');
    const rowsPerPage = 5;

    // Estados de Formulário
    const [clientName, setClientName] = useState('');
    const [clientNif, setClientNif] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Preços Dinâmicos
    const [prices, setPrices] = useState<Record<LicenseType, number>>(() => {
        const saved = localStorage.getItem('tango_master_prices');
        const defaults = {
            'monthly': 15000,
            'quarterly': 40000,
            'biannual': 75000,
            'annual': 140000,
            'lifetime': 1500000,
            'trial': 0
        };
        return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    });

    // Logos
    const [branding, setBranding] = useState({
        systemLogo: localStorage.getItem('tango_master_logo_system') || '',
        invoiceLogo: localStorage.getItem('tango_master_logo_invoice') || ''
    });

    // Segurança & Chaves (Estado Restaurado)
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [hasPrivateKey, setHasPrivateKey] = useState(false);
    const [showKeyGenerator, setShowKeyGenerator] = useState(false);
    const [tempKeys, setTempKeys] = useState<{ privateKey: string, publicKey: string } | null>(null);

    // Perfil do proprietário (guardado no processo principal, junto da credencial mestra)
    const [profile, setProfile] = useState({ name: 'Admin Master', email: '', phone: '' });
    const [profileDraft, setProfileDraft] = useState(profile);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const profileInitials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2)
        .map(part => part[0]?.toUpperCase()).join('') || 'AD';

    useEffect(() => {
        window.electronAPI?.masterProfileGet?.()
            .then(loaded => { setProfile(loaded); setProfileDraft(loaded); })
            .catch(error => console.warn('[Master] Perfil indisponível:', error));
    }, []);

    // Stats
    const totalRevenue = financialRecords.reduce((acc, curr) => acc + (curr.value || 0), 0);
    const totalKeys = generatedKeys.length;
    const totalSalesCount = financialRecords.length;
    const averageTicket = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0;
    const activeMachinesCount = new Set(generatedKeys.filter(k => k.status !== 'migrated').map(k => k.machineId)).size;
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Migração de Licença
    const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
    const [selectedKeyForMigration, setSelectedKeyForMigration] = useState<GeneratedKeyRecord | null>(null);
    const [newMachineIdForMigration, setNewMachineIdForMigration] = useState('');

    // Notificações Premium (Substituição de Toast)
    const [notification, setNotification] = useState<{
        open: boolean;
        title: string;
        message: string;
        type: 'success' | 'error' | 'info';
    }>({ open: false, title: '', message: '', type: 'success' });

    // Confirmações Premium
    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ open: false, title: '', message: '', onConfirm: () => { } });

    useEffect(() => {
        // ATUALIZAÇÃO AUTOMÁTICA DA DATA DE EXPIRAÇÃO BASEADA NO PLANO
        const now = new Date();
        let newExpDate: Date;

        switch (planType) {
            case 'monthly':
                newExpDate = addMonths(now, 1);
                break;
            case 'quarterly':
                newExpDate = addMonths(now, 3);
                break;
            case 'biannual':
                newExpDate = addMonths(now, 6);
                break;
            case 'annual':
                newExpDate = addMonths(now, 12);
                break;
            case 'lifetime':
                newExpDate = addYears(now, 99); // Vitalício = 99 anos
                break;
            case 'trial':
                newExpDate = addDays(now, 3);
                break;
            default:
                newExpDate = addMonths(now, 1);
        }
        setExpirationDate(newExpDate);
    }, [planType]);

    // PDF Preview State
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

    const showModalNotification = (title: string, message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setNotification({ open: true, title, message, type });
        if (type === 'success') {
            setTimeout(() => setNotification(prev => ({ ...prev, open: false })), 3000);
        }
    };
    const expiringSoonKeys = generatedKeys.filter(k => {
        const expDate = new Date(k.expirationDate);
        const now = new Date();
        const limit = addDays(now, 15);
        return expDate > now && isBefore(expDate, limit);
    });

    const recentActivity = [...generatedKeys]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

    // Theme Effect
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('tango_master_theme', theme);
    }, [theme]);

    useEffect(() => {
        // Carregar chaves de licença (Histórico)
        const savedKeys = localStorage.getItem('tango_master_keys');
        if (savedKeys) {
            setGeneratedKeys(JSON.parse(savedKeys));
        }

        // --- NOVO: Carregar Chaves RSA Locais (Sincronização Automática) ---
        const loadLocalKeys = async () => {
            if ((window as any).electronAPI && (window as any).electronAPI.readLicenseKeys) {
                try {
                    const response = await (window as any).electronAPI.readLicenseKeys();
                    setHasPrivateKey(Boolean(response.success && response.hasPrivateKey));
                } catch (e) {
                    console.error("Erro ao carregar chaves locais:", e);
                }
            }
        };
        loadLocalKeys();

    }, []);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const handleLogout = async () => {
        await window.electronAPI?.masterAuthLogout?.();
        navigate(window.location.hash.includes('tango-master') ? '/tango-master' : '/login');
    };

    // --- STATS & CHARTS DATA ---
    const chartData = Object.keys(prices).filter(k => k !== 'trial').map(type => {
        const count = generatedKeys.filter(k => k.type === type).length;
        const revenue = generatedKeys.filter(k => k.type === type).reduce((acc, curr) => acc + (curr.value || 0), 0);
        return { name: getLicenseTypeName(type as LicenseType).split('-')[1]?.trim() || type, revenue, count };
    });

    const pieData = [
        { name: 'Ativas', value: generatedKeys.filter(k => new Date(k.expirationDate) > new Date()).length, color: '#10b981' },
        { name: 'Expiradas', value: generatedKeys.filter(k => new Date(k.expirationDate) <= new Date()).length, color: '#ef4444' }
    ];

    // Dados Mensais (Últimos 12 meses)
    const monthlyRevenueData = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (11 - i));
        const monthLabel = d.toLocaleString('pt-PT', { month: 'short' }).toUpperCase();
        const year = d.getFullYear();
        const month = d.getMonth();

        const total = generatedKeys
            .filter(k => {
                const date = new Date(k.createdAt);
                return date.getFullYear() === year && date.getMonth() === month;
            })
            .reduce((acc, curr) => acc + (curr.value || 0), 0);

        return { name: monthLabel, valor: total };
    });

    // --- SEGURANÇA & CHAVES ---
    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast({ title: "Senhas não coincidem", description: "Tente novamente.", variant: "destructive" });
            return;
        }
        try {
            await window.electronAPI.masterAuthChangePassword(currentPassword, newPassword);
            showModalNotification("Sucesso", "Palavra-passe mestra atualizada com segurança.");
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            showModalNotification("Falha na atualização", error instanceof Error ? error.message : String(error), "error");
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.electronAPI?.masterProfileUpdate) {
            showModalNotification("Indisponível", "A edição de perfil só está disponível na aplicação Tango Master.", "error");
            return;
        }
        setIsSavingProfile(true);
        try {
            const saved = await window.electronAPI.masterProfileUpdate(profileDraft);
            setProfile(saved);
            setProfileDraft(saved);
            showModalNotification("Perfil atualizado", "Os seus dados foram guardados.");
        } catch (error) {
            showModalNotification("Falha ao guardar perfil", error instanceof Error ? error.message : String(error), "error");
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleGenerateNewKeys = async () => {
        try {
            const result = await window.electronAPI.generateLicenseKeypair();
            setTempKeys({ privateKey: '', publicKey: result.publicKey });
            setHasPrivateKey(result.hasPrivateKey);
            localStorage.setItem('tango_master_public_key', result.publicKey);
            setShowKeyGenerator(true);
        } catch (error) {
            showModalNotification("Falha ao gerar chaves", error instanceof Error ? error.message : String(error), "error");
        }
    };

    // --- MANIPULAÇÃO DE LOGOS ---
    const handleLogoUpload = (type: 'system' | 'invoice', file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            if (type === 'system') {
                localStorage.setItem('tango_master_logo_system', base64);
                setBranding(prev => ({ ...prev, systemLogo: base64 }));
            } else {
                localStorage.setItem('tango_master_logo_invoice', base64);
                setBranding(prev => ({ ...prev, invoiceLogo: base64 }));
            }
            showModalNotification("Logo Atualizado", "As definições visuais foram guardadas.");
        };
        reader.readAsDataURL(file);
    };

    // --- PORTABILIDADE (BACKUP & RESTORE) ---
    const handleExportBackup = () => {
        const backupData = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            config: {
                prices,
                branding,
                keys: generatedKeys,
                finance: financialRecords,
                masterWatermark: localStorage.getItem('tango_master_watermark') || '',
                softwareContracts: {
                    history: JSON.parse(localStorage.getItem('tango_master_contracts_v1') || '[]'),
                    draft: JSON.parse(localStorage.getItem('tango_master_contract_draft_v1') || 'null')
                }
            }
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tango_master_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showModalNotification("Backup Concluído", "As suas configurações mestre (chaves e histórico) foram exportadas.");
    };

    const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (!data.config || !Array.isArray(data.config.keys)) {
                    throw new Error("Ficheiro de backup inválido.");
                }

                const { config } = data;
                if(config.masterWatermark!==undefined && (typeof config.masterWatermark!=='string' || (config.masterWatermark!=='' && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(config.masterWatermark))))throw new Error('Marca de água no backup inválida.');
                if (config.softwareContracts) {
                    const contracts = config.softwareContracts;
                    if (!Array.isArray(contracts.history) || !contracts.history.every(validateSoftwareContract) ||
                        (contracts.draft != null && !validateSoftwareContract(contracts.draft))) throw new Error('Contratos no backup inválidos.');
                }

                // Restaurar localStorage
                if(config.masterWatermark!==undefined){if(config.masterWatermark)localStorage.setItem('tango_master_watermark',config.masterWatermark);else localStorage.removeItem('tango_master_watermark');}
                localStorage.setItem('tango_master_prices', JSON.stringify(config.prices));
                localStorage.setItem('tango_master_logo_system', config.branding.systemLogo);
                localStorage.setItem('tango_master_logo_invoice', config.branding.invoiceLogo);
                localStorage.setItem('tango_master_keys', JSON.stringify(config.keys));
                // Restaurar Estados
                setPrices(config.prices);
                setBranding(config.branding);
                setGeneratedKeys(config.keys);
                if (config.finance) {
                    setFinancialRecords(config.finance);
                    localStorage.setItem('tango_master_finance', JSON.stringify(config.finance));
                }
                if (config.softwareContracts) {
                    const contracts = config.softwareContracts;
                    localStorage.setItem('tango_master_contracts_v1', JSON.stringify(contracts.history));
                    if (contracts.draft) localStorage.setItem('tango_master_contract_draft_v1', JSON.stringify(contracts.draft));
                    else localStorage.removeItem('tango_master_contract_draft_v1');
                }

                showModalNotification("Restauro Concluído", "Configurações, chaves e histórico restaurados com sucesso.");
            } catch (err) {
                console.error(err);
                showModalNotification("Erro no Import", "Ficheiro de backup inválido ou corrompido.", "error");
            }
        };
        reader.readAsText(file);
    };

    // --- GERAÇÃO DE CHAVES ---
    const handleGenerateKey = async () => {
        // Bloqueio de Segurança: Verificar Chave RSA
        if (!hasPrivateKey) {
            showModalNotification("Chave Ausente", "Configure a sua Chave Privada em 'Configurações' para poder assinar e emitir licenças.", "error");
            return;
        }

        // Validação
        if (!targetMachineId) {
            showModalNotification("ID em falta", "Introduza o ID da Máquina do cliente para continuar.", "info");
            return;
        }

        if (planTier === 'empresarial' && !clientNif) {
            showModalNotification("NIF Obrigatório", "Empresas requerem NIF para emissão de licença.", "info");
            return;
        }

        // Calcular Valor
        let basePrice = prices[planType];
        if (planTier === 'empresarial') {
            basePrice = basePrice * 2.5; // Exemplo: Empresarial custa 2.5x mais
        }
        const finalValue = basePrice * deviceCount;

        try {
            // Dados da Licença (Reforçados para Segurança - Campos Curtos para o Validador)
            const licensePayload = {
                alg: 'RS256',
                kid: 'tango-license-2026-01',
                licenseVersion: 2,
                jti: crypto.randomUUID(),
                mid: targetMachineId,
                type: planType,
                tier: planTier,
                exp: expirationDate.toISOString(),
                devices: deviceCount,
                client: clientName || 'CONSUMIDOR_FINAL',
                nif: clientNif || '999999999',
                iat: new Date().toISOString()
            };

            // 3. Converter para Base64 antes de assinar (conforme licenciamento.ts)
            const payloadBase64 = encodeLicensePayload(JSON.stringify(licensePayload));

            // A chave privada nunca sai do cofre do processo principal.
            const signed = await window.electronAPI.signLicensePayload(payloadBase64);
            const signature = signed.signature;
            const signedPayload = signed.payload;

            // 5. Criar Chave Final (JSON com payload B64 + assinatura)
            const finalKey = btoa(JSON.stringify({ payload: signedPayload, signature }));

            // Guardar Registo
            const newRecord: GeneratedKeyRecord = {
                id: crypto.randomUUID(),
                key: finalKey,
                type: planType,
                tier: planTier,
                machineId: targetMachineId,
                expirationDate: expirationDate.toISOString(),
                createdAt: new Date().toISOString(),
                value: finalValue,
                clientName: clientName || 'N/A',
                clientNif: clientNif || 'N/A',
                clientPhone: clientPhone || 'N/A',
                clientEmail: clientEmail || 'N/A',
                deviceCount: deviceCount
            };

            const updatedKeys = [newRecord, ...generatedKeys];
            setGeneratedKeys(updatedKeys);
            localStorage.setItem('tango_master_keys', JSON.stringify(updatedKeys));

            // Registar na Contabilidade (Persistência)
            const newFinanceRecord: FinanceRecord = {
                id: crypto.randomUUID(),
                date: new Date().toISOString(),
                clientName: newRecord.clientName || 'N/A',
                clientNif: newRecord.clientNif || 'N/A',
                plan: getLicenseTypeName(newRecord.type),
                value: newRecord.value,
                licenseId: newRecord.id
            };
            const updatedFinance = [newFinanceRecord, ...financialRecords];
            setFinancialRecords(updatedFinance);
            localStorage.setItem('tango_master_finance', JSON.stringify(updatedFinance));

            // 5. Gerar Recibo PDF Automático
            generateLicenseReceiptPDF(newRecord);

            showModalNotification("Sucesso!", "Licença gerada com sucesso e recibo emitido.");

            // Reset parcial
            setTargetMachineId('');
            setClientName('');
            setClientNif('');
            setClientPhone('');
            setClientEmail('');

        } catch (error) {
            console.error(error);
            showModalNotification("Erro Crítico", "Falha interna ao assinar os dados da licença.", "error");
        }
    };

    const handleMigrateKey = async () => {
        if (!selectedKeyForMigration || !newMachineIdForMigration) return;

        if (!hasPrivateKey) {
            showModalNotification("Chave Ausente", "Configure a Chave Privada RSA antes de migrar licenças.", "error");
            return;
        }

        try {
            // 1. Novos Dados (Mesma validade, Nova máquina)
            const licensePayload = {
                alg: 'RS256',
                kid: 'tango-license-2026-01',
                licenseVersion: 2,
                jti: crypto.randomUUID(),
                mid: newMachineIdForMigration,
                type: selectedKeyForMigration.type,
                tier: selectedKeyForMigration.tier,
                exp: selectedKeyForMigration.expirationDate,
                devices: selectedKeyForMigration.deviceCount || 1,
                client: selectedKeyForMigration.clientName || 'CLIENTE_MIGRADO',
                nif: selectedKeyForMigration.clientNif || '999999999',
                iat: new Date().toISOString()
            };

            // 2. Converter para Base64 antes de assinar
            const payloadBase64 = encodeLicensePayload(JSON.stringify(licensePayload));

            // 3. Assinar
            const signed = await window.electronAPI.signLicensePayload(payloadBase64);
            const signature = signed.signature;
            const signedPayload = signed.payload;

            // 4. Criar Chave Final
            const finalKey = btoa(JSON.stringify({ payload: signedPayload, signature }));

            // 4. Criar Novo Registo
            const newRecordId = crypto.randomUUID();
            const newRecord: GeneratedKeyRecord = {
                id: newRecordId,
                key: finalKey,
                type: selectedKeyForMigration.type,
                tier: selectedKeyForMigration.tier,
                machineId: newMachineIdForMigration,
                expirationDate: selectedKeyForMigration.expirationDate,
                createdAt: new Date().toISOString(),
                value: 0,
                clientName: selectedKeyForMigration.clientName,
                clientNif: selectedKeyForMigration.clientNif,
                clientPhone: selectedKeyForMigration.clientPhone,
                clientEmail: selectedKeyForMigration.clientEmail,
                deviceCount: selectedKeyForMigration.deviceCount,
                status: 'active'
            };

            // 5. Atualizar Lista (Marcar antiga como migrada)
            const updatedKeys = generatedKeys.map(k => {
                if (k.id === selectedKeyForMigration.id) {
                    return { ...k, status: 'migrated' as const, migratedTo: newRecordId };
                }
                return k;
            });

            const finalKeyList = [newRecord, ...updatedKeys];
            setGeneratedKeys(finalKeyList);
            localStorage.setItem('tango_master_keys', JSON.stringify(finalKeyList));

            showModalNotification("Migração Concluída!", "Nova chave gerada e dias transferidos com sucesso.");

            setIsMigrationModalOpen(false);
            setNewMachineIdForMigration('');
            setSelectedKeyForMigration(null);

            // Opcional: Gerar novo PDF
            generateLicenseReceiptPDF(newRecord);

        } catch (error) {
            console.error(error);
            showModalNotification("Falha", "Não foi possível migrar a licença. Verifique as chaves.", "error");
        }
    };

    const handleCopyKey = (key: string) => {
        navigator.clipboard.writeText(key);
        showModalNotification("Copiado", "A chave foi copiada para a área de transferência.");
    };

    const handleDeleteKey = (id: string) => {
        setConfirmModal({
            open: true,
            title: "Eliminar Licença",
            message: "Tem a certeza que deseja apagar este registo? Esta ação não pode ser revertida e a chave deixará de ser listada no histórico.",
            onConfirm: () => {
                const updated = generatedKeys.filter(k => k.id !== id);
                setGeneratedKeys(updated);
                localStorage.setItem('tango_master_keys', JSON.stringify(updated));
                showModalNotification("Eliminado", "O registo foi removido com sucesso.");
                setConfirmModal(prev => ({ ...prev, open: false }));
            }
        });
    };

    const handleSavePrices = () => {
        localStorage.setItem('tango_master_prices', JSON.stringify(prices));
        showModalNotification("Guardado", "A tabela de preços foi atualizada.");
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const colors = {
            red: [220, 30, 30] as [number, number, number],
            dark: [30, 30, 30] as [number, number, number],
            gray: [100, 100, 100] as [number, number, number],
            lightGray: [240, 240, 240] as [number, number, number]
        };

        // Geometria
        doc.setLineWidth(8); doc.setDrawColor(...colors.red);
        doc.circle(pageWidth + 5, -5, 45, 'S');
        doc.circle(-5, pageHeight + 5, 45, 'S');

        // Logo e Título
        const logo = branding.invoiceLogo || branding.systemLogo;
        if (logo) {
            try {
                let imgWidth = 30;
                let imgHeight = 15;
                try {
                    const properties = doc.getImageProperties(logo);
                    const originalWidth = properties.width;
                    const originalHeight = properties.height;
                    if (originalWidth && originalHeight) {
                        const aspectRatio = originalWidth / originalHeight;
                        if (aspectRatio > 2) {
                            imgWidth = 30;
                            imgHeight = 30 / aspectRatio;
                        } else {
                            imgHeight = 15;
                            imgWidth = 15 * aspectRatio;
                        }
                    }
                } catch (err) {
                    console.warn("Could not get logo properties:", err);
                }
                const yOffset = 15 + (15 - imgHeight) / 2;
                doc.addImage(logo, 'PNG', 20, yOffset, imgWidth, imgHeight, undefined, 'NONE');
            } catch (e) { }
        }

        doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.dark);
        doc.text("TangoMasterGestao", 55, 23);
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.gray);
        doc.text("SISTEMA DE GESTÃO INTELIGENTE & LICENCIAMENTO DIGITAL", 55, 28);

        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.red);
        doc.text('RELATÓRIO DE LICENÇAS EMITIDAS', 20, 50);

        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.dark);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 20, 58);
        doc.text(`Total Faturado: ${totalRevenue.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}`, 20, 64);

        const tableData = generatedKeys.slice(0, 50).map(k => [
            formatDateSafe(k.createdAt),
            k.clientName || 'N/A',
            getLicenseTypeName(k.type).toUpperCase(),
            k.value.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' }),
            k.machineId.substring(0, 15) + '...'
        ]);

        autoTable(doc, {
            startY: 75,
            head: [['DATA', 'CLIENTE', 'TIPO', 'VALOR', 'MID']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: colors.red, textColor: 255, fontSize: 9, fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 3 },
            alternateRowStyles: { fillColor: [250, 250, 250] }
        });

        // Rodapé
        for (let page = 1; page <= doc.getNumberOfPages(); page++) { doc.setPage(page); drawContactFooter(doc, getCompanySettings()); }
        doc.setFontSize(7); doc.setTextColor(...colors.gray);
        doc.text("TangoMasterGestao - Relatório Oficial de Licenciamento", pageWidth / 2, pageHeight - 10, { align: 'center' });

        doc.save('TangoMasterGestao_Licencas.pdf');
    };

    // --- CERTIFICADO DE LICENÇA (mesmo modelo gráfico dos documentos do ERP) ---
    const generateLicenseReceiptPDF = (record: GeneratedKeyRecord, isPreview: boolean = false) => {
        // Os dados assinados (NIF, dispositivos, identificador) vêm da própria chave.
        let signed: { nif?: string; devices?: number; jti?: string; iat?: string; tier?: string } = {};
        try {
            const wrapper = JSON.parse(atob(record.key.replace(/\s+/g, '')));
            signed = JSON.parse(decodeLicensePayload(wrapper.payload));
        } catch { /* chave antiga ou ilegível: usa os dados do registo */ }
        const planNames: Record<string, string> = {
            monthly: 'Mensal', quarterly: 'Trimestral', biannual: 'Semestral', annual: 'Anual', lifetime: 'Vitalícia', trial: 'Demonstração (3 dias)'
        };
        const tier = signed.tier || record.tier;
        const licenseNif = String(signed.nif || record.clientNif || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
        const verificationSource = (signed.jti || record.id || '').replace(/[^0-9a-f]/gi, '').toUpperCase().padEnd(12, '0');
        const result = generateLicenseCertificatePDF({
            clientName: record.clientName || 'Cliente',
            clientNif: record.clientNif,
            clientPhone: record.clientPhone,
            clientEmail: record.clientEmail,
            machineId: record.machineId,
            planLabel: planNames[record.type] || getLicenseTypeName(record.type),
            tierLabel: tier === 'empresarial' ? 'Licença Empresarial' : 'Licença Pessoal',
            devices: signed.devices || record.deviceCount,
            issuedAt: signed.iat || record.createdAt,
            expiresAt: record.expirationDate,
            key: record.key,
            verificationCode: verificationSource.slice(0, 12).match(/.{4}/g)!.join('-'),
            companyNif: licenseNif.length >= 9 && licenseNif !== '999999999' ? licenseNif : null,
        }, {
            name: 'DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA',
            logo: branding.invoiceLogo || branding.systemLogo || null,
            phone: profile.phone || '+244 941 537 486',
            email: profile.email || 'suporte@tangogestao.ao',
            signerName: profile.name && profile.name !== 'Admin Master' ? profile.name : 'Administração Tango',
        }, isPreview ? 'datauri' : 'save');
        if (isPreview && result) setPdfPreviewUrl(result);
    };

    // --- ELIMINAR REGISTO FINANCEIRO ---
    const handleDeleteFinancialRecord = (id: string) => {
        setConfirmModal({
            open: true,
            title: 'Eliminar Registo',
            message: 'Tem a certeza que deseja eliminar este registo do histórico? O valor será subtraído da receita total.',
            onConfirm: () => {
                const updated = financialRecords.filter(r => r.id !== id);
                setFinancialRecords(updated);
                localStorage.setItem('tango_master_finance', JSON.stringify(updated));
                setConfirmModal(prev => ({ ...prev, open: false }));
                showModalNotification('Registo Eliminado', 'Transação removida com sucesso.', 'info');
            }
        });
    };

    // --- EXPORTAR GUIA TÉCNICO PDF ---
    const exportHelpToPDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const colors = {
            red: [220, 30, 30] as [number, number, number],
            dark: [30, 30, 30] as [number, number, number],
            gray: [100, 100, 100] as [number, number, number],
            lightGray: [240, 240, 240] as [number, number, number]
        };

        // Geometria
        doc.setLineWidth(8); doc.setDrawColor(...colors.red);
        doc.circle(pageWidth + 5, -5, 45, 'S');
        doc.circle(-5, pageHeight + 5, 45, 'S');

        // Logo e Título
        const logo = branding.invoiceLogo || branding.systemLogo;
        if (logo) {
            try {
                let imgWidth = 30;
                let imgHeight = 15;
                try {
                    const properties = doc.getImageProperties(logo);
                    const originalWidth = properties.width;
                    const originalHeight = properties.height;
                    if (originalWidth && originalHeight) {
                        const aspectRatio = originalWidth / originalHeight;
                        if (aspectRatio > 2) {
                            imgWidth = 30;
                            imgHeight = 30 / aspectRatio;
                        } else {
                            imgHeight = 15;
                            imgWidth = 15 * aspectRatio;
                        }
                    }
                } catch (err) {
                    console.warn("Could not get logo properties:", err);
                }
                const yOffset = 15 + (15 - imgHeight) / 2;
                doc.addImage(logo, 'PNG', 20, yOffset, imgWidth, imgHeight, undefined, 'NONE');
            } catch (e) { }
        }

        doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.dark);
        doc.text("TangoMasterGestao", 55, 23);
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.gray);
        doc.text("SISTEMA DE GESTÃO INTELIGENTE & LICENCIAMENTO DIGITAL", 55, 28);

        doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.red);
        doc.text("GUIA DE CONFIGURAÇÃO RSA", 20, 50);

        doc.setFontSize(12); doc.setTextColor(...colors.dark);
        doc.text("1. Chave Privada (Assinatura)", 20, 65);
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.gray);
        const text1 = "A Chave Privada é usada no Painel Master (este software) para assinar as licenças. Cole-a em Perfil -> Chave Privada. NUNCA partilhe este ficheiro com ninguém, nem mesmo com os clientes.";
        doc.text(doc.splitTextToSize(text1, pageWidth - 40), 20, 72);

        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.dark);
        doc.text("2. Chave Pública (Verificação)", 20, 95);
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.gray);
        const text2 = "A Chave Pública é usada no código-fonte do software do Cliente (Tango ERP) para validar as assinaturas geradas. Substitua a constante MASTER_PUBLIC_KEY em 'src/bibliotecas/chave-publica-licencas.ts'.";
        doc.text(doc.splitTextToSize(text2, pageWidth - 40), 20, 102);

        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...colors.dark);
        doc.text("3. Segurança Digital", 20, 125);
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...colors.gray);
        const text3 = "O sistema utiliza algoritmos RSA para garantir a integridade. Se um cliente tentar alterar dados da licença (como a validade) no ficheiro local, a assinatura deixará de ser válida e o software bloqueará o acesso.";
        doc.text(doc.splitTextToSize(text3, pageWidth - 40), 20, 132);

        // Rodapé
        for (let page = 1; page <= doc.getNumberOfPages(); page++) { doc.setPage(page); drawContactFooter(doc, getCompanySettings()); }
        doc.setFontSize(7); doc.setTextColor(...colors.gray);
        doc.text("TangoMasterGestao - Documentação Técnica de Segurança", pageWidth / 2, pageHeight - 10, { align: 'center' });

        doc.save("Guia_Configuracao_RSA.pdf");
    };

    // --- SIDEBAR ---
    // Pagamentos de subscrições web registados no Tango Master entram na Contabilidade.
    const handleSubscriptionPayment = (payment: SubscriptionPayment) => {
        const record: FinanceRecord = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            clientName: payment.clientName,
            clientNif: payment.clientNif,
            plan: payment.plan,
            value: payment.value,
            licenseId: payment.referenceId
        };
        setFinancialRecords(previous => {
            const updated = [record, ...previous];
            localStorage.setItem('tango_master_finance', JSON.stringify(updated));
            return updated;
        });
    };

    // Subscrições web a expirar ou expiradas (lista guardada pelo separador Empresas Cloud).
    const subscriptionAlerts = (() => {
        try {
            const saved: CloudTenant[] = JSON.parse(localStorage.getItem('tango_master_registered_tenants') || '[]');
            return saved
                .map(tenant => ({ tenant, state: subscriptionState(tenant.expiresAt) }))
                .filter(({ state }) => state.kind === 'expiring' || state.kind === 'expired');
        } catch {
            return [];
        }
    })();

    const SidebarItem = ({ id, icon: Icon, label, badge }: { id: typeof activeTab, icon: any, label: string, badge?: number }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm mb-1
                ${activeTab === id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
        >
            <Icon className="h-5 w-5" />
            {label}
            {badge ? (
                <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white" aria-label={`${badge} subscrições a renovar`}>
                    {badge}
                </span>
            ) : null}
        </button>
    );

    return (
        <div className="flex h-svh w-full overflow-hidden bg-slate-50 font-sans text-slate-800 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
            {/* SIDEBAR */}
            <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white/50 backdrop-blur-md transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/50 xl:w-64">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-blue-600 p-2 rounded-xl shadow-lg">
                            <Shield className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg leading-tight text-slate-900 dark:text-white">TangoMasterGestao</h1>
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold tracking-wider uppercase">Generator Pro</p>
                        </div>
                    </div>

                    <nav className="space-y-1">
                        <SidebarItem id="painel" icon={LayoutDashboard} label="Visão Geral" />
                        <SidebarItem id="volume" icon={TrendingUp} label="Volume de Negócio" />
                        <SidebarItem id="seguranca" icon={ShieldAlert} label="Segurança" />
                <SidebarItem id="relatorios" icon={BarChart3} label="Relatórios" />
                        <SidebarItem id="licenciamento" icon={Key} label="Gerar Licenças" />
                        <SidebarItem id="contratos" icon={FileText} label="Contratos de Venda" />
                        <SidebarItem id="marcaagua" icon={FileText} label="Marca de Água" />
                        <SidebarItem id="empresas" icon={Cloud} label="Empresas Cloud" badge={subscriptionAlerts.length} />
                        <SidebarItem id="precos" icon={FileText} label="Gestão de Preços" />
                        <SidebarItem id="perfil" icon={Settings} label="Perfil & Configurações" />
                        <SidebarItem id="contabilidade" icon={CreditCard} label="Contabilidade" />
                        <SidebarItem id="guia" icon={BookOpen} label="Ajuda e Guia" />
                        <SidebarItem id="suporte" icon={LifeBuoy} label="Suporte & Tokens" />
                    </nav>
                </div>

                <div className="mt-auto p-6 border-t border-slate-200 dark:border-slate-800/50">
                    {/* Theme Toggle in Sidebar */}
                    <Button
                        variant="ghost"
                        onClick={toggleTheme}
                        className="w-full mb-4 justify-start text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                        {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                        Modo: {theme === 'dark' ? 'Claro' : 'Escuro'}
                    </Button>

                    <div className="bg-slate-100 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 mb-4 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center font-bold text-xs text-white">
                                {profileInitials}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">{profile.name}</p>
                                <p className="truncate text-xs text-slate-500">{profile.email || 'Super User'}</p>
                            </div>
                        </div>
                    </div>
                    <Button variant="outline" onClick={handleLogout} className="w-full border-slate-300 dark:border-slate-700 bg-transparent hover:bg-red-50 dark:hover:bg-red-950 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 transition-colors">
                        <LogOut className="mr-2 h-4 w-4" /> Terminar Sessão
                    </Button>
                </div>
            </aside >

            {/* MAIN CONTENT */}
            < main className="flex-1 overflow-y-auto custom-scrollbar relative" >
                {/* Background Glow */}
                < div className="pointer-events-none fixed left-56 right-0 top-0 h-64 bg-gradient-to-b from-blue-900/5 to-transparent dark:from-blue-900/10 xl:left-64" />

                <div className="relative z-10 w-full px-2 sm:px-4 py-4 md:py-6">

                    {/* --- EMPRESAS CLOUD (Tenants & Chaves de Sincronização) --- */}
                    {activeTab === 'empresas' && <GestaoEmpresasCloud onSubscriptionPayment={handleSubscriptionPayment} />}
                    {activeTab === 'contratos' && <ContratosSoftware logo={branding.invoiceLogo || branding.systemLogo} />}
                    {activeTab === 'marcaagua' && <MarcaAguaMaster />}

                    {/* --- PAINEL --- */}
                    {activeTab === 'painel' && (
                        <div className="space-y-6">
                            {subscriptionAlerts.length > 0 && (
                                <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-start gap-3">
                                        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                        <div className="text-sm">
                                            <p className="font-black">{subscriptionAlerts.length} {subscriptionAlerts.length === 1 ? 'subscrição precisa' : 'subscrições precisam'} de renovação</p>
                                            <p className="text-xs">
                                                {subscriptionAlerts.slice(0, 3).map(({ tenant, state }) => state.kind === 'expired'
                                                    ? `${tenant.name} (expirada)`
                                                    : `${tenant.name} (${state.kind === 'expiring' ? state.daysLeft : 0} dias)`).join(' · ')}
                                                {subscriptionAlerts.length > 3 ? ' …' : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={() => setActiveTab('empresas')} className="shrink-0 bg-amber-600 font-bold text-white hover:bg-amber-700">
                                        Ver empresas
                                    </Button>
                                </div>
                            )}
                            <div className="flex justify-between items-end mb-6">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Painel de Controlo</h2>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1">Visão geral do desempenho de vendas e licenças.</p>
                                </div>
                                <Button onClick={() => setActiveTab('licenciamento')} className="bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/40 animate-pulse-slow">
                                    <Key className="mr-2 h-4 w-4" /> Nova Licença
                                </Button>
                            </div>

                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur transition-colors">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Faturação Total</p>
                                                <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
                                                    {totalRevenue.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}
                                                </div>
                                            </div>
                                            <div className="bg-green-500/10 p-2 rounded-lg"><TrendingUp className="h-5 w-5 text-green-600 dark:text-green-500" /></div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur transition-colors">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Licenças Emitidas</p>
                                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{totalKeys}</div>
                                            </div>
                                            <div className="bg-blue-500/10 p-2 rounded-lg"><Key className="h-5 w-5 text-blue-600 dark:text-blue-500" /></div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur transition-colors">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Máquinas Ativas</p>
                                                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">{activeMachinesCount}</div>
                                            </div>
                                            <div className="bg-purple-500/10 p-2 rounded-lg"><Users className="h-5 w-5 text-purple-600 dark:text-purple-500" /></div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur transition-colors">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ticket Médio</p>
                                                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
                                                    {formatCurrency(averageTicket)}
                                                </div>
                                            </div>
                                            <div className="bg-amber-500/10 p-2 rounded-lg"><BarChartIcon className="h-5 w-5 text-amber-600 dark:text-amber-500" /></div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur transition-colors text-red-600 dark:text-red-400">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-medium uppercase tracking-wider text-red-500/80">Prestes a Vencer</p>
                                                <div className="text-2xl font-bold mt-2">
                                                    {expiringSoonKeys.length}
                                                </div>
                                            </div>
                                            <div className="bg-red-500/10 p-2 rounded-lg">
                                                <ShieldAlert className="h-5 w-5" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* GRÁFICO DE FATURAMENTO MENSAL (12 MESES) */}
                            <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur mt-6">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-bold uppercase text-slate-500">Fluxo de Arrecadação Mensal (AOA)</CardTitle>
                                            <CardDescription className="text-[10px]">Evolução dos últimos 12 meses</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={monthlyRevenueData}>
                                            <defs>
                                                <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                stroke="#888888"
                                                fontSize={10}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <YAxis
                                                stroke="#888888"
                                                fontSize={10}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(value) => `${(value / 1000).toLocaleString()}k`}
                                            />
                                            <RechartsTooltip
                                                contentStyle={{
                                                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                                    border: '1px solid rgba(51, 65, 85, 0.5)',
                                                    borderRadius: '8px',
                                                    color: '#fff',
                                                    fontSize: '12px'
                                                }}
                                                itemStyle={{ color: '#10b981' }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="valor"
                                                stroke="#10b981"
                                                strokeWidth={3}
                                                fillOpacity={1}
                                                fill="url(#colorValor)"
                                                animationDuration={1500}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* GRÁFICOS SECUNDÁRIOS */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur">
                                    <CardHeader>
                                        <CardTitle className="text-sm font-bold uppercase text-slate-500">Arrecadação por Tipo</CardTitle>
                                    </CardHeader>
                                    <CardContent className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                                <XAxis dataKey="name" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000}k`} />
                                                <RechartsTooltip
                                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                                    itemStyle={{ color: '#fff' }}
                                                />
                                                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>

                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur">
                                    <CardHeader>
                                        <CardTitle className="text-sm font-bold uppercase text-slate-500">Estado das Licenças</CardTitle>
                                    </CardHeader>
                                    <CardContent className="h-64 flex items-center justify-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={pieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {pieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* INTELIGÊNCIA DE GESTÃO: ALERTAS E ATIVIDADE */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                                {/* Alertas de Expiração */}
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                                                <ShieldAlert className="h-4 w-4 text-amber-500" /> Expirações em breve (15 dias)
                                            </CardTitle>
                                            <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-200">{expiringSoonKeys.length}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {expiringSoonKeys.length > 0 ? expiringSoonKeys.map(key => (
                                                <div key={key.id} className="flex justify-between items-center p-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800 dark:text-white">{key.clientName}</p>
                                                        <p className="text-[10px] text-slate-500">{getLicenseTypeName(key.type)} • {key.machineId}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black text-red-600 dark:text-red-400">Expira em {Math.ceil((new Date(key.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} dias</p>
                                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setActiveTab('licenciamento')}>
                                                            <TrendingUp className="h-3 w-3 text-blue-500" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="py-8 text-center bg-slate-50/50 dark:bg-slate-950/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                                    <p className="text-xs text-slate-400">Nenhuma licença prestes a vencer.</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Atividade Recente */}
                                <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                                            <BarChartIcon className="h-4 w-4 text-blue-500" /> Atividade Recente
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {recentActivity.map(action => (
                                                <div key={action.id} className="flex gap-4 items-start relative pb-4 last:pb-0">
                                                    <div className="h-full absolute left-4 top-8 w-px bg-slate-100 dark:bg-slate-800 last:hidden" />
                                                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full relative z-10 shrink-0">
                                                        <Key className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start">
                                                            <p className="text-xs font-bold text-slate-800 dark:text-white truncate">Licença emitida para {action.clientName}</p>
                                                            <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatDateSafe(action.createdAt)}</span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-0.5">Plano {getLicenseTypeName(action.type)} • {action.value.toLocaleString()} Kz</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {recentActivity.length === 0 && (
                                                <div className="py-8 text-center">
                                                    <p className="text-xs text-slate-400">Sem atividade registada.</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Tabela de Licenças Recentes */}
                            <Card className="bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 backdrop-blur mt-8 transition-colors">
                                <CardHeader>
                                    <CardTitle>Últimas Licenças Geradas</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-slate-100/50 dark:hover:bg-slate-800/50">
                                                <TableHead>Cliente</TableHead>
                                                <TableHead>Plano</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Expira em</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {generatedKeys.slice(0, 5).map((record) => (
                                                <TableRow key={record.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-100/50 dark:hover:bg-slate-800/50">
                                                    <TableCell>
                                                        <div className="font-medium text-slate-800 dark:text-white">{record.clientName || 'N/A'}</div>
                                                        <div className="text-xs text-slate-500">{record.clientNif || 'NIF Isento'}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <Badge variant="outline" className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 w-fit">
                                                                {getLicenseTypeName(record.type).toUpperCase()}
                                                            </Badge>
                                                            {record.status === 'migrated' && (
                                                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[9px] w-fit">MIGRADA</Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-green-600 dark:text-green-400 font-mono">
                                                        {record.value?.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 dark:text-slate-400 text-sm">
                                                        {formatDateSafe(record.createdAt)}
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 dark:text-slate-400 text-sm">
                                                        {formatDateSafe(record.expirationDate)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 w-7 p-0 text-blue-500 hover:bg-blue-50"
                                                                onClick={() => {
                                                                    setSelectedKeyForMigration(record);
                                                                    setIsMigrationModalOpen(true);
                                                                }}
                                                                disabled={record.status === 'migrated'}
                                                            >
                                                                <ArrowLeftRight className="h-4 w-4" />
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500 hover:bg-blue-50" onClick={() => generateLicenseReceiptPDF(record, true)}>
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-50" onClick={() => generateLicenseReceiptPDF(record, false)}>
                                                                <Download className="h-4 w-4" />
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-500 hover:bg-amber-50" onClick={() => handleCopyKey(record.key)}>
                                                                <Key className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {generatedKeys.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                                        Nenhuma licença gerada ainda.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* --- LICENCIAMENTO --- */}
                    {activeTab === 'licenciamento' && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-full">
                            {/* Coluna Esquerda: Formulário (40%) */}
                            <div className="xl:col-span-5 space-y-6">
                                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden">
                                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                                        <div className="h-10 w-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                                            <Key className="h-5 w-5 text-slate-800 dark:text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black text-slate-800 dark:text-white">Emissão de Licença</h2>
                                            <p className="text-xs text-slate-500">Gerar nova chave para ativação de terminal.</p>
                                        </div>
                                    </div>
                                    <CardContent className="space-y-6 pt-6 bg-white dark:bg-slate-900">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo de Plano</Label>
                                            <select
                                                className="w-full h-11 px-4 rounded-lg bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-sm font-medium focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                                                value={planType}
                                                onChange={(e) => setPlanType(e.target.value as LicenseType)}
                                            >
                                                <option value="monthly">Mensal (1 Mês)</option>
                                                <option value="quarterly">Trimestral (3 Meses)</option>
                                                <option value="biannual">Semestral (6 Meses)</option>
                                                <option value="annual">Anual (1 Ano)</option>
                                                <option value="lifetime">Vitalício</option>
                                                <option value="trial">Demonstração (3 Dias)</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nível do Plano</Label>
                                                <select
                                                    className="w-full h-11 px-4 rounded-lg bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-sm font-medium"
                                                    value={planTier}
                                                    onChange={(e) => setPlanTier(e.target.value as 'singular' | 'empresarial')}
                                                >
                                                    <option value="singular">Singular (Pessoal)</option>
                                                    <option value="empresarial">Empresarial (Rede)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nº Dispositivos</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={deviceCount}
                                                    onChange={(e) => setDeviceCount(parseInt(e.target.value) || 1)}
                                                    className="h-11 bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nome do Cliente</Label>
                                                <Input
                                                    placeholder="Nome ou Instituição"
                                                    value={clientName}
                                                    onChange={e => setClientName(e.target.value)}
                                                    className="h-11 bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">NIF / BI</Label>
                                                <Input
                                                    placeholder="000000000XX000 ou 10 Dig"
                                                    value={clientNif}
                                                    onChange={e => {
                                                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                                        if (val.length <= 14) setClientNif(val);
                                                    }}
                                                    className="h-11 bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 font-mono"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Telefone</Label>
                                                <Input
                                                    placeholder="+244 9XX XXX XXX"
                                                    value={clientPhone}
                                                    onChange={e => setClientPhone(formatAngolanPhone(e.target.value))}
                                                    className="h-11 bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email (Opcional)</Label>
                                                <Input
                                                    placeholder="cliente@exemplo.com"
                                                    type="email"
                                                    value={clientEmail}
                                                    onChange={e => setClientEmail(e.target.value)}
                                                    className="h-11 bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ID da Máquina (MID)</Label>
                                            <Input
                                                placeholder="TANGO-XXXXXXX"
                                                value={targetMachineId}
                                                onChange={(e) => setTargetMachineId(e.target.value)}
                                                className="h-11 bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 font-mono tracking-wider"
                                            />
                                            <p className="text-[10px] text-slate-400 italic">Para redes, recomenda-se deixar VAZIO (Global).</p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Valor da Venda (AOA)</Label>
                                            <Input
                                                type="number"
                                                value={(prices[planType] * (planTier === 'empresarial' ? 2.5 : 1)) * deviceCount}
                                                readOnly
                                                className="h-11 bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 font-black text-slate-900 dark:text-white"
                                            />
                                        </div>

                                        {/* Card de Resumo Final */}
                                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/30 dark:bg-slate-950/30 flex justify-between items-center">
                                            <div>
                                                <h4 className="font-black text-slate-800 dark:text-white leading-tight">
                                                    {getLicenseTypeName(planType)} - {planTier === 'empresarial' ? 'Empresarial' : 'Singular'}
                                                </h4>
                                                <p className="text-[10px] text-slate-500 mt-1">
                                                    Expira em: {planType === 'lifetime' ? 'Nunca (Vitalícia)' : format(expirationDate, "dd/MM/yyyy")} ({deviceCount} Disp.)
                                                </p>
                                            </div>
                                            <div className="text-xl font-black text-slate-800 dark:text-white">
                                                {((prices[planType] * (planTier === 'empresarial' ? 2.5 : 1)) * deviceCount).toLocaleString()} Kz
                                            </div>
                                        </div>

                                        {/* Bloqueio de Segurança */}
                                        {!hasPrivateKey ? (
                                            <div className="p-5 bg-red-600 rounded-xl text-white space-y-2 shadow-lg shadow-red-900/20">
                                                <h4 className="font-black flex items-center gap-2">
                                                    <ShieldAlert className="h-5 w-5" /> Chave Privada Ausente
                                                </h4>
                                                <p className="text-xs opacity-90 leading-relaxed">
                                                    Configure a Chave Privada RSA na aba 'Perfil' antes de gerar licenças para garantir a autenticidade do software.
                                                </p>
                                            </div>
                                        ) : (
                                            <Button
                                                onClick={handleGenerateKey}
                                                className="w-full h-14 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white font-black text-lg uppercase tracking-widest transition-all active:scale-[0.98]"
                                            >
                                                Gerar e Registar Chave
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Coluna Direita: Histórico (60%) */}
                            <div className="xl:col-span-7">
                                <Card className="h-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none transition-colors border-none">
                                    <CardHeader className="flex flex-row items-center justify-between pb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center">
                                                <BarChartIcon className="h-4 w-4 text-slate-500" />
                                            </div>
                                            <CardTitle className="text-lg font-black text-slate-800 dark:text-white">Histórico de Emissões</CardTitle>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                                <Input
                                                    placeholder="Pesquisar..."
                                                    className="pl-9 w-48 h-9 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="overflow-auto max-h-[700px]">
                                            <Table>
                                                <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30 sticky top-0 z-20">
                                                    <TableRow>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 pl-6">Cliente</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Tipo / Nível</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Valor</TableHead>
                                                        <TableHead className="text-right text-[10px] font-black uppercase text-slate-400 pr-6">Ações</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {generatedKeys.filter(k =>
                                                        k.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                        k.machineId.toLowerCase().includes(searchQuery.toLowerCase())
                                                    ).map((record) => (
                                                        <TableRow key={record.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-slate-100 dark:border-slate-800">
                                                            <TableCell className="py-4 pl-6">
                                                                <div className="font-bold text-slate-800 dark:text-white">{record.clientName || 'N/A'}</div>
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="text-[10px] text-slate-400 font-mono">{record.machineId}</div>
                                                                    {activations[record.key] && (
                                                                        <div className="flex items-center gap-1 text-[9px] text-emerald-500 font-bold uppercase mt-1">
                                                                            <ShieldCheck className="h-3 w-3" /> Ativada em: {activations[record.key].slice(0, 15)}...
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    <Badge variant="outline" className="text-[10px] border-slate-200 dark:border-slate-700 font-bold w-fit">
                                                                        {getLicenseTypeName(record.type)}
                                                                    </Badge>
                                                                    {record.status === 'migrated' && (
                                                                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[9px] w-fit">MIGRADA</Badge>
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 mt-1 capitalize">{record.tier}</div>
                                                            </TableCell>
                                                            <TableCell className="font-black text-slate-800 dark:text-slate-300">
                                                                {record.value.toLocaleString()} Kz
                                                            </TableCell>
                                                            <TableCell className="text-right pr-6">
                                                                <div className="flex justify-end gap-1">
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                        onClick={() => {
                                                                            setSelectedKeyForMigration(record);
                                                                            setIsMigrationModalOpen(true);
                                                                        }}
                                                                        disabled={record.status === 'migrated'}
                                                                    >
                                                                        <ArrowLeftRight className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" onClick={() => generateLicenseReceiptPDF(record, true)} className="h-8 w-8 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                                                        <Eye className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" onClick={() => generateLicenseReceiptPDF(record, false)} className="h-8 w-8 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/20">
                                                                        <Download className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" onClick={() => handleCopyKey(record.key)} className="h-8 w-8 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                                                        <Key className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleDeleteKey(record.id)}>
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {generatedKeys.length === 0 && (
                                                        <TableRow>
                                                            <TableCell colSpan={4} className="h-64 text-center">
                                                                <div className="flex flex-col items-center justify-center space-y-4">
                                                                    <div className="h-20 w-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center">
                                                                        <Search className="h-10 w-10 text-slate-200 dark:text-slate-700" />
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <p className="font-black text-slate-800 dark:text-white">Nenhum registo encontrado</p>
                                                                        <p className="text-xs text-slate-500">Tente ajustar os filtros de pesquisa.</p>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}



                    {/* --- RELATÓRIOS --- */}
                    {activeTab === 'volume' && <VolumeNegocioSaas />}
                    {activeTab === 'seguranca' && <SegurancaServidor />}

                    {activeTab === 'relatorios' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Relatórios do Sistema</h2>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1">Análise detalhada de atividades e finanças.</p>
                                </div>
                                <Button onClick={exportToPDF} className="bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white font-bold">
                                    <Download className="mr-2 h-4 w-4" /> Exportar PDF
                                </Button>
                            </div>

                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                <CardHeader>
                                    <CardTitle>Histórico Completo de Licenças</CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Search className="h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Pesquisar por cliente, NIF ou ID..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="max-w-sm h-8 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Data Emissão</TableHead>
                                                <TableHead>Cliente</TableHead>
                                                <TableHead>Tipo</TableHead>
                                                <TableHead>Máquina ID</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Ativação</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {generatedKeys
                                                .filter(k =>
                                                    k.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                    k.machineId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                    k.key.includes(searchQuery)
                                                )
                                                .map((record) => {
                                                    const isExpired = new Date(record.expirationDate) <= new Date();
                                                    return (
                                                        <TableRow key={record.id}>
                                                            <TableCell>{formatDateSafe(record.createdAt)}</TableCell>
                                                            <TableCell>
                                                                <div className="font-bold">{record.clientName || 'N/A'}</div>
                                                                <div className="text-xs text-slate-500">{record.clientNif || 'S/ NIF'}</div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={record.type === 'trial' ? 'secondary' : 'outline'}>
                                                                    {getLicenseTypeName(record.type)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs text-slate-500">{record.machineId}</TableCell>
                                                            <TableCell className="font-mono text-green-600 dark:text-green-400">
                                                                {record.value?.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    {activations[record.key] ? (
                                                                        <div className="flex flex-col">
                                                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 w-fit font-bold">ATV. ÚNICA</Badge>
                                                                            <span className="text-[9px] text-slate-500 font-mono mt-1">{activations[record.key].slice(0, 15)}...</span>
                                                                        </div>
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-slate-400 w-fit border-slate-200 text-[9px]">AGUARDANDO</Badge>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-1">
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                        onClick={() => {
                                                                            setSelectedKeyForMigration(record);
                                                                            setIsMigrationModalOpen(true);
                                                                        }}
                                                                        disabled={record.status === 'migrated'}
                                                                    >
                                                                        <ArrowLeftRight className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" onClick={() => generateLicenseReceiptPDF(record, true)} className="h-8 w-8 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                                                        <Eye className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" onClick={() => generateLicenseReceiptPDF(record, false)} className="h-8 w-8 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/20">
                                                                        <Download className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" onClick={() => handleCopyKey(record.key)} className="h-8 w-8 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                                                        <Key className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleDeleteKey(record.id)}>
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* --- PREÇOS --- */}
                    {activeTab === 'precos' && (
                        <div className="w-full space-y-6 text-left">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Tabela de Preços Global</h2>
                                <p className="text-slate-500 dark:text-slate-400">Defina os preços base para cada tipo de licença.</p>
                            </div>

                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors">
                                <CardContent className="space-y-4 pt-6">
                                    {Object.entries(prices).map(([key, value]) => (
                                        <div key={key} className="flex items-center gap-4">
                                            <Label className="w-40 capitalize text-slate-700 dark:text-slate-300">{getLicenseTypeName(key as LicenseType)}</Label>
                                            <div className="relative flex-1">
                                                <span className="absolute left-3 top-2.5 text-slate-500 font-mono">AOA</span>
                                                <Input
                                                    type="number"
                                                    value={value}
                                                    onChange={(e) => setPrices(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                                                    className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800 pl-12 text-slate-900 dark:text-white font-mono"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <div className="pt-4 flex justify-end">
                                        <Button onClick={handleSavePrices} className="bg-green-600 hover:bg-green-500 font-bold">
                                            <Save className="mr-2 h-4 w-4" /> Guardar Alterações
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* --- PERFIL & LOGOS --- */}
                    {activeTab === 'perfil' && (
                        <div className="w-full space-y-8 text-left">
                            {/* Editar Perfil */}
                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors">
                                <CardHeader>
                                    <div className="flex items-center gap-4">
                                        <div className="h-14 w-14 shrink-0 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center font-bold text-lg text-white">
                                            {profileInitials}
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl font-bold">Editar Perfil</CardTitle>
                                            <CardDescription>Os seus dados de proprietário do Tango Master.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleSaveProfile} className="grid gap-4 md:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="master-profile-name">Nome</Label>
                                            <Input
                                                id="master-profile-name"
                                                value={profileDraft.name}
                                                onChange={(e) => setProfileDraft(prev => ({ ...prev, name: e.target.value }))}
                                                maxLength={80}
                                                autoComplete="name"
                                                className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="master-profile-email">Email</Label>
                                            <Input
                                                id="master-profile-email"
                                                type="email"
                                                value={profileDraft.email}
                                                onChange={(e) => setProfileDraft(prev => ({ ...prev, email: e.target.value }))}
                                                maxLength={120}
                                                autoComplete="email"
                                                className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="master-profile-phone">Telefone</Label>
                                            <Input
                                                id="master-profile-phone"
                                                type="tel"
                                                value={profileDraft.phone}
                                                onChange={(e) => setProfileDraft(prev => ({ ...prev, phone: e.target.value }))}
                                                maxLength={30}
                                                autoComplete="tel"
                                                className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                                            />
                                        </div>
                                        <div className="md:col-span-3 flex justify-end">
                                            <Button type="submit" disabled={isSavingProfile} className="gap-2 font-bold">
                                                <Save className="h-4 w-4" /> {isSavingProfile ? 'A guardar…' : 'Guardar Perfil'}
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>

                            <div>
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Personalização da Marca</h2>
                                <p className="text-slate-500 dark:text-slate-400">Carregue os logótipos que serão usados nas faturas e no sistema.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                {/* Logo do Sistema */}
                                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors">
                                    <CardHeader>
                                        <CardTitle className="text-lg">Logo do Sistema (Login/Header)</CardTitle>
                                        <CardDescription>Recomendado: 500x500px PNG Transparente</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="h-40 bg-slate-50 dark:bg-slate-950 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-800 flex items-center justify-center overflow-hidden relative group">
                                            {branding.systemLogo ? (
                                                <img src={branding.systemLogo} className="h-full object-contain p-4" />
                                            ) : (
                                                <div className="text-center text-slate-600 dark:text-slate-400">
                                                    <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                    <span className="text-xs">Sem Imagem</span>
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Label htmlFor="upload-system" className="cursor-pointer bg-white text-black px-4 py-2 rounded-full font-bold text-xs hover:scale-105 transition-transform">
                                                    Alterar Imagem
                                                </Label>
                                            </div>
                                        </div>
                                        <Input
                                            id="upload-system"
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => e.target.files && handleLogoUpload('system', e.target.files[0])}
                                        />
                                    </CardContent>
                                </Card>

                                {/* Logo da Fatura */}
                                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors">
                                    <CardHeader>
                                        <CardTitle className="text-lg">Logo para Documentos (PDF)</CardTitle>
                                        <CardDescription>Recomendado: 300x150px PNG (Fundo Branco/Transparente)</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="h-40 bg-white dark:bg-white/5 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden relative group">
                                            {branding.invoiceLogo ? (
                                                <img src={branding.invoiceLogo} className="h-full object-contain p-4" />
                                            ) : (
                                                <div className="text-center text-slate-400">
                                                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                    <span className="text-xs">Sem Imagem</span>
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Label htmlFor="upload-invoice" className="cursor-pointer bg-slate-900 text-white px-4 py-2 rounded-full font-bold text-xs hover:scale-105 transition-transform shadow-xl">
                                                    Alterar Imagem
                                                </Label>
                                            </div>
                                        </div>
                                        <Input
                                            id="upload-invoice"
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => e.target.files && handleLogoUpload('invoice', e.target.files[0])}
                                        />
                                    </CardContent>
                                </Card>
                            </div>

                            <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/50 transition-colors">
                                <CardContent className="p-4 flex items-start gap-3">
                                    <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-amber-700 dark:text-amber-500">Nota Importante</h4>
                                        <p className="text-sm text-amber-600 dark:text-amber-200/70">
                                            Estas imagens são guardadas localmente no seu Gerador. Elas não são enviadas automaticamente para os clientes.
                                            Quando gera um novo executável para um cliente, certifique-se que inclui estes ficheiros na pasta de *assets* se desejar que sejam padrão.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Mudança de Senha */}
                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors">
                                <CardHeader className="text-center">
                                    <div className="mx-auto bg-slate-100 dark:bg-slate-800 p-4 rounded-full w-fit mb-4">
                                        <Lock className="h-8 w-8 text-slate-700 dark:text-slate-300" />
                                    </div>
                                    <CardTitle className="text-xl font-bold">Segurança do Master</CardTitle>
                                    <CardDescription>Altere a senha de acesso ao painel mestre.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Palavra-passe atual</Label>
                                            <Input
                                                type="password"
                                                autoComplete="current-password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Nova Senha Mestra</Label>
                                            <Input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                autoComplete="new-password"
                                                placeholder="Mínimo 12 caracteres"
                                                className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Confirmar Nova Senha</Label>
                                            <Input
                                                type="password"
                                                autoComplete="new-password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="Repita a senha"
                                                className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                                            />
                                        </div>
                                        <Button type="submit" className="w-full gap-2 font-bold h-12 mt-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200">
                                            <CheckCircle className="h-4 w-4" /> Atualizar Acesso
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>

                            {/* Configuração RSA */}
                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                                <Key className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">Configuração de Assinatura (RSA)</CardTitle>
                                                <CardDescription>Gerencie as chaves mestras de assinatura digital.</CardDescription>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 font-bold text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/10 dark:text-blue-400 dark:border-blue-900/30"
                                            onClick={handleGenerateNewKeys}
                                        >
                                            Gerar Novo Par
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/30 dark:bg-blue-900/10">
                                        <ShieldAlert className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        <p className="text-xs leading-relaxed text-blue-800 dark:text-blue-300">
                                            A chave privada é criada exclusivamente no processo principal e permanece cifrada no cofre do sistema operativo. O renderer recebe apenas a chave pública. Estado: <strong>{hasPrivateKey ? 'configurada' : 'não configurada'}</strong>.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* PORTABILIDADE & BACKUP */}
                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors overflow-hidden border-blue-100 dark:border-blue-900/30">
                                <div className="h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                                <ArrowLeftRight className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">Portabilidade & Cópia de Segurança</CardTitle>
                                                <CardDescription>Mova o seu Gerador para outro computador sem perder nada.</CardDescription>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-xl">
                                        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                                            Esta ferramenta permite exportar toda a "Identidade" do gerador (incluindo as <strong>Chaves RSA</strong> de assinatura, preços e histórico de licenças). Útil para formatar o PC ou trocar de hardware.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <Button
                                            onClick={handleExportBackup}
                                            className="h-20 flex-col gap-2 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 border"
                                            variant="ghost"
                                        >
                                            <Download className="h-6 w-6 text-blue-600" />
                                            <div className="text-center">
                                                <div className="text-xs font-black uppercase tracking-tighter">Exportar Config.</div>
                                                <div className="text-[9px] opacity-60">Baixar ficheiro .json</div>
                                            </div>
                                        </Button>

                                        <div className="relative">
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept=".json"
                                                onChange={handleImportBackup}
                                            />
                                            <Button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full h-20 flex-col gap-2 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 border"
                                                variant="ghost"
                                            >
                                                <Upload className="h-6 w-6 text-indigo-600" />
                                                <div className="text-center">
                                                    <div className="text-xs font-black uppercase tracking-tighter">Importar Config.</div>
                                                    <div className="text-[9px] opacity-60">Restaurar de ficheiro</div>
                                                </div>
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}


                    {/* --- CONTABILIDADE --- */}
                    {activeTab === 'contabilidade' && (
                        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 dark:text-white">Fluxo de Caixa & Contabilidade</h2>
                                    <p className="text-slate-500">Gestão financeira completa de todas as licenças emitidas.</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-6 py-2 shadow-sm">
                                        <p className="text-[10px] text-slate-500 uppercase font-black">Saldo Total</p>
                                        <p className="text-xl font-bold text-green-600">
                                            {totalRevenue.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}
                                        </p>
                                    </div>
                                    <Button onClick={exportToPDF} className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold h-12 px-6">
                                        <Download className="mr-2 h-4 w-4" /> Exportar Balanço
                                    </Button>
                                </div>
                            </div>

                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-colors">
                                <CardHeader>
                                    <CardTitle className="text-lg">Transações Financeiras (Histórico Perpétuo)</CardTitle>
                                    <CardDescription>Estes registos permanecem mesmo que a licença seja eliminada do sistema.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-col gap-4">
                                        <div className="flex justify-between items-center">
                                            <div className="relative w-72">
                                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                                <Input
                                                    placeholder="Pesquisar por cliente ou NIF..."
                                                    value={financeSearch}
                                                    onChange={(e) => setFinanceSearch(e.target.value)}
                                                    className="pl-8 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                                                />
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                A mostrar {Math.min(financialRecords.length, rowsPerPage)} de {financialRecords.length} registos
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                            <Table>
                                                <TableHeader className="bg-slate-50 dark:bg-slate-950">
                                                    <TableRow>
                                                        <TableHead className="font-bold">Data/Hora</TableHead>
                                                        <TableHead className="font-bold">Cliente</TableHead>
                                                        <TableHead className="font-bold">Plano</TableHead>
                                                        <TableHead className="font-bold text-right">Valor</TableHead>
                                                        <TableHead className="font-bold text-center">Referência</TableHead>
                                                        <TableHead className="w-[50px]"></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {financialRecords
                                                        .filter(r =>
                                                            r.clientName.toLowerCase().includes(financeSearch.toLowerCase()) ||
                                                            r.clientNif.includes(financeSearch)
                                                        )
                                                        .slice((financePage - 1) * rowsPerPage, financePage * rowsPerPage)
                                                        .length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={6} className="h-32 text-center text-slate-500 italic">
                                                                {financialRecords.length === 0 ? "Nenhum movimento financeiro registado." : "Nenhum resultado encontrado."}
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        financialRecords
                                                            .filter(r =>
                                                                r.clientName.toLowerCase().includes(financeSearch.toLowerCase()) ||
                                                                r.clientNif.includes(financeSearch)
                                                            )
                                                            .slice((financePage - 1) * rowsPerPage, financePage * rowsPerPage)
                                                            .map((record) => (
                                                                <TableRow key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                                    <TableCell className="text-xs text-slate-500">
                                                                        {format(new Date(record.date), "dd/MM/yyyy HH:mm")}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <div className="font-bold text-slate-900 dark:text-slate-100">{record.clientName}</div>
                                                                        <div className="text-[10px] text-slate-500 font-mono">{record.clientNif}</div>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tight">
                                                                            {record.plan}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-black text-green-600 dark:text-green-400">
                                                                        {record.value.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}
                                                                    </TableCell>
                                                                    <TableCell className="text-center">
                                                                        <span className="text-[9px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                                                                            ID: {record.licenseId.substring(0, 8)}...
                                                                        </span>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                            onClick={() => handleDeleteFinancialRecord(record.id)}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        {/* Pagination Controls */}
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setFinancePage(p => Math.max(1, p - 1))}
                                                disabled={financePage === 1}
                                                className="h-8 w-8 p-0"
                                            >
                                                <ChevronDown className="h-4 w-4 rotate-90" />
                                            </Button>
                                            <span className="text-xs font-bold text-slate-500">
                                                Página {financePage}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setFinancePage(p => p + 1)}
                                                disabled={financePage * rowsPerPage >= financialRecords.filter(r =>
                                                    r.clientName.toLowerCase().includes(financeSearch.toLowerCase()) ||
                                                    r.clientNif.includes(financeSearch)
                                                ).length}
                                                className="h-8 w-8 p-0"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )
                    }

                    {/* --- GUIA DE AJUDA --- */}
                    {
                        activeTab === 'guia' && (
                            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                                            <HelpCircle className="h-10 w-10 text-blue-600" /> Centro de Suporte RSA
                                        </h2>
                                        <p className="text-slate-500 text-lg mt-2">Sincronização entre Gerador (Master) e Software do Cliente.</p>
                                    </div>
                                    <Button onClick={exportHelpToPDF} className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 px-8 shadow-xl shadow-blue-500/20">
                                        <Download className="mr-2 h-5 w-5" /> Baixar Manual Técnico PDF
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Parte 1: O Que fica aqui */}
                                    <Card className="border-2 border-blue-100 dark:border-blue-900/30 overflow-hidden shadow-2xl">
                                        <div className="bg-blue-600 h-2" />
                                        <CardHeader className="bg-blue-50/50 dark:bg-blue-950/20 pb-8">
                                            <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-2xl flex items-center justify-center mb-4">
                                                <Settings className="h-6 w-6 text-blue-600" />
                                            </div>
                                            <CardTitle className="text-2xl font-black text-blue-900 dark:text-blue-100">1. No Painel Master (Aqui)</CardTitle>
                                            <CardDescription className="text-blue-700 dark:text-blue-400 font-medium">Onde a "mágica" da assinatura acontece.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="p-8 space-y-6">
                                            <div className="flex gap-4 items-start">
                                                <div className="h-8 w-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">01</div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Gerar/Configurar Chave Privada</h4>
                                                    <p className="text-sm text-slate-500 mt-1">Vá a <strong>Perfil</strong> e use o botão "Gerar Novo Par" ou cole a sua <strong>Chave Privada PEM</strong>.</p>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center font-mono text-[11px] text-slate-400">
                                                -----BEGIN PRIVATE KEY-----<br />
                                                [COLE ESTO NO PAINEL DE PERFIL]<br />
                                                -----END PRIVATE KEY-----
                                            </div>
                                            <div className="flex gap-4 items-start">
                                                <div className="h-8 w-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">02</div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Manter em Segredo</h4>
                                                    <p className="text-sm text-slate-500 mt-1">Nunca partilhe a chave privada. Ela é a "assinatura oficial" do seu software.</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Parte 2: O Que colar no Código */}
                                    <Card className="border-2 border-emerald-100 dark:border-emerald-900/30 overflow-hidden shadow-2xl">
                                        <div className="bg-emerald-600 h-2" />
                                        <CardHeader className="bg-emerald-50/50 dark:bg-emerald-950/20 pb-8">
                                            <div className="h-12 w-12 bg-emerald-100 dark:bg-emerald-900 rounded-2xl flex items-center justify-center mb-4">
                                                <BookOpen className="h-6 w-6 text-emerald-600" />
                                            </div>
                                            <CardTitle className="text-2xl font-black text-emerald-900 dark:text-emerald-100">2. No Código (Tango ERP)</CardTitle>
                                            <CardDescription className="text-emerald-700 dark:text-emerald-400 font-medium">Onde a validação acontece no cliente.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="p-8 space-y-6">
                                            <div className="flex gap-4 items-start">
                                                <div className="h-8 w-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">01</div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Localize o Ficheiro</h4>
                                                    <p className="text-sm text-slate-500 mt-1">No projeto do cliente, abra o ficheiro:</p>
                                                    <code className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded mt-2 block text-xs underline">src/bibliotecas/licenciamento.ts</code>
                                                </div>
                                            </div>
                                            <div className="flex gap-4 items-start">
                                                <div className="h-8 w-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">02</div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Substitua a Chave Pública</h4>
                                                    <p className="text-sm text-slate-500 mt-1">Cole a <strong>Chave Pública</strong> gerada aqui na constante MASTER_PUBLIC_KEY.</p>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-emerald-950 text-white rounded-xl border border-emerald-800 text-[10px] space-y-1">
                                                <div className="text-emerald-400">// Em src/bibliotecas/licenciamento.ts</div>
                                                <div className="font-bold whitespace-nowrap overflow-hidden text-ellipsis">const MASTER_PUBLIC_KEY = "MIIBIjANBgkqhkiG...[TUDO_ISTO]";</div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Alerta de Segurança */}
                                <Card className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-900/50">
                                    <CardContent className="p-6 flex items-start gap-4">
                                        <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center flex-shrink-0">
                                            <ShieldAlert className="h-6 w-6 text-amber-600" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-black text-amber-900 dark:text-amber-500">Porquê desta complexidade?</h4>
                                            <p className="text-amber-700 dark:text-amber-400 mt-1">
                                                Este sistema de "chave dupla" (RSA) garante que apenas o <strong>seu</strong> painel master pode emitir licenças que funcionam no software.
                                                Se alguém tentar alterar a data de uma licença manualmente num cliente, a assinatura digital deixará de corresponder e o software bloqueará instantaneamente.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )
                    }

                    {/* --- ABA DE SUPORTE --- */}
                    {
                        activeTab === 'suporte' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Suporte Técnico</h2>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1">Ferramentas de auxílio ao cliente e recuperação de sistemas.</p>
                                </div>

                                <div className="grid gap-6">
                                    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden opacity-60">
                                        <div className="h-2 bg-slate-400" />
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <FileText className="h-5 w-5 text-slate-400" />
                                                Base de Conhecimento
                                            </CardTitle>
                                            <CardDescription>
                                                Documentação rápida para resolução de problemas comuns.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-4">
                                                <div className="p-3 border rounded-lg border-dashed border-slate-200 dark:border-slate-800">
                                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Como trocar o hardware?</h4>
                                                    <p className="text-xs text-slate-500 mt-1">Utilize a aba de "Migração" para transferir os dias restantes para um novo Hardware ID.</p>
                                                </div>
                                                <div className="p-3 border rounded-lg border-dashed border-slate-200 dark:border-slate-800">
                                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Licença Expirada precocemente</h4>
                                                    <p className="text-xs text-slate-500 mt-1">Verifique se o fuso horário ou a data do sistema do cliente estão corretos.</p>
                                                </div>
                                                <Button variant="outline" className="w-full text-xs font-bold border-slate-200 dark:border-slate-800" onClick={() => setActiveTab('guia')}>
                                                    Ver Todos os Manuais
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        )
                    }
                </div >
            </main >

            {/* KEY GENERATOR MODAL */}
            < Dialog open={showKeyGenerator} onOpenChange={setShowKeyGenerator} >
                <DialogContent className="max-w-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 transition-colors">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-500" /> Gerador de Chaves RSA Seguras
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 dark:text-slate-400">
                            Copie estas chaves para configurar a assinatura digital das suas licenças.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] uppercase font-black text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <Shield className="h-3 w-3" /> Chave Pública (Código Fonte)
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[9px] font-bold px-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                    onClick={() => {
                                        if (!tempKeys) return;
                                        navigator.clipboard.writeText(`export const MASTER_PUBLIC_KEY = \`${tempKeys.publicKey}\`;`);
                                        showModalNotification("Código Copiado", "O código completo da constante (com acentos graves) foi copiado.");
                                    }}
                                >
                                    <Copy className="h-3 w-3 mr-1" /> Copiar Código TS
                                </Button>
                            </div>

                            <div className="relative group">
                                <div className="absolute inset-0 bg-green-500/5 rounded-xl blur-sm group-hover:bg-green-500/10 transition-colors"></div>
                                <div className="relative p-4 bg-slate-950 rounded-xl border border-green-900/30 font-mono text-[10px] space-y-2">
                                    <div className="flex items-center justify-between text-slate-500 border-b border-slate-800 pb-2 mb-2">
                                        <span>licenciamento.ts</span>
                                        <span className="text-green-500 font-bold uppercase tracking-tighter text-[9px]">TypeScript</span>
                                    </div>
                                    <div className="text-slate-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                                        <span className="text-blue-400">export const</span> <span className="text-amber-400">MASTER_PUBLIC_KEY</span> = <span className="text-green-400">`{tempKeys?.publicKey || '...'}`</span>;
                                    </div>
                                </div>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-xl border border-amber-200 dark:border-amber-900/30 flex items-start gap-3">
                                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-400">PASSO OBRIGATÓRIO (SINCRONIZAÇÃO)</p>
                                    <p className="text-[9px] text-amber-700/80 dark:text-amber-400/80 leading-tight">
                                        Esta chave é a sua "impressão digital". Se gerar novas chaves, deve copiar o código acima e substituir no ficheiro <code className="bg-amber-100 dark:bg-amber-950 px-1 rounded">src/bibliotecas/licenciamento.ts</code>. Caso contrário, as novas licenças serão dadas como <strong>INVÁLIDAS</strong> pelo sistema.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button className="w-full font-bold h-11 bg-blue-600 hover:bg-blue-500 text-white" onClick={() => {
                            if (tempKeys) {
                                localStorage.setItem('tango_master_public_key', tempKeys.publicKey);
                                setShowKeyGenerator(false);
                                toast({
                                    title: "Configuração Aplicada",
                                    description: "A chave privada ficou protegida no cofre do sistema operativo."
                                });
                            }
                        }}>
                            Concluir configuração
                        </Button>
                    </div>
                </DialogContent>
            </Dialog >
            {/* MIGRATION MODAL */}
            < Dialog open={isMigrationModalOpen} onOpenChange={setIsMigrationModalOpen} >
                <DialogContent className="max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowLeftRight className="h-5 w-5 text-blue-600" /> Migrar Licença
                        </DialogTitle>
                        <DialogDescription>
                            Transfira os dias restantes para uma nova máquina. A licença atual será invalidada.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedKeyForMigration && (
                        <div className="space-y-4 py-4">
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 text-[10px] uppercase font-bold">Cliente</span>
                                    <span className="font-bold">{selectedKeyForMigration.clientName}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 text-[10px] uppercase font-bold">Máquina Antiga</span>
                                    <span className="font-mono text-blue-600">{selectedKeyForMigration.machineId}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 text-[10px] uppercase font-bold">Válido Até</span>
                                    <span className="font-bold text-green-600">{formatDateSafe(selectedKeyForMigration.expirationDate)}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Novo ID da Máquina (MID)</Label>
                                <Input
                                    placeholder="TANGO-NOVO-ID"
                                    value={newMachineIdForMigration}
                                    onChange={(e) => setNewMachineIdForMigration(e.target.value)}
                                    className="h-11 bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 font-mono"
                                />
                                <p className="text-[10px] text-red-500 italic">* A licença antiga será marcada como 'MIGRADA' e não contará mais como ativa.</p>
                            </div>

                            <Button onClick={handleMigrateKey} className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-bold" disabled={!newMachineIdForMigration}>
                                Confirmar e Gerar Nova Chave
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog >

            {/* NOTIFICATION MODAL (PREMIUM) */}
            < Dialog open={notification.open} onOpenChange={(o) => setNotification(p => ({ ...p, open: o }))
            }>
                <DialogContent className="max-w-[400px] p-0 overflow-hidden border-none bg-transparent shadow-none">
                    <div className={`
                        p-8 rounded-3xl text-center space-y-4 animate-in zoom-in-95 duration-300
                        ${notification.type === 'success' ? 'bg-emerald-600 text-white' : ''}
                        ${notification.type === 'error' ? 'bg-red-600 text-white' : ''}
                        ${notification.type === 'info' ? 'bg-blue-600 text-white' : ''}
                    `}>
                        <div className="flex justify-center">
                            <div className="p-4 bg-white/20 rounded-full animate-bounce">
                                {notification.type === 'success' && <CheckCircle className="h-12 w-12" />}
                                {notification.type === 'error' && <XCircle className="h-12 w-12" />}
                                {notification.type === 'info' && <Info className="h-12 w-12" />}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black uppercase tracking-tight">{notification.title}</h3>
                            <p className="text-white/80 font-medium leading-relaxed">{notification.message}</p>
                        </div>
                        <Button
                            onClick={() => setNotification(p => ({ ...p, open: false }))}
                            className="w-full h-12 bg-white text-slate-900 hover:bg-white/90 font-bold rounded-xl border-none"
                        >
                            FECHAR
                        </Button>
                    </div>
                </DialogContent>
            </Dialog >

            {/* CONFIRMATION MODAL (PREMIUM) */}
            < Dialog open={confirmModal.open} onOpenChange={(o) => setConfirmModal(p => ({ ...p, open: o }))}>
                <DialogContent className="max-w-[420px] p-0 overflow-hidden border-none bg-slate-900 shadow-2xl">
                    <div className="p-8 text-center space-y-6">
                        <div className="flex justify-center">
                            <div className="p-4 bg-amber-500/20 rounded-full">
                                <ShieldAlert className="h-12 w-12 text-amber-500" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">{confirmModal.title}</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">{confirmModal.message}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setConfirmModal(p => ({ ...p, open: false }))}
                                className="h-12 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 font-bold rounded-xl"
                            >
                                CANCELAR
                            </Button>
                            <Button
                                onClick={confirmModal.onConfirm}
                                className="h-12 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl border-none shadow-lg shadow-red-900/20"
                            >
                                CONFIRMAR
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog >

            {/* PDF PREVIEW MODAL */}
            < Dialog open={!!pdfPreviewUrl} onOpenChange={(open) => !open && setPdfPreviewUrl(null)
            }>
                <DialogContent className="max-w-5xl h-[90vh] p-0 bg-slate-900 border-none shadow-2xl">
                    <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <Eye className="h-5 w-5 text-blue-500" /> Pré-visualização do Documento
                            </h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPdfPreviewUrl(null)}
                                className="text-slate-400 hover:text-white"
                            >
                                Fechar
                            </Button>
                        </div>
                        <div className="flex-1 bg-slate-800 relative">
                            {pdfPreviewUrl && (
                                <iframe
                                    src={pdfPreviewUrl}
                                    className="w-full h-full border-none"
                                    title="PDF Preview"
                                />
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog >

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                  width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: #0f172a; 
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: #334155; 
                  border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: #475569; 
                }
                .animate-pulse-slow {
                    animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}</style>
        </div >
    );
}
