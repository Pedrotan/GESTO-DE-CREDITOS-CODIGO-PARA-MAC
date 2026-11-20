import { useState } from 'react';
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { validatePasswordStrength } from '@/bibliotecas/password-validator';
import { alertaSucesso, avisar } from '@/bibliotecas/alerta';

/** A conta tem de trocar a senha antes de entrar (ex.: senha temporária do portal do funcionário). */
export const precisaTrocarSenha = (user: { mustChangePassword?: unknown } | null | undefined) =>
    Boolean(user) && (user!.mustChangePassword === true || Number(user!.mustChangePassword) === 1);

/** Ecrã que bloqueia o sistema até a senha temporária ser trocada por uma senha pessoal. */
export function TrocaSenhaObrigatoria() {
    const { user, updateUser, logout } = useAuth();
    const [senha, setSenha] = useState('');
    const [repetir, setRepetir] = useState('');
    const [ver, setVer] = useState(false);
    const [aGuardar, setAGuardar] = useState(false);
    if (!user) return null;
    const forca = validatePasswordStrength(senha);
    const erro = !senha ? '' : forca.score < 60 ? 'Use pelo menos 8 caracteres, com maiúsculas, minúsculas, números e um símbolo.'
        : repetir && repetir !== senha ? 'As senhas não coincidem.' : '';
    const pronto = senha.length > 0 && forca.score >= 60 && senha === repetir;

    const guardar = async () => {
        if (!pronto) return;
        setAGuardar(true);
        try {
            await updateUser(user.id, { password: senha, mustChangePassword: false });
            await alertaSucesso('Senha alterada', 'A partir de agora entre com a sua nova senha.');
        } catch (e) {
            void avisar((e as Error)?.message || 'Não foi possível alterar a senha.', 'error');
        } finally { setAGuardar(false); }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
            <form className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                onSubmit={e => { e.preventDefault(); void guardar(); }}>
                <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><KeyRound className="h-5 w-5" /></span>
                    <div>
                        <h1 className="text-lg font-black">Defina a sua senha</h1>
                        <p className="text-sm text-slate-500">Olá, {user.name.split(' ')[0]}. Está a usar uma senha temporária: troque-a para continuar.</p>
                    </div>
                </div>
                <Label htmlFor="nova-senha" className="text-xs font-bold">Nova senha</Label>
                <div className="relative mt-1">
                    <Input id="nova-senha" type={ver ? 'text' : 'password'} autoComplete="new-password" autoFocus value={senha} onChange={e => setSenha(e.target.value)} className="pr-10" />
                    <button type="button" aria-label={ver ? 'Esconder a senha' : 'Mostrar a senha'} onClick={() => setVer(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">
                        {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                {senha && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full transition-all" style={{ width: `${forca.score}%`, background: forca.color }} /></div>}
                <Label htmlFor="repetir-senha" className="mt-4 block text-xs font-bold">Repetir a nova senha</Label>
                <Input id="repetir-senha" type={ver ? 'text' : 'password'} autoComplete="new-password" className="mt-1" value={repetir} onChange={e => setRepetir(e.target.value)} />
                {erro && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{erro}</p>}
                <Button type="submit" className="mt-5 w-full" disabled={!pronto || aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar e entrar'}</Button>
                <button type="button" onClick={() => void logout()} className="mx-auto mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"><LogOut className="h-3.5 w-3.5" /> Sair</button>
            </form>
        </div>
    );
}
