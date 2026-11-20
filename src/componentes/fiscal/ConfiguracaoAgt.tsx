import { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, Cpu, KeyRound, Percent, Plug, Save, Upload, XCircle } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Card } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { toast } from '@/ganchos/usar-toast';
import { ponteAgt, modoPonte, type EstadoPonte, type InfoChave } from '@/bibliotecas/fiscal/ponte-agt';
import { resolverPerfis } from '@/bibliotecas/fiscal/regras';
import { AGT_TIPOS_OPERACAO, type AgtErro, type ConfigFiscal, type PerfilFiscal, type TipoEncargo } from '@/bibliotecas/fiscal/tipos';
import { guardarConfig, testarLigacao } from '@/servicos/ServicoFiscal';
import { Aviso, ErrosAgt } from './comum';
import { ContextoFiscal } from './apoio';

export default function ConfiguracaoAgt({ ctx }: { ctx: ContextoFiscal }) {
  const [config, setConfig] = useState<ConfigFiscal>(ctx.config);
  const [perfis, setPerfis] = useState(() => resolverPerfis(ctx.config));
  const [estado, setEstado] = useState<EstadoPonte | null>(null);
  const [teste, setTeste] = useState<{ ok: boolean; status: number; ms: number; erros: AgtErro[]; erroRede?: string; erro?: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const ro = !ctx.podeAdministrar;

  const lerEstado = () => ponteAgt.estado().then(setEstado).catch(e => setEstado({ success: false, contribuinte: { carregada: false, erro: (e as Error).message }, saft: { carregada: false } }));
  useEffect(() => { lerEstado(); }, []);
  useEffect(() => { setConfig(ctx.config); setPerfis(resolverPerfis(ctx.config)); }, [ctx.config]);

  const mudar = <K extends keyof ConfigFiscal>(k: K, v: ConfigFiscal[K]) => setConfig(c => ({ ...c, [k]: v }));
  const mudarSoftware = (k: keyof ConfigFiscal['software'], v: string | number | undefined) => setConfig(c => ({ ...c, software: { ...c.software, [k]: v } }));
  const mudarPerfil = (k: TipoEncargo, patch: Partial<PerfilFiscal>) => setPerfis(p => ({ ...p, [k]: { ...p[k], ...patch } }));
  const certificado = Boolean(config.software.softwareValidationNumber && config.software.jwsSoftwareSignature);

  const guardar = async () => {
    setOcupado('guardar');
    try { await guardarConfig({ ...config, perfis }, ctx.user); toast.success('Configuração fiscal guardada'); ctx.recarregar(); }
    catch (e) { toast.error((e as Error).message); } finally { setOcupado(null); }
  };

  return (
    <div className="space-y-5">
      {ro && <Aviso tom="info">Só administradores alteram a configuração fiscal.</Aviso>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 font-bold"><Plug className="h-4 w-4" />Ligação à AGT</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['homologacao', 'producao'] as const).map(a => (
              <button key={a} type="button" disabled={ro} onClick={() => mudar('ambiente', a)}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${config.ambiente === a ? 'border-primary bg-primary/5 font-semibold' : ''}`}>
                {a === 'homologacao' ? 'Homologação (testes)' : 'Produção'}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Comunicar documentos à AGT<span className="block text-xs text-muted-foreground">Desligado = simulação: só séries de simulação, sem validade fiscal.</span></span>
            <Switch disabled={ro} checked={config.agtActiva} onCheckedChange={v => mudar('agtActiva', v)} /></label>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Modo de contingência<span className="block text-xs text-muted-foreground">Emite em séries de contingência quando a AGT está indisponível.</span></span>
            <Switch disabled={ro} checked={config.contingencia} onCheckedChange={v => mudar('contingencia', v)} /></label>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Facturar pagamentos automaticamente<span className="block text-xs text-muted-foreground">Emite a Factura/Recibo dos juros e da mora assim que o pagamento fica confirmado.</span></span>
            <Switch disabled={ro} checked={config.emissaoAutomatica} onCheckedChange={v => mudar('emissaoAutomatica', v)} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Estabelecimento</Label><Input disabled={ro} value={config.estabelecimento} onChange={e => mudar('estabelecimento', e.target.value)} /><p className="mt-1 text-[11px] text-muted-foreground">Registado no Portal do Contribuinte (SEDE se só houver um).</p></div>
            <div><Label className="text-xs">Adesão à facturação electrónica</Label><Input disabled={ro} type="date" value={config.dataAdesao ?? ''} onChange={e => mudar('dataAdesao', e.target.value || undefined)} /><p className="mt-1 text-[11px] text-muted-foreground">Documentos anteriores são recusados (E29).</p></div>
            <div><Label className="text-xs">CAE principal (opcional)</Label><Input disabled={ro} maxLength={5} value={config.eacCode ?? ''} onChange={e => mudar('eacCode', e.target.value.replace(/\D/g, '') || undefined)} /></div>
            <div><Label className="text-xs">Cidade / Província (SAF-T)</Label><div className="flex gap-2"><Input disabled={ro} placeholder="Cidade" value={config.cidade ?? ''} onChange={e => mudar('cidade', e.target.value)} /><Input disabled={ro} placeholder="Província" value={config.provincia ?? ''} onChange={e => mudar('provincia', e.target.value)} /></div></div>
          </div>
          {ctx.podeAdministrar && <Button variant="outline" className="gap-2" disabled={ocupado !== null} onClick={async () => {
            setOcupado('teste');
            try { setTeste(await testarLigacao(config, ctx.empresa)); } catch (e) { setTeste({ ok: false, status: 0, ms: 0, erros: [], erroRede: undefined, erro: (e as Error).message }); } finally { setOcupado(null); }
          }}><Plug className="h-4 w-4" />Testar ligação</Button>}
          {teste && (teste.ok ? <Aviso tom="ok" titulo="Ligação estabelecida">A AGT respondeu em {teste.ms} ms e aceitou as assinaturas.</Aviso>
            : <div className="space-y-2"><Aviso tom="erro" titulo="Falha na ligação">{teste.erro ?? teste.erroRede ?? `HTTP ${teste.status}`}</Aviso><ErrosAgt erros={teste.erros} /></div>)}
        </Card>

        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            <h3 className="flex items-center gap-2 font-bold"><Building2 className="h-4 w-4" />Empresa emissora</h3>
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Denominação</dt><dd className="font-medium">{ctx.empresa.nome || '—'}</dd>
              <dt className="text-muted-foreground">NIF</dt><dd className="font-mono">{ctx.empresa.nif || <span className="text-red-600">em falta</span>}</dd>
              <dt className="text-muted-foreground">Morada</dt><dd>{ctx.empresa.morada || '—'}</dd>
            </dl>
            <p className="text-[11px] text-muted-foreground">Estes dados vêm de Definições › Empresa.</p>
          </Card>
          <Card className="space-y-3 p-5">
            <h3 className="flex items-center gap-2 font-bold"><KeyRound className="h-4 w-4" />Chaves privadas</h3>
            <p className="text-[11px] text-muted-foreground">{modoPonte() === 'desktop' ? 'Guardadas cifradas pelo cofre do sistema operativo deste computador.' : 'Guardadas no servidor da empresa (VPS), nunca no navegador.'}</p>
            <LinhaChave titulo="Chave do contribuinte (documentos e pedidos)" info={estado?.contribuinte} extra={estado?.nif ? `NIF ${estado.nif}` : undefined}
              podeImportar={ctx.podeAdministrar} onImportar={async pem => { await ponteAgt.importarChave('contribuinte', pem, ctx.empresa.nif); await lerEstado(); }} />
            <LinhaChave titulo="Chave do hash SAF-T (RSA 1024)" info={estado?.saft}
              podeImportar={ctx.podeAdministrar} onImportar={async pem => { await ponteAgt.importarChave('saft', pem); await lerEstado(); }} />
            {estado?.nif && ctx.empresa.nif && estado.nif !== ctx.empresa.nif && <Aviso tom="erro">A chave do contribuinte pertence ao NIF {estado.nif}, mas a empresa tem o NIF {ctx.empresa.nif}. Importe a chave correcta.</Aviso>}
          </Card>
        </div>
      </div>

      <Card className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-bold"><Cpu className="h-4 w-4" />Software certificado</h3>
        {!certificado && <Aviso tom="aviso" titulo="Software ainda sem certificação AGT">Sem o número de certificação e a assinatura do produtor (jwsSoftwareSignature), a AGT recusa os pedidos (E07/E08). A produção fica bloqueada até serem preenchidos.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-4">
          <div><Label className="text-xs">Produto</Label><Input disabled value={config.software.productId} /></div>
          <div><Label className="text-xs">Versão</Label><Input disabled value={config.software.productVersion} /></div>
          <div><Label className="text-xs">N.º de certificação AGT</Label><Input disabled={!ctx.isSuperAdmin} value={config.software.softwareValidationNumber} onChange={e => mudarSoftware('softwareValidationNumber', e.target.value.trim())} /></div>
          <div><Label className="text-xs">Versão da assinatura</Label><Input disabled={!ctx.isSuperAdmin} type="number" min={1} value={config.software.signatureVersion ?? ''} onChange={e => mudarSoftware('signatureVersion', e.target.value ? Number(e.target.value) : undefined)} /></div>
          <div className="sm:col-span-3"><Label className="text-xs">jwsSoftwareSignature (assinatura do produtor sobre os dados do software)</Label><Textarea disabled={!ctx.isSuperAdmin} rows={2} className="font-mono text-[11px]" value={config.software.jwsSoftwareSignature} onChange={e => mudarSoftware('jwsSoftwareSignature', e.target.value.trim())} /></div>
          <div><Label className="text-xs">NIF do produtor</Label><Input disabled={!ctx.isSuperAdmin} value={config.software.producerTaxId} onChange={e => mudarSoftware('producerTaxId', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
        <p className="text-[11px] text-muted-foreground">Preenchidos pelo produtor (DIGITAL NORTE) depois da certificação. Só o Super Administrador os altera.</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4"><h3 className="flex items-center gap-2 font-bold"><Percent className="h-4 w-4" />Perfis fiscais por tipo de encargo</h3>
          <p className="text-xs text-muted-foreground">Definem o imposto de cada linha. Confirme-os com o contabilista certificado: códigos de isenção (Anexo 6.4) e verbas do Imposto de Selo (Anexo 6.3) da especificação AGT.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm">
          <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 text-left">Encargo</th><th className="text-left">Operação</th><th className="text-left">Imposto</th><th className="text-left">Código</th><th className="text-left">Taxa %</th><th className="text-left">Cód. isenção</th><th className="text-left">Motivo</th><th className="px-4 text-left">Estado</th></tr></thead>
          <tbody className="divide-y">{(Object.keys(perfis) as TipoEncargo[]).map(k => {
            const p = perfis[k];
            return (
              <tr key={k} className={p.porConfirmar ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                <td className="px-4 py-2 text-xs font-medium">{p.label}</td>
                <td className="w-24"><Select disabled={ro} value={p.operationType} onValueChange={v => mudarPerfil(k, { operationType: v as PerfilFiscal['operationType'] })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(AGT_TIPOS_OPERACAO).map(([c, d]) => <SelectItem key={c} value={c} title={d}>{c}</SelectItem>)}</SelectContent></Select></td>
                <td className="w-24"><Select disabled={ro} value={p.taxType} onValueChange={v => mudarPerfil(k, { taxType: v as PerfilFiscal['taxType'] })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{['IVA', 'IS', 'IEC', 'CEOC', 'NS'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></td>
                <td className="w-24"><Input disabled={ro} className="h-8" value={p.taxCode ?? ''} placeholder={p.taxType === 'IVA' ? 'NOR/ISE' : 'verba'} onChange={e => mudarPerfil(k, { taxCode: e.target.value.toUpperCase() })} /></td>
                <td className="w-20"><Input disabled={ro} className="h-8 text-right" type="number" min={0} step="0.01" value={p.taxPercentage} onChange={e => mudarPerfil(k, { taxPercentage: Number(e.target.value) })} /></td>
                <td className="w-24"><Input disabled={ro} className="h-8 font-mono" maxLength={3} placeholder="Mxx" value={p.taxExemptionCode ?? ''} onChange={e => mudarPerfil(k, { taxExemptionCode: e.target.value.toUpperCase() })} /></td>
                <td><Input disabled={ro} className="h-8" maxLength={60} value={p.taxExemptionReason ?? ''} onChange={e => mudarPerfil(k, { taxExemptionReason: e.target.value })} /></td>
                <td className="px-4">{p.porConfirmar
                  ? <Button size="sm" variant="outline" disabled={ro} className="h-7 whitespace-nowrap text-xs" onClick={() => mudarPerfil(k, { porConfirmar: false })}>Marcar confirmado</Button>
                  : <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Confirmado</span>}</td>
              </tr>);
          })}</tbody>
        </table></div>
      </Card>

      {ctx.podeAdministrar && <div className="sticky bottom-4 flex justify-end"><Button className="gap-2 shadow-lg" disabled={ocupado !== null} onClick={guardar}><Save className="h-4 w-4" />Guardar configuração</Button></div>}
    </div>
  );
}

function LinhaChave({ titulo, info, extra, podeImportar, onImportar }: { titulo: string; info?: InfoChave; extra?: string; podeImportar: boolean; onImportar: (pem: string) => Promise<void> }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 text-xs">
      {info?.carregada ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titulo}</p>
        {info?.carregada ? <p className="text-muted-foreground">RSA {info.bits} bits · <span className="font-mono">{info.impressao}</span>{extra ? ` · ${extra}` : ''}</p>
          : <p className="text-red-700">{info?.erro ?? 'Não importada'}</p>}
      </div>
      {podeImportar && <>
        <input ref={entrada} type="file" accept=".pem,.key,.txt" className="hidden" onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setOcupado(true);
          try { await onImportar(await f.text()); toast.success('Chave importada'); } catch (erro) { toast.error((erro as Error).message); } finally { setOcupado(false); }
        }} />
        <Button size="sm" variant="outline" className="gap-1" disabled={ocupado} onClick={() => entrada.current?.click()}><Upload className="h-3.5 w-3.5" />{info?.carregada ? 'Substituir' : 'Importar'}</Button>
      </>}
    </div>
  );
}
