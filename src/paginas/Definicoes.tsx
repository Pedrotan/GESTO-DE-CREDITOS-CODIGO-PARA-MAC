import React, { useState, useRef, useEffect } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useSearchParams } from 'react-router-dom';
import { formatDateSafe } from '@/bibliotecas/utils';
import { formatAngolanPhone } from '@/bibliotecas/formatters';
import { resolveBrandPrimary, resolveBrandDark, BRAND_ORANGE, BRAND_CHARCOAL } from '@/bibliotecas/pdf';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Textarea } from '@/componentes/ui/textarea';
import { Tabs, TabsContent } from "@/componentes/ui/tabs";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from '@/componentes/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/componentes/ui/dialog';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '../componentes/ui/alert-dialog';
import { useToast } from '@/componentes/ui/use-toast';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { isCloudSyncUrl } from '@/servicos/ServicoSincronizacaoCloud';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import { LicenseRenewalModal } from '@/componentes/dashboard/LicenseRenewalModal';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import { cn, getFileUrl } from '@/bibliotecas/utils';
import {
    Download,
    Upload,
    Mail,
    MessageSquare,
    Save,
    Image as ImageIcon,
    Building2,
    Palette,
    ShieldCheck,
    Lock,
    Eye,
    Key,
    Calendar,
    Clock,
    EyeOff,
    FileText,
    Cloud,
    RefreshCw,
    ShieldAlert,
    CheckCircle2,
    Wifi,
    WifiOff,
    Users,
    CreditCard,
    DollarSign,
    FileCheck,
    BarChart,
    CheckSquare,
    Settings as SettingsIcon,
    Wallet,
    Activity,
    Globe,
    PenTool,
    Shield,
    ShieldPlus,
    AlertCircle,
    Database,
    Layout,
    Trash2,
    Landmark,
    Plus,
    Trash,
    Laptop,
    Gavel,
    Rocket,
    Monitor,
    Stamp,
    HelpCircle,
    Handshake
} from 'lucide-react';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { Badge } from '@/componentes/ui/badge';
import { Checkbox } from '@/componentes/ui/checkbox';
import { sqlite } from '@/bibliotecas/adaptador-sqlite';
import { formatAngolanIBAN, identifyBankFromIBAN, validateAngolanIBAN, ANGOLAN_BANKS } from '@/bibliotecas/ibanHelper';
import { v4 as uuidv4 } from 'uuid';
import { appAdapter } from '@/bibliotecas/adaptador-aplicacao';
import { validateLicense, getLicenseTypeName, getMachineId } from '@/bibliotecas/licenciamento';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ServicoAutoBackup, AutoBackupConfig, AutoBackupLog } from '@/servicos/ServicoAutoBackup';
import { ConflictReview } from '@/componentes/sync/ConflictReview';

const SUPPORT_PHONE = "+244 941537486";
const SYSTEM_NAME = "Tango Gestão de Créditos";
// Funções auxiliares movidas para o escopo global do módulo para hoisting correto
const hexToRgb = (hex: string): number[] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
};




const rgbToHex = (rgb: number[]): string => {
    return "#" + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
};



export default function Settings() {
    const [searchParams] = useSearchParams();
    const { user, users, refreshSettings, syncUsersFromMaster } = useAuth();
    const { toast: toastNotify } = useToast();
    const {
        clients, credits, payments, companySettings, updateCompanySettings,
        syncData, messageTemplates, updateMessageTemplate, addMessageTemplate,
        deleteMessageTemplate, serverInfo, toggleServerMode, connectedClients, refreshData
    } = useData();

    const [license, setLicense] = useState<any>({ tier: 'singular', isValid: false, type: 'trial' });
    const [previewLicense, setPreviewLicense] = useState<any>({ tier: 'singular', isValid: false, type: 'trial' });
    const [isSingular, setIsSingular] = useState(true);
    const [machineId, setMachineId] = useState('Carregando...');

    const [logoPreview, setLogoPreview] = useState<string | null>(companySettings?.logo || null);
    const [reportLogoPreview, setReportLogoPreview] = useState<string | null>(companySettings?.reportLogo || null);
    const [watermarkLogoPreview, setWatermarkLogoPreview] = useState<string | null>(companySettings?.watermarkLogo || null);
    
    const logoInputRef = useRef<HTMLInputElement>(null);
    const reportLogoInputRef = useRef<HTMLInputElement>(null);
    const watermarkLogoInputRef = useRef<HTMLInputElement>(null);

    const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.85): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (!result) {
                    resolve("");
                    return;
                }
                if (file.type === 'image/svg+xml') {
                    resolve(result);
                    return;
                }
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    if (width <= maxWidth && height <= maxHeight && file.size < 150 * 1024) {
                        resolve(result);
                        return;
                    }
                    if (width > maxWidth || height > maxHeight) {
                        if (width / maxWidth > height / maxHeight) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, width);
                    canvas.height = Math.max(1, height);
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(result);
                        return;
                    }
                    ctx.drawImage(img, 0, 0, width, height);
                    const isPng = file.type === 'image/png';
                    const outputType = isPng ? 'image/png' : 'image/jpeg';
                    resolve(canvas.toDataURL(outputType, isPng ? undefined : quality));
                };
                img.onerror = () => resolve(result);
                img.src = result;
            };
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
        });
    };

    const handleWebFileChange = (type: 'logo' | 'report' | 'watermark') => async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const base64Data = await compressImage(file, 800, 800, 0.85);
            if (!base64Data) return;

            // Save file to disk for backup (Electron), but always use base64 for state/DB
            if ((window as any).electronAPI?.saveLogo) {
                await (window as any).electronAPI.saveLogo(type, base64Data);
            }
            // Always store the base64 data URI directly
            if (type === 'logo') setLogoPreview(base64Data);
            else if (type === 'report') setReportLogoPreview(base64Data);
            else setWatermarkLogoPreview(base64Data);
            toastNotify({ title: "Sucesso", description: "Imagem carregada e otimizada com sucesso." });
        } catch (err) {
            console.error("Erro ao processar imagem:", err);
            toastNotify({ title: "Erro", description: "Falha ao processar imagem", variant: "destructive" });
        } finally {
            e.target.value = '';
        }
    };

    const formatImageURL = (pathOrData: string | null) => {
        if (!pathOrData) return "";
        if (
            pathOrData.startsWith('data:') ||
            pathOrData.startsWith('blob:') ||
            pathOrData.startsWith('http://') ||
            pathOrData.startsWith('https://')
        ) {
            return pathOrData;
        }

        const isElectronEnv = typeof window !== 'undefined' && !!(window as any).electronAPI;
        if (!isElectronEnv) {
            return pathOrData.startsWith('/') ? pathOrData : `/${pathOrData}`;
        }

        // File path no Electron — converter para safe-file:// URL com cache busting
        const url = getFileUrl(pathOrData);
        const [base, query] = url.split('?');
        const timestamp = `t=${Date.now()}`;

        return query ? `${base}?${query}&${timestamp}` : `${base}?${timestamp}`;
    };

    // Estado local para inputs do formulário para evitar re-renders excessivos
    const [formData, setFormData] = useState({
        name: companySettings?.name || '',
        nif: companySettings?.nif || '',
        address: companySettings?.address || '',
        location: companySettings?.location || '',
        website: companySettings?.website || '',
        segment: companySettings?.segment || '',
        slogan: companySettings?.slogan || '',
        currency: companySettings?.currency || 'AOA',
        rescueKey: companySettings?.rescueKey || 'TANGO-RECOVERY-2026',
        phone: companySettings?.phone || '',
        primaryColor: rgbToHex(resolveBrandPrimary(companySettings?.primaryColor)),
        secondaryColor: rgbToHex(resolveBrandDark(companySettings?.secondaryColor)),
        sessionTimeout: companySettings?.sessionTimeout || 5,
        email: companySettings?.email || '',
        whatsapp: companySettings?.whatsapp || '',
        whatsappAutoNotify: companySettings?.whatsappAutoNotify || false,
        whatsappVerified: companySettings?.whatsappVerified || false,
        enableGatewaysModule: !!companySettings?.enableGatewaysModule,
        enableGatewaysModuleAdminOnly: companySettings?.enableGatewaysModuleAdminOnly || false,
        syncEnabled: companySettings?.syncEnabled || false,
        syncUrl: companySettings?.syncUrl || '',
        syncApiKey: companySettings?.syncApiKey || '',
        maintenanceMode: Boolean(companySettings?.maintenanceMode) || false,
        allowedModulesDuringMaintenance: (() => {
            try {
                const val = companySettings?.allowedModulesDuringMaintenance;
                if (!val) return [];
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) { return []; }
        })(),
        nifType: companySettings?.nif && (companySettings.nif.length > 10 || /[A-Z]/.test(companySettings.nif)) ? 'SINGULAR' : 'COLECTIVO',
        digitalSignatureEnabled: companySettings?.digitalSignatureEnabled || false,
        authorizedSigners: (() => {
            try {
                const val = companySettings?.authorizedSigners;
                if (!val) return [];
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) { return []; }
        })(),
        financialLock: companySettings?.financialLock || false,
        enableWarrantiesModule: !!companySettings?.enableWarrantiesModule,
        enableWarrantiesModuleAdminOnly: companySettings?.enableWarrantiesModuleAdminOnly || false,
        enableLegalModule: !!companySettings?.enableLegalModule,
        enableLegalModuleAdminOnly: companySettings?.enableLegalModuleAdminOnly || false,
        enableScoringModule: !!companySettings?.enableScoringModule,
        enableScoringModuleAdminOnly: companySettings?.enableScoringModuleAdminOnly || false,
        enableSuppliersModule: !!companySettings?.enableSuppliersModule,
        enableSuppliersModuleAdminOnly: companySettings?.enableSuppliersModuleAdminOnly || false,
        enableMultiTenant: companySettings?.enableMultiTenant !== false,
        licenseKey: companySettings?.licenseKey || '',

        // SMTP
        smtpHost: companySettings?.smtpHost || 'smtp.gmail.com',
        smtpPort: companySettings?.smtpPort || '587',
        smtpUser: companySettings?.smtpUser || companySettings?.email || '',
        smtpPassword: companySettings?.smtpPassword || '',
        smtpSecure: companySettings?.smtpSecure || false,
        smtpFromName: companySettings?.smtpFromName || companySettings?.name || 'Tango ERP',

        syncPasskey: companySettings?.syncPasskey || '',
        bankingInfo: (() => {
            try {
                const val = companySettings?.bankingInfo;
                if (!val) return [];
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) { return []; }
        })(),
        contractTemplates: (() => {
            try {
                const val = companySettings?.contractTemplates;
                if (!val) return [];
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) { return []; }
        })(),
        enableProfileActivity: !!companySettings?.enableProfileActivity,
        enableProfileActivityAdminOnly: companySettings?.enableProfileActivityAdminOnly || false,
        defaultSimulationInterestRate: companySettings?.defaultSimulationInterestRate || 3.5,
        defaultSimulationAdminFee: companySettings?.defaultSimulationAdminFee || 2.0,
        defaultSimulationIof: companySettings?.defaultSimulationIof || 0.38,
    });

    const [smtpTesting, setSmtpTesting] = useState(false);




    useEffect(() => {
        const checkLicense = async () => {
            const result = await validateLicense(companySettings?.licenseKey || '');
            setLicense(result);
            setIsSingular(result.tier === 'singular');
            const mid = await getMachineId();
            setMachineId(mid);
        };
        checkLicense();
    }, [companySettings?.licenseKey]);

    useEffect(() => {
        const checkFormLicense = async () => {
            // Verifica se formData existe antes de acessar
            if (formData?.licenseKey) {
                const result = await validateLicense(formData.licenseKey);
                setPreviewLicense(result);
            }
        };
        const timer = setTimeout(checkFormLicense, 500);
        return () => clearTimeout(timer);
    }, [formData?.licenseKey]);

    const isSuperAdmin = user?.role === 'super_admin';
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const isOnboardingCompleted = !!(companySettings && companySettings.name && companySettings.name !== 'A Carregar...' && companySettings.name !== '' && companySettings.nif !== '');

    // Estado da Modal de Alerta
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: AlertModalType;
        onConfirm?: () => void;
        actionLabel?: string;
        showCancel?: boolean;
        variant?: 'default' | 'destructive';
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success',
        showCancel: false,
        variant: 'default'
    });





    const [showRescueKey, setShowRescueKey] = useState(false);
    const [showFullLicenseKey, setShowFullLicenseKey] = useState(false);
    const [isLicenseRenewalOpen, setIsLicenseRenewalOpen] = useState(false);


    const [newTemplate, setNewTemplate] = useState({ name: '', type: 'custom', content: '' });
    const [isAddingTemplate, setIsAddingTemplate] = useState(false);

    const [isTestingUrl, setIsTestingUrl] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [lastOnlineStatus, setLastOnlineStatus] = useState(navigator.onLine);
    const [activeTab, setActiveTab] = useState('general');
    const [isModulesModalOpen, setIsModulesModalOpen] = useState(false);

    // Estados para Contas Bancárias e Modelos de Contrato
    const [newBank, setNewBank] = useState({ bankName: '', nib: '', iban: '', swift: '', holder: '' });
    const [newContract, setNewContract] = useState({ name: '', type: 'custom', content: '' });

    const handleToggleModule = (key: string, label: string, checked: boolean) => {
        const moduleKey = key as keyof typeof formData;
        if (checked) {
            // Ativação
            setAlertConfig({
                isOpen: true,
                title: `Ativar ${label}?`,
                description: `O módulo "${label}" será ativado e ficará visível na barra lateral para todos os utilizadores autorizados.`,
                type: "success",
                showCancel: true,
                onConfirm: async () => {
                    setFormData(prev => ({ ...prev, [moduleKey]: true }));
                    await updateCompanySettings({ [moduleKey]: true }, user ? { id: user.id, name: user.name } : undefined);
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                    toastNotify({ title: "Módulo Ativado", description: `O recurso "${label}" está agora disponível.` });
                }
            });
        } else {
            // Desativação
            setAlertConfig({
                isOpen: true,
                title: `Desativar ${label}?`,
                description: `O módulo "${label}" será desativado e OCULTADO da barra lateral. Esta ação não elimina dados, apenas remove o acesso visual.`,
                type: "warning",
                showCancel: true,
                variant: 'destructive',
                onConfirm: async () => {
                    setFormData(prev => ({ ...prev, [moduleKey]: false }));
                    await updateCompanySettings({ [moduleKey]: false }, user ? { id: user.id, name: user.name } : undefined);
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                    toastNotify({ title: "Módulo Desativado", description: `O recurso "${label}" foi ocultado.` });
                }
            });
        }
    };

    // Estado para modal de seleção de usuários (Assinatura Digital)
    const [isUserSelectModalOpen, setIsUserSelectModalOpen] = useState(false);
    const [tempSelectedSigners, setTempSelectedSigners] = useState<string[]>([]);

    const handleToggleSignature = (checked: boolean) => {
        if (checked) {
            setAlertConfig({
                isOpen: true,
                title: "Ativar Assinatura Digital?",
                description: "Ao ativar esta opção, o módulo de assinatura digital estará ativo para os usuários que você autorizar. Deseja continuar?",
                type: "warning",
                showCancel: true,
                actionLabel: "Ativar",
                onConfirm: () => {
                    setFormData(prev => ({ ...prev, digitalSignatureEnabled: true }));
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                }
            });
        } else {
            setAlertConfig({
                isOpen: true,
                title: "Desativar Assinatura Digital?",
                description: "Ao desativar, a assinatura eletrônica ficará indisponível para todos os utilizadores, exceto o Super Administrador. Deseja continuar?",
                type: "warning",
                showCancel: true,
                variant: 'destructive',
                actionLabel: "Desativar",
                onConfirm: () => {
                    setFormData(prev => ({ ...prev, digitalSignatureEnabled: false }));
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                }
            });
        }
    };

    const handleAddSigner = (userId: string) => {
        const current = Array.isArray(formData.authorizedSigners) ? formData.authorizedSigners : [];
        if (!current.includes(userId)) {
            setFormData(prev => ({ ...prev, authorizedSigners: [...current, userId] }));
        }
    };

    const handleRemoveSigner = (userId: string) => {
        const signerUser = users.find(u => u.id === userId || u.name === userId);
        const name = signerUser ? signerUser.name : userId;

        setAlertConfig({
            isOpen: true,
            title: "Remover Signatário?",
            description: `Tem certeza que deseja remover ${name} da lista de signatários autorizados?`,
            type: "warning",
            showCancel: true,
            variant: 'destructive',
            actionLabel: "Remover",
            onConfirm: () => {
                const current = Array.isArray(formData.authorizedSigners) ? formData.authorizedSigners : [];
                setFormData(prev => ({ ...prev, authorizedSigners: current.filter((id: string) => id !== userId) }));
                setAlertConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            if (!lastOnlineStatus) {
                setAlertConfig({
                    isOpen: true,
                    title: "Conexão Detetada!",
                    description: "O sistema detectou conexão com a internet.",
                    type: "success"
                });
            }
            setLastOnlineStatus(true);
        };
        const handleOffline = () => {
            setIsOnline(false);
            setLastOnlineStatus(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [lastOnlineStatus]);

    const handleToggleServerMode = async (enabled: boolean) => {
        try {
            if (enabled) {
                // Verificar se outro servidor está potencialmente ativo na rede
                // Vamos tentar verificar o URL de sincronização configurado atualmente se parecer local
                if (formData.syncUrl && formData.syncUrl.includes(':3000')) {
                    try {
                        const check = await fetch(formData.syncUrl.replace('/sync', '/ping'), { method: 'GET' });
                        if (check.ok) {
                            const data = await check.json();
                            if (data.app === SYSTEM_NAME || data.app === 'Tango Gestão e Créditos ERP') {
                                setAlertConfig({
                                    isOpen: true,
                                    title: "Servidor Já Ativo",
                                    description: `Detectamos outro servidor ativo no IP ${data.ip}. Apenas uma máquina pode ser o servidor principal.`,
                                    type: "warning"
                                });
                                return;
                            }
                        }
                    } catch (e) {
                        // Nenhum servidor encontrado nesse URL, prosseguir
                    }
                }

                await toggleServerMode(true);
                setAlertConfig({
                    isOpen: true,
                    title: "Modo Servidor Ativado",
                    description: "Esta máquina está agora a funcionar como servidor central da rede local.",
                    type: "success"
                });
            } else {
                await toggleServerMode(false);
                setAlertConfig({
                    isOpen: true,
                    title: "Modo Servidor Desativado",
                    description: "O servidor foi desligado. Outras máquinas não poderão sincronizar com esta.",
                    type: "success"
                });
            }
        } catch (error: any) {
            console.error(error);
            setAlertConfig({
                isOpen: true,
                title: "Erro no Servidor",
                description: error.message || "Não foi possível alterar o estado do servidor.",
                type: "error"
            });
        }
    };

    const handleTestSyncUrl = async () => {
        if (!formData.syncUrl) {
            toastNotify({ title: "Introduza um URL primeiro", variant: "destructive" });
            return;
        }

        setIsTestingUrl(true);
        let url = formData.syncUrl.trim();
        if (!url.startsWith('http')) url = `http://${url}`;

        if (isCloudSyncUrl(url)) {
            try {
                const baseUrl = url.replace(/\/+$/, '').replace(/\/api\/sync$/i, '').replace(/\/sync$/i, '');
                const res = await fetch(`${baseUrl}/api/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-sync-passkey': formData.syncApiKey.trim() },
                    body: JSON.stringify({
                        tenantId: formData.nif.trim() || 'tango-default',
                        deviceId: 'connection-test',
                        cursor: 0,
                        operations: []
                    }),
                    signal: AbortSignal.timeout(10_000)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || `Servidor respondeu com erro: ${res.status}`);
                toastNotify({
                    title: 'Ligação Cloud Estabelecida!',
                    description: 'A Vercel e a base Neon responderam corretamente.',
                    variant: 'success_premium' as any
                });
            } catch (e: any) {
                toastNotify({ title: 'Falha na Ligação Cloud', description: e.message || 'Verifique a URL e a chave.', variant: 'destructive' });
            } finally {
                setIsTestingUrl(false);
            }
            return;
        }

        // Transformar /sync em /ping ou adicionar /ping
        const pingUrl = url.replace('/sync', '/ping').endsWith('/ping')
            ? url.replace('/sync', '/ping')
            : `${url.split('/sync')[0].replace(/\/$/, '')}/ping`;

        try {
            const res = await fetch(pingUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (res.ok) {
                const data = await res.json();
                if (data.app === SYSTEM_NAME || data.app === 'Tango Gestão e Créditos ERP') {
                    toastNotify({
                        title: "Ligação Estabelecida!",
                        description: `Servidor encontrado com sucesso (${data.ip}).`,
                        variant: "success_premium" as any
                    });
                } else {
                    throw new Error("Resposta inesperada do servidor.");
                }
            } else {
                throw new Error(`Servidor respondeu com erro: ${res.status}`);
            }
        } catch (e: any) {
            console.error("Test URL error:", e);
            toastNotify({
                title: "Falha na Ligação",
                description: "Não foi possível alcançar o servidor. Verifique o IP e se a Firewall permite a porta 3000.",
                variant: "destructive"
            });
        } finally {
            setIsTestingUrl(false);
        }
    };

    // Atualizar estado local quando o contexto muda (ex: carregamento inicial)
    useEffect(() => {
        if (companySettings) {
            setFormData({
                name: companySettings.name || '',
                nif: companySettings.nif || '',
                address: companySettings.address || '',
                location: companySettings.location || '',
                website: companySettings.website || '',
                segment: companySettings.segment || '',
                slogan: companySettings.slogan || '',
                currency: companySettings.currency || 'AOA',
                rescueKey: companySettings.rescueKey || 'TANGO-RECOVERY-2026',
                phone: companySettings.phone || '',
                primaryColor: rgbToHex(resolveBrandPrimary(companySettings.primaryColor)),
                secondaryColor: rgbToHex(resolveBrandDark(companySettings.secondaryColor)),
                sessionTimeout: companySettings.sessionTimeout || 5,
                email: companySettings.email || '',
                whatsapp: companySettings.whatsapp || '',
                whatsappAutoNotify: !!companySettings.whatsappAutoNotify,
                whatsappVerified: !!companySettings.whatsappVerified,
                syncEnabled: !!companySettings.syncEnabled,
                syncUrl: companySettings.syncUrl || '',
                syncApiKey: companySettings.syncApiKey || '',
                maintenanceMode: Boolean(companySettings.maintenanceMode) || false,
                allowedModulesDuringMaintenance: (() => {
                    try {
                        const val = companySettings.allowedModulesDuringMaintenance;
                        if (!val) return [];
                        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) { return []; }
                })(),
                nifType: companySettings.nif && (companySettings.nif.length > 10 || /[A-Z]/.test(companySettings.nif)) ? 'SINGULAR' : 'COLECTIVO',
                digitalSignatureEnabled: !!companySettings.digitalSignatureEnabled,
                authorizedSigners: (() => {
                    try {
                        const val = companySettings.authorizedSigners;
                        if (!val) return [];
                        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) { return []; }
                })(),
                syncPasskey: companySettings.syncPasskey || '',
                bankingInfo: (() => {
                    try {
                        const val = companySettings.bankingInfo;
                        if (!val) return [];
                        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) { return []; }
                })(),
                contractTemplates: (() => {
                    try {
                        const val = companySettings.contractTemplates;
                        if (!val) return [];
                        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) { return []; }
                })(),
                financialLock: !!companySettings.financialLock,
                enableProfileActivity: !!companySettings.enableProfileActivity,
                enableProfileActivityAdminOnly: !!companySettings.enableProfileActivityAdminOnly,
                enableGatewaysModule: !!companySettings.enableGatewaysModule,
                enableGatewaysModuleAdminOnly: !!companySettings.enableGatewaysModuleAdminOnly,
                enableWarrantiesModule: !!companySettings.enableWarrantiesModule,
                enableWarrantiesModuleAdminOnly: !!companySettings.enableWarrantiesModuleAdminOnly,
                enableLegalModule: !!companySettings.enableLegalModule,
                enableLegalModuleAdminOnly: !!companySettings.enableLegalModuleAdminOnly,
                enableScoringModule: !!companySettings.enableScoringModule,
                enableScoringModuleAdminOnly: !!companySettings.enableScoringModuleAdminOnly,
                enableSuppliersModule: !!companySettings.enableSuppliersModule,
                enableSuppliersModuleAdminOnly: !!companySettings.enableSuppliersModuleAdminOnly,
                enableMultiTenant: companySettings.enableMultiTenant !== false,
                licenseKey: companySettings.licenseKey || '',

                // SMTP Config Sync
                smtpHost: companySettings.smtpHost || 'smtp.gmail.com',
                smtpPort: companySettings.smtpPort || '587',
                smtpUser: companySettings.smtpUser || companySettings.email || '',
                smtpPassword: companySettings.smtpPassword || '',
                smtpSecure: !!companySettings.smtpSecure,
                smtpFromName: companySettings.smtpFromName || companySettings.name || 'Tango ERP',
                defaultSimulationInterestRate: companySettings.defaultSimulationInterestRate || 3.5,
                defaultSimulationAdminFee: companySettings.defaultSimulationAdminFee || 2.0,
                defaultSimulationIof: companySettings.defaultSimulationIof || 3.5,
            });
            setLogoPreview(companySettings.logo);
            setReportLogoPreview(companySettings.reportLogo || null);
            setWatermarkLogoPreview(companySettings.watermarkLogo || null);
        }
    }, [companySettings]);

    // Handle initial tab from URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);



    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setFormData(prev => {
            const newState = { ...prev, [id]: value };
            // Sincronizar automaticamente Usuário SMTP com o Email da Empresa se estiverem iguais ou vazio
            if (id === 'email' && (prev.smtpUser === prev.email || !prev.smtpUser)) {
                newState.smtpUser = value;
            }
            return newState;
        });
    };

    const handleNativeLogoSelection = async (type: 'logo' | 'report' | 'watermark') => {
        if (!(window as any).electronAPI?.selectImage) {
            if (type === 'logo') logoInputRef.current?.click();
            else if (type === 'report') reportLogoInputRef.current?.click();
            else watermarkLogoInputRef.current?.click();
            return;
        }

        try {
            const base64Data = await (window as any).electronAPI.selectImage();
            if (!base64Data) return; // Cancelado

            // Save file to disk for backup (Electron), but always use base64 for state/DB
            if ((window as any).electronAPI?.saveLogo) {
                await (window as any).electronAPI.saveLogo(type, base64Data);
            }
            // Always store the base64 data URI directly
            if (type === 'logo') setLogoPreview(base64Data);
            else if (type === 'report') setReportLogoPreview(base64Data);
            else setWatermarkLogoPreview(base64Data);
        } catch (err) {
            console.error("Erro ao selecionar/guardar logótipo:", err);
            toastNotify({ title: "Erro", description: "Falha ao processar imagem", variant: "destructive" });
        }
    };

    const handleSwitchChange = (checked: boolean) => {
        setFormData(prev => ({ ...prev, syncEnabled: checked }));
        if (checked && !formData.syncUrl) {
            setAlertConfig({
                isOpen: true,
                title: "Ativar Sincronização",
                description: "Lembre-se de configurar a URL e a Chave de API abaixo para que a sincronização funcione corretamente entre os seus dispositivos.",
                type: "info"
            });
        }
    };

    const handleSaveGeneral = async () => {
        try {
            // Verificar se a chave de licença foi alterada
            const isNewKey = formData.licenseKey.trim() !== (companySettings?.licenseKey || '').trim();

            if (isNewKey && formData.licenseKey.trim() !== '') {
                // 1. Validar estrutura e assinatura
                const licenseResult = await validateLicense(formData.licenseKey.trim());

                if (licenseResult.isValid) {
                    // 2. Validar uso único se houver rede Master
                    if (formData.syncUrl) {
                        const activation = await appAdapter.activateLicense(
                            formData.syncUrl,
                            formData.licenseKey.trim(),
                            machineId
                        );

                        if (!activation.success) {
                            setAlertConfig({
                                isOpen: true,
                                title: "Ativação Negada",
                                description: activation.message || "Licença já utilizada por favor adquira outra",
                                type: "error"
                            });
                            return;
                        }
                    }
                }
            }

            await updateCompanySettings({
                name: formData.name.trim(),
                nif: formData.nif.trim(),
                address: formData.address.trim(),
                location: formData.location.trim(),
                website: formData.website.trim(),
                segment: formData.segment.trim(),
                slogan: formData.slogan.trim(),
                currency: formData.currency.trim(),
                logo: logoPreview,
                reportLogo: reportLogoPreview,
                watermarkLogo: watermarkLogoPreview,
                rescueKey: formData.rescueKey.trim(),
                customClauses: companySettings.customClauses || '',
                phone: formData.phone.trim(),
                primaryColor: hexToRgb(formData.primaryColor),
                secondaryColor: hexToRgb(formData.secondaryColor),
                sessionTimeout: Number(formData.sessionTimeout),
                email: formData.email.trim().toLowerCase(),
                whatsapp: formData.whatsapp.trim(),
                whatsappAutoNotify: formData.whatsappAutoNotify,
                whatsappVerified: formData.whatsappVerified,
                syncEnabled: formData.syncEnabled,
                syncUrl: formData.syncUrl.trim(),
                syncApiKey: formData.syncApiKey.trim(),
                maintenanceMode: formData.maintenanceMode ? 1 : 0,
                enableGatewaysModule: formData.enableGatewaysModule,
                // allowedModulesDuringMaintenance: JSON.stringify(formData.allowedModulesDuringMaintenance), // Removed to avoid overwriting dedicated modal logic if any
                digitalSignatureEnabled: formData.digitalSignatureEnabled,
                authorizedSigners: JSON.stringify(formData.authorizedSigners),
                bankingInfo: JSON.stringify(formData.bankingInfo),
                contractTemplates: JSON.stringify(formData.contractTemplates),
                financialLock: formData.financialLock,
                enableWarrantiesModule: formData.enableWarrantiesModule,
                enableLegalModule: formData.enableLegalModule,
                enableScoringModule: formData.enableScoringModule,
                enableSuppliersModule: formData.enableSuppliersModule,
                enableSuppliersModuleAdminOnly: formData.enableSuppliersModuleAdminOnly,
                enableMultiTenant: formData.enableMultiTenant,
                licenseKey: formData.licenseKey.trim(),
                defaultSimulationInterestRate: Number(formData.defaultSimulationInterestRate),
                defaultSimulationAdminFee: Number(formData.defaultSimulationAdminFee),
                defaultSimulationIof: Number(formData.defaultSimulationIof),
                smtpHost: formData.smtpHost?.trim() || 'smtp.gmail.com',
                smtpPort: String(formData.smtpPort || '587').trim(),
                smtpUser: formData.smtpUser?.trim() || '',
                smtpPassword: formData.smtpPassword || '',
                smtpSecure: Boolean(formData.smtpSecure),
                smtpFromName: formData.smtpFromName?.trim() || formData.name?.trim() || 'Tango ERP',
            }, user ? { id: user.id, name: user.name } : undefined);

            // Partilhar configuração com o backend se for Master
            if (serverInfo?.isRunning && appAdapter.setSharedConfig) {
                appAdapter.setSharedConfig({
                    settings: { ...companySettings, ...formData },
                    clients,
                    credits,
                    payments
                });
            }

            // AUTO-SYNC USERS if Sync is Enabled
            if (formData.syncEnabled && formData.syncUrl && !isCloudSyncUrl(formData.syncUrl)) {
                // @ts-ignore
                if (window.electronAPI) {
                    try {
                        await syncUsersFromMaster(formData.syncUrl, formData.syncApiKey);
                        toastNotify({
                            title: "Sincronização Inicial Concluída",
                            description: "Base de dados de utilizadores atualizada a partir do Master.",
                            variant: "success_premium" as any
                        });
                    } catch (e) {
                        console.warn("Auto-sync users failed:", e);
                    }
                }
            }

            // AUTO-REFRESH AUTH CONTEXT for things like sessionTimeout
            try {
                await refreshSettings();
            } catch (e) {
                console.warn("Auth settings refresh failed:", e);
            }

            setAlertConfig({
                isOpen: true,
                title: "Sucesso!",
                description: `As definições de ${formData.name || 'Tango Gestion'} foram guardadas com sucesso.`,
                type: "success"
            });
        } catch (error: any) {
            console.error("Erro ao salvar configurações:", error);
            setAlertConfig({
                isOpen: true,
                title: "Erro ao Salvar",
                description: `Erro: ${error?.message || error || "Falha desconhecida"}. Tente recarregar a página.`,
                type: "error"
            });
        }
    };

    const handleBackupExport = async () => {
        if (!(window as any).electronAPI?.backupDatabase) {
            setAlertConfig({
                isOpen: true,
                title: "Erro de Versão",
                description: "Ambiente não suporta exportação.",
                type: "error"
            });
            return;
        }

        try {
            const result = await (window as any).electronAPI.backupDatabase();

            if (!result?.success) {
                if (result?.canceled) return;
                throw new Error(result?.error || "Falha desconhecida ao exportar a base de dados.");
            }

            const now = new Date().toISOString();
            try {
                await updateCompanySettings({ lastBackupDate: now });
            } catch (settingsError) {
                // O ficheiro ja foi criado. Uma falha ao atualizar o lembrete nao deve
                // transformar um backup concluido num falso erro de exportacao.
                console.warn('Backup concluido, mas a data do ultimo backup nao foi atualizada:', settingsError);
            }

            setAlertConfig({
                isOpen: true,
                title: "Backup Concluído",
                description: result.filePath
                    ? `Backup guardado com sucesso em: ${result.filePath}`
                    : "Backup do sistema realizado com sucesso.",
                type: "success"
            });
        } catch (error: any) {
            console.error('Failed to export DB', error);
            const detail = String(error?.message || error || "Falha desconhecida.")
                .replace(/^Error invoking remote method ['\"]db-export['\"]:\s*/i, '')
                .trim();
            setAlertConfig({
                isOpen: true,
                title: "Erro no Backup",
                description: `Falha ao exportar a base de dados: ${detail}`,
                type: "error"
            });
        }
    };

    const handleOptimizeDB = async () => {
        try {
            if (window.electronAPI?.dbOptimize) {
                await window.electronAPI.dbOptimize();
            } else {
                await sqlite.exec('VACUUM');
            }
            setAlertConfig({
                isOpen: true,
                title: "Sistema Otimizado",
                description: "Base de dados compactada e otimizada para melhor desempenho.",
                type: "success"
            });
        } catch (error) {
            setAlertConfig({
                isOpen: true,
                title: "Erro na Otimização",
                description: "Não foi possível otimizar a base de dados.",
                type: "error"
            });
        }
    };

    const handleCheckIntegrity = async () => {
        try {
            const result = await sqlite.all('PRAGMA integrity_check');
            if (result && result[0] && (result[0] as any).integrity_check === 'ok') {
                setAlertConfig({
                    isOpen: true,
                    title: "Integridade OK",
                    description: "Todos os dados estão íntegros e sem erros estruturais.",
                    type: "success"
                });
            } else {
                setAlertConfig({
                    isOpen: true,
                    title: "Atenção",
                    description: "Foram detetadas falhas estruturais. Recomenda-se restaurar um backup.",
                    type: "warning"
                });
            }
        } catch (error) {
            setAlertConfig({
                isOpen: true,
                title: "Erro na Verificação",
                description: "Falha ao verificar integridade.",
                type: "error"
            });
        }
    };


    const handleSaveSessionTimeout = async () => {
        try {
            await updateCompanySettings({
                sessionTimeout: Number(formData.sessionTimeout)
            }, user ? { id: user.id, name: user.name } : undefined);

            // Sync ContextoAutenticacao with new timeout
            if (refreshSettings) await refreshSettings();

            setAlertConfig({
                isOpen: true,
                title: "Tempo Atualizado",
                description: `A sessão expirará após ${formData.sessionTimeout} min de inatividade para todos os utilizadores.`,
                type: "success"
            });
        } catch (error) {
            setAlertConfig({
                isOpen: true,
                title: "Erro ao salvar",
                description: "Falha ao atualizar tempo de sessão.",
                type: "error"
            });
        }
    };

    const handleAddBank = () => {
        if (!newBank.bankName || !newBank.iban) {
            toastNotify({ title: "Preencha pelo menos o Banco e o IBAN", variant: "destructive" });
            return;
        }

        const updatedBanking = [...(formData.bankingInfo || []), { ...newBank, id: crypto.randomUUID() }];
        setFormData(prev => ({ ...prev, bankingInfo: updatedBanking }));
        setNewBank({ bankName: '', nib: '', iban: '', swift: '', holder: '' });
        toastNotify({ title: "Banco pré-adicionado", description: "Clique em Gravar Informações para persistir." });
    };

    const handleRemoveBank = (id: string) => {
        const updatedBanking = formData.bankingInfo.filter((b: any) => b.id !== id);
        setFormData(prev => ({ ...prev, bankingInfo: updatedBanking }));
    };

    const handleAddContractTemplate = () => {
        if (!newContract.name || !newContract.content) {
            toastNotify({ title: "Nome e conteúdo são obrigatórios", variant: "destructive" });
            return;
        }

        const updatedTemplates = [...(formData.contractTemplates || []), { ...newContract, id: crypto.randomUUID() }];
        setFormData(prev => ({ ...prev, contractTemplates: updatedTemplates }));
        setNewContract({ name: '', type: 'custom', content: '' });
        toastNotify({ title: "Modelo pré-adicionado", description: "Clique em Gravar Informações para persistir." });
    };

    const handleFormatDatabase = async () => {
        setAlertConfig({
            isOpen: true,
            title: "FORMATAR BASE DE DADOS?",
            description: "ATENÇÃO: Esta ação é IRREVERSÍVEL. Todos os clientes, créditos, pagamentos, contratos e registos de auditoria serão ELIMINADOS permanentemente. É altamente recomendado fazer um backup antes de prosseguir.",
            type: "error",
            showCancel: true,
            actionLabel: "Sim, Formatar Tudo",
            variant: 'destructive',
            onConfirm: async () => {
                try {
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));

                    // Executar comandos de limpeza
                    await sqlite.exec('DELETE FROM clients');
                    await sqlite.exec('DELETE FROM credits');
                    await sqlite.exec('DELETE FROM payments');
                    await sqlite.exec('DELETE FROM contracts');
                    await sqlite.exec('DELETE FROM notifications');
                    await sqlite.exec('DELETE FROM audit_logs');
                    await sqlite.exec('DELETE FROM chat_messages');
                    await sqlite.exec('DELETE FROM payment_gateways');
                    await sqlite.exec('DELETE FROM payment_references');

                    // Resetar sequências se necessário (SQLite autoincrement)
                    await sqlite.exec("DELETE FROM sqlite_sequence WHERE name IN ('clients', 'credits', 'payments', 'contracts', 'notifications', 'audit_logs', 'chat_messages', 'payment_gateways', 'payment_references')");

                    toastNotify({
                        title: "Base de Dados Formatada",
                        description: "Todos os dados foram eliminados com sucesso."
                    });

                    // Recarregar os dados no contexto
                    if (refreshData) await refreshData();

                    // Recarregar a página para limpar o estado da UI completamente
                    setTimeout(() => window.location.reload(), 1000);
                } catch (error: any) {
                    console.error("Erro ao formatar banco:", error);
                    toastNotify({
                        title: "Erro na Formatação",
                        description: error.message || "Não foi possível limpar os dados.",
                        variant: "destructive"
                    });
                }
            }
        });
    };

    const [backupRecoveryKey, setBackupRecoveryKey] = useState('');

    const handleShowBackupRecoveryKey = async () => {
        try {
            const result = await window.electronAPI?.getBackupRecoveryKey();
            if (!result?.recoveryKey) throw new Error('Chave indisponível.');
            setBackupRecoveryKey(result.recoveryKey);
        } catch (error: any) {
            toastNotify({ title: "Erro", description: error?.message || "Não foi possível obter a chave de recuperação.", variant: "destructive" });
        }
    };

    const handleBackupImport = async () => {
        setAlertConfig({
            isOpen: true,
            title: "Restaurar Backup?",
            description: "Substituir todos os dados atuais por este backup?",
            type: "warning",
            showCancel: true,
            actionLabel: "Restaurar",
            onConfirm: async () => {
                try {
                    setAlertConfig(prev => ({ ...prev, isOpen: false }));
                    const result = await window.electronAPI?.restoreBackup(backupRecoveryKey.trim() || undefined);
                    if (!result?.success) {
                        if (result?.canceled) return;
                        throw new Error(result?.error || 'A restauração falhou.');
                    }
                    toastNotify({ title: "Restauração Concluída", description: "Recarregando sistema..." });
                    setTimeout(() => window.location.reload(), 1500);
                } catch (e) {
                    toastNotify({ title: "Erro na Importação", variant: "destructive" });
                }
            }
        });
    };


    // --- ESTADOS E FUNÇÕES DO BACKUP AUTOMÁTICO ---
    const [autoBackupConfig, setAutoBackupConfig] = useState<AutoBackupConfig>(() => ServicoAutoBackup.getConfig());
    const [autoBackupLogs, setAutoBackupLogs] = useState<AutoBackupLog[]>(() => ServicoAutoBackup.getLogs());
    const [isTestingAutoBackup, setIsTestingAutoBackup] = useState(false);

    const handleUpdateAutoBackup = (updates: Partial<AutoBackupConfig>) => {
        const saved = ServicoAutoBackup.saveConfig(updates);
        setAutoBackupConfig(saved);
        toastNotify({
            title: "Configurações Atualizadas",
            description: "As definições de backup automático foram salvas com sucesso."
        });
    };

    const handleRunAutoBackupTest = async () => {
        setIsTestingAutoBackup(true);
        try {
            const res = await ServicoAutoBackup.executeBackup('manual_test');
            setAutoBackupConfig(ServicoAutoBackup.getConfig());
            setAutoBackupLogs(ServicoAutoBackup.getLogs());

            setAlertConfig({
                isOpen: true,
                title: res.success ? "Backup Automático Testado com Sucesso" : "Falha no Teste de Backup",
                description: res.message + (res.filePath ? `\nLocal: ${res.filePath}` : ''),
                type: res.success ? "success" : "error"
            });
        } catch (error: any) {
            setAlertConfig({
                isOpen: true,
                title: "Erro no Backup Automático",
                description: error?.message || "Ocorreu um erro ao testar o backup automático.",
                type: "error"
            });
        } finally {
            setIsTestingAutoBackup(false);
        }
    };

    const handleClearAutoBackupLogs = () => {
        ServicoAutoBackup.clearLogs();
        setAutoBackupLogs([]);
        toastNotify({
            title: "Histórico Limpo",
            description: "O registo de backups automáticos foi reiniciado."
        });
    };

    return (
        <MainLayout title="Configurações">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                {/* A navegação entre separadores é feita pelo submenu
                    "Configurações" da barra lateral, que aponta para ?tab=... */}

                {/* Configurações de Branding */}
                <TabsContent value="general" className="mt-6 space-y-6">
                    <Card className="card-elevated border-none shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-primary" />
                                Identidade Visual
                            </CardTitle>
                            <CardDescription>
                                Configurações de exibição do sistema e documentos fiscais.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            {/* Gestão de Logotipos */}
                            <div className="grid gap-6 md:grid-cols-3">
                                {/* Logotipo do Sistema */}
                                <div className="group relative overflow-hidden rounded-xl border bg-background hover:shadow-md transition-all">
                                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="font-semibold text-base">Sistema</Label>
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <Monitor className="h-4 w-4 text-primary" />
                                            </div>
                                        </div>

                                        <div 
                                            onClick={() => handleNativeLogoSelection('logo')}
                                            className="aspect-video w-full flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-input bg-muted/50 hover:bg-muted/30 cursor-pointer hover:border-primary/50 transition-all relative"
                                        >
                                            {logoPreview ? (
                                                <img src={formatImageURL(logoPreview)} alt="System Logo" className="h-full w-full object-contain p-2" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                                                    <ImageIcon className="h-8 w-8" />
                                                    <span className="text-[10px] uppercase font-bold tracking-wider">Vazio</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => handleNativeLogoSelection('logo')} disabled={!isAdmin}>
                                                <Upload className="mr-2 h-3 w-3" /> Alterar
                                            </Button>
                                            {logoPreview && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => {
                                                    setLogoPreview(null);
                                                    setAlertConfig({
                                                        isOpen: true,
                                                        title: "Logo Removido",
                                                        description: "O logotipo do sistema foi removido. Clique em Gravar para confirmar.",
                                                        type: "warning"
                                                    });
                                                }} disabled={!isAdmin}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground text-center">
                                            Exibido no login e menu lateral.
                                        </p>

                                    </div>
                                </div>

                                {/* Logotipo do Relatório */}
                                <div className="group relative overflow-hidden rounded-xl border bg-background hover:shadow-md transition-all">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="font-semibold text-base">Relatórios</Label>
                                            <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                <FileText className="h-4 w-4 text-blue-600" />
                                            </div>
                                        </div>

                                        <div 
                                            onClick={() => handleNativeLogoSelection('report')}
                                            className="aspect-video w-full flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 cursor-pointer hover:border-blue-500/50 transition-all relative"
                                        >
                                            {reportLogoPreview ? (
                                                <img src={formatImageURL(reportLogoPreview)} alt="Report Logo" className="h-full w-full object-contain p-2" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-blue-500/50">
                                                    <FileText className="h-8 w-8" />
                                                    <span className="text-[10px] uppercase font-bold tracking-wider">Vazio</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => handleNativeLogoSelection('report')} disabled={!isAdmin}>
                                                <Upload className="mr-2 h-3 w-3" /> Alterar
                                            </Button>
                                            {reportLogoPreview && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setReportLogoPreview(null)} disabled={!isAdmin}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground text-center">
                                            Cabeçalho de documentos PDF.
                                        </p>

                                    </div>
                                </div>

                                {/* Logotipo de Marca de Água */}
                                <div className="group relative overflow-hidden rounded-xl border bg-background hover:shadow-md transition-all">
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="font-semibold text-base">Marca de Água</Label>
                                            <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                                                <Stamp className="h-4 w-4 text-orange-600" />
                                            </div>
                                        </div>

                                        <div 
                                            onClick={() => handleNativeLogoSelection('watermark')}
                                            className="aspect-video w-full flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 cursor-pointer hover:border-orange-500/50 transition-all relative"
                                        >
                                            {watermarkLogoPreview ? (
                                                <img src={formatImageURL(watermarkLogoPreview)} alt="Watermark Logo" className="h-full w-full object-contain p-2 opacity-50" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-orange-500/50">
                                                    <Stamp className="h-8 w-8" />
                                                    <span className="text-[10px] uppercase font-bold tracking-wider">Vazio</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => handleNativeLogoSelection('watermark')} disabled={!isAdmin}>
                                                <Upload className="mr-2 h-3 w-3" /> Alterar
                                            </Button>
                                            {watermarkLogoPreview && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setWatermarkLogoPreview(null)} disabled={!isAdmin}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground text-center">
                                            Fundo decorativo em documentos.
                                        </p>

                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Nome da Empresa</Label>
                                    <Input id="name" value={formData.name} onChange={handleInputChange} disabled={!isAdmin} />
                                </div>

                                <div className="space-y-3 md:col-span-2">
                                    <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tipo de Contribuinte (NIF)</Label>
                                    <div className="grid grid-cols-2 gap-3 max-w-md">
                                        <Button
                                            type="button"
                                            variant={formData.nifType === 'COLECTIVO' ? 'default' : 'outline'}
                                            onClick={() => setFormData(prev => ({ ...prev, nifType: 'COLECTIVO', nif: '' }))}
                                            className={`h-11 font-bold ${formData.nifType === 'COLECTIVO' ? 'shadow-md' : ''}`}
                                            disabled={!isAdmin}
                                        >
                                            Empresa (10 Dígitos)
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={formData.nifType === 'SINGULAR' ? 'default' : 'outline'}
                                            onClick={() => setFormData(prev => ({ ...prev, nifType: 'SINGULAR', nif: '' }))}
                                            className={`h-11 font-bold ${formData.nifType === 'SINGULAR' ? 'shadow-md' : ''}`}
                                            disabled={!isAdmin}
                                        >
                                            Particular / BI
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="nif">{formData.nifType === 'COLECTIVO' ? 'NIF Colectivo' : 'NIF Singular (BI)'}</Label>
                                    <Input
                                        id="nif"
                                        value={formData.nif}
                                        placeholder={formData.nifType === 'COLECTIVO' ? "54XXXXXXXX" : "000000000LA000"}
                                        onChange={(e) => {
                                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                            let formatted = '';
                                            if (formData.nifType === 'COLECTIVO') {
                                                formatted = val.slice(0, 10).replace(/[^0-9]/g, '');
                                            } else {
                                                for (let i = 0; i < val.length && i < 14; i++) {
                                                    const char = val[i];
                                                    if (i < 9 || i >= 11) {
                                                        if (/[0-9]/.test(char)) formatted += char;
                                                    } else {
                                                        if (/[A-Z]/.test(char)) formatted += char;
                                                    }
                                                }
                                            }
                                            setFormData(prev => ({ ...prev, nif: formatted }));
                                        }}
                                        className="font-mono uppercase text-lg"
                                        disabled={!isAdmin}
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
                                        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                                            <ShieldAlert className="h-4 w-4" />
                                            <h4 className="font-bold text-xs">Padrões de NIF em Angola (AGT)</h4>
                                        </div>
                                        <div className="text-[11px] text-amber-800/80 dark:text-amber-400/80 leading-relaxed">
                                            <p>Empresas: 10 dígitos numéricos (geralmente iniciados por 5 ou 7). | Particulares: Unificado com o Bilhete de Identidade (9 números + 2 letras + 3 números).</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-2 md:col-span-2">
                                    <Label htmlFor="address">Morada Completa</Label>
                                    <Input id="address" value={formData.address} onChange={handleInputChange} disabled={!isAdmin} />
                                </div>

                                <div className="grid gap-2 md:col-span-2">
                                    <Label htmlFor="location">Localização da Empresa (Cidade / Província)</Label>
                                    <Input id="location" value={formData.location} placeholder="Ex: Luanda" onChange={handleInputChange} disabled={!isAdmin} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="currency">Símbolo Monetário (Moeda)</Label>
                                    <Input id="currency" value={formData.currency} onChange={handleInputChange} disabled={!isAdmin} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="segment">Ramo de Actividade</Label>
                                    <Input
                                        id="segment"
                                        value={formData.segment}
                                        placeholder="Ex: Micro Crédito"
                                        onChange={handleInputChange}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="grid gap-2 md:col-span-2">
                                    <Label htmlFor="slogan">Slogan da Marca</Label>
                                    <Input
                                        id="slogan"
                                        value={formData.slogan}
                                        placeholder="Ex: O crédito que impulsiona sonhos"
                                        onChange={handleInputChange}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="website">Sítio da Empresa</Label>
                                    <Input
                                        id="website"
                                        value={formData.website}
                                        placeholder="www.empresa.co.ao"
                                        onChange={handleInputChange}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="phone">Telefone da Empresa</Label>
                                    <Input
                                        id="phone"
                                        value={formData.phone}
                                        placeholder="+244 9XX XXX XXX"
                                        onChange={(e) => {
                                            const formatted = formatAngolanPhone(e.target.value);
                                            setFormData(prev => ({ ...prev, phone: formatted }));
                                        }}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email da Empresa</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        placeholder="admin@empresa.ao"
                                        onChange={handleInputChange}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="whatsapp" className="flex justify-between items-center">
                                        WhatsApp da Empresa
                                        {formData.whatsappVerified ? (
                                            <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                                <CheckCircle2 className="h-3 w-3" /> VERIFICADO COM SUCESSO
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                                NÃO VERIFICADO
                                            </span>
                                        )}
                                    </Label>
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Input
                                                    id="whatsapp"
                                                    value={formData.whatsapp}
                                                    placeholder="+244 9XX XXX XXX"
                                                    onChange={(e) => {
                                                        const formatted = formatAngolanPhone(e.target.value);
                                                        setFormData(prev => ({ ...prev, whatsapp: formatted, whatsappVerified: false }));
                                                    }}
                                                    disabled={!isAdmin}
                                                    className={formData.whatsappVerified ? "border-green-300 bg-green-50/20 pr-10" : ""}
                                                />
                                                {formData.whatsappVerified && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                                            </div>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    if (formData.whatsapp) {
                                                        const clean = formData.whatsapp.replace(/\D/g, '');
                                                        window.open(`https://wa.me/${clean}`, '_blank');
                                                        setAlertConfig({
                                                            isOpen: true,
                                                            title: "Teste Aberto",
                                                            description: "Verifique se a página do WhatsApp carrega corretamente.",
                                                            type: "success"
                                                        });
                                                    }
                                                }}
                                                disabled={!isAdmin || !formData.whatsapp}
                                                className="min-w-[140px]"
                                            >
                                                <MessageSquare className="h-4 w-4 mr-2" />
                                                Testar no Navegador
                                            </Button>
                                        </div>
                                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                                            <input
                                                type="checkbox"
                                                id="confirmWhatsapp"
                                                checked={formData.whatsappVerified}
                                                onChange={(e) => {
                                                    setFormData(prev => ({ ...prev, whatsappVerified: e.target.checked }));
                                                }}
                                                disabled={!isAdmin}
                                                className="mt-1"
                                            />
                                            <label htmlFor="confirmWhatsapp" className="text-sm text-amber-900 cursor-pointer">
                                                <strong>Confirmo que este número tem uma conta WhatsApp ativa.</strong>
                                                <br />
                                                <span className="text-xs text-amber-700">
                                                    Certifique-se de criar a conta no telemóvel antes de confirmar. Use o botão "Testar" para verificar.
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="primaryColor">Cor Primária do Contrato</Label>
                                    <div className="flex gap-2">
                                        <Input id="primaryColor" type="color" value={formData.primaryColor} onChange={handleInputChange} className="w-12 p-1 h-10" disabled={!isAdmin} />
                                        <Input value={formData.primaryColor} onChange={handleInputChange} id="primaryColor" className="font-mono" disabled={!isAdmin} />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="secondaryColor">Cor Secundária do Contrato</Label>
                                    <div className="flex gap-2">
                                        <Input id="secondaryColor" type="color" value={formData.secondaryColor} onChange={handleInputChange} className="w-12 p-1 h-10" disabled={!isAdmin} />
                                        <Input value={formData.secondaryColor} onChange={handleInputChange} id="secondaryColor" className="font-mono" disabled={!isAdmin} />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end bg-slate-50/50 border-t px-6 py-4">
                            {isAdmin && (
                                <Button onClick={handleSaveGeneral} className="gap-2">
                                    <Save className="h-4 w-4" />
                                    Gravar Informações
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Configurações de Segurança */}
                <TabsContent value="security" className="mt-6 space-y-6">
                    <Card className="border-amber-100 bg-amber-50/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-amber-900">
                                <ShieldCheck className="h-5 w-5" />
                                Recuperação Mestre
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                                <strong>REVISÃO DE SEGURANÇA:</strong> Guarde esta chave fisicamente. Ela permite resetar a conta mestre offline.
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rescueKey">Chave de Resgate Atual</Label>
                                <div className="relative">
                                    <Input
                                        id="rescueKey"
                                        type={showRescueKey ? "text" : "password"}
                                        value={formData.rescueKey}
                                        onChange={handleInputChange}
                                        placeholder="Chave de Recuperação"
                                        className="font-mono pr-10"
                                        disabled={!isAdmin}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full px-3"
                                        onClick={() => setShowRescueKey(!showRescueKey)}
                                        disabled={!isAdmin}
                                    >
                                        {showRescueKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                            <div className="grid gap-2 pt-4 border-t">
                                <Label htmlFor="sessionTimeout">Tempo de Inatividade (Minutos)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="sessionTimeout"
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={formData.sessionTimeout}
                                        onChange={handleInputChange}
                                        className="w-24 border-amber-200"
                                        disabled={!isAdmin}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-10 border-amber-300 text-amber-900 bg-amber-100/50 hover:bg-amber-100"
                                        onClick={handleSaveSessionTimeout}
                                        disabled={!isAdmin}
                                    >
                                        Aplicar
                                    </Button>
                                    <span className="text-xs text-amber-800 ml-2">A sessão fechará após este período.</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-between border-t border-amber-100 px-6 py-4">
                            <Button
                                variant="outline"
                                className="border-destructive hover:bg-destructive/10 text-destructive"
                                onClick={() => {
                                    setAlertConfig({
                                        isOpen: true,
                                        title: "Resetar Visual?",
                                        description: "Tem certeza? Isso resetará cores e logotipos para o padrão.",
                                        type: "warning",
                                        showCancel: true,
                                        actionLabel: "Confirmar Reset",
                                        onConfirm: async () => {
                                            setAlertConfig(prev => ({ ...prev, isOpen: false }));
                                            await updateCompanySettings({
                                                logo: null, reportLogo: null, watermarkLogo: null,
                                                primaryColor: BRAND_ORANGE, secondaryColor: BRAND_CHARCOAL
                                            });
                                            setAlertConfig({
                                                isOpen: true,
                                                title: "Visual Redefinido",
                                                description: "As configurações foram resetadas. Recarregando sistema...",
                                                type: "success"
                                            });
                                            // Recarregar para aplicar alterações
                                            setTimeout(() => window.location.reload(), 1500);
                                        }
                                    });
                                }}
                                disabled={!isAdmin}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Resetar Visual
                            </Button>

                            {isAdmin && (
                                <Button onClick={handleSaveGeneral} variant="outline" className="text-amber-900 border-amber-200">
                                    Atualizar Chave Master
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    {/* Bloqueio de Emergência (Botão de Pânico) */}
                    <Card className={cn(
                        "transition-all duration-300",
                        formData.financialLock ? "border-red-500 bg-red-50/10 shadow-lg shadow-red-500/10" : "border-slate-200"
                    )}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-red-600">
                                <Lock className={cn("h-5 w-5", formData.financialLock && "animate-pulse")} />
                                Bloqueio de Emergência (Pânico)
                            </CardTitle>
                            <CardDescription>
                                Interrompe imediatamente todas as operações de escrita no sistema.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-bold">Estado do Bloqueio Financeiro</Label>
                                    <p className="text-sm text-muted-foreground mr-4">
                                        Quando ativado, os usuários não poderão criar novos empréstimos, processar pagamentos ou editar dados.
                                    </p>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <Switch
                                        checked={formData.financialLock}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setAlertConfig({
                                                    isOpen: true,
                                                    title: "ATIVAR BOTÃO DE PÂNICO?",
                                                    description: "Esta ação BLOQUEARÁ todas as movimentações financeiras no sistema imediatamente. Apenas Super Administradores poderão reverter.",
                                                    type: "error",
                                                    showCancel: true,
                                                    actionLabel: "Ativar Bloqueio",
                                                    variant: 'destructive',
                                                    onConfirm: () => setFormData(prev => ({ ...prev, financialLock: true }))
                                                });
                                            } else {
                                                setAlertConfig({
                                                    isOpen: true,
                                                    title: "DESBLOQUEAR SISTEMA?",
                                                    description: "As operações financeiras e de escrita serão normalizadas para todos os utilizadores.",
                                                    type: "success_premium",
                                                    showCancel: true,
                                                    actionLabel: "Desbloquear Agora",
                                                    onConfirm: () => setFormData(prev => ({ ...prev, financialLock: false }))
                                                });
                                            }
                                        }}
                                        disabled={!isAdmin}
                                    />
                                    {formData.financialLock && (
                                        <Badge variant="destructive" className="animate-pulse text-[10px]">SISTEMA BLOQUEADO</Badge>
                                    )}
                                </div>
                            </div>

                            {formData.financialLock && (
                                <div className="p-4 bg-red-100/50 border border-red-200 rounded-xl flex gap-3 items-start animate-in fade-in duration-500">
                                    <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-red-800">Protocolo de Emergência Ativo</p>
                                        <p className="text-xs text-red-700 leading-relaxed">
                                            O sistema está em modo "Somente Leitura". Nenhuma alteração na base de dados será permitida até que este bloqueio seja removido manualmente por um administrador autorizado.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="justify-end border-t border-red-100 px-6 py-4">
                            {isAdmin && (
                                <Button
                                    onClick={handleSaveGeneral}
                                    className={cn(
                                        "gap-2",
                                        formData.financialLock ? "bg-red-600 hover:bg-red-700" : "bg-slate-800 hover:bg-slate-900"
                                    )}
                                >
                                    <Save className="h-4 w-4" />
                                    Confirmar Estado de Segurança
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Configurações de Módulos */}
                <TabsContent value="modules" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestão de Módulos</CardTitle>
                            <CardDescription>
                                Ative ou desative módulos do sistema conforme a necessidade da sua empresa.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Wallet className="h-4 w-4 text-primary" />
                                        <Label className="text-base">Gateways de Pagamento</Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Permite configurar métodos de pagamento, validar transações e gerar referências.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.enableGatewaysModule}
                                    onCheckedChange={(checked) => handleToggleModule('enableGatewaysModule', 'Gateways de Pagamento', checked)}
                                    disabled={!isSuperAdmin}
                                />
                            </div>
                            <div className="flex justify-end -mt-2 pr-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="gateways-admin-only"
                                        checked={formData.enableGatewaysModuleAdminOnly}
                                        onCheckedChange={(checked) => {
                                            const key = 'enableGatewaysModuleAdminOnly';
                                            setFormData(prev => ({ ...prev, [key]: checked }));
                                            if (user) updateCompanySettings({ [key]: checked }, { id: user.id, name: user.name });
                                        }}
                                        disabled={!isSuperAdmin || !formData.enableGatewaysModule}
                                        className="scale-90"
                                    />
                                    <Label htmlFor="gateways-admin-only" className="text-xs text-muted-foreground">Visível apenas para Administradores</Label>
                                </div>
                            </div>

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-primary" />
                                        <Label className="text-base">Gestão de Garantias</Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Registo de bens (carros, imóveis) e avaliação de colaterais para maior segurança.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.enableWarrantiesModule}
                                    onCheckedChange={(checked) => handleToggleModule('enableWarrantiesModule', 'Gestão de Garantias', checked)}
                                    disabled={!isSuperAdmin}
                                />
                            </div>
                            <div className="flex justify-end -mt-2 pr-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="warranties-admin-only"
                                        checked={formData.enableWarrantiesModuleAdminOnly}
                                        onCheckedChange={(checked) => {
                                            const key = 'enableWarrantiesModuleAdminOnly';
                                            setFormData(prev => ({ ...prev, [key]: checked }));
                                            if (user) updateCompanySettings({ [key]: checked }, { id: user.id, name: user.name });
                                        }}
                                        disabled={!isSuperAdmin || !formData.enableWarrantiesModule}
                                        className="scale-90"
                                    />
                                    <Label htmlFor="warranties-admin-only" className="text-xs text-muted-foreground">Visível apenas para Administradores</Label>
                                </div>
                            </div>

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Gavel className="h-4 w-4 text-primary" />
                                        <Label className="text-base">Contencioso Jurídico</Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Monitorização de processos de cobrança judicial e geração de interpelações.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.enableLegalModule}
                                    onCheckedChange={(checked) => handleToggleModule('enableLegalModule', 'Contencioso Jurídico', checked)}
                                    disabled={!isSuperAdmin}
                                />
                            </div>
                            <div className="flex justify-end -mt-2 pr-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="legal-admin-only"
                                        checked={formData.enableLegalModuleAdminOnly}
                                        onCheckedChange={(checked) => {
                                            const key = 'enableLegalModuleAdminOnly';
                                            setFormData(prev => ({ ...prev, [key]: checked }));
                                            if (user) updateCompanySettings({ [key]: checked }, { id: user.id, name: user.name });
                                        }}
                                        disabled={!isSuperAdmin || !formData.enableLegalModule}
                                        className="scale-90"
                                    />
                                    <Label htmlFor="legal-admin-only" className="text-xs text-muted-foreground">Visível apenas para Administradores</Label>
                                </div>
                            </div>

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Activity className="h-4 w-4 text-primary" />
                                        <Label className="text-base">Inteligência de Risco (Scoring)</Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Algoritmo de pontuação de crédito para análise preditiva de clientes.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.enableScoringModule}
                                    onCheckedChange={(checked) => handleToggleModule('enableScoringModule', 'Inteligência de Risco (Scoring)', checked)}
                                    disabled={!isSuperAdmin}
                                />
                            </div>
                            <div className="flex justify-end -mt-2 pr-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="scoring-admin-only"
                                        checked={formData.enableScoringModuleAdminOnly}
                                        onCheckedChange={(checked) => {
                                            const key = 'enableScoringModuleAdminOnly';
                                            setFormData(prev => ({ ...prev, [key]: checked }));
                                            if (user) updateCompanySettings({ [key]: checked }, { id: user.id, name: user.name });
                                        }}
                                        disabled={!isSuperAdmin || !formData.enableScoringModule}
                                        className="scale-90"
                                    />
                                    <Label htmlFor="scoring-admin-only" className="text-xs text-muted-foreground">Visível apenas para Administradores</Label>
                                </div>
                            </div>

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Handshake className="h-4 w-4 text-primary" />
                                        <Label className="text-base">Fornecedores / Parceiros</Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Registo de fornecedores que disponibilizam capitais e rastreamento de investimentos.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.enableSuppliersModule}
                                    onCheckedChange={(checked) => handleToggleModule('enableSuppliersModule', 'Fornecedores / Parceiros', checked)}
                                    disabled={!isSuperAdmin}
                                />
                            </div>
                            <div className="flex justify-end -mt-2 pr-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="suppliers-admin-only"
                                        checked={formData.enableSuppliersModuleAdminOnly}
                                        onCheckedChange={(checked) => {
                                            const key = 'enableSuppliersModuleAdminOnly';
                                            setFormData(prev => ({ ...prev, [key]: checked }));
                                            if (user) updateCompanySettings({ [key]: checked }, { id: user.id, name: user.name });
                                        }}
                                        disabled={!isSuperAdmin || !formData.enableSuppliersModule}
                                        className="scale-90"
                                    />
                                    <Label htmlFor="suppliers-admin-only" className="text-xs text-muted-foreground">Visível apenas para Administradores</Label>
                                </div>
                            </div>

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Activity className="h-4 w-4 text-primary" />
                                        <Label className="text-base">Atividade Recente no Perfil</Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Exibe as últimas ações realizadas pelo utilizador diretamente no seu perfil.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.enableProfileActivity}
                                    onCheckedChange={(checked) => handleToggleModule('enableProfileActivity', 'Atividade Recente no Perfil', checked)}
                                    disabled={!isSuperAdmin}
                                />
                            </div>
                            <div className="flex justify-end -mt-2 pr-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="profile-activity-admin-only"
                                        checked={formData.enableProfileActivityAdminOnly}
                                        onCheckedChange={(checked) => {
                                            const key = 'enableProfileActivityAdminOnly';
                                            setFormData(prev => ({ ...prev, [key]: checked }));
                                            if (user) updateCompanySettings({ [key]: checked }, { id: user.id, name: user.name });
                                        }}
                                        disabled={!isSuperAdmin || !formData.enableProfileActivity}
                                        className="scale-90"
                                    />
                                    <Label htmlFor="profile-activity-admin-only" className="text-xs text-muted-foreground">Visível apenas para Administradores</Label>
                                </div>
                            </div>

                            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-primary" />
                                        <Label className="text-base">Módulo Multi-Empresas (Multi-Tenant)</Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Permite criar e alternar entre múltiplas contas/empresas independentes no sistema. Quando desativado, o seletor de contas é ocultado.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.enableMultiTenant}
                                    onCheckedChange={(checked) => {
                                        setFormData(prev => ({ ...prev, enableMultiTenant: checked }));
                                        if (user) updateCompanySettings({ enableMultiTenant: checked }, { id: user.id, name: user.name });
                                    }}
                                    disabled={!isSuperAdmin}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* WhatsApp */}
                <TabsContent value="whatsapp" className="mt-6 space-y-6">
                    <Card className="card-elevated border-none shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-green-500" />
                                Configuração de WhatsApp
                            </CardTitle>
                            <CardDescription>
                                Configure notificações automáticas e modelos de mensagem. Não requer API paga.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between rounded-lg border p-4 bg-green-50/50">
                                <div className="space-y-0.5">
                                    <Label className="text-base">Notificações Automáticas</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Abrir WhatsApp automaticamente ao registar clientes ou pagamentos.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.whatsappAutoNotify}
                                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, whatsappAutoNotify: checked }))}
                                    disabled={!isSuperAdmin}
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Modelos de Mensagem</h3>
                                    {isAdmin && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setIsAddingTemplate(!isAddingTemplate)}
                                            className="text-[10px] font-bold"
                                        >
                                            {isAddingTemplate ? 'Cancelar' : '+ Novo Modelo'}
                                        </Button>
                                    )}
                                </div>

                                {isAddingTemplate && (
                                    <Card className="border-primary/20 bg-primary/5">
                                        <CardContent className="pt-4 space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Nome do Modelo</Label>
                                                    <Input
                                                        value={newTemplate.name}
                                                        onChange={e => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                                                        placeholder="Ex: Lembrete de Cobrança"
                                                        className="h-8 text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Tipo</Label>
                                                    <select
                                                        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                                                        value={newTemplate.type}
                                                        onChange={e => setNewTemplate(prev => ({ ...prev, type: e.target.value }))}
                                                    >
                                                        <option value="custom">Personalizado</option>
                                                        <option value="marketing">Marketing</option>
                                                        <option value="reminder">Lembrete</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Conteúdo da Mensagem</Label>
                                                <Textarea
                                                    value={newTemplate.content}
                                                    onChange={e => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                                                    placeholder="Escreva sua mensagem aqui..."
                                                    className="min-h-[80px] text-sm"
                                                />
                                            </div>
                                            <Button
                                                className="w-full h-8 text-xs"
                                                onClick={async () => {
                                                    if (!newTemplate.name || !newTemplate.content) {
                                                        toastNotify({ title: "Preencha todos os campos", variant: "destructive" });
                                                        return;
                                                    }
                                                    await addMessageTemplate({
                                                        id: 'custom_' + Date.now(),
                                                        ...newTemplate
                                                    });
                                                    setNewTemplate({ name: '', type: 'custom', content: '' });
                                                    setIsAddingTemplate(false);
                                                    toastNotify({ title: "Modelo adicionado com sucesso" });
                                                }}
                                            >
                                                Adicionar Modelo
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}

                                <div className="grid gap-4">
                                    {messageTemplates.map((template) => {
                                        const typeLabels: Record<string, string> = {
                                            'registration': 'CADASTRO',
                                            'reminder': 'LEMBRETE',
                                            'confirmation': 'CONFIRMAÇÃO',
                                            'custom': 'PERSONALIZADO',
                                            'marketing': 'MARKETING',
                                            'warning': 'AVISO',
                                            'error': 'ERRO'
                                        };

                                        return (
                                            <div key={template.id} className="space-y-2 border rounded-lg p-4 bg-background shadow-sm hover:border-primary/30 transition-colors group">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <Label className="font-bold">{template.name}</Label>
                                                        <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold border border-primary/20">
                                                            {typeLabels[template.type] || template.type.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    {!template.isDefault && isSuperAdmin && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => deleteMessageTemplate(template.id)}
                                                        >
                                                            <RefreshCw className="h-3 w-3 rotate-45" />
                                                        </Button>
                                                    )}
                                                </div>
                                                <Textarea
                                                    value={template.content}
                                                    onChange={(e) => {
                                                        if (isAdmin) updateMessageTemplate(template.id, e.target.value);
                                                    }}
                                                    className={cn(
                                                        "min-h-[100px] text-sm bg-muted/20",
                                                        !isAdmin && "cursor-not-allowed opacity-70"
                                                    )}
                                                    disabled={!isAdmin}
                                                    title={isAdmin ? 'Modelo editavel' : 'Campo bloqueado para este utilizador'}
                                                />
                                                <div className="space-y-1 bg-muted/10 p-2 rounded border border-dashed">
                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                                                        <Palette className="h-3 w-3" /> Variaveis disponiveis em portugues:
                                                    </p>
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        {[
                                                            ['{nome_cliente}', 'Nome do cliente'],
                                                            ['{empresa}', 'Sua empresa'],
                                                            ['{valor}', 'Valor'],
                                                            ['{data_vencimento}', 'Data de vencimento'],
                                                            ['{limite_credito}', 'Limite aprovado'],
                                                            ['{saldo_devedor}', 'Saldo devedor'],
                                                            ['{dias_atraso}', 'Dias de atraso'],
                                                            ['{detalhe_dividas}', 'Detalhe das dividas'],
                                                        ].map(([token, label]) => (
                                                            <span key={token} className="text-[10px] bg-white border px-1.5 py-0.5 rounded text-blue-600 font-mono">
                                                                {token} <span className="text-muted-foreground">({label})</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {!isAdmin && (
                                                        <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                                                            <Lock className="h-3 w-3" />
                                                            Edicao bloqueada. Apenas administradores podem alterar modelos.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end bg-slate-50/50 border-t px-6 py-4">
                            {isAdmin && (
                                <Button onClick={handleSaveGeneral} className="gap-2 bg-green-600 hover:bg-green-700">
                                    <Save className="h-4 w-4" />
                                    Gravar Configuração WhatsApp
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Contas */}
                <TabsContent value="banking" className="mt-6 space-y-6">
                    <Card className="card-elevated border-none shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Landmark className="h-5 w-5 text-primary" />
                                Contas Bancárias da Empresa
                            </CardTitle>
                            <CardDescription>
                                Faça a gestão das contas bancárias que aparecerão nos contratos e fichas de cliente.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isAdmin && (
                                <div className="p-4 bg-primary/5 border border-dashed border-primary/20 rounded-xl">
                                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                                        <Plus className="h-4 w-4" /> Adicionar Nova Conta
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-2">
                                            <Label>Banco</Label>
                                            <select
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                value={newBank.bankName}
                                                onChange={(e) => {
                                                    const selectedBankName = e.target.value;
                                                    const bankDetails = ANGOLAN_BANKS.find(b => b.name === selectedBankName);
                                                    setNewBank(prev => ({
                                                        ...prev,
                                                        bankName: selectedBankName,
                                                        iban: bankDetails ? `AO06 ${bankDetails.code} ` : prev.iban
                                                    }));
                                                }}
                                            >
                                                <option value="">Selecionar Banco...</option>
                                                {ANGOLAN_BANKS.map(b => (
                                                    <option key={b.code} value={b.name}>{b.name} ({b.code})</option>
                                                ))}
                                                <option value="OUTRO">Outro Banco...</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>IBAN (AO06...)</Label>
                                            <Input
                                                placeholder="AO06 0000 0000 0000 0000 0"
                                                value={newBank.iban}
                                                onChange={(e) => {
                                                    const formatted = formatAngolanIBAN(e.target.value);
                                                    const bankInfo = identifyBankFromIBAN(formatted);
                                                    setNewBank(prev => ({
                                                        ...prev,
                                                        iban: formatted,
                                                        bankName: bankInfo?.name || prev.bankName
                                                    }));
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Proprietário da Conta</Label>
                                            <Input
                                                placeholder="Nome da Empresa"
                                                value={newBank.holder}
                                                onChange={(e) => setNewBank(prev => ({ ...prev, holder: e.target.value }))}
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button className="w-full gap-2" onClick={handleAddBank}>
                                                <Plus className="h-4 w-4" /> Adicionar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-3">
                                {formData.bankingInfo?.length > 0 ? (
                                    formData.bankingInfo.map((bank: any) => (
                                        <div key={bank.id} className="flex items-center justify-between p-4 rounded-xl border bg-background hover:border-primary/30 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden">
                                                    {identifyBankFromIBAN(bank.iban) ? (
                                                        <span className="text-[10px] font-black text-primary uppercase tracking-tighter">
                                                            {identifyBankFromIBAN(bank.iban)?.shortName}
                                                        </span>
                                                    ) : (
                                                        <Landmark className="h-5 w-5 text-primary" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold">{bank.bankName || identifyBankFromIBAN(bank.iban)?.name || 'Banco não identificado'}</span>
                                                    <span className="text-xs font-mono text-muted-foreground">{bank.iban}</span>
                                                    {bank.holder && <span className="text-[10px] text-muted-foreground/70">Titular: {bank.holder}</span>}
                                                </div>
                                            </div>
                                            {isAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            bankingInfo: prev.bankingInfo.filter((b: any) => b.id !== bank.id)
                                                        }));
                                                    }}
                                                >
                                                    <Trash className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
                                        <Landmark className="h-8 w-8 text-muted/30 mx-auto mb-2" />
                                        <p className="text-xs text-muted-foreground font-medium">Nenhuma conta bancária configurada.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end border-t px-6 py-4">
                            {isAdmin && (
                                <Button onClick={handleSaveGeneral} className="gap-2">
                                    <Save className="h-4 w-4" />
                                    Gravar Bancos
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Contratos */}
                <TabsContent value="contracts" className="mt-6 space-y-6">
                    <Card className="card-elevated border-none shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <PenTool className="h-5 w-5 text-primary" />
                                Modelos de Contrato
                            </CardTitle>
                            <CardDescription>
                                Gestão de múltiplos modelos de contrato para diferentes tipos de negócio ou crédito.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isAdmin && (
                                <div className="p-4 bg-primary/5 border border-dashed border-primary/20 rounded-xl space-y-4">
                                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                                        <Plus className="h-4 w-4" /> Novo Modelo Customizado
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Nome do Modelo</Label>
                                            <Input
                                                placeholder="Ex: Contrato de Mútuo Particular"
                                                value={newContract.name}
                                                onChange={(e) => setNewContract(prev => ({ ...prev, name: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Categoria</Label>
                                            <select
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                value={newContract.type}
                                                onChange={(e) => setNewContract(prev => ({ ...prev, type: e.target.value }))}
                                            >
                                                <option value="custom">Personalizado</option>
                                                <option value="legal">Jurídico / Acordo</option>
                                                <option value="internal">Uso Interno</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Conteúdo do Contrato (Markdown Suportado)</Label>
                                        <Textarea
                                            placeholder="Escreva o texto do contrato aqui..."
                                            className="min-h-[200px] font-mono text-sm"
                                            value={newContract.content}
                                            onChange={(e) => setNewContract(prev => ({ ...prev, content: e.target.value }))}
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <Button className="gap-2" onClick={handleAddContractTemplate}>
                                            <Plus className="h-4 w-4" /> Criar Modelo
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-3">
                                {formData.contractTemplates?.length > 0 ? (
                                    formData.contractTemplates.map((tpl: any) => (
                                        <div key={tpl.id} className="p-4 rounded-xl border bg-background hover:border-primary/30 transition-all group space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                                        <FileText className="h-4 w-4 text-slate-500" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold">{tpl.name}</span>
                                                        <span className="text-[10px] uppercase font-bold text-primary">{tpl.type}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-primary group-hover:bg-primary/10 transition-colors"
                                                        onClick={() => setNewContract(tpl)}
                                                        title="Editar Modelo"
                                                    >
                                                        <PenTool className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive group-hover:bg-destructive/10 transition-colors"
                                                        onClick={() => {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                contractTemplates: prev.contractTemplates.filter((t: any) => t.id !== tpl.id)
                                                            }));
                                                        }}
                                                        title="Eliminar Modelo"
                                                    >
                                                        <Trash className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="p-2 bg-slate-50 rounded border text-[10px] font-mono text-muted-foreground line-clamp-2 italic">
                                                {tpl.content}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
                                        <PenTool className="h-8 w-8 text-muted/30 mx-auto mb-2" />
                                        <p className="text-xs text-muted-foreground font-medium">Nenhum modelo de contrato personalizado.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end border-t px-6 py-4">
                            {isAdmin && (
                                <Button onClick={handleSaveGeneral} className="gap-2">
                                    <Save className="h-4 w-4" />
                                    Gravar Todos os Modelos
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Email */}
                <TabsContent value="email" className="mt-6 space-y-6">
                    <Card className="card-elevated border-none shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Mail className="h-5 w-5 text-primary" />
                                Configuração de Email (SMTP)
                            </CardTitle>
                            <CardDescription>
                                Configure o envio de emails transacionais (boas-vindas, notificações) diretamente pelo sistema.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Servidor SMTP (Host)</Label>
                                    <Input
                                        placeholder="smtp.gmail.com"
                                        value={formData.smtpHost}
                                        onChange={(e) => setFormData(prev => ({ ...prev, smtpHost: e.target.value }))}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Porta</Label>
                                    <Input
                                        placeholder="587"
                                        value={formData.smtpPort}
                                        onChange={(e) => setFormData(prev => ({ ...prev, smtpPort: e.target.value }))}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email Remetente (Usuário)</Label>
                                    <Input
                                        placeholder="exemplo@gmail.com"
                                        type="email"
                                        value={formData.smtpUser}
                                        onChange={(e) => setFormData(prev => ({ ...prev, smtpUser: e.target.value }))}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Senha / App Password</Label>
                                    <Input
                                        id="smtpPassword"
                                        type="password"
                                        value={formData.smtpPassword}
                                        onChange={handleInputChange}
                                        placeholder="••••••••••••••••"
                                        className="font-mono"
                                        disabled={!isAdmin}
                                    />
                                    {formData.smtpHost.toLowerCase().includes('gmail') && (
                                        <div className="mt-3 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 space-y-2 animate-in fade-in zoom-in duration-300">
                                            <div className="flex gap-2 items-center text-amber-800 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                Configuração Obrigatória para Gmail
                                            </div>
                                            <p className="text-sm text-amber-700 dark:text-amber-400">
                                                Detectamos que está a usar o **Gmail**. O Google exige que use uma **"Senha de App"** de 16 dígitos em vez da sua senha de login normal.
                                            </p>
                                            <div className="pt-2">
                                                <a
                                                    href="https://myaccount.google.com/apppasswords"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm gap-2"
                                                >
                                                    <Key className="h-3 w-3" />
                                                    Gerar Senha de App Google
                                                </a>
                                            </div>
                                            <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80 italic">
                                                Nota: Deve ter a Verificação em Duas Etapas ativa na sua conta Google.
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label>Nome do Remetente</Label>
                                    <Input
                                        placeholder="Nome da Empresa"
                                        value={formData.smtpFromName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, smtpFromName: e.target.value }))}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="flex items-center space-x-2 pt-8">
                                    <Switch
                                        id="smtp-secure"
                                        checked={formData.smtpSecure}
                                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, smtpSecure: checked }))}
                                        disabled={!isAdmin}
                                    />
                                    <Label htmlFor="smtp-secure">Usar SSL/TLS (Secure)</Label>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-between border-t border-slate-100 px-6 py-4">
                            <div className="text-sm text-muted-foreground">
                                Recomendado: Gmail com App Password.
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={async () => {
                                        setSmtpTesting(true);
                                        try {
                                            const result = await window.electronAPI.sendEmail({
                                                smtpSettings: {
                                                    host: formData.smtpHost,
                                                    port: formData.smtpPort,
                                                    user: formData.smtpUser,
                                                    pass: formData.smtpPassword,
                                                    secure: formData.smtpSecure,
                                                    fromName: formData.smtpFromName
                                                },
                                                emailOptions: {
                                                    to: formData.smtpUser,
                                                    subject: 'Teste de Conexão Tango ERP',
                                                    text: 'Se você recebeu este email, a configuração SMTP está correta.'
                                                }
                                            });
                                            if (result.success) {
                                                toastNotify({ title: "Sucesso", description: "Email de teste enviado com sucesso!", variant: "default" });
                                            } else {
                                                let errorMessage = result.error;
                                                if (result.error?.includes('534-5.7.9') ||
                                                    result.error?.includes('535-5.7.8') ||
                                                    result.error?.toLowerCase().includes('application-specific password required')) {
                                                    errorMessage = "Gmail: É obrigatório usar uma 'Senha de App'. Aceda a myaccount.google.com/apppasswords para gerar uma.";
                                                }
                                                toastNotify({
                                                    title: "Erro no envio",
                                                    description: errorMessage,
                                                    variant: "destructive",
                                                    duration: 8000
                                                });
                                            }
                                        } catch (e) {
                                            toastNotify({ title: "Erro", description: "Erro de conexão", variant: "destructive" });
                                        } finally {
                                            setSmtpTesting(false);
                                        }
                                    }}
                                    disabled={smtpTesting || !formData.smtpUser || !formData.smtpPassword}
                                >
                                    {smtpTesting ? "Testando..." : "Testar Conexão"}
                                </Button>
                                {isAdmin && (
                                    <Button onClick={handleSaveGeneral}>
                                        <Save className="mr-2 h-4 w-4" />
                                        Salvar Configurações
                                    </Button>
                                )}
                            </div>
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Backup e Dados */}
                <TabsContent value="backup" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Exportar Base de Dados</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">Exporta o ficheiro `.sqlite` com todos os registos do sistema.</p>
                            <Button onClick={handleBackupExport} className="gap-2">
                                <Download className="h-4 w-4" />
                                Exportar agora
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Restaurar Backup</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <Input
                                    type="text"
                                    value={backupRecoveryKey}
                                    onChange={event => setBackupRecoveryKey(event.target.value.trim())}
                                    placeholder="Chave portátil TGRK-... (necessária noutro dispositivo)"
                                    autoComplete="off"
                                />
                                <Button type="button" variant="outline" onClick={handleShowBackupRecoveryKey}>
                                    Mostrar a chave deste dispositivo
                                </Button>
                            </div>
                            <p className="text-xs text-destructive mt-2">Atenção: substitui todos os dados atuais.</p>
                            <Button variant="destructive" onClick={handleBackupImport} className="mt-4">Selecionar e Restaurar Backup</Button>
                        </CardContent>
                    </Card>

                    <Card className="border-blue-100 bg-blue-50/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <RefreshCw className="h-5 w-5 text-blue-500" />
                                Manutenção e Otimização
                            </CardTitle>
                            <CardDescription>
                                Ferramentas para manter o sistema rápido e livre de erros.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-semibold">Otimizar Banco de Dados</p>
                                    <p className="text-xs text-muted-foreground">Recupera espaço e acelera consultas.</p>
                                </div>
                                <Button size="sm" variant="outline" onClick={handleOptimizeDB}>Otimizar</Button>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-semibold">Verificar Integridade</p>
                                    <p className="text-xs text-muted-foreground">Verifica se há corrupção nos dados.</p>
                                </div>
                                <Button size="sm" variant="outline" onClick={handleCheckIntegrity}>Verificar</Button>
                            </div>

                            {isAdmin && (
                                <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50/20">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-semibold text-red-600">Formatar Base de Dados</p>
                                        <p className="text-xs text-muted-foreground">Apaga todos os registos do sistema permanentemente.</p>
                                    </div>
                                    <Button size="sm" variant="destructive" onClick={handleFormatDatabase}>Formatar</Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Configurar Backup Automático Diário (Aba Independente) */}
                <TabsContent value="auto-backup" className="mt-6 space-y-6">
                    {/* Card de Status & Ativação */}
                    <Card className="border-emerald-200/60 dark:border-emerald-900/40 shadow-md overflow-hidden">
                        <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
                        <CardHeader className="bg-emerald-50/30 dark:bg-emerald-950/10">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                            <RefreshCw className="h-5 w-5" />
                                        </div>
                                        <CardTitle className="text-xl">Configurar Backup Automático</CardTitle>
                                    </div>
                                    <CardDescription>
                                        O sistema executa cópias de segurança diárias sozinho sem necessitar de intervenção manual.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-3 self-start sm:self-auto bg-background px-4 py-2 rounded-xl border shadow-xs">
                                    <div className="space-y-0.5 text-right">
                                        <Label htmlFor="auto-backup-toggle" className="text-xs font-bold cursor-pointer">
                                            {autoBackupConfig.enabled ? "AUTOMÁTICO ATIVO" : "AUTOMÁTICO INATIVO"}
                                        </Label>
                                        <p className="text-[10px] text-muted-foreground">
                                            {autoBackupConfig.enabled ? "Disparo diário ativo" : "Backup manual apenas"}
                                        </p>
                                    </div>
                                    <Switch
                                        id="auto-backup-toggle"
                                        checked={autoBackupConfig.enabled}
                                        onCheckedChange={(checked) => handleUpdateAutoBackup({ enabled: checked })}
                                        disabled={!isAdmin}
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {/* Resumo de Estado */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <Calendar className="h-3.5 w-3.5 text-primary" />
                                        Último Backup
                                    </div>
                                    <p className="text-sm font-bold text-foreground">
                                        {autoBackupConfig.lastAutoBackupTimestamp
                                            ? format(new Date(autoBackupConfig.lastAutoBackupTimestamp), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
                                            : "Ainda não executado"}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {autoBackupConfig.lastAutoBackupDate ? `Data: ${autoBackupConfig.lastAutoBackupDate}` : "Sem histórico recente"}
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <Clock className="h-3.5 w-3.5 text-emerald-600" />
                                        Horário Programado
                                    </div>
                                    <p className="text-sm font-bold text-foreground">
                                        {autoBackupConfig.scheduleTime === 'startup' ? 'Ao Iniciar o Sistema' : `${autoBackupConfig.scheduleTime} (Diariamente)`}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        Frequência: 1 vez por dia
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                                        Comportamento
                                    </div>
                                    <p className="text-sm font-bold text-foreground">
                                        {autoBackupConfig.mode === 'silent' ? 'Silencioso em 2º Plano' : 'Alerta Interativo Diário'}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {autoBackupConfig.notifyOnSuccess ? "Com notificação de sucesso" : "Sem notificação"}
                                    </p>
                                </div>
                            </div>

                            {/* Configurações de Horário e Modo */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                <div className="space-y-3 p-4 rounded-xl border bg-background">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold">Horário de Disparo Diário</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Escolha o momento do dia em que o backup automático deve ser processado.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                                        {[
                                            { val: 'startup', label: 'Ao Abrir' },
                                            { val: '08:00', label: '08:00' },
                                            { val: '12:00', label: '12:00' },
                                            { val: '18:00', label: '18:00' },
                                            { val: '22:00', label: '22:00' },
                                        ].map(item => (
                                            <button
                                                key={item.val}
                                                type="button"
                                                onClick={() => handleUpdateAutoBackup({ scheduleTime: item.val })}
                                                disabled={!isAdmin}
                                                className={cn(
                                                    "py-2 px-3 text-xs font-bold rounded-lg border transition-all text-center",
                                                    autoBackupConfig.scheduleTime === item.val
                                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                                        : "bg-muted/40 hover:bg-muted text-foreground border-border"
                                                )}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3 p-4 rounded-xl border bg-background">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold">Tipo de Disparo</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Defina como o sistema deve agir ao chegar a hora do backup diário.
                                        </p>
                                    </div>
                                    <div className="space-y-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateAutoBackup({ mode: 'silent' })}
                                            disabled={!isAdmin}
                                            className={cn(
                                                "w-full p-3 rounded-lg border text-left transition-all flex items-start gap-3",
                                                autoBackupConfig.mode === 'silent'
                                                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-800"
                                                    : "bg-muted/20 border-border hover:bg-muted/40"
                                            )}
                                        >
                                            <div className="p-1 rounded bg-emerald-500/10 text-emerald-600 mt-0.5">
                                                <RefreshCw className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold">Automático Silencioso (Recomendado)</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Gera o backup sozinho sem interromper o trabalho e avisa no final.
                                                </p>
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleUpdateAutoBackup({ mode: 'interactive' })}
                                            disabled={!isAdmin}
                                            className={cn(
                                                "w-full p-3 rounded-lg border text-left transition-all flex items-start gap-3",
                                                autoBackupConfig.mode === 'interactive'
                                                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-800"
                                                    : "bg-muted/20 border-border hover:bg-muted/40"
                                            )}
                                        >
                                            <div className="p-1 rounded bg-emerald-500/10 text-emerald-600 mt-0.5">
                                                <Clock className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold">Alerta Diário Interativo</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Abre uma caixa de diálogo diária na tela para confirmar com 1 clique.
                                                </p>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Opções Adicionais & Retenção */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border bg-muted/20">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-semibold">Notificar após sucesso</p>
                                        <p className="text-[10px] text-muted-foreground">Adiciona alerta no painel de notificações.</p>
                                    </div>
                                    <Switch
                                        checked={autoBackupConfig.notifyOnSuccess}
                                        onCheckedChange={(checked) => handleUpdateAutoBackup({ notifyOnSuccess: checked })}
                                        disabled={!isAdmin}
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-semibold">Histórico de Retenção</p>
                                        <p className="text-[10px] text-muted-foreground">Guardar registos dos últimos dias.</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {[7, 15, 30].map(days => (
                                            <Button
                                                key={days}
                                                size="sm"
                                                variant={autoBackupConfig.retentionDays === days ? "default" : "outline"}
                                                onClick={() => handleUpdateAutoBackup({ retentionDays: days })}
                                                className="h-7 text-xs px-2.5"
                                                disabled={!isAdmin}
                                            >
                                                {days}d
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-muted/30 border-t flex flex-col sm:flex-row items-center justify-between gap-4 p-5">
                            <div className="text-xs text-muted-foreground">
                                As configurações são guardadas automaticamente ao alterar.
                            </div>
                            <Button
                                onClick={handleRunAutoBackupTest}
                                disabled={isTestingAutoBackup}
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                            >
                                <RefreshCw className={cn("h-4 w-4", isTestingAutoBackup && "animate-spin")} />
                                {isTestingAutoBackup ? "A Executar Cópia..." : "Testar Execução do Backup Automático Agora"}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Histórico dos Backups Automáticos */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Database className="h-4 w-4 text-primary" />
                                    Histórico de Backups Automáticos
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Registos detalhados das execuções automáticas diárias.
                                </CardDescription>
                            </div>
                            {autoBackupLogs.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClearAutoBackupLogs}
                                    className="text-xs h-8 text-muted-foreground hover:text-destructive"
                                >
                                    Limpar Histórico
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            {autoBackupLogs.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed rounded-xl bg-muted/10">
                                    <Database className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-muted-foreground">Nenhum registo de backup automático ainda</p>
                                    <p className="text-xs text-muted-foreground/80 mt-1">
                                        Assim que o agendamento diário for acionado ou clicar em testar, os registos aparecerão aqui.
                                    </p>
                                </div>
                            ) : (
                                <div className="border rounded-xl overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="text-xs">Data & Hora</TableHead>
                                                <TableHead className="text-xs">Tipo</TableHead>
                                                <TableHead className="text-xs">Status</TableHead>
                                                <TableHead className="text-xs">Detalhes</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {autoBackupLogs.slice(0, 10).map((log) => (
                                                <TableRow key={log.id} className="text-xs">
                                                    <TableCell className="font-mono whitespace-nowrap">
                                                        {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss")}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-[10px] uppercase font-bold">
                                                            {log.triggerType === 'manual_test' ? 'Teste' : log.triggerType === 'startup' ? 'Abertura' : 'Agendado'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {log.status === 'success' ? (
                                                            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs">
                                                                <CheckCircle2 className="h-3.5 w-3.5" /> Sucesso
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-destructive font-bold text-xs">
                                                                <AlertCircle className="h-3.5 w-3.5" /> Falha
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground truncate max-w-md" title={log.message}>
                                                        {log.message}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Cloud Sync */}
                <TabsContent value="cloud" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Cloud className="h-5 w-5 text-blue-500" />
                                Sincronização com a Nuvem / Rede Local
                            </CardTitle>
                            <CardDescription>
                                Configure a sincronização de dados entre máquinas ou nuvem.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* Modo Servidor LAN */}
                            <div className="rounded-lg border bg-slate-50 p-4 border-l-4 border-l-blue-500">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="space-y-0.5">
                                        <Label className="text-base font-semibold text-blue-900">Modo Servidor (Esta Máquina)</Label>
                                        <p className="text-sm text-slate-600">
                                            Torna este computador o servidor principal da rede local.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={serverInfo?.isRunning || false}
                                        onCheckedChange={handleToggleServerMode}
                                        disabled={!isAdmin}
                                    />
                                </div>

                                {serverInfo?.isRunning && (
                                    <div className="space-y-4 mt-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200/50 shadow-sm space-y-4">
                                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                                                <Globe className="h-3 w-3" /> ENDEREÇOS PARA OUTRAS MÁQUINAS
                                            </p>

                                            <div className="grid gap-4">
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">OPÇÃO 1: POR IP (Pode haver vários se tiver Wi-Fi e Ethernet)</p>
                                                    <div className="flex flex-col gap-2">
                                                        {(serverInfo.ips && serverInfo.ips.length > 0 ? serverInfo.ips : [serverInfo.ip]).map((ip, idx) => (
                                                            <div key={idx} className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 100}ms` }}>
                                                                <code className="bg-white px-3 py-1.5 rounded-lg border border-blue-200 text-base font-mono font-bold text-blue-700 shadow-sm flex-grow">
                                                                    http://{ip}:3000/sync
                                                                </code>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-9 text-xs border-blue-200 bg-white hover:bg-blue-50 text-blue-600 shrink-0"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(`http://${ip}:3000/sync`);
                                                                        toastNotify({ title: `IP ${ip} copiado!` });
                                                                    }}
                                                                >
                                                                    Copiar
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">OPÇÃO 2: POR NOME (RECOMENDADO / MAIS ESTÁVEL)</p>
                                                    <div className="flex items-center gap-3">
                                                        <code className="bg-white px-3 py-1.5 rounded-lg border border-blue-200 text-lg font-mono font-bold text-emerald-700 shadow-sm truncate flex-grow">
                                                            http://{serverInfo.hostname}:3000/sync
                                                        </code>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-9 text-xs border-blue-200 bg-white hover:bg-blue-50 text-emerald-600 shrink-0"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(`http://${serverInfo.hostname}:3000/sync`);
                                                                toastNotify({ title: "Nome do Computador copiado!" });
                                                            }}
                                                        >
                                                            Copiar
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>

                                            <p className="text-xs text-blue-600/70 mt-1 font-medium bg-blue-100/30 p-2 rounded-lg border border-blue-100">
                                                DICA: Use o <strong>NOME (Opção 2)</strong> nos outros computadores. Assim não precisa mudar o URL se o IP do servidor alterar.
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center px-1">
                                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-primary" />
                                                    Máquinas Conetadas ({connectedClients.length})
                                                </h3>
                                            </div>

                                            <div className="grid gap-2">
                                                {connectedClients.length > 0 ? (
                                                    connectedClients.map((client: any) => (
                                                        <div key={client.ip} className="flex items-center justify-between p-3 rounded-xl border bg-background hover:border-primary/30 transition-all group">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-full ${client.status === 'offline' ? 'bg-slate-100' : 'bg-emerald-100'} flex items-center justify-center transition-colors`}>
                                                                    <Wifi className={`h-5 w-5 ${client.status === 'offline' ? 'text-slate-400' : 'text-emerald-600'}`} />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-bold text-slate-800">{client.hostname || 'Dispositivo'}</span>
                                                                        <Badge className={`text-[9px] ${client.status === 'offline' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-600'} border-none font-mono`}>{client.ip}</Badge>
                                                                        {client.platform === 'web' && <Badge variant="outline" className="text-[8px] h-3.5 px-1 uppercase opacity-70">Web</Badge>}
                                                                        {client.platform === 'app' && <Badge variant="secondary" className="text-[8px] h-3.5 px-1 uppercase opacity-70">App</Badge>}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`text-[10px] font-bold uppercase ${client.status === 'offline' ? 'text-slate-400' : 'text-emerald-600'}`}>
                                                                            {client.status === 'offline' ? 'Desconectado' : 'Online'}
                                                                        </span>
                                                                        <span className="text-slate-300">•</span>
                                                                        <span className="text-[10px] text-slate-500">
                                                                            Entrou: {new Date(client.connectTime).toLocaleTimeString('pt-AO')}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-right">
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 leading-none uppercase">Visto por último</p>
                                                                    <p className="text-[10px] font-bold text-slate-600">{new Date(client.lastSeen).toLocaleTimeString('pt-AO')}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
                                                        <Cloud className="h-8 w-8 text-muted/30 mx-auto mb-2" />
                                                        <p className="text-xs text-muted-foreground italic font-medium">
                                                            Nenhuma outra máquina ligada ao seu servidor ainda.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="relative flex py-6 items-center">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink-0 mx-4 text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">OU CONECTAR COMO CLIENTE</span>
                                <div className="flex-grow border-t border-slate-200"></div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Laptop className="h-4 w-4 text-primary" />
                                    <h3 className="text-sm font-bold">Configuração de Máquina Escrava (Cliente)</h3>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Se este computador não for o servidor principal, ative a opção abaixo e introduza o URL do computador que está a atuar como servidor.
                                </p>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <Label className="text-base">Sincronização Cloud</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Ative para desbloquear e configurar a sincronização com o servidor remoto.
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.syncEnabled}
                                    onCheckedChange={handleSwitchChange}
                                    disabled={!isSuperAdmin || serverInfo?.isRunning} // Disable if acting as server
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="syncUrl" className="flex items-center justify-between">
                                    <span>URL da API (Servidor Local ou Nuvem)</span>
                                    {formData.syncEnabled && !serverInfo?.isRunning && (
                                        <button
                                            type="button"
                                            onClick={handleTestSyncUrl}
                                            disabled={isTestingUrl}
                                            className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-tighter"
                                        >
                                            {isTestingUrl ? 'A Testar...' : 'Testar Ligação'}
                                        </button>
                                    )}
                                </Label>
                                <Input
                                    id="syncUrl"
                                    value={formData.syncUrl}
                                    onChange={handleInputChange}
                                    placeholder="http://192.168.1.X:3000/sync"
                                    disabled={!formData.syncEnabled || !isSuperAdmin}
                                    className={cn(formData.syncEnabled && !formData.syncUrl && "border-amber-300 bg-amber-50/20")}
                                />
                                {formData.syncEnabled && !formData.syncUrl && (
                                    <p className="text-[10px] text-amber-600 font-medium">
                                        Introduza o URL que aparece no Computador Servidor.
                                    </p>
                                )}
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="syncApiKey">Chave de Sincronização Cloud</Label>
                                <div className="relative">
                                    <Input
                                        id="syncApiKey"
                                        type="password"
                                        value={formData.syncApiKey}
                                        onChange={handleInputChange}
                                        placeholder="Código de Acesso da empresa emitido pelo Tango Master"
                                        className="font-mono"
                                        disabled={!formData.syncEnabled || !isSuperAdmin}
                                    />
                                </div>
                            </div>

                            {companySettings?.lastSync && (
                                <p className="text-sm text-muted-foreground">
                                    Última sincronização: {formatDateSafe(companySettings.lastSync)}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter className="justify-between border-t px-6 py-4">
                            <Button variant="outline" onClick={() => (syncData as any)()} disabled={!formData.syncEnabled || serverInfo?.isRunning}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Sincronizar Agora
                            </Button>
                            {isAdmin && (
                                <Button onClick={handleSaveGeneral}>
                                    <Save className="mr-2 h-4 w-4" />
                                    Salvar Configuração
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                    <ConflictReview actorId={user?.id} actorName={user?.name} canManage={isAdmin} />
                </TabsContent>

                {/* Assinaturas */}
                <TabsContent value="signatures" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <PenTool className="h-5 w-5 text-purple-500" />
                                Configuração de Assinaturas
                            </CardTitle>
                            <CardDescription>
                                Gerencie quem pode assinar digitalmente os documentos e contratos da empresa.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between rounded-lg border p-4 bg-purple-50/50 dark:bg-purple-900/10 dark:border-purple-800">
                                <div className="space-y-0.5">
                                    <Label className="text-base text-purple-900 dark:text-purple-300">Ativar Assinatura Digital</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Permite incluir assinaturas digitalizadas nos contratos gerados pelo sistema.
                                    </p>
                                </div>
                                <Switch
                                    checked={Boolean(formData.digitalSignatureEnabled)}
                                    onCheckedChange={handleToggleSignature}
                                    disabled={!isSuperAdmin}
                                />
                            </div>

                            {formData.digitalSignatureEnabled && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <Label>Signatários Autorizados</Label>
                                        <Button
                                            onClick={() => setIsUserSelectModalOpen(true)}
                                            disabled={!isAdmin}
                                            size="sm"
                                            className="gap-2"
                                        >
                                            <Users className="h-4 w-4" />
                                            Adicionar Signatário
                                        </Button>
                                    </div>

                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/50">
                                                    <TableHead>Nome</TableHead>
                                                    <TableHead>Cargo</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Ações</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {(Array.isArray(formData.authorizedSigners) ? formData.authorizedSigners : []).length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                            Nenhum signatário adicionado.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    (Array.isArray(formData.authorizedSigners) ? formData.authorizedSigners : []).map((signerId: string) => {
                                                        const signerUser = users.find(u => u.id === signerId || u.name === signerId);
                                                        const name = signerUser ? signerUser.name : signerId;
                                                        const role = signerUser
                                                            ? (signerUser.role === 'super_admin' ? 'Super Administrador' : signerUser.role === 'admin' ? 'Administrador' : 'Gestor')
                                                            : 'N/A';

                                                        return (
                                                            <TableRow key={signerId}>
                                                                <TableCell className="font-medium">{name}</TableCell>
                                                                <TableCell>
                                                                    <Badge variant="outline" className="font-normal text-xs uppercase tracking-tight">
                                                                        {role}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full w-fit">
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        Autorizado
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => handleRemoveSigner(signerId)}
                                                                        disabled={!isAdmin}
                                                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="justify-end border-t px-6 py-4 bg-slate-50/50 dark:bg-slate-900/20">
                            {isAdmin && (
                                <Button onClick={handleSaveGeneral}>
                                    <Save className="mr-2 h-4 w-4" />
                                    Salvar Assinaturas
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Sobre */}
                <TabsContent value="about" className="mt-6">
                    <Card className="border-none shadow-xl overflow-hidden bg-slate-50 dark:bg-slate-900/40">
                        <CardHeader className="text-center pb-2">
                            <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-3xl shadow-lg mx-auto mb-4 flex items-center justify-center border-4 border-primary/10">
                                <Building2 className="h-12 w-12 text-primary" />
                            </div>
                            <CardTitle className="text-3xl font-black tracking-tighter">Tango Gestão de Créditos</CardTitle>
                            <CardDescription className="text-primary font-bold">Versão 3.0.0 "Professional Edition"</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8 p-8">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h3 className="font-bold text-lg flex items-center gap-2">
                                        <Building2 className="h-5 w-5 text-primary" />
                                        Desenvolvimento
                                    </h3>
                                    <div className="space-y-2 text-sm">
                                        <p className="font-bold text-slate-800 dark:text-slate-200">DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA</p>
                                        <p className="text-muted-foreground text-xs leading-relaxed">
                                            Líder em inovação tecnológica para microcrédito e gestão empresarial estratégica em Angola.
                                        </p>
                                        <p className="text-muted-foreground italic">Cuanza Norte, N´dalatando, Angola</p>
                                        <div className="flex flex-col gap-1 mt-4">
                                            <p className="flex items-center gap-2"><Mail className="h-4 w-4" /> pedromoraisjose9@gmail.com</p>
                                            <p className="flex items-center gap-2"><span className="font-bold">WhatsApp:</span> (+244) 941 537 486</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="font-bold text-lg flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5 text-emerald-600" />
                                        Licenciamento e Copyright
                                    </h3>
                                    <div className="space-y-3 text-sm">
                                        <p className="leading-relaxed">
                                            © 2025-2026 Tango Gestão de Créditos. Todos os direitos reservados.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                {/* Licença */}
                <TabsContent value="license" className="mt-6 space-y-6">
                    <Card className="card-elevated border-none shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-blue-500" />
                                Detalhes da Licença
                            </CardTitle>
                            <CardDescription>
                                Verifique o estado da sua licença e atualize a chave se necessário.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1">
                                        <Label className="text-sm font-semibold">Chave de Licença Atual</Label>
                                        <div className="relative">
                                            <Input
                                                type={showFullLicenseKey ? "text" : "password"}
                                                value={formData.licenseKey}
                                                onChange={(e) => setFormData(prev => ({ ...prev, licenseKey: e.target.value }))}
                                                className="font-mono pr-10"
                                                disabled={!isAdmin}
                                                placeholder="Insira a sua chave de licença"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowFullLicenseKey(!showFullLicenseKey)}
                                            >
                                                {showFullLicenseKey ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-1 bg-muted/20 p-4 rounded-lg border border-dashed">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Estado da Licença:</span>
                                            {previewLicense?.isValid ? (
                                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Ativa</Badge>
                                            ) : (
                                                <Badge variant="destructive">Inválida / Expirada</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Plano:</span>
                                            <span className="text-sm font-bold capitalize">{getLicenseTypeName(previewLicense?.type)}</span>
                                        </div>
                                        {previewLicense?.expiration && previewLicense?.expiration !== 'lifetime' && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium">Válida até:</span>
                                                <span className="text-sm font-bold">
                                                    {formatDateSafe(previewLicense.expiration)}
                                                </span>
                                            </div>
                                        )}
                                        {previewLicense?.expiration === 'lifetime' && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium">Válida até:</span>
                                                <span className="text-sm font-bold text-primary">Vitalícia</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">ID da Máquina:</span>
                                            <span className="text-xs font-mono text-muted-foreground break-all max-w-[200px] text-right">{machineId}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 h-full">
                                        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                                            <HelpCircle className="h-4 w-4" /> Precisa de Ajuda?
                                        </h4>
                                        <p className="text-sm text-blue-800/80 mb-4">
                                            Se deseja adquirir uma licença ou atualizar o seu plano atual, entre em contacto com a nossa equipa de suporte.
                                        </p>
                                        <Button 
                                            variant="outline" 
                                            className="w-full bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                                            onClick={() => openWhatsApp(SUPPORT_PHONE.replace(/\D/g, ''), "Olá, gostaria de saber mais sobre as licenças do Tango ERP.")}
                                        >
                                            Contactar Suporte
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end border-t px-6 py-4 bg-slate-50/50">
                            {isAdmin && (
                                <Button onClick={handleSaveGeneral}>
                                    <Save className="mr-2 h-4 w-4" />
                                    Validar e Salvar Licença
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
                variant={alertConfig.variant}
                showCancel={alertConfig.showCancel}
                actionLabel={alertConfig.actionLabel}
                onConfirm={alertConfig.onConfirm}
            />

            <input
                type="file"
                ref={logoInputRef}
                style={{ display: 'none' }}
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleWebFileChange('logo')}
            />
            <input
                type="file"
                ref={reportLogoInputRef}
                style={{ display: 'none' }}
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleWebFileChange('report')}
            />
            <input
                type="file"
                ref={watermarkLogoInputRef}
                style={{ display: 'none' }}
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleWebFileChange('watermark')}
            />
        </MainLayout >
    );
}
