import { useEffect, useMemo, useState } from 'react';
import { Ban, Code2, Download, Eye, FileCheck2, FileText, Plus, Printer, QrCode, RefreshCw, Search, Send, Trash2, Wallet, Wrench } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { formatCurrency } from '@/bibliotecas/formatters';
import { toast } from '@/ganchos/usar-toast';
import { resolverPerfis, urlQrAgt } from '@/bibliotecas/fiscal/regras';
import { gerarPdfDocumentoFiscal } from '@/bibliotecas/fiscal/pdf-documento-fiscal';
import type { AgtTipoDocumento, LinhaEncargo, Problema, TipoEncargo, TipoRetencao } from '@/bibliotecas/fiscal/tipos';
import type { Client, Credit } from '@/tipos/credito';
import {
  anularComNotaCredito, chamadasDoDocumento, consultarAgora, corrigirRejeitado, emitir, ErroFiscal, facturarPagamentos,
  lerErros, lerPayload, processarFila, type DocumentoFiscal, type PagamentoPorFacturar,
} from '@/servicos/ServicoFiscal';
import { ErrosAgt, EstadoAgtBadge, ListaProblemas, Vazio, Aviso } from './comum';
import { ContextoFiscal, ESTADOS_AGT, TIPOS_DOC, aposFechar, dataPt, dataHoraPt, exportarCsv } from './apoio';
import { porMaisRecente } from '@/bibliotecas/ordenacao';

const kz = (m: number) => m / 100;
const erroTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function DocumentosFiscais({ ctx, documentos, porFacturar, clientes, creditos, empresaPdf, abrirFacturacao, onAbrirFacturacao, onFecharFacturacao }: {
  ctx: ContextoFiscal; documentos: DocumentoFiscal[]; porFacturar: PagamentoPorFacturar[]; clientes: Client[]; creditos: Credit[];
  empresaPdf: unknown; abrirFacturacao: boolean; onAbrirFacturacao: () => void; onFecharFacturacao: () => void;
}) {
  const [pesquisa, setPesquisa] = useState('');
  const [estado, setEstado] = useState('todos');
  const [tipo, setTipo] = useState('todos');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<DocumentoFiscal | null>(null);
  const [emitirAberto, setEmitirAberto] = useState(false);
  const [anular, setAnular] = useState<DocumentoFiscal | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    return documentos.filter(d =>
      (estado === 'todos' || (estado === 'por_enviar' ? ['pendente', 'erro_envio'].includes(d.agtStatus) : estado === 'em_curso' ? ['enviado', 'em_validacao'].includes(d.agtStatus) : d.agtStatus === estado)) &&
      (tipo === 'todos' || d.documentType === tipo) &&
      (!q || d.documentNo.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q) || d.customerTaxId.toLowerCase().includes(q)))
      .sort(porMaisRecente(d => d.systemEntryDate || d.documentDate));
  }, [documentos, pesquisa, estado, tipo]);
  useEffect(() => setPagina(1), [pesquisa, estado, tipo]);
  const POR_PAGINA = 25;
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visiveis = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const enviaveis = documentos.filter(d => seleccionados.has(d.id) && ['pendente', 'erro_envio'].includes(d.agtStatus));

  const correr = async (chave: string, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(chave);
    try { await fn(); toast.success(ok); ctx.recarregar(); }
    catch (e) { toast({ title: 'Operação fiscal recusada', description: e instanceof ErroFiscal && e.problemas.length ? `${e.message}: ${e.problemas.filter(p => p.nivel === 'erro').map(p => p.mensagem).join('; ')}` : erroTexto(e), variant: 'destructive' }); }
    finally { setOcupado(null); }
  };

  const pdf = (d: DocumentoFiscal) => gerarPdfDocumentoFiscal({
    documento: lerPayload(d), saftHash: d.saftHash, nifEmissor: ctx.empresa.nif, software: ctx.config.software,
    simulado: d.agtStatus === 'simulado', morada: d.customerAddress, empresa: empresaPdf, operador: d.createdByName, estadoAgt: ESTADOS_AGT[d.agtStatus].label,
  }).catch(e => toast.error(`Não foi possível gerar o PDF: ${erroTexto(e)}`));

  const todosMarcados = visiveis.length > 0 && visiveis.every(d => seleccionados.has(d.id));

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <Label className="text-xs">Pesquisar</Label>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="N.º do documento, cliente ou NIF" value={pesquisa} onChange={e => setPesquisa(e.target.value)} /></div>
          </div>
          <div className="w-44"><Label className="text-xs">Estado AGT</Label>
            <Select value={estado} onValueChange={setEstado}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="todos">Todos</SelectItem><SelectItem value="por_enviar">Por enviar</SelectItem><SelectItem value="em_curso">Em validação</SelectItem>
              {Object.entries(ESTADOS_AGT).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent></Select></div>
          <div className="w-44"><Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="todos">Todos</SelectItem>{['FR', 'FT', 'NC', 'ND', 'RG'].map(t => <SelectItem key={t} value={t}>{t} — {TIPOS_DOC[t]}</SelectItem>)}
            </SelectContent></Select></div>
          {ctx.podeGerir && <>
            <Button variant="outline" className="gap-2" onClick={onAbrirFacturacao} disabled={!porFacturar.length}>
              <Wallet className="h-4 w-4" />Facturar pagamentos {porFacturar.length > 0 && `(${porFacturar.length})`}</Button>
            <Button className="gap-2" onClick={() => setEmitirAberto(true)}><Plus className="h-4 w-4" />Emitir documento</Button>
          </>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2">
          <p className="text-xs text-muted-foreground">{filtrados.length} documento(s){seleccionados.size > 0 && ` · ${seleccionados.size} seleccionado(s)`}</p>
          <div className="flex flex-wrap gap-2">
            {ctx.podeGerir && ctx.config.agtActiva && <Button size="sm" variant="outline" className="gap-2" disabled={!enviaveis.length || ocupado === 'enviar'}
              onClick={() => correr('enviar', () => processarFila(ctx.config, ctx.empresa), 'Pedido de envio feito à AGT')}><Send className="h-4 w-4" />Enviar pendentes</Button>}
            <Button size="sm" variant="outline" className="gap-2" disabled={!filtrados.length} onClick={() => exportarCsv('documentos_fiscais.csv', filtrados.map(d => ({
              Documento: d.documentNo, Tipo: d.documentType, Data: d.documentDate, Cliente: d.customerName, NIF: d.customerTaxId,
              Base: kz(d.netTotalMinor).toFixed(2), Imposto: kz(d.taxPayableMinor).toFixed(2), Total: kz(d.grossTotalMinor).toFixed(2),
              EstadoAGT: ESTADOS_AGT[d.agtStatus].label, PedidoAGT: d.agtRequestId ?? '', EmitidoPor: d.createdByName ?? '',
            })))}><Download className="h-4 w-4" />CSV</Button>
          </div>
        </div>

        {!filtrados.length ? (
          <Vazio icone={FileText} titulo="Sem documentos fiscais neste período">{ctx.podeGerir ? 'Facture os pagamentos com juros e mora ou emita um documento.' : 'Altere o período ou os filtros.'}</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-2"><input type="checkbox" aria-label="Seleccionar todos" checked={todosMarcados}
                    onChange={() => setSeleccionados(todosMarcados ? new Set() : new Set(visiveis.map(d => d.id)))} /></th>
                  <th className="px-2">Documento</th><th className="px-2">Data</th><th className="px-2">Cliente</th>
                  <th className="px-2 text-right">Base</th><th className="px-2 text-right">Imposto</th><th className="px-2 text-right">Total</th>
                  <th className="px-2">Estado AGT</th><th className="px-4 text-right">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visiveis.map(d => {
                  const erros = lerErros(d);
                  return (
                    <tr key={d.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5"><input type="checkbox" aria-label={`Seleccionar ${d.documentNo}`} checked={seleccionados.has(d.id)}
                        onChange={() => setSeleccionados(s => { const n = new Set(s); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })} /></td>
                      <td className="px-2 py-2.5">
                        <button className="font-mono text-xs font-bold text-primary hover:underline" onClick={() => setDetalhe(d)}>{d.documentNo}</button>
                        <div className="text-[11px] text-muted-foreground">{TIPOS_DOC[d.documentType] ?? d.documentType}{d.documentStatus === 'C' && ` · correcção de ${d.rejectedDocumentNo}`}</div>
                      </td>
                      <td className="whitespace-nowrap px-2">{dataPt(d.documentDate)}</td>
                      <td className="max-w-[220px] px-2"><p className="truncate font-medium">{d.customerName}</p><p className="font-mono text-[11px] text-muted-foreground">{d.customerTaxId}</p></td>
                      <td className="px-2 text-right tabular-nums">{formatCurrency(kz(d.netTotalMinor))}</td>
                      <td className="px-2 text-right tabular-nums">{formatCurrency(kz(d.taxPayableMinor))}</td>
                      <td className={`px-2 text-right font-semibold tabular-nums ${d.documentType === 'NC' ? 'text-red-600' : ''}`}>{d.documentType === 'NC' ? '−' : ''}{formatCurrency(kz(d.grossTotalMinor))}</td>
                      <td className="px-2"><EstadoAgtBadge estado={d.agtStatus} />
                        {erros.length > 0 && <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-red-600" title={erros.map(e => `${e.idError ?? e.errorCode} ${e.descriptionError ?? e.errorDescription}`).join('\n')}>{erros[0].hint ?? erros[0].descriptionError ?? erros[0].errorDescription}</p>}</td>
                      <td className="px-4">
                        <div className="flex justify-end gap-1">
                          {ctx.podeGerir && d.agtStatus === 'invalido' && <Button size="sm" variant="ghost" className="gap-1" disabled={ocupado === `c${d.id}`}
                            onClick={() => correr(`c${d.id}`, () => corrigirRejeitado(d.id, ctx), `Correcção de ${d.documentNo} emitida`)}><Wrench className="h-3.5 w-3.5" />Corrigir</Button>}
                          {ctx.podeGerir && ['valido', 'valido_penal', 'simulado', 'pendente', 'enviado', 'em_validacao'].includes(d.agtStatus) && d.documentType !== 'NC' && !['RG', 'RC', 'AR'].includes(d.documentType) &&
                            <Button size="sm" variant="ghost" className="gap-1" onClick={() => setAnular(d)}><Ban className="h-3.5 w-3.5" />Anular</Button>}
                          {ctx.podeGerir && ['enviado', 'em_validacao', 'pendente', 'erro_envio'].includes(d.agtStatus) && ctx.config.agtActiva &&
                            <Button size="icon" variant="ghost" title="Consultar a AGT agora" disabled={ocupado === `k${d.id}`} onClick={() => correr(`k${d.id}`, () => consultarAgora(d.id, ctx.config, ctx.empresa), 'Estado actualizado')}><RefreshCw className="h-3.5 w-3.5" /></Button>}
                          <Button size="icon" variant="ghost" title="PDF com QR Code" onClick={() => pdf(d)}><Printer className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs">
            <span className="text-muted-foreground">Página {pagina} de {paginas}</span>
            <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button><Button size="sm" variant="ghost" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Seguinte</Button></div>
          </div>
        )}
      </Card>

      <DetalheDocumento documento={detalhe} onFechar={() => setDetalhe(null)} nif={ctx.empresa.nif} onPdf={pdf} />
      <EmitirDocumento aberto={emitirAberto} onFechar={() => setEmitirAberto(false)} ctx={ctx} clientes={clientes} creditos={creditos} />
      <AnularDocumento documento={anular} onFechar={() => setAnular(null)} ctx={ctx} />
      <FacturarPagamentos aberto={abrirFacturacao} onFechar={onFecharFacturacao} lista={porFacturar} ctx={ctx} />
    </div>
  );
}

// ---------------------------------------------------------------------------- detalhe
function DetalheDocumento({ documento: d, onFechar, nif, onPdf }: { documento: DocumentoFiscal | null; onFechar: () => void; nif: string; onPdf: (d: DocumentoFiscal) => void }) {
  const [chamadas, setChamadas] = useState<Awaited<ReturnType<typeof chamadasDoDocumento>>>([]);
  const [json, setJson] = useState(false);
  useEffect(() => { setJson(false); if (d) chamadasDoDocumento(d.documentNo).then(setChamadas).catch(() => setChamadas([])); }, [d]);
  const p = d ? lerPayload(d) : null;
  return (
    <Sheet open={!!d} onOpenChange={o => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {d && p && <>
          <SheetHeader><SheetTitle className="font-mono">{d.documentNo}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-5 text-sm">
            <div className="flex flex-wrap gap-2"><EstadoAgtBadge estado={d.agtStatus} />{d.agtRequestId && <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">requestID {d.agtRequestId}</span>}</div>
            <ErrosAgt erros={lerErros(d)} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Tipo</dt><dd>{TIPOS_DOC[d.documentType]}</dd>
              <dt className="text-muted-foreground">Data</dt><dd>{dataPt(d.documentDate)}</dd>
              <dt className="text-muted-foreground">Registo</dt><dd>{dataHoraPt(d.createdAt)}</dd>
              <dt className="text-muted-foreground">Cliente</dt><dd className="font-medium">{d.customerName}</dd>
              <dt className="text-muted-foreground">NIF</dt><dd className="font-mono">{d.customerTaxId}</dd>
              <dt className="text-muted-foreground">Total</dt><dd className="font-bold">{formatCurrency(kz(d.grossTotalMinor))}</dd>
              <dt className="text-muted-foreground">Tentativas de envio</dt><dd>{d.agtAttempts}</dd>
              <dt className="text-muted-foreground">Validado em</dt><dd>{dataHoraPt(d.agtValidatedAt)}</dd>
              <dt className="text-muted-foreground">Emitido por</dt><dd>{d.createdByName ?? '—'}</dd>
            </dl>
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">#</th><th className="text-left">Descrição</th><th className="text-left">Imposto</th><th className="text-right">Valor</th></tr></thead>
              <tbody className="divide-y">{(p.lines ?? []).map(l => (
                <tr key={l.lineNumber}><td className="py-1.5">{l.lineNumber}</td><td>{l.productDescription}</td>
                  <td>{l.taxes?.map(t => `${t.taxType} ${t.taxCode ?? ''} ${t.taxPercentage ?? 0}%${t.taxExemptionCode ? ` (${t.taxExemptionCode})` : ''}`).join(', ')}</td>
                  <td className="text-right tabular-nums">{formatCurrency(l.creditAmount ?? l.debitAmount ?? l.taxes?.[0]?.taxBase ?? 0)}</td></tr>))}</tbody>
            </table>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => onPdf(d)}><Printer className="h-4 w-4" />PDF com QR Code</Button>
              <Button size="sm" variant="outline" className="gap-2" asChild><a href={urlQrAgt(nif, d.documentNo)} target="_blank" rel="noreferrer"><QrCode className="h-4 w-4" />Verificar na AGT</a></Button>
              <Button size="sm" variant="ghost" className="gap-2" onClick={() => setJson(j => !j)}><Code2 className="h-4 w-4" />{json ? 'Ocultar' : 'Ver'} JSON</Button>
            </div>
            {json && <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-emerald-200">{JSON.stringify(p, null, 2)}</pre>}
            <div className="rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Integridade</p>
              <p className="break-all font-mono">Hash SAF-T: {d.saftHash.slice(0, 60)}…</p>
              <p className="break-all font-mono">Assinatura: {d.jwsSignature.slice(0, 60)}…</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold">Comunicações com a AGT</p>
              {chamadas.length ? <ul className="space-y-1.5">{chamadas.map((c, i) => (
                <li key={i} className="rounded-md border px-3 py-2 text-xs"><span className="font-mono font-semibold">{c.service}</span> · HTTP {c.httpStatus ?? 'rede'}{c.resultCode && ` · resultado ${c.resultCode}`} · {c.durationMs ?? 0} ms · {dataHoraPt(c.createdAt)}
                  {c.error && <p className="text-red-600">{c.error}</p>}</li>))}</ul> : <p className="text-xs text-muted-foreground">Ainda sem comunicações.</p>}
            </div>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------- emitir
const LINHA_VAZIA: LinhaEncargo = { tipo: 'juros', descricao: '', valor: 0 };

function EmitirDocumento({ aberto, onFechar, ctx, clientes, creditos }: { aberto: boolean; onFechar: () => void; ctx: ContextoFiscal; clientes: Client[]; creditos: Credit[] }) {
  const perfis = resolverPerfis(ctx.config);
  const [tipoDoc, setTipoDoc] = useState<AgtTipoDocumento>('FR');
  const [creditoId, setCreditoId] = useState('nenhum');
  const [cliente, setCliente] = useState({ id: '', nome: '', nif: '', morada: '' });
  const [linhas, setLinhas] = useState<LinhaEncargo[]>([{ ...LINHA_VAZIA }]);
  const [referencia, setReferencia] = useState({ documento: '', motivo: '' });
  const [recibos, setRecibos] = useState('');
  const [retencao, setRetencao] = useState({ tipo: 'nenhuma', valor: 0, descricao: '' });
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [previa, setPrevia] = useState<{ documento: unknown; problemas: Problema[] } | null>(null);
  const [verJson, setVerJson] = useState(false);
  const [ocupado, setOcupado] = useState<'previa' | 'emitir' | null>(null);

  useEffect(() => { if (aberto) { setPrevia(null); setChave(crypto.randomUUID()); setVerJson(false); } }, [aberto]);
  useEffect(() => {
    const c = creditos.find(x => x.id === creditoId);
    const cl = c ? clientes.find(x => x.id === c.clientId) : undefined;
    if (cl) setCliente({ id: cl.id, nome: cl.name, nif: cl.nif ?? '', morada: cl.address ?? '' });
    setPrevia(null);
  }, [creditoId, creditos, clientes]);

  const recibo = ['RG', 'RC'].includes(tipoDoc);
  const pedido = (previsualizar: boolean) => ({
    tipo: tipoDoc, idempotencia: chave, previsualizar,
    cliente: { id: cliente.id || null, nif: cliente.nif || null, nome: cliente.nome, morada: cliente.morada || null },
    linhas: recibo ? undefined : linhas.map(l => ({ ...l, valor: Number(l.valor) || 0, desconto: l.desconto ? Number(l.desconto) : undefined })),
    referencia: ['NC', 'ND'].includes(tipoDoc) ? referencia : undefined,
    recibos: recibo ? recibos.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) : undefined,
    retencoes: retencao.tipo !== 'nenhuma' && retencao.valor > 0 ? [{ withholdingTaxType: retencao.tipo as TipoRetencao, withholdingTaxAmount: Number(retencao.valor), withholdingTaxDescription: retencao.descricao || undefined }] : undefined,
    creditId: creditoId !== 'nenhum' ? creditoId : null,
  });

  const validar = async () => {
    setOcupado('previa');
    try { const r = await emitir(pedido(true), ctx); setPrevia({ documento: r.documento, problemas: r.problemas }); }
    catch (e) { setPrevia({ documento: null, problemas: e instanceof ErroFiscal && e.problemas.length ? e.problemas : [{ nivel: 'erro', codigo: 'ERRO', mensagem: erroTexto(e) }] }); }
    finally { setOcupado(null); }
  };
  const confirmar = async () => {
    setOcupado('emitir');
    try {
      const r = await emitir(pedido(false), ctx);
      onFechar(); ctx.recarregar();
      aposFechar(() => toast.success(r.duplicado ? `Este documento já tinha sido emitido: ${r.documento.documentNo}` : `${r.documento.documentNo} emitido${r.simulado ? ' (simulação)' : ' — segue para a AGT'}`));
    } catch (e) {
      if (e instanceof ErroFiscal && e.problemas.length) setPrevia({ documento: null, problemas: e.problemas });
      toast.error(erroTexto(e));
    } finally { setOcupado(null); }
  };
  const mudarLinha = (i: number, patch: Partial<LinhaEncargo>) => { setLinhas(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l))); setPrevia(null); };
  const bloqueado = !previa || previa.problemas.some(p => p.nivel === 'erro');

  return (
    <Dialog open={aberto} onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Emitir documento fiscal</DialogTitle><DialogDescription>O documento é validado, assinado e numerado antes de ser gravado. Depois segue automaticamente para a AGT.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Tipo</Label>
              <Select value={tipoDoc} onValueChange={v => { setTipoDoc(v as AgtTipoDocumento); setPrevia(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                {['FR', 'FT', 'NC', 'ND', 'RG'].map(t => <SelectItem key={t} value={t}>{t} — {TIPOS_DOC[t]}</SelectItem>)}</SelectContent></Select></div>
            <div className="sm:col-span-2"><Label className="text-xs">Crédito associado</Label>
              <Select value={creditoId} onValueChange={setCreditoId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-72">
                <SelectItem value="nenhum">Sem crédito associado</SelectItem>
                {creditos.filter(c => ['active', 'overdue', 'paid', 'renegotiated'].includes(c.status)).map(c => <SelectItem key={c.id} value={c.id}>{c.clientName} — {formatCurrency(c.principalAmount)}</SelectItem>)}
              </SelectContent></Select></div>
          </div>
          <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">Cliente</legend>
            <div className="sm:col-span-2"><Label className="text-xs">Nome</Label><Input value={cliente.nome} onChange={e => setCliente({ ...cliente, nome: e.target.value })} /></div>
            <div><Label className="text-xs">NIF (vazio = consumidor final)</Label><Input value={cliente.nif} onChange={e => setCliente({ ...cliente, nif: e.target.value.toUpperCase() })} /></div>
            <div className="sm:col-span-3"><Label className="text-xs">Morada</Label><Input value={cliente.morada} onChange={e => setCliente({ ...cliente, morada: e.target.value })} /></div>
          </fieldset>
          {['NC', 'ND'].includes(tipoDoc) && <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Documento de origem</Label><Input className="font-mono" placeholder="FR FR26S1N/15" value={referencia.documento} onChange={e => setReferencia({ ...referencia, documento: e.target.value })} /></div>
            <div><Label className="text-xs">Motivo</Label><Input maxLength={60} value={referencia.motivo} onChange={e => setReferencia({ ...referencia, motivo: e.target.value })} /></div></div>}
          {recibo ? (
            <div><Label className="text-xs">Documentos liquidados (um por linha)</Label><Textarea rows={3} className="font-mono" value={recibos} onChange={e => setRecibos(e.target.value)} /></div>
          ) : (
            <div className="space-y-2">
              <Aviso tom="info">O capital amortizado não é receita e não se factura: só juros, mora, comissões e seguros. O Imposto de Selo sobre a utilização do crédito é uma linha «só imposto» (valor = capital).</Aviso>
              {linhas.map((l, i) => (
                <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-12">
                  <div className="sm:col-span-4"><Label className="text-xs">Encargo</Label>
                    <Select value={l.tipo} onValueChange={v => mudarLinha(i, { tipo: v as TipoEncargo, soImposto: v === 'imposto_selo_capital' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                      {Object.entries(perfis).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="sm:col-span-3"><Label className="text-xs">Descrição</Label><Input value={l.descricao} onChange={e => mudarLinha(i, { descricao: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label className="text-xs">{l.soImposto ? 'Capital (base)' : 'Valor s/ imposto'}</Label><Input type="number" min={0} step="0.01" className="text-right" value={l.valor || ''} onChange={e => mudarLinha(i, { valor: Number(e.target.value) })} /></div>
                  <div className="sm:col-span-2"><Label className="text-xs">Desconto</Label><Input type="number" min={0} step="0.01" disabled={l.soImposto} className="text-right" value={l.desconto || ''} onChange={e => mudarLinha(i, { desconto: Number(e.target.value) })} /></div>
                  <div className="flex justify-end sm:col-span-1"><Button size="icon" variant="ghost" aria-label="Remover linha" disabled={linhas.length === 1} onClick={() => setLinhas(linhas.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button></div>
                  <p className="text-[11px] text-muted-foreground sm:col-span-12">{perfis[l.tipo].taxType} {perfis[l.tipo].taxCode ?? ''} {perfis[l.tipo].taxPercentage}%{perfis[l.tipo].taxExemptionCode ? ` · isenção ${perfis[l.tipo].taxExemptionCode}` : ''}{perfis[l.tipo].porConfirmar && <b className="ml-1 text-amber-700">· perfil por confirmar</b>}</p>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => setLinhas([...linhas, { ...LINHA_VAZIA }])}><Plus className="h-4 w-4" />Adicionar linha</Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Retenção na fonte</Label>
              <Select value={retencao.tipo} onValueChange={v => setRetencao({ ...retencao, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="nenhuma">Sem retenção</SelectItem><SelectItem value="II">II — Imposto Industrial</SelectItem><SelectItem value="IRT">IRT</SelectItem>
                <SelectItem value="IS">Imposto de Selo</SelectItem><SelectItem value="IVA">IVA (cativação)</SelectItem><SelectItem value="IAC">IAC</SelectItem><SelectItem value="OU">Outros</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Valor retido</Label><Input type="number" min={0} step="0.01" disabled={retencao.tipo === 'nenhuma'} value={retencao.valor || ''} onChange={e => setRetencao({ ...retencao, valor: Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Fundamento</Label><Input maxLength={120} disabled={retencao.tipo === 'nenhuma'} value={retencao.descricao} onChange={e => setRetencao({ ...retencao, descricao: e.target.value })} /></div>
          </div>
          {previa && <div className="space-y-2">
            <ListaProblemas problemas={previa.problemas} vazio="Documento válido — pronto a emitir." />
            {previa.documento && <><Button size="sm" variant="ghost" className="gap-2" onClick={() => setVerJson(v => !v)}><Code2 className="h-4 w-4" />{verJson ? 'Ocultar' : 'Ver'} JSON para a AGT</Button>
              {verJson && <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-emerald-200">{JSON.stringify(previa.documento, null, 2)}</pre>}</>}
          </div>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button variant="outline" className="gap-2" onClick={validar} disabled={!cliente.nome || ocupado !== null}><Eye className="h-4 w-4" />Validar</Button>
          <Button className="gap-2" onClick={confirmar} disabled={bloqueado || ocupado !== null} title={bloqueado ? 'Valide primeiro: só se emite sem erros' : undefined}><FileCheck2 className="h-4 w-4" />Emitir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------- anular
function AnularDocumento({ documento, onFechar, ctx }: { documento: DocumentoFiscal | null; onFechar: () => void; ctx: ContextoFiscal }) {
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => setMotivo(''), [documento]);
  return (
    <Dialog open={!!documento} onOpenChange={o => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Anular {documento?.documentNo}</DialogTitle>
          <DialogDescription>Documentos fiscais não se apagam. A anulação é uma nota de crédito pelo valor total, que referencia este documento e também é comunicada à AGT. O cliente deve tomar conhecimento da nota de crédito.</DialogDescription></DialogHeader>
        <div><Label className="text-xs">Motivo (fica no documento e na auditoria)</Label><Input maxLength={60} value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus /></div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button variant="destructive" className="gap-2" disabled={motivo.trim().length < 5 || ocupado} onClick={async () => {
            setOcupado(true);
            try { const r = await anularComNotaCredito(documento!.id, motivo, ctx); onFechar(); ctx.recarregar(); aposFechar(() => toast.success(`Nota de crédito ${r.documento.documentNo} emitida`)); }
            catch (e) { toast.error(erroTexto(e)); } finally { setOcupado(false); }
          }}><Ban className="h-4 w-4" />Emitir nota de crédito</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------- facturar pagamentos
function FacturarPagamentos({ aberto, onFechar, lista, ctx }: { aberto: boolean; onFechar: () => void; lista: PagamentoPorFacturar[]; ctx: ContextoFiscal }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [falhas, setFalhas] = useState<Array<{ pagamento: string; erro: string }>>([]);
  useEffect(() => { if (aberto) { setMarcados(new Set(lista.map(x => x.payment.id))); setFalhas([]); } }, [aberto, lista]);
  const escolhidos = lista.filter(x => marcados.has(x.payment.id));
  const total = escolhidos.reduce((s, x) => s + x.juros + x.mora, 0);
  return (
    <Dialog open={aberto} onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Facturar pagamentos</DialogTitle>
          <DialogDescription>Cada pagamento com juros ou mora gera uma Factura/Recibo (FR) com essas linhas. O capital amortizado não é facturado. Um pagamento nunca é facturado duas vezes.</DialogDescription></DialogHeader>
        {!lista.length ? <Vazio icone={Wallet} titulo="Todos os pagamentos com juros ou mora já estão facturados" /> : (
          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-[11px] uppercase text-muted-foreground"><tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Seleccionar todos" checked={marcados.size === lista.length} onChange={() => setMarcados(marcados.size === lista.length ? new Set() : new Set(lista.map(x => x.payment.id)))} /></th>
                <th className="text-left">Data</th><th className="text-left">Cliente</th><th className="text-right">Juros</th><th className="px-3 text-right">Mora</th></tr></thead>
              <tbody className="divide-y">{lista.map(x => (
                <tr key={x.payment.id}>
                  <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Facturar pagamento de ${x.client?.name ?? x.payment.clientName}`} checked={marcados.has(x.payment.id)}
                    onChange={() => setMarcados(s => { const n = new Set(s); if (n.has(x.payment.id)) n.delete(x.payment.id); else n.add(x.payment.id); return n; })} /></td>
                  <td>{new Date(x.payment.paymentDate).toLocaleDateString('pt-AO')}</td>
                  <td className="max-w-[220px] truncate">{x.client?.name ?? x.payment.clientName}{!x.client?.nif && <span className="ml-1 text-amber-700">(sem NIF)</span>}</td>
                  <td className="text-right tabular-nums">{formatCurrency(x.juros)}</td><td className="px-3 text-right tabular-nums">{formatCurrency(x.mora)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        {falhas.length > 0 && <Aviso tom="erro" titulo={`${falhas.length} pagamento(s) não facturado(s)`}>{falhas.slice(0, 5).map(f => <div key={f.pagamento}>{f.erro}</div>)}</Aviso>}
        <DialogFooter className="gap-2">
          <span className="mr-auto self-center text-xs text-muted-foreground">{escolhidos.length} pagamento(s) · base {formatCurrency(total)}</span>
          <Button variant="ghost" onClick={onFechar}>Fechar</Button>
          <Button className="gap-2" disabled={!escolhidos.length || ocupado} onClick={async () => {
            setOcupado(true);
            try {
              const r = await facturarPagamentos(escolhidos, ctx);
              setFalhas(r.falhas);
              ctx.recarregar();
              if (!r.falhas.length) onFechar();
              if (r.emitidos) aposFechar(() => toast.success(`${r.emitidos} factura(s)/recibo emitida(s)`));
            } finally { setOcupado(false); }
          }}><FileCheck2 className="h-4 w-4" />Emitir {escolhidos.length} FR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
