import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { ESTADOS_AGT } from './apoio';
import type { ElementType, ReactNode } from 'react';
import type { EstadoAgt, Problema, AgtErro } from '@/bibliotecas/fiscal/tipos';
import { codigoErro, DICAS_ERRO_AGT } from '@/bibliotecas/fiscal/regras';

export function EstadoAgtBadge({ estado }: { estado: EstadoAgt }) {
  const e = ESTADOS_AGT[estado] ?? ESTADOS_AGT.pendente;
  const Icone = e.icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.cls}`}>
      <Icone className="h-3 w-3" />{e.label}
    </span>
  );
}

export function Aviso({ tom = 'info', titulo, children }: { tom?: 'info' | 'aviso' | 'erro' | 'ok'; titulo?: string; children: ReactNode }) {
  const cls = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100',
    aviso: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
    erro: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  }[tom];
  const Icone = { info: CheckCircle2, aviso: AlertTriangle, erro: XCircle, ok: CheckCircle2 }[tom];
  return (
    <div className={`flex gap-3 rounded-lg border p-3 text-sm ${cls}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{titulo && <p className="font-semibold">{titulo}</p>}<div className="text-xs leading-relaxed">{children}</div></div>
    </div>
  );
}

export function ListaProblemas({ problemas, vazio = 'Sem problemas encontrados.' }: { problemas: Problema[]; vazio?: string }) {
  if (!problemas.length) return <Aviso tom="ok">{vazio}</Aviso>;
  const erros = problemas.filter(p => p.nivel === 'erro');
  const avisos = problemas.filter(p => p.nivel === 'aviso');
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold"><span className="text-red-600">{erros.length} erro(s)</span> · <span className="text-amber-600">{avisos.length} aviso(s)</span></p>
      <ul className="max-h-72 divide-y overflow-auto rounded-lg border text-xs">
        {[...erros, ...avisos].map((p, i) => (
          <li key={i} className="flex gap-2 px-3 py-2">
            {p.nivel === 'erro' ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
            <span><b className="font-mono">{p.codigo}</b>{p.documentNo && <span className="ml-1 font-mono text-muted-foreground">[{p.documentNo}]</span>} {p.mensagem}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ErrosAgt({ erros }: { erros: AgtErro[] }) {
  if (!erros?.length) return null;
  return (
    <ul className="space-y-1.5">
      {erros.map((e, i) => (
        <li key={i} className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-100">
          <b className="font-mono">{codigoErro(e)}</b> {e.descriptionError ?? e.errorDescription}
          {(e.hint ?? DICAS_ERRO_AGT[codigoErro(e)]) && <div className="opacity-80">→ {e.hint ?? DICAS_ERRO_AGT[codigoErro(e)]}</div>}
        </li>
      ))}
    </ul>
  );
}

export function Vazio({ icone: Icone, titulo, children }: { icone: ElementType; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icone className="h-5 w-5" /></div>
      <p className="text-sm font-semibold">{titulo}</p>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

