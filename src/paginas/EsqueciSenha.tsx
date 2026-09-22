import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Shield, ArrowLeft, Key, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Alert, AlertDescription } from '@/componentes/ui/alert';
import { useToast } from '@/ganchos/usar-toast';

export default function ForgotPassword() {
    const navigate = useNavigate();
    const { rescueSuperAdmin } = useAuth();
    const { toast } = useToast();

    const [showRescueForm, setShowRescueForm] = useState(false);
    const [showNotifyForm, setShowNotifyForm] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [rescueKey, setRescueKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [notified, setNotified] = useState(false);
    const [showRescueKey, setShowRescueKey] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState('');

    const { requestPasswordReset } = useAuth();

    const handleRescue = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const cleanEmail = email.trim().toLowerCase();
        const cleanKey = rescueKey.trim();
        const tempPassword = await rescueSuperAdmin(cleanEmail, cleanKey);

        if (tempPassword) {
            setGeneratedPassword(tempPassword);
            setSuccess(true);
            toast({
                title: "Acesso Restaurado",
                description: "A senha do Super Administrador foi redefinida com sucesso.",
            });
        } else {
            setError('Chave de Resgate ou Email inválidos. Verifique os dados ou contacte o suporte.');
        }

        setLoading(false);
    };

    if (success) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden p-4">
                {/* Animated Background Blobs */}
                <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-72 h-72 bg-secondary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-accent/30 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

                <div className="relative w-full max-w-md animate-fade-in">
                    <Card className="glass border-white/20 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-success via-primary to-accent"></div>
                        <CardHeader className="text-center pb-6">
                            <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4 animate-scale-in" />
                            <CardTitle className="text-3xl font-bold">Sucesso!</CardTitle>
                            <CardDescription className="text-base">
                                A sua conta de Super Administrador foi recuperada com sucesso.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 text-center">
                            <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 shadow-inner">
                                <p className="text-sm font-medium text-muted-foreground mb-2">
                                    {notified ? "Solicitação de Recuperação:" : "Nova Senha Temporária:"}
                                </p>
                                {notified ? (
                                    <p className="text-xl font-bold text-primary italic leading-tight">
                                        Notificação enviada ao Super Administrador com sucesso.
                                    </p>
                                ) : (
                                    <code className="text-3xl font-black text-primary tracking-wider">{generatedPassword}</code>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {notified
                                    ? "O seu Administrador recebeu o seu pedido. Por favor, aguarde que ele redefina a sua senha no painel de gestão."
                                    : "Por favor, entre no sistema e altere esta senha imediatamente no seu perfil para garantir a segurança dos seus dados."}
                            </p>
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full h-12 text-lg font-bold shadow-gold hover:scale-[1.02] transition-transform"
                                onClick={() => navigate('/entrar')}
                            >
                                Ir para o Login
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden p-4">
            {/* Animated Background Blobs */}
            <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute top-0 -right-4 w-72 h-72 bg-secondary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-72 h-72 bg-accent/30 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

            <div className="relative w-full max-w-md animate-fade-in">
                <Card className="glass border-white/20 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-accent"></div>
                    <CardHeader className="pb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/entrar')}
                                className="h-10 w-10 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <CardTitle className="text-2xl font-bold tracking-tight">Recuperar Acesso</CardTitle>
                        </div>
                        <CardDescription className="text-base leading-relaxed">
                            {showRescueForm
                                ? "Espaço exclusivo para recuperação da conta mestre (Super Admin)."
                                : "Instruções para recuperação de credenciais em ambiente local."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {showRescueForm ? (
                            <form onSubmit={handleRescue} className="space-y-6 animate-slide-up">
                                {error && (
                                    <Alert variant="destructive" className="animate-scale-in">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="rescue-email" className="font-bold">Email do Super Admin</Label>
                                    <Input
                                        id="rescue-email"
                                        type="email"
                                        placeholder="admin@empresa.ao"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-11 rounded-xl border-primary/20 focus-visible:ring-primary shadow-sm"
                                        required
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="rescue-key" className="font-bold">Chave de Resgate (Master Key)</Label>
                                    <div className="relative">
                                        <Input
                                            id="rescue-key"
                                            type={showRescueKey ? "text" : "password"}
                                            placeholder="••••••••••••"
                                            value={rescueKey}
                                            onChange={(e) => setRescueKey(e.target.value)}
                                            className="h-11 rounded-xl pr-10 border-primary/20 focus-visible:ring-primary shadow-sm"
                                            required
                                            disabled={loading}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                            onClick={() => setShowRescueKey(!showRescueKey)}
                                            disabled={loading}
                                        >
                                            {showRescueKey ? (
                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </Button>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground/60 italic leading-relaxed">
                                        Esta chave foi fornecida durante a instalação ou pode ser consultada nas definições do sistema.
                                    </p>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-12 text-lg font-bold shadow-gold hover:scale-[1.02] transition-transform"
                                    disabled={loading}
                                >
                                    {loading ? "A validar credenciais..." : "Restaurar Acesso Master"}
                                </Button>

                                <Button
                                    variant="ghost"
                                    className="w-full text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                                    onClick={() => setShowRescueForm(false)}
                                    disabled={loading}
                                >
                                    Voltar às instruções gerais
                                </Button>
                            </form>
                        ) : showNotifyForm ? (
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                setLoading(true);
                                await requestPasswordReset(email, name);
                                setNotified(true);
                                setSuccess(true);
                                setLoading(false);
                            }} className="space-y-6 animate-slide-up">
                                <div className="space-y-2">
                                    <Label htmlFor="notify-name" className="font-bold">O seu Nome</Label>
                                    <Input
                                        id="notify-name"
                                        placeholder="Digite o seu nome completo"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="h-11 rounded-xl border-primary/20 shadow-sm"
                                        required
                                        disabled={loading}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="notify-email" className="font-bold">O seu Email</Label>
                                    <Input
                                        id="notify-email"
                                        type="email"
                                        placeholder="exemplo@empresa.ao"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-11 rounded-xl border-primary/20 shadow-sm"
                                        required
                                        disabled={loading}
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    className="w-full h-12 text-lg font-bold shadow-gold hover:scale-[1.02] transition-transform"
                                    disabled={loading}
                                >
                                    {loading ? "A processar..." : "Notificar Administrador Principal"}
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full text-xs font-bold uppercase"
                                    onClick={() => setShowNotifyForm(false)}
                                    disabled={loading}
                                >
                                    Voltar
                                </Button>
                            </form>
                        ) : (
                            <div className="space-y-8 animate-slide-up">
                                <div className="p-5 glass border-primary/10 rounded-2xl flex items-start gap-4 shadow-sm">
                                    <div className="bg-primary/10 p-2 rounded-xl">
                                        <Shield className="h-6 w-6 text-primary shrink-0" />
                                    </div>
                                    <div className="text-sm">
                                        <p className="font-bold text-primary mb-1 text-base">Sistema 100% Local</p>
                                        <p className="text-muted-foreground leading-relaxed">
                                            Por motivos de segurança e privacidade, os dados são processados apenas neste computador. O sistema não envia comunicações externas.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <h4 className="font-bold text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Utilizadores e Admins:</h4>
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-4 p-3 rounded-xl transition-colors hover:bg-primary/5">
                                            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">1</div>
                                            <p className="text-sm text-foreground/80 leading-relaxed font-medium">Contacte o seu <strong>Super Administrador</strong> responsável pelo sistema.</p>
                                        </div>
                                        <div className="flex items-start gap-4 p-3 rounded-xl transition-colors hover:bg-primary/5">
                                            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">2</div>
                                            <p className="text-sm text-foreground/80 leading-relaxed font-medium">Ele poderá redefinir a sua palavra-passe no menu de gestão de <strong>Utilizadores</strong>.</p>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="button"
                                    variant="link"
                                    className="w-full text-xs text-muted-foreground/60 hover:text-primary h-auto p-0 font-medium transition-colors mb-4"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setShowNotifyForm(true);
                                    }}
                                >
                                    Esqueci a minha senha (Administrador/Gestor)
                                </Button>

                                <Button
                                    type="button"
                                    variant="link"
                                    className="w-full text-xs text-muted-foreground/40 hover:text-primary h-auto p-0 font-medium transition-colors"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setShowRescueForm(true);
                                    }}
                                >
                                    Sou o Super Administrador e perdi o meu acesso mestre
                                </Button>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2 border-t border-white/10 pt-6">
                        <p className="text-[10px] text-center text-muted-foreground uppercase tracking-[0.25em] font-black opacity-40">
                            Segurança Local • {new Date().getFullYear()}
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}




