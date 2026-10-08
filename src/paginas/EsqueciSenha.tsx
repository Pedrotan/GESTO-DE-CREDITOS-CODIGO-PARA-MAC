import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { ShieldCheck, ArrowLeft, AlertCircle, CheckCircle2, Mail, ExternalLink, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/componentes/ui/alert';
import { requestPasswordReset } from '@/servicos/ServicoIdentidadeEmpresa';

export default function ForgotPassword() {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [devLink, setDevLink] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            setError('Por favor, introduza um endereço de e-mail válido.');
            setLoading(false);
            return;
        }

        try {
            const res = await requestPasswordReset(cleanEmail);
            if (res.devLink) {
                setDevLink(res.devLink);
            }
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Não foi possível solicitar a recuperação de senha neste momento. Verifique a ligação à internet.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-slate-950 overflow-hidden p-4 font-sans text-white">
                {/* Animated Background Glows */}
                <div className="absolute top-1/4 -left-12 w-80 h-80 bg-blue-600/15 rounded-full blur-[140px] pointer-events-none" />
                <div className="absolute bottom-1/4 -right-12 w-80 h-80 bg-emerald-600/15 rounded-full blur-[140px] pointer-events-none" />

                <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                    <Card className="border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
                        <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-500" />
                        <CardHeader className="text-center pb-4 pt-8">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                <CheckCircle2 className="h-9 w-9" />
                            </div>
                            <CardTitle className="text-2xl font-black tracking-tight text-white">Pedido Enviado!</CardTitle>
                            <CardDescription className="text-xs text-slate-400 mt-2">
                                Se o e-mail <strong>{email}</strong> estiver associado a um utilizador ativo, foi enviado um link de recuperação.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 text-center px-6">
                            <div className="p-4 bg-white/[0.04] rounded-2xl border border-white/10 text-left space-y-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                                    <ShieldCheck className="h-4 w-4" />
                                    <span>Segurança Reforçada (Tango Master Gen)</span>
                                </div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    Por motivos de conformidade, nunca enviamos senhas em texto limpo. O link de redefinição contém um token criptográfico único e expira em <strong>15 minutos</strong>.
                                </p>
                            </div>

                            {devLink && (
                                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-left space-y-2">
                                    <p className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">
                                        Ambiente de Testes / Desenvolvimento:
                                    </p>
                                    <a
                                        href={devLink.replace(/https?:\/\/[^/]+/, '') || devLink}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            const tokenMatch = devLink.match(/token=([^&]+)/);
                                            if (tokenMatch) {
                                                navigate(`/reset-password?token=${tokenMatch[1]}`);
                                            } else {
                                                window.location.href = devLink;
                                            }
                                        }}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 underline"
                                    >
                                        Abrir Link Seguro para Redefinir Senha <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                </div>
                            )}

                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                Abra o link recebido, crie a sua nova senha e, em seguida, volte à aplicação para iniciar sessão normalmente.
                            </p>
                        </CardContent>

                        <CardFooter className="pt-2 pb-8 px-6">
                            <Button
                                className="w-full h-12 text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl"
                                onClick={() => navigate('/entrar')}
                            >
                                Voltar para o Login
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-white overflow-hidden">
            {/* Background Glows */}
            <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-blue-600/15 blur-[140px] pointer-events-none" />
            <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-indigo-600/15 blur-[140px] pointer-events-none" />

            <div className="relative w-full max-w-md animate-in fade-in duration-300">
                <Card className="border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
                    <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500" />
                    <CardHeader className="pb-4 pt-7 px-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/entrar')}
                                className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/20">
                                    <Lock className="h-3 w-3" /> Tango Master Gen
                                </span>
                            </div>
                        </div>
                        <CardTitle className="text-2xl font-black tracking-tight text-white">Esqueci-me da Senha</CardTitle>
                        <CardDescription className="text-xs text-slate-400 leading-relaxed mt-1">
                            Insira o seu endereço de e-mail registado. Enviaremos um link criptográfico exclusivo com validade máxima de 15 minutos para redefinir a sua senha com segurança.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-5 px-6">
                        {error && (
                            <Alert variant="destructive" className="border-red-500/30 bg-red-500/10 text-red-200">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                                <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
                            </Alert>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="user-email" className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                    <Mail className="h-3.5 w-3.5 text-blue-400" /> E-mail do Utilizador
                                </Label>
                                <Input
                                    id="user-email"
                                    type="email"
                                    placeholder="exemplo@empresa.ao"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="h-11 rounded-xl bg-slate-950/70 border-white/10 text-sm text-white focus-visible:ring-blue-500"
                                    required
                                    disabled={loading}
                                    autoFocus
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-12 mt-2 text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl"
                            >
                                {loading ? 'A enviar pedido seguro...' : 'Enviar Link de Recuperação'}
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full text-xs font-semibold text-slate-400 hover:text-white"
                                onClick={() => navigate('/entrar')}
                                disabled={loading}
                            >
                                Voltar para o Início de Sessão
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
