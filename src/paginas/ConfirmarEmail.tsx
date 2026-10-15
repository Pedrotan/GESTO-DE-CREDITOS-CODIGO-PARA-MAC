import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/componentes/ui/alert';
import { Button } from '@/componentes/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/componentes/ui/card';
import { CheckCircle2, AlertCircle, MailCheck, ArrowLeft, Loader2 } from 'lucide-react';
import { verifyCompanyEmailWithToken } from '@/servicos/ServicoIdentidadeEmpresa';

const readQueryParams = () => {
  if (typeof window === 'undefined') return { token: '', requestId: '', nif: '' };

  const search = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : window.location.search;
  const params = new URLSearchParams(search || '');

  return {
    token: params.get('token') || '',
    requestId: params.get('request') || params.get('requestId') || '',
    nif: params.get('nif') || '',
  };
};

export default function ConfirmarEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get('token') || readQueryParams().token);
  const [requestId, setRequestId] = useState(() => searchParams.get('request') || searchParams.get('requestId') || readQueryParams().requestId);
  const [nif, setNif] = useState(() => searchParams.get('nif') || readQueryParams().nif);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('A verificar o endereço de e-mail associado ao pedido de onboarding...');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const values = readQueryParams();
    if (values.token) setToken(values.token);
    if (values.requestId) setRequestId(values.requestId);
    if (values.nif) setNif(values.nif);
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!token || !requestId || !nif) {
        setLoading(false);
        setSuccess(false);
        setMessage('Link de confirmação inválido. Falta token, pedido ou NIF.');
        return;
      }

      try {
        const result = await verifyCompanyEmailWithToken({ token, requestId, nif });
        if (!active) return;
        setEmail(result.email || '');
        setSuccess(Boolean(result.verified || result.emailVerified));
        setMessage(result.message || 'Endereço de e-mail confirmado com sucesso.');
      } catch (error: any) {
        if (!active) return;
        setSuccess(false);
        setMessage(error?.message || 'Não foi possível confirmar o endereço de e-mail.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => { active = false; };
  }, [token, requestId, nif]);

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white overflow-hidden">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">A confirmar e-mail</h1>
          <p className="mt-3 text-sm text-slate-400">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white overflow-hidden font-sans">
      <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-blue-600/15 blur-[140px]" />
      <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-indigo-600/15 blur-[140px]" />

      <div className="relative w-full max-w-md animate-in fade-in duration-300">
        <Card className="border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500" />
          <CardHeader className="pb-4 pt-7 px-6">
            <div className="flex items-center gap-3 mb-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { navigate('/entrar'); window.location.reload(); }}
                className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/20">
                  <MailCheck className="h-3 w-3" /> Verificação de e-mail
                </span>
              </div>
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-white">
              {success ? 'E-mail confirmado' : 'Falha na confirmação'}
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 leading-relaxed mt-1">
              {success
                ? 'O endereço de e-mail foi confirmado. O pedido de cadastro continua à espera da aprovação do administrador Tango, que lhe enviará o Código de Acesso.'
                : 'A confirmação não foi concluída.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 px-6">
            {success ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Confirmado com sucesso</span>
                </div>
                {email && <p className="mt-2 text-xs text-emerald-100">{email}</p>}
              </div>
            ) : (
              <Alert variant="destructive" className="border-red-500/30 bg-red-500/10 text-red-200">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-xs font-semibold">{message}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="pt-2 pb-8 px-6">
            <Button
              onClick={() => { navigate('/entrar'); window.location.reload(); }}
              className="w-full h-12 text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl"
            >
              Voltar à página inicial
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
