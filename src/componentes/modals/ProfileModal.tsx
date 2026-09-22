import { useState, useEffect } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/componentes/ui/card';
import { ROLES } from '@/tipos/autenticacao';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Camera, Mail, Shield, User, Clock, Globe, Activity, Calendar, Eye, EyeOff, Smartphone, ShieldCheck, QrCode } from 'lucide-react';
import { useToast } from '@/ganchos/usar-toast';
import QRCode from 'qrcode';
import { formatDateTimeFull } from '@/bibliotecas/formatters';
import { cn, getFileUrl } from '@/bibliotecas/utils';

export function ProfileModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { user, updateUser } = useAuth();
    const { companySettings, addLog, serverInfo } = useData();
    const { toast } = useToast();
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        type: 'success_premium' | 'success' | 'warning' | 'error';
        onConfirm?: () => void;
        showCancel?: boolean;
    }>({
        isOpen: false,
        title: '',
        description: '',
        type: 'success_premium'
    });

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        avatar: '',
        signature: '',
    });
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // 2FA State
    const { generate2FASecret, enable2FA, disable2FA } = useAuth();
    const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);
    const [twoFactorStep, setTwoFactorStep] = useState<'setup' | 'verify' | 'recovery'>('setup');
    const [twoFactorData, setTwoFactorData] = useState({ secret: '', qrDataUrl: '' });
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [verificationCode, setVerificationCode] = useState('');
    const [is2FALoading, setIs2FALoading] = useState(false);

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                email: user.email || '',
                avatar: user.avatar || '',
                signature: user.signature || '',
            });
            setAvatarLoadFailed(false);
        }
    }, [user, isOpen]);

    useEffect(() => {
        setAvatarLoadFailed(false);
    }, [formData.avatar]);

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (user) {
            await updateUser(user.id, formData);
            await addLog('update', 'user', `Atualizou dados do perfil pessoal`, user.id, user.name);
            setAlertConfig({
                isOpen: true,
                title: "Perfil Atualizado",
                description: "Os seus dados pessoais foram guardados com sucesso no servidor.",
                type: "success_premium"
            });
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast({
                title: "Erro",
                description: "As novas senhas não coincidem.",
                variant: "destructive",
            });
            return;
        }

        if (user) {
            await updateUser(user.id, { password: passwordData.newPassword });
            await addLog('update', 'user', `Alterou a própria palavra-passe`, user.id, user.name);
            setAlertConfig({
                isOpen: true,
                title: "Senha Alterada",
                description: "A sua credencial de acesso foi redefinida com sucesso. Use a nova senha no próximo início de sessão.",
                type: "success_premium"
            });
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        }
    };

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1024 * 1024) { // 1MB limit
                toast({
                    title: "Erro",
                    description: "A assinatura deve ter no máximo 1MB.",
                    variant: "destructive",
                });
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, signature: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEnable2FA = async () => {
        setIs2FALoading(true);
        try {
            const { secret, qrCode } = await generate2FASecret();
            const qrDataUrl = await QRCode.toDataURL(qrCode);
            setTwoFactorData({ secret, qrDataUrl });
            setTwoFactorStep('setup');
            setIs2FAModalOpen(true);
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível gerar o código 2FA.",
                variant: "destructive"
            });
        } finally {
            setIs2FALoading(false);
        }
    };

    const handleVerifyAndEnable = async () => {
        setIs2FALoading(true);
        try {
            const result = await enable2FA(twoFactorData.secret, verificationCode);
            if (result.success) {
                if (result.recoveryCodes?.length) {
                    setRecoveryCodes(result.recoveryCodes);
                    setTwoFactorStep('recovery');
                } else {
                    setIs2FAModalOpen(false);
                    setAlertConfig({
                        isOpen: true,
                        title: "2FA Ativado",
                        description: "A autenticação de dois fatores foi ativada com sucesso para sua conta.",
                        type: "success_premium"
                    });
                }
                setVerificationCode('');
            } else {
                toast({
                    title: "Código Inválido",
                    description: "O código introduzido está incorreto ou expirou.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            toast({
                title: "Erro",
                description: "Falha ao verificar o código.",
                variant: "destructive"
            });
        } finally {
            setIs2FALoading(false);
        }
    };

    const handleDisable2FA = async () => {
        setAlertConfig({
            isOpen: true,
            title: "Desativar 2FA?",
            description: "A sua conta ficará menos segura sem a autenticação de dois fatores. Tem a certeza que deseja continuar?",
            type: "warning",
            showCancel: true,
            onConfirm: () => {
                setTwoFactorStep('verify');
                setIs2FAModalOpen(true);
            }
        });
    };

    const handleConfirmDisable = async () => {
        setIs2FALoading(true);
        try {
            const success = await disable2FA(verificationCode);
            if (success) {
                setIs2FAModalOpen(false);
                setAlertConfig({
                    isOpen: true,
                    title: "2FA Desativado",
                    description: "A autenticação de dois fatores foi desativada.",
                    type: "warning"
                });
                setVerificationCode('');
            } else {
                toast({
                    title: "Código Inválido",
                    description: "O código introduzido está incorreto.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            toast({
                title: "Erro",
                description: "Falha ao desativar 2FA.",
                variant: "destructive"
            });
        } finally {
            setIs2FALoading(false);
        }
    };

    const compressImage = (base64: string, quality: number = 0.8): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                const MAX_SIZE = 1200;
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        });
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && user) {
            const sizeInMB = file.size / (1024 * 1024);
            const reader = new FileReader();
            reader.onloadend = async () => {
                let base64 = reader.result as string;

                if (sizeInMB > 2) {
                    base64 = await compressImage(base64, 0.7);
                }

                const filePath = await (window as any).electronAPI.saveAvatar(user.id, base64);
                if (filePath) {
                    const newFormData = { ...formData, avatar: filePath };
                    setFormData(newFormData);
                    await updateUser(user.id, newFormData);
                    await addLog('update', 'user', `Alterou a foto de perfil`, user.id, user.name);
                    toast({ title: "Sucesso", description: "Foto de perfil atualizada." });
                } else {
                    toast({ title: "Erro", description: "Falha ao gravar foto localmente.", variant: "destructive" });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleResetAvatar = async () => {
        if (user) {
            const newFormData = { ...formData, avatar: '' };
            setFormData(newFormData);
            await updateUser(user.id, newFormData);
            await addLog('update', 'user', `Removeu a foto de perfil (restaurou avatar padrão)`, user.id, user.name);
            toast({ title: "Sucesso", description: "Avatar padrão restaurado." });
        }
    };

    if (!user || !isOpen) return null;

    const userInitials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-[95vw] max-w-[1600px] max-h-[92vh] flex flex-col overflow-hidden p-0 border-none bg-slate-50 dark:bg-slate-900 shadow-2xl rounded-2xl">
                <DialogHeader className="p-8 pb-4 bg-slate-900 text-white rounded-t-2xl relative overflow-hidden shrink-0">
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm">
                            <User className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-bold text-white">Meu Perfil</DialogTitle>
                            <DialogDescription className="text-slate-300">Gerencie suas informações pessoais, assinatura e segurança</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid gap-6 md:grid-cols-3">
                        {/* Left Column: Avatar & Quick Info */}
                        <div className="md:col-span-1 space-y-6">
                            <Card className="border-none shadow-premium bg-card overflow-hidden">
                                <CardHeader className="text-center pb-2">
                                    <div className="relative mx-auto w-32 h-32 mb-4 group">
                                        <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white text-4xl font-black border-4 border-background shadow-2xl overflow-hidden relative ring-4 ring-primary/10">
                                            {formData.avatar && !avatarLoadFailed ? (
                                                <img
                                                    src={getFileUrl(formData.avatar) + (formData.avatar.startsWith('data:') ? '' : `?t=${new Date().getTime()}`)}
                                                    alt="Avatar"
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    onError={() => setAvatarLoadFailed(true)}
                                                />
                                            ) : (
                                                <span className="animate-in fade-in zoom-in duration-300">
                                                    {userInitials}
                                                </span>
                                            )}
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 border-4 border-background z-10 shadow-lg" title="Online" />
                                        <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-20 backdrop-blur-[2px]">
                                            <Camera className="h-8 w-8 text-white animate-in zoom-in-50 duration-200" />
                                            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                                        </label>
                                    </div>
                                    <CardTitle className="text-xl">{user.name}</CardTitle>
                                    <CardDescription className="font-medium text-primary/80">{ROLES[user.role].label}</CardDescription>
                                    {formData.avatar && (
                                        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-[10px] font-bold uppercase tracking-widest h-auto py-1.5 px-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                onClick={handleResetAvatar}
                                            >
                                                Resetar Foto
                                            </Button>
                                        </div>
                                    )}
                                </CardHeader>
                                <CardContent className="px-6 pb-6 pt-2">
                                    <div className="space-y-4 pt-4 border-t border-border">
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="p-2 rounded-lg bg-primary/5">
                                                <Mail className="h-4 w-4 text-primary/70" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Email</span>
                                                <span className="text-foreground font-medium">{user.email}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="p-2 rounded-lg bg-primary/5">
                                                <Shield className="h-4 w-4 text-primary/70" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Nível de Acesso</span>
                                                <span className="text-foreground font-medium">{ROLES[user.role].label}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3 pt-2">
                                            <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Membro desde</span>
                                                </div>
                                                <p className="text-xs font-semibold">{user.createdAt ? formatDateTimeFull(user.createdAt) : 'N/A'}</p>
                                            </div>

                                            <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Último Acesso</span>
                                                </div>
                                                <p className="text-xs font-semibold">{user.lastLogin ? formatDateTimeFull(user.lastLogin) : 'Acedido agora'}</p>
                                            </div>

                                            {serverInfo?.isRunning && (
                                                <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Globe className="h-3 w-3 text-muted-foreground" />
                                                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Endereço IP (Local)</span>
                                                    </div>
                                                    <p className="text-xs font-mono font-semibold">{serverInfo.ip || user.ip || '127.0.0.1'}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                        </div>

                        {/* Form Section */}
                        <Card className="md:col-span-2 border-none shadow-premium bg-card">
                            <CardHeader>
                                <CardTitle>Dados Pessoais</CardTitle>
                                <CardDescription>Atualize seu nome e endereço de e-mail</CardDescription>
                            </CardHeader>
                            <form onSubmit={handleProfileSubmit}>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Nome Completo</Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="name"
                                                    value={formData.name}
                                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                    className="pl-10"
                                                    placeholder="Seu nome"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                    className="pl-10"
                                                    placeholder="seu@email.com"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <Label>Assinatura Digital</Label>
                                        <div className="flex flex-col sm:flex-row gap-6 items-start">
                                            <div className="w-full sm:w-64 h-32 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/20 overflow-hidden relative group">
                                                {formData.signature ? (
                                                    <>
                                                        <img src={formData.signature} alt="Assinatura" className="max-w-full max-h-full object-contain" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={() => setFormData(prev => ({ ...prev, signature: '' }))}
                                                            >
                                                                Remover
                                                            </Button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="text-center p-4">
                                                        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                                        <p className="text-xs text-muted-foreground">Nenhuma assinatura carregada</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 space-y-3">
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Carregue o ficheiro da sua assinatura (formato PNG transparente recomendado).
                                                    Esta imagem será utilizada para assinar electronicamente contratos e outros documentos PDF.
                                                </p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="file"
                                                        id="signature-upload"
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={handleSignatureUpload}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => document.getElementById('signature-upload')?.click()}
                                                    >
                                                        {formData.signature ? "Alterar Assinatura" : "Carregar Assinatura"}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-border">
                                        <CardTitle className="text-lg mb-4">Segurança</CardTitle>
                                        <div className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="currentPassword">Senha Atual</Label>
                                                    <div className="relative">
                                                        <Input
                                                            id="currentPassword"
                                                            type={showCurrentPassword ? "text" : "password"}
                                                            value={passwordData.currentPassword}
                                                            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                                            placeholder="••••••••"
                                                            className="pr-10"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                        >
                                                            {showCurrentPassword ? (
                                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="newPassword">Nova Senha</Label>
                                                    <div className="relative">
                                                        <Input
                                                            id="newPassword"
                                                            type={showNewPassword ? "text" : "password"}
                                                            value={passwordData.newPassword}
                                                            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                                            placeholder="••••••••"
                                                            className="pr-10"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                                        >
                                                            {showNewPassword ? (
                                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                                                    <div className="relative">
                                                        <Input
                                                            id="confirmPassword"
                                                            type={showConfirmPassword ? "text" : "password"}
                                                            value={passwordData.confirmPassword}
                                                            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                                            placeholder="••••••••"
                                                            className="pr-10"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                        >
                                                            {showConfirmPassword ? (
                                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                            <Button type="button" onClick={handlePasswordSubmit} className="w-full sm:w-auto mt-2">
                                                Alterar Senha
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-border">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Smartphone className="h-5 w-5 text-primary" />
                                            <CardTitle className="text-lg">Autenticação de Dois Fatores (2FA)</CardTitle>
                                        </div>
                                        <div className="bg-muted/30 p-4 rounded-xl border border-border/50 flex flex-col md:flex-row gap-6 items-center">
                                            <div className={cn(
                                                "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                                                user.twoFactorEnabled ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                                            )}>
                                                {user.twoFactorEnabled ? <ShieldCheck className="h-8 w-8" /> : <Shield className="h-8 w-8" />}
                                            </div>
                                            <div className="flex-1 space-y-1 text-center md:text-left">
                                                <p className="font-bold text-foreground">
                                                    {user.twoFactorEnabled ? "Proteção 2FA Ativada" : "2FA Desativada"}
                                                </p>
                                                <p className="text-xs text-muted-foreground leading-relaxed">
                                                    {user.twoFactorEnabled
                                                        ? "A sua conta está protegida com uma camada adicional de segurança. Cada login exigirá um código do seu telemóvel."
                                                        : "Adicione uma camada extra de segurança à sua conta exigindo um código de verificação sempre que fizer login."}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant={user.twoFactorEnabled ? "destructive" : "default"}
                                                onClick={user.twoFactorEnabled ? handleDisable2FA : handleEnable2FA}
                                                disabled={is2FALoading}
                                            >
                                                {user.twoFactorEnabled ? "Desativar 2FA" : "Configurar 2FA"}
                                            </Button>
                                        </div>
                                    </div>

                                </CardContent>
                                <CardFooter className="flex justify-end gap-3 border-t border-border mt-6 pt-6">
                                    <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
                                    <Button type="submit">Guardar Alterações</Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </div>
                </div>

            </DialogContent>

            {/* 2FA Setup Dialog */}
            <Dialog open={is2FAModalOpen} onOpenChange={setIs2FAModalOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden">
                    <DialogHeader className="p-8 text-center bg-gradient-to-b from-primary/20 to-transparent border-b border-border/50 relative">
                        <div className="mx-auto h-16 w-16 rounded-[1.5rem] bg-white shadow-2xl shadow-primary/20 flex items-center justify-center mb-4 ring-4 ring-primary/10">
                            <QrCode className="h-8 w-8 text-primary animate-pulse" />
                        </div>
                        <DialogTitle className="text-2xl font-black tracking-tight mb-2">
                            {twoFactorStep === 'setup' ? "Configurar 2FA" : twoFactorStep === 'verify' ? "Verificar 2FA" : "Códigos de recuperação"}
                        </DialogTitle>
                        <DialogDescription className="text-sm font-medium">
                            {twoFactorStep === 'setup'
                                ? "Siga os passos abaixo para ativar a proteção extra."
                                : twoFactorStep === 'verify' ? "Introduza o código do seu aplicativo para confirmar."
                                    : "Guarde estes códigos num local seguro. Cada código só pode ser usado uma vez."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-8 space-y-8">
                        {twoFactorStep === 'recovery' ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-5">
                                    {recoveryCodes.map(code => (
                                        <code key={code} className="rounded-lg bg-background px-3 py-2 text-center font-mono text-sm font-bold select-all">
                                            {code}
                                        </code>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Estes códigos não voltarão a ser apresentados. Use um deles no ecrã de segundo fator caso perca o autenticador.
                                </p>
                                <Button className="w-full h-12 font-bold" onClick={() => {
                                    setRecoveryCodes([]);
                                    setIs2FAModalOpen(false);
                                }}>
                                    Já guardei os códigos
                                </Button>
                            </div>
                        ) : twoFactorStep === 'setup' ? (
                            <div className="space-y-8">
                                <div className="grid gap-4 bg-muted/30 p-5 rounded-2xl border border-border/50 shadow-inner">
                                    <div className="flex gap-4 items-start">
                                        <div className="h-7 w-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0 shadow-lg">1</div>
                                        <p className="text-sm text-slate-600 font-semibold leading-relaxed">Abra o Google Authenticator ou Microsoft Authenticator no seu telemóvel.</p>
                                    </div>
                                    <div className="flex gap-4 items-start">
                                        <div className="h-7 w-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0 shadow-lg">2</div>
                                        <p className="text-sm text-slate-600 font-semibold leading-relaxed">Digitalize o código QR abaixo ou introduza a chave manualmente.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center gap-6">
                                    <div className="relative group">
                                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                                        <div className="relative p-6 bg-white rounded-[2rem] border border-primary/10 shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
                                            {twoFactorData.qrDataUrl && <img src={twoFactorData.qrDataUrl} alt="QR Code" className="w-48 h-48" />}
                                        </div>
                                    </div>

                                    <div className="w-full text-center space-y-3">
                                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.2em]">Chave Manual</p>
                                        <div className="group relative">
                                            <p className="font-mono text-xs bg-slate-50 text-slate-800 px-6 py-3 rounded-2xl border border-slate-200 select-all break-all shadow-sm transition-all hover:border-primary/50">
                                                {twoFactorData.secret}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <Button className="w-full h-14 text-lg font-black bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all active:scale-[0.98]" onClick={() => setTwoFactorStep('verify')}>
                                    Já li o código, continuar
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-6 text-center">
                                <div className="space-y-2">
                                    <Label htmlFor="verificationCode" className="text-xs font-bold uppercase text-muted-foreground">Código de 6 Dígitos</Label>
                                    <Input
                                        id="verificationCode"
                                        type="text"
                                        placeholder="000 000"
                                        className="text-center text-3xl h-16 font-bold tracking-[0.5em] border-2 focus-visible:ring-primary"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        autoFocus
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Introduza o código de verificação gerado pelo seu aplicativo autenticador.
                                </p>
                                <div className="flex gap-3">
                                    {!user.twoFactorEnabled && (
                                        <Button variant="outline" className="flex-1" onClick={() => setTwoFactorStep('setup')}>
                                            Voltar
                                        </Button>
                                    )}
                                    <Button
                                        className="flex-[2] h-12 font-bold"
                                        disabled={verificationCode.length !== 6 || is2FALoading}
                                        onClick={user.twoFactorEnabled ? handleConfirmDisable : handleVerifyAndEnable}
                                    >
                                        {is2FALoading ? "Verificando..." : user.twoFactorEnabled ? "Desativar Agora" : "Ativar Proteção"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type === 'success_premium' ? 'success' : alertConfig.type}
            />
        </Dialog>
    );
}
