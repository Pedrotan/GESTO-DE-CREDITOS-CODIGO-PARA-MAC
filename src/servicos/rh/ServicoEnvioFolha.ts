// Envio da folha de correcção ao portal dos funcionários: o PDF (marca CORREÇÃO) fica como documento da empresa
// (o portal só o abre para ver, sem descarregar), cada funcionário activo recebe uma mensagem marcada e um aviso
// em vermelho. A reclamação do funcionário vai ao Gestor de RH, ao Administrador principal e aos Super Administradores.
import { db } from '@/bibliotecas/bd';
import { auditoriaRH, ServicoRH, type ActorRH, type Funcionario } from './ServicoRH';
import { EMPRESA } from './ServicoDocumentosRH';
import { ServicoReclamacoesRH } from './ServicoReclamacoesRH';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MARCA = /\[\[folha-correcao:([\w-]+):([\w-]+)\]\]/u;
const agora = () => new Date().toISOString();
const NOTIFICACAO_SQL = 'INSERT INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)';

export type FolhaRecebida = { mensagemId: string; documentoId: string; processamentoId: string; assunto: string; lida: boolean; criadoEm: string };

/** Lê a marca da folha de correcção numa mensagem do correio (ou null). */
export const folhaDaMensagem = (m: { id: string; assunto: string; corpo: string; lida: number; criado_em: string }): FolhaRecebida | null => {
    const r = MARCA.exec(m.corpo || '');
    return r ? { mensagemId: m.id, documentoId: r[1], processamentoId: r[2], assunto: m.assunto, lida: Boolean(m.lida), criadoEm: m.criado_em } : null;
};

/** Texto da mensagem sem a marca técnica (para o correio). */
export const semMarcaFolha = (corpo: string) => corpo.replace(MARCA, '').trim();

export class ServicoEnvioFolha {
    /**
     * Envia a folha de correcção a todos os funcionários activos. `pdfDataUrl` é a folha gerada com a marca CORREÇÃO.
     * Devolve quantos funcionários a receberam.
     */
    static async enviar(proc: { id: string; ano: number; mes: number }, pdfDataUrl: string, actor: ActorRH) {
        const periodo = `${MESES[proc.mes - 1]}/${proc.ano}`;
        const documentoId = await ServicoRH.carregarDocumento({
            funcionario_id: EMPRESA, categoria: 'salarial', nome: `Folha de correção — ${periodo}`,
            ficheiro_nome: `folha-correcao-${proc.ano}-${String(proc.mes).padStart(2, '0')}.pdf`, data_url: pdfDataUrl, confidencial: false, origem: 'folha_correcao',
        }, 25, actor);
        const funcionarios = (await ServicoRH.funcionarios()).filter(f => f.estado === 'activo');
        if (!funcionarios.length) throw new Error('Não há funcionários activos para receber a folha.');
        const when = agora();
        const assunto = `Folha de correção — ${periodo}`;
        const corpo = `A folha de correção de ${periodo} está disponível no seu painel para conferir. Se encontrar algum erro, faça a reclamação com a justificação.\n[[folha-correcao:${documentoId}:${proc.id}]]`;
        const statements: Array<{ sql: string; params?: unknown[]; expectChanges?: number }> = funcionarios.flatMap(f => [
            { sql: `INSERT INTO rh_correio (id, funcionario_id, sentido, assunto, corpo, resposta_a, criado_em, de_id, de_nome) VALUES (?, ?, 'para_funcionario', ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), f.id, assunto, corpo, null, when, actor.id, actor.name], expectChanges: 1 },
            ...(f.utilizador_id ? [{ sql: NOTIFICACAO_SQL, params: [crypto.randomUUID(), f.utilizador_id, 'Nova folha de correção', `${assunto}: confira-a no seu painel.`, 'error', when] }] : []),
        ]);
        statements.push(auditoriaRH(actor, 'create', `Enviou a folha de correção de ${periodo} a ${funcionarios.length} funcionário(s)`, { processamentoId: proc.id, documentoId }, undefined, undefined, when));
        await db.transaction(statements);
        return funcionarios.length;
    }

    /** Reclamação do funcionário sobre a folha de correcção, com aviso aos responsáveis (RH, principal e Super Administradores). */
    static async reclamar(f: Funcionario, folha: FolhaRecebida, motivo: string, actor: ActorRH, destinatarios: string[]) {
        const id = await ServicoReclamacoesRH.reclamar({ funcionario_id: f.id, processamento_id: folha.processamentoId, recibo_id: null, descricao: `Folha de correção (${folha.assunto.replace(/^Folha de correção — /u, '')})`, motivo }, actor);
        const when = agora();
        const avisos = [...new Set(destinatarios)].filter(u => u && u !== actor.id).map(userId => ({
            sql: NOTIFICACAO_SQL, params: [crypto.randomUUID(), userId, 'Reclamação da folha de correção', `${f.nome}: ${motivo.trim().slice(0, 160)}`, 'warning', when],
        }));
        if (avisos.length) await db.transaction(avisos).catch(error => console.warn('[RH] Aviso da reclamação não enviado:', error));
        return id;
    }
}
