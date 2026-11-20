// Relógios biométricos com ligação directa (F3.6) e alertas do ponto por e-mail. Os relógios enviam as marcações
// para o servidor da empresa; este serviço vai buscá-las, junta-as ao livro de ponto (origem «relógio»), confirma a
// recepção e o servidor apaga-as. Sem ligação à nuvem nada acontece (a importação por ficheiro continua disponível).
import { db } from '@/bibliotecas/bd';
import type { TipoMarcacao } from '@/bibliotecas/rh/ponto-calculo';
import { pedidoNuvem, urlNuvem } from '@/servicos/ServicoSincronizacaoCloud';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { ServicoPontoRH } from './ServicoPontoRH';
import type { ActorRH } from './ServicoRH';

export type Relogio = {
    device_id: string; nome: string; localizacao: string | null; serial: string | null; criado_em: string;
    ultimo_contacto: string | null; ultimo_ip: string | null; pendentes: number;
};
type MarcacaoServidor = { id: string; device_id: string; numero: string; data_hora: string; estado: number | null };
export type ResultadoRecolha = { recebidas: number; importadas: number; desconhecidas: string[]; bloqueadas: number };

/** Sem contacto há mais de 1 hora = offline (secção 7.7). */
export const relogioOnline = (r: Pick<Relogio, 'ultimo_contacto'>, agora = Date.now()) => Boolean(r.ultimo_contacto && agora - Date.parse(r.ultimo_contacto) < 3_600_000);

/** Estado do relógio (protocolo ADMS/ZKTeco ou push HTTP). 0 = «entrada» por omissão em muitos modelos: infere-se. */
const tipoDoEstado = (estado: number | null): TipoMarcacao | null =>
    estado === 1 || estado === 5 ? 'saida' : estado === 2 ? 'inicio_pausa' : estado === 3 ? 'fim_pausa' : estado === 4 ? 'entrada' : null;
const seguinte = (anterior: TipoMarcacao | null | undefined): TipoMarcacao =>
    anterior === 'entrada' || anterior === 'fim_pausa' ? 'saida' : anterior === 'inicio_pausa' ? 'fim_pausa' : 'entrada';

let aRecolher: Promise<ResultadoRecolha | null> | null = null;
let ultimaRecolha = 0;

export class ServicoRelogiosPonto {
    static ligado() {
        return Boolean(urlNuvem());
    }

    static enderecos() {
        const base = urlNuvem();
        if (!base) return null;
        const host = base.replace(/^https?:\/\//u, '').replace(/\/.*$/u, '');
        return { https: base, host, adms: `http://${host}` };
    }

    static async relogios(): Promise<Relogio[]> {
        const r = await pedidoNuvem<{ relogios: Relogio[] }>('/api/ponto', { accao: 'relogios' });
        return r?.relogios || [];
    }

    static async registar(input: { nome: string; localizacao?: string; serial?: string }, actor: ActorRH) {
        this.assertRH(actor);
        const r = await pedidoNuvem<{ deviceId: string; chave: string }>('/api/ponto', { accao: 'registarRelogio', ...input });
        if (!r) throw new Error('Ligue primeiro a empresa à nuvem (Definições › Sincronização) para usar relógios com ligação directa.');
        return r;
    }

    static async novaChave(deviceId: string, actor: ActorRH) {
        this.assertRH(actor);
        const r = await pedidoNuvem<{ chave: string }>('/api/ponto', { accao: 'novaChave', deviceId });
        if (!r) throw new Error('Sem ligação ao servidor.');
        return r.chave;
    }

    static async remover(deviceId: string, actor: ActorRH) {
        this.assertRH(actor);
        await pedidoNuvem('/api/ponto', { accao: 'removerRelogio', deviceId });
    }

    /**
     * Vai buscar as marcações novas dos relógios e junta-as ao livro de ponto. Os tipos que o relógio não indica
     * seguem as marcações que o funcionário já tem nesse dia (entrada → saída → entrada…). Ficam no servidor (por
     * importar) as de números sem funcionário e as de meses fechados, para entrarem depois de corrigido.
     */
    static recolher(actor: ActorRH, opcoes: { seNecessario?: boolean } = {}): Promise<ResultadoRecolha | null> {
        if (!ServicoControloAcesso.temPermissao(actor as any, 'hr_manage') || !this.ligado()) return Promise.resolve(null);
        if (opcoes.seNecessario && Date.now() - ultimaRecolha < 120_000) return Promise.resolve(null);
        aRecolher ||= this.recolherAgora(actor).finally(() => { aRecolher = null; ultimaRecolha = Date.now(); });
        return aRecolher;
    }

    private static async recolherAgora(actor: ActorRH): Promise<ResultadoRecolha | null> {
        const r = await pedidoNuvem<{ marcacoes: MarcacaoServidor[] }>('/api/ponto', { accao: 'recolher' }, 60_000);
        if (!r || !r.marcacoes.length) return r ? { recebidas: 0, importadas: 0, desconhecidas: [], bloqueadas: 0 } : null;
        const marcacoes = r.marcacoes;
        const texto = marcacoes.map(m => `${m.numero};${m.data_hora.replace('T', ' ')};${tipoDoEstado(m.estado) || ''}`).join('\n');
        const linhas = await ServicoPontoRH.previsualizarImportacao(texto, { modo: 'marcacoes', numero: 0, data: null, hora: null, data_hora: 1, tipo: 2, entrada: null, saida: null, cabecalho: false });
        // Cada linha corresponde a uma marcação do servidor, pela ordem.
        const comServidor = linhas.map(l => ({ ...l, servidor: marcacoes[l.linha - 1], tipoIndicado: tipoDoEstado(marcacoes[l.linha - 1]?.estado ?? null) }));
        const validas = comServidor.filter(l => l.estado !== 'funcionario_desconhecido' && l.estado !== 'data_invalida' && l.funcionario_id && l.data && l.data_hora);
        // Tipos em falta: a seguir às marcações que já existem nesse dia (e às novas anteriores).
        const datas = validas.map(l => l.data!).sort();
        const existentes = datas.length ? await db.all<{ funcionario_id: string; data: string; data_hora: string; tipo: TipoMarcacao | null }>(
            'SELECT funcionario_id, data, data_hora, tipo FROM rh_marcacao WHERE anulada = 0 AND data >= ? AND data <= ?', [datas[0], datas[datas.length - 1]]).catch(() => []) : [];
        const porDia = new Map<string, Array<{ data_hora: string; tipo: TipoMarcacao | null; nova?: (typeof validas)[number] }>>();
        for (const e of existentes) porDia.set(`${e.funcionario_id}:${e.data}`, [...(porDia.get(`${e.funcionario_id}:${e.data}`) || []), e]);
        for (const l of validas) porDia.set(`${l.funcionario_id}:${l.data}`, [...(porDia.get(`${l.funcionario_id}:${l.data}`) || []), { data_hora: l.data_hora!, tipo: l.tipoIndicado, nova: l }]);
        for (const lista of porDia.values()) {
            lista.sort((a, b) => a.data_hora.localeCompare(b.data_hora));
            let anterior: TipoMarcacao | null = null;
            for (const item of lista) {
                if (item.nova && !item.tipo) item.tipo = seguinte(anterior);
                if (item.nova) item.nova.tipo = item.tipo;
                anterior = item.tipo;
            }
        }
        // Já existentes (a mesma hora e tipo, por exemplo importadas antes por ficheiro) só se confirmam.
        const resultado = await ServicoPontoRH.importarDoRelogio(validas.filter(l => l.estado !== 'duplicada').map(l => ({
            servidorId: l.servidor.id, dispositivoId: l.servidor.device_id, funcionario_id: l.funcionario_id!, data: l.data!, data_hora: l.data_hora!, tipo: l.tipo,
        })), actor);
        const bloqueadas = new Set(resultado.bloqueadas);
        // Confirmadas: importadas (ou já existentes) e as de data inválida (não há o que fazer com elas).
        const confirmar = [
            ...validas.filter(l => !bloqueadas.has(l.servidor.id)).map(l => l.servidor.id),
            ...comServidor.filter(l => l.estado === 'data_invalida').map(l => l.servidor?.id).filter(Boolean),
        ];
        if (confirmar.length) await pedidoNuvem('/api/ponto', { accao: 'confirmar', ids: confirmar });
        return {
            recebidas: marcacoes.length, importadas: resultado.importadas, bloqueadas: bloqueadas.size,
            desconhecidas: [...new Set(comServidor.filter(l => l.estado === 'funcionario_desconhecido').map(l => l.numero))],
        };
    }

    // ── E-mail ────────────────────────────────────────────────────────────────────
    static async estadoEmail(): Promise<{ email: boolean; motivo: string | null } | null> {
        return pedidoNuvem<{ email: boolean; motivo: string | null }>('/api/ponto', { accao: 'estadoEmail' }).catch(() => null);
    }

    static async enviarEmails(mensagens: Array<{ para: string; assunto: string; texto: string }>) {
        if (!mensagens.length) return null;
        return pedidoNuvem<{ enviados: number; motivo?: string }>('/api/ponto', { accao: 'email', mensagens }).catch(() => null);
    }

    private static assertRH(actor: ActorRH) {
        if (!ServicoControloAcesso.temPermissao(actor as any, 'hr_manage')) throw new Error('Só o RH gere os relógios.');
    }
}
