import { AlertTriangle, Ban, CheckCircle2, Clock, FlaskConical, RefreshCw, Send, XCircle } from 'lucide-react';
import type { ElementType } from 'react';
import type { ConfigFiscal, EmpresaFiscal, EstadoAgt } from '@/bibliotecas/fiscal/tipos';
import type { Utilizador } from '@/servicos/ServicoFiscal';

export interface ContextoFiscal {
  config: ConfigFiscal;
  empresa: EmpresaFiscal;
  user: Utilizador;
  podeGerir: boolean;
  podeAdministrar: boolean;
  isSuperAdmin: boolean;
  recarregar: () => void;
}

export const ESTADOS_AGT: Record<EstadoAgt, { label: string; cls: string; icon: ElementType }> = {
  pendente: { label: 'Por enviar', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', icon: Clock },
  enviado: { label: 'Enviado', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200', icon: Send },
  em_validacao: { label: 'Em validação', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200', icon: RefreshCw },
  valido: { label: 'Válido AGT', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', icon: CheckCircle2 },
  valido_penal: { label: 'Válido c/ penalização', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200', icon: AlertTriangle },
  invalido: { label: 'Rejeitado', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200', icon: XCircle },
  erro_envio: { label: 'Erro de envio', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200', icon: AlertTriangle },
  simulado: { label: 'Simulação', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: FlaskConical },
  anulado: { label: 'Anulado', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: Ban },
};

export const TIPOS_DOC: Record<string, string> = {
  FR: 'Factura/Recibo', FT: 'Factura', NC: 'Nota de Crédito', ND: 'Nota de Débito', RG: 'Recibo', RC: 'Recibo (numerário)',
  FA: 'Factura de Adiantamento', AR: 'Aviso de Cobrança/Recibo', AC: 'Aviso de Cobrança', FG: 'Factura Global', GF: 'Factura Genérica', RE: 'Estorno',
};

export const hojeLuanda = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Luanda' });
export const dataPt = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export const dataHoraPt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-AO', { timeZone: 'Africa/Luanda', dateStyle: 'short', timeStyle: 'short' }) : '—');

export function exportarCsv(nome: string, linhas: Array<Record<string, unknown>>) {
  if (!linhas.length) return;
  const colunas = Object.keys(linhas[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [colunas.join(';'), ...linhas.map(l => colunas.map(c => esc(l[c])).join(';'))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/** Notificação depois de o diálogo fechar: o SweetAlert e o diálogo Radix não podem estar abertos ao mesmo tempo
 * (senão a página fica marcada como oculta para leitores de ecrã). */
export const aposFechar = (fn: () => void) => { setTimeout(fn, 350); };
