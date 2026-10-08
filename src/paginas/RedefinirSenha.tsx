import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { ShieldCheck, ArrowLeft, Eye, EyeOff, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/componentes/ui/alert';
import { resetPasswordWithToken } from '@/servicos/ServicoIdentidadeEmpresa';

export default function RedefinirSenha() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    
    // Obter o token dos parâmetros de busca
    const [token, setToken] = useState(() => {
        const urlToken = searchParams.get('token');
        if (urlToken) return urlToken;
        if (typeof window !== 'undefined' && window.location.hash.includes('token=')) {
            const parts = window.location.hash.split('token=');
            return parts[1]?.split('&')[0] || '';
        }
        return '';
    });

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const queryToken = searchParams.get('token');
        if (queryToken) {
            setToken(queryToken);
        }
    }, [searchParams]);

    // Validação de força da senha em tempo real
    const hasMinLength = newPassword.length >= 8;
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
    const isPasswordStrong = hasMinLength && hasUppercase && hasLowercase && hasNumber;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');

        if (!token.trim()) {
            setErrorMessage('Token de recuperação não encontrado no link. Por favor, utilize o link seguro enviado para o seu e-mail.');
            return;
        }

        if (!isPasswordStrong) {
            setErrorMessage('A nova senha não cumpre os requisitos mínimos de segurança.');
            return;
        }

        if (!passwordsMatch) {
            setErrorMessage('A confirmação da senha não coincide com a nova senha.');
            return;
        }

        setLoading(true);

        try {
            await resetPasswordWithToken(token.trim(), newPassword);
            setIsSuccess(true);
        } catch (err: any) {
            setErrorMessage(err.message || 'Não foi possível redefinir a senha. O link pode ter expirado (limite de 15 minutos).');
        } finally {
            setLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white overflow-hidden font-sans">
                {/* Background decorative glows */}
                <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 h-[450px] w-[450px] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

                <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                    <Card className="border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
                        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-blue-500" />
                        <CardHeader className="text-center pb-4 pt-8">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                <CheckCircle2 className="h-9 w-9" />
                            </div>
                            <CardTitle className="text-2xl font-black tracking-tight text-white">Senha Redefinida!</CardTitle>
                            <CardDescription className="text-sm text-slate-400 mt-2">
                                A sua nova senha foi gravada com sucesso no Tango Master Gen.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-center px-6">
                            <p className="text-xs text-slate-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                                Pode agora aceder à aplicação desktop ou web e iniciar sessão utilizando as suas novas credenciais.
                            </p>
                        </CardContent>
                        <CardFooter className="pt-2 pb-8 px-6">
                            <Button
                                className="w-full h-12 text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 rounded-xl"
                                onClick={() => navigate('/entrar')}
                            >
                                Ir para o Início de Sessão
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white overflow-hidden font-sans">
            {/* Background decorative glows */}
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
                        <CardTitle className="text-2xl font-black tracking-tight text-white">Definir Nova Senha</CardTitle>
                        <CardDescription className="text-xs text-slate-400 leading-relaxed mt-1">
                            Crie uma senha forte e segura para a sua conta no sistema.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-5 px-6">
                        {errorMessage && (
                            <Alert variant="destructive" className="border-red-500/30 bg-red-500/10 text-red-200">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                                <AlertDescription className="text-xs font-semibold">{errorMessage}</AlertDescription>
                            </Alert>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {!token && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="token" className="text-xs font-bold text-slate-300">Token de Recuperação</Label>
                                    <Input
                                        id="token"
                                        placeholder="Cole o token do link de recuperação"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        className="h-11 rounded-xl bg-slate-950/70 border-white/10 font-mono text-xs text-white"
                                        required
                                        disabled={loading}
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="new-password" className="text-xs font-bold text-slate-300">Nova Senha</Label>
                                <div className="relative">
                                    <Input
                                        id="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Mínimo 8 caracteres"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="h-11 rounded-xl bg-slate-950/70 border-white/10 pr-10 text-sm text-white focus-visible:ring-blue-500"
                                        required
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="confirm-password" className="text-xs font-bold text-slate-300">Confirmar Nova Senha</Label>
                                <Input
                                    id="confirm-password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Repita a nova senha"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="h-11 rounded-xl bg-slate-950/70 border-white/10 text-sm text-white focus-visible:ring-blue-500"
                                    required
                                    disabled={loading}
                                />
                            </div>

                            {/* Validação de Força da Senha */}
                            <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3.5 space-y-2">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Requisitos de Segurança:</p>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${hasMinLength ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                        Mínimo 8 caracteres
                                    </div>
                                    <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${hasUppercase ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                        1 letra maiúscula
                                    </div>
                                    <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${hasLowercase ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                        1 letra minúscula
                                    </div>
                                    <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${hasNumber ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                        1 número
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading || !isPasswordStrong || !passwordsMatch}
                                className="w-full h-12 mt-2 text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl disabled:opacity-40"
                            >
                                {loading ? 'A gravar no servidor...' : 'Atualizar Senha'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
