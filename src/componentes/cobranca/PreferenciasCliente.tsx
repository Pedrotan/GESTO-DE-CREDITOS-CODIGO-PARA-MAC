import { useEffect, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { db } from '@/bibliotecas/bd';
import { ServicoHubCobranca, perfilVazio } from '@/servicos/ServicoHubCobranca';
import type { PerfilCobranca } from '@/bibliotecas/hub-cobranca';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Campo } from './comum';
export function PreferenciasCliente({ clientId, onGuardar }: { clientId: string; onGuardar?: () => void }) {
  const { user } = useAuth(), [perfil, setPerfil] = useState<PerfilCobranca>(perfilVazio(clientId)), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { let active = true; void db.get<{ data: string }>('SELECT data FROM hub_collection_clients WHERE clientId = ?', [clientId]).then(row => { if (active) setPerfil(row ? JSON.parse(row.data) : perfilVazio(clientId)); }).catch(e => setMessage(e.message)); return () => { active = false; }; }, [clientId]);
  const save = async () => { if (!user) return; setBusy(true); setMessage(''); try { setPerfil(await ServicoHubCobranca.perfil(perfil, user)); setMessage('Preferências guardadas.'); onGuardar?.(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  return <section className="space-y-3 rounded-xl border bg-card p-4"><h3 className="font-bold">Contacto e promoções</h3>
    <div className="grid gap-3 sm:grid-cols-2"><Campo nome="Província"><Input value={perfil.provincia} onChange={e => setPerfil({ ...perfil, provincia: e.target.value })} /></Campo><Campo nome="Balcão"><Input value={perfil.balcao} onChange={e => setPerfil({ ...perfil, balcao: e.target.value })} /></Campo></div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={perfil.consentimento} onChange={e => setPerfil({ ...perfil, consentimento: e.target.checked })} /><span>O cliente aceitou receber promoções pelo WhatsApp.</span></label>
    {perfil.consentimento && <Campo nome="Comprovativo do aceite (data, meio e referência)"><Textarea value={perfil.evidencia || ''} onChange={e => setPerfil({ ...perfil, evidencia: e.target.value })} placeholder="Ex.: aceite no formulário assinado de 25/10/2026, documento na ficha." /></Campo>}
    {perfil.aceiteEm && <p className="text-xs text-muted-foreground">Aceite registado em {new Date(perfil.aceiteEm).toLocaleString('pt-AO')} por {perfil.aceitePor}.</p>}
    <p className="text-xs text-muted-foreground">Sem aceite, o cliente fica excluído de campanhas. Responder SAIR retira o número das promoções.</p>
    <Button type="button" variant="outline" disabled={busy} onClick={save}>Guardar preferências de contacto</Button>{message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
