import { useState, useEffect } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency } from '@/bibliotecas/formatters';
import { Button } from '@/componentes/ui/button';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Label } from '@/componentes/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { ShieldCheck, Save, Info, AlertTriangle } from 'lucide-react';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import { UserLimit } from '@/tipos/credito';
import { Switch } from '@/componentes/ui/switch';

export default function UserLimits() {
    const { user } = useAuth();
    const { getUserLimit, updateUserLimit } = useData();

    const [adminLimit, setAdminLimit] = useState<UserLimit>({
        id: 'admin_default',
        role: 'admin',
        maxTransaction: 1000000,
        dailyLimit: 5000000,
        monthlyLimit: 20000000,
        restrictionsEnabled: false,
        updatedAt: new Date()
    } as UserLimit);

    const [managerLimit, setManagerLimit] = useState<UserLimit>({
        id: 'manager_default',
        role: 'manager',
        maxTransaction: 500000,
        dailyLimit: 2000000,
        monthlyLimit: 10000000,
        restrictionsEnabled: false,
        updatedAt: new Date()
    } as UserLimit);

    const [loading, setLoading] = useState(true);

    // Estados do Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalConfig, setModalConfig] = useState<{
        title: string;
        description: string;
        type: AlertModalType;
    }>({
        title: '',
        description: '',
        type: 'success'
    });

    useEffect(() => {
        const loadLimits = async () => {
            try {
                const admin = await getUserLimit('admin');
                const manager = await getUserLimit('manager');

                // Fallbacks to prevent blank fields if DB is empty
                setAdminLimit(admin || {
                    id: 'admin_default',
                    role: 'admin',
                    maxTransaction: 1000000,
                    dailyLimit: 5000000,
                    monthlyLimit: 20000000,
                    restrictionsEnabled: false,
                    updatedAt: new Date()
                } as UserLimit);

                setManagerLimit(manager || {
                    id: 'manager_default',
                    role: 'manager',
                    maxTransaction: 500000,
                    dailyLimit: 2000000,
                    monthlyLimit: 10000000,
                    restrictionsEnabled: false,
                    updatedAt: new Date()
                } as UserLimit);
            } catch (error) {
                console.error("Erro ao carregar limites:", error);
            } finally {
                setLoading(false);
            }
        };
        loadLimits();
    }, [getUserLimit]);

    const handleSave = async (role: 'admin' | 'manager', limit: UserLimit) => {
        try {
            await updateUserLimit(limit);
            setModalConfig({
                title: "Limites Atualizados",
                description: `Os limites para o cargo de ${role === 'admin' ? 'Administrador' : 'Gestor'} foram guardados com sucesso.`,
                type: 'success'
            });
            setModalOpen(true);
        } catch (error) {
            setModalConfig({
                title: "Erro ao Salvar",
                description: "Não foi possível atualizar os limites.",
                type: 'error'
            });
            setModalOpen(true);
        }
    };

    if (loading) return null;

    return (
        <MainLayout title="Limites de Transação" subtitle="Controle de tetos financeiros">
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Limites de Transação</h1>
                    <p className="text-muted-foreground">Defina os tetos financeiros para cada nível de acesso no sistema.</p>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 text-primary text-sm border border-primary/10">
                    <Info className="h-5 w-5 shrink-0" />
                    <p>As transações que excederem o <strong>"Limite p/ Transação"</strong> serão enviadas automaticamente para a fila de aprovações.</p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Admin Limits */}
                    <Card className="glass overflow-hidden border-blue-200/50 shadow-blue-500/10 flex flex-col h-full animate-fade-in">
                        <CardHeader className="bg-gradient-to-br from-blue-500/10 to-transparent border-b border-blue-100/30">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                                        <ShieldCheck className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-blue-900 text-xl">Administradores</CardTitle>
                                        <CardDescription className="text-blue-700/60 font-medium">Limites para cargos administrativos</CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md p-2 rounded-xl border border-blue-200/50 shadow-sm">
                                    <Label htmlFor="admin-toggle" className="text-[10px] font-black text-blue-800 cursor-pointer tracking-wider px-1">
                                        {adminLimit?.restrictionsEnabled ? 'ATIVADO' : 'DESATIVADO'}
                                    </Label>
                                    <Switch
                                        id="admin-toggle"
                                        checked={adminLimit?.restrictionsEnabled || false}
                                        onCheckedChange={(val) => setAdminLimit(prev => prev ? { ...prev, restrictionsEnabled: val } : null)}
                                        className="data-[state=checked]:bg-blue-600"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 flex flex-col flex-1 space-y-4">
                            <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={!adminLimit.restrictionsEnabled}>
                                <Label htmlFor="admin-max" className="font-semibold text-blue-900/70">Limite por Operação</Label>
                                <CurrencyInput
                                    id="admin-max"
                                    disabled={!adminLimit.restrictionsEnabled}
                                    value={adminLimit.maxTransaction}
                                    onValueChange={(val) => setAdminLimit({ ...adminLimit, maxTransaction: val })}
                                />
                                <p className="text-[10px] text-muted-foreground italic">Valor máximo permitido para um único crédito sem aprovação adicional.</p>
                            </div>
                            <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={!adminLimit.restrictionsEnabled}>
                                <Label htmlFor="admin-daily" className="font-semibold text-blue-900/70">Volume Máximo Diário</Label>
                                <CurrencyInput
                                    id="admin-daily"
                                    disabled={!adminLimit.restrictionsEnabled}
                                    value={adminLimit.dailyLimit}
                                    onValueChange={(val) => setAdminLimit({ ...adminLimit, dailyLimit: val })}
                                />
                                <p className="text-[10px] text-muted-foreground italic">Limite acumulado de créditos libertados em 24 horas.</p>
                            </div>
                            <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={!adminLimit.restrictionsEnabled}>
                                <Label htmlFor="admin-monthly" className="font-semibold text-blue-900/70">Volume Máximo Mensal</Label>
                                <CurrencyInput
                                    id="admin-monthly"
                                    disabled={!adminLimit.restrictionsEnabled}
                                    value={adminLimit.monthlyLimit}
                                    onValueChange={(val) => setAdminLimit({ ...adminLimit, monthlyLimit: val })}
                                />
                            </div>
                            <div className="mt-auto pt-4">
                                <Button
                                    className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200"
                                    onClick={() => handleSave('admin', adminLimit)}
                                >
                                    <Save className="h-4 w-4" />
                                    Guardar Configurações Administrativas
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Manager Limits */}
                    <Card className="glass overflow-hidden border-amber-200/50 shadow-amber-500/10 flex flex-col h-full animate-fade-in [animation-delay:200ms]">
                        <CardHeader className="bg-gradient-to-br from-amber-500/10 to-transparent border-b border-amber-100/30">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600 text-white shadow-lg shadow-amber-500/20">
                                        <ShieldCheck className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-amber-900 text-xl">Gestores de Crédito</CardTitle>
                                        <CardDescription className="text-amber-700/60 font-medium">Restrições para operações de balcão</CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md p-2 rounded-xl border border-amber-200/50 shadow-sm">
                                    <Label htmlFor="manager-toggle" className="text-[10px] font-black text-amber-800 cursor-pointer tracking-wider px-1">
                                        {managerLimit?.restrictionsEnabled ? 'ATIVADO' : 'DESATIVADO'}
                                    </Label>
                                    <Switch
                                        id="manager-toggle"
                                        checked={managerLimit?.restrictionsEnabled || false}
                                        onCheckedChange={(val) => setManagerLimit(prev => prev ? { ...prev, restrictionsEnabled: val } : null)}
                                        className="data-[state=checked]:bg-amber-600"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 flex flex-col flex-1 space-y-4">
                            <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={!managerLimit.restrictionsEnabled}>
                                <Label htmlFor="manager-max" className="font-semibold text-amber-900/70">Limite por Operação</Label>
                                <CurrencyInput
                                    id="manager-max"
                                    disabled={!managerLimit.restrictionsEnabled}
                                    value={managerLimit.maxTransaction}
                                    onValueChange={(val) => setManagerLimit({ ...managerLimit, maxTransaction: val })}
                                />
                                <p className="text-[10px] text-muted-foreground italic">Acima deste valor, o crédito ficará retido para aprovação admin.</p>
                            </div>
                            <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={!managerLimit.restrictionsEnabled}>
                                <Label htmlFor="manager-daily" className="font-semibold text-amber-900/70">Volume Máximo Diário</Label>
                                <CurrencyInput
                                    id="manager-daily"
                                    disabled={!managerLimit.restrictionsEnabled}
                                    value={managerLimit.dailyLimit}
                                    onValueChange={(val) => setManagerLimit({ ...managerLimit, dailyLimit: val })}
                                />
                                <p className="text-[10px] text-muted-foreground italic">Limite acumulado de créditos libertados por balcão em 24 horas.</p>
                            </div>
                            <div className="space-y-2 opacity-100 data-[disabled=true]:opacity-50 transition-opacity" data-disabled={!managerLimit.restrictionsEnabled}>
                                <Label htmlFor="manager-monthly" className="font-semibold text-amber-900/70">Volume Máximo Mensal</Label>
                                <CurrencyInput
                                    id="manager-monthly"
                                    disabled={!managerLimit.restrictionsEnabled}
                                    value={managerLimit.monthlyLimit}
                                    onValueChange={(val) => setManagerLimit({ ...managerLimit, monthlyLimit: val })}
                                />
                            </div>
                            <div className="mt-auto pt-4">
                                <Button
                                    className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-200"
                                    onClick={() => handleSave('manager', managerLimit)}
                                >
                                    <Save className="h-4 w-4" />
                                    Actualizar Limites Gestor
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="p-4 rounded-xl border border-warning/20 bg-warning/5 flex gap-3">
                    <AlertTriangle className="h-6 w-6 text-warning shrink-0" />
                    <div className="space-y-1">
                        <p className="text-sm font-bold text-warning-foreground">Atenção Crítica</p>
                        <p className="text-xs text-muted-foreground">Alterar estes limites afeta imediatamente a capacidade operativa de todos os utilizadores do respetivo cargo. Reduzir limites de volume pode travar operações legítimas se o teto diário/mensal já tiver sido atingido.</p>
                    </div>
                </div>
            </div>

            <AlertModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalConfig.title}
                description={modalConfig.description}
                type={modalConfig.type}
            />
        </MainLayout>
    );
}




