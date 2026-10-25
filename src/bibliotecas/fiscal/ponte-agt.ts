/**
 * Ponte para a AGT vista do renderer. As chaves privadas e as chamadas HTTP ficam fora do navegador:
 *  - Desktop (Electron): processo principal, via IPC (electron/main.ts › registerAgtHandlers);
 *  - Web (VPS): rota /api/agt (vercel-api/agt.js), autenticada pela sessão da empresa.
 */
import { lerSegredo, SEGREDO_CODIGO_EMPRESA } from '../cofre-segredos.ts';
import type { AgtAmbiente } from './tipos.ts';

export interface InfoChave { carregada: boolean; bits?: number; impressao?: string; erro?: string }
export interface EstadoPonte { success: boolean; nif?: string; contribuinte: InfoChave; saft: InfoChave; erro?: string }
export interface RespostaAgt { success: boolean; ok: boolean; status: number; dados: any; erroRede?: string; ms: number }

export type ServicoAgt = 'solicitarSerie' | 'listarSeries' | 'registarFactura' | 'obterEstado' | 'consultarFactura' | 'listarFacturas' | 'validarDocumento';

const electron = () => (typeof window !== 'undefined' ? (window as any).electronAPI : undefined);
export const ponteDisponivel = () => Boolean(electron()?.agtEstado) || (typeof window !== 'undefined' && window.location.protocol.startsWith('http'));
export const modoPonte = (): 'desktop' | 'web' => (electron()?.agtEstado ? 'desktop' : 'web');

async function web<T>(corpo: Record<string, unknown>): Promise<T> {
  const tenantId = localStorage.getItem('tango_active_tenant_id');
  if (!tenantId) throw new Error('Ligue primeiro a empresa à nuvem (Definições › Sincronização) para usar a facturação electrónica na versão web.');
  const codigo = lerSegredo(SEGREDO_CODIGO_EMPRESA);
  const resposta = await fetch('/api/agt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-tenant-id': tenantId, ...(codigo ? { 'x-sync-passkey': codigo } : {}) },
    credentials: 'same-origin',
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(45_000),
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || !dados?.success) throw new Error(dados?.message || `Ponte AGT indisponível (HTTP ${resposta.status}).`);
  return dados as T;
}

export const ponteAgt = {
  estado: (): Promise<EstadoPonte> => (electron()?.agtEstado ? electron().agtEstado() : web<EstadoPonte>({ accao: 'estado' })),

  importarChave: (tipo: 'contribuinte' | 'saft', pem: string, nif?: string) =>
    (electron()?.agtImportarChave ? electron().agtImportarChave({ tipo, pem, nif }) : web({ accao: 'importarChave', tipo, pem, nif })),

  assinarDocumento: async (payload: Record<string, unknown>): Promise<string> => {
    const r = electron()?.agtAssinarDocumento ? await electron().agtAssinarDocumento(payload) : await web<{ jws: string }>({ accao: 'assinarDocumento', payload });
    return r.jws;
  },

  hashesSaft: async (mensagens: string[]): Promise<string[]> => {
    const r = electron()?.agtHashSaft ? await electron().agtHashSaft(mensagens) : await web<{ hashes: string[] }>({ accao: 'hashSaft', mensagens });
    return r.hashes;
  },

  chamar: (ambiente: AgtAmbiente, servico: ServicoAgt, corpo: Record<string, unknown>): Promise<RespostaAgt> =>
    (electron()?.agtChamar ? electron().agtChamar({ ambiente, servico, corpo }) : web<RespostaAgt>({ accao: 'chamar', ambiente, servico, corpo })),
};
