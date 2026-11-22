import { db, dbUsaBaseLocal } from '@/bibliotecas/bd';
import {
    consultarFicha, consultarLista, consultarResumo, contar, descreverFiltros, EMAIL_VALIDO, filtrosDaExportacao, idsDoFiltro, linhasExportacao,
    normalizarFiltros, podeAgenda, recusaExportacao, revelarNif, type ExecutorSql, type FiltrosContactos, type LinhaContacto, type LinhaExportacao,
    type PedidoExportacao, type ResumoContactos,
} from '@/bibliotecas/contactos/agenda-contactos';
import { ServicoAuditoria } from '@/servicos/ServicoAuditoria';
import { enqueueSyncOperation } from '@/servicos/ServicoSincronizacaoCloud';

type Actor = { id: string; name: string; role?: string; isOwner?: unknown; permissions?: unknown } | null | undefined;
type Auditoria = { sql: string; params: unknown[] };

/**
 * Agenda de contactos. No Electron (base deste dispositivo) tudo passa pelo processo principal, que verifica as
 * permissões e grava a auditoria; aqui só se põe esse registo na fila da sincronização. Na versão web e nos postos
 * ligados a outro computador, as mesmas consultas correm sobre a base disponível, com as mesmas regras de permissão.
 */
const ipc = () => {
    const api = (window as any).electronAPI;
    return api?.agendaContactos && dbUsaBaseLocal() ? api.agendaContactos as (accao: string, payload?: unknown) => Promise<any> : null;
};
const exec: ExecutorSql = { all: (sql, params) => db.all(sql, params as any[]), get: (sql, params) => db.get(sql, params as any[]) };

const sincronizarAuditoria = async (a?: Auditoria) => {
    if (a?.sql && Array.isArray(a.params)) await enqueueSyncOperation(a.sql, a.params).catch(() => undefined);
};
const exigir = (actor: Actor, ok: boolean, mensagem: string) => { if (!actor || !ok) throw new Error(mensagem); };

export const ServicoAgendaContactos = {
    async listar(filtros: FiltrosContactos, pagina: number, porPagina: number, actor: Actor): Promise<{ linhas: LinhaContacto[]; total: number; pagina: number; porPagina: number }> {
        const viaIpc = ipc();
        if (viaIpc) return viaIpc('listar', { filtros, pagina, porPagina });
        exigir(actor, podeAgenda(actor, 'ver'), 'Sem permissão para ver a agenda de contactos.');
        return consultarLista(exec, normalizarFiltros(filtros), pagina, porPagina);
    },

    async resumo(filtros: FiltrosContactos, actor: Actor): Promise<ResumoContactos> {
        const viaIpc = ipc();
        if (viaIpc) return viaIpc('resumo', { filtros });
        exigir(actor, podeAgenda(actor, 'ver'), 'Sem permissão para ver a agenda de contactos.');
        return consultarResumo(exec, normalizarFiltros(filtros));
    },

    async ids(filtros: FiltrosContactos, actor: Actor): Promise<string[]> {
        const viaIpc = ipc();
        if (viaIpc) return viaIpc('ids', { filtros });
        exigir(actor, podeAgenda(actor, 'ver'), 'Sem permissão para ver a agenda de contactos.');
        return idsDoFiltro(exec, normalizarFiltros(filtros));
    },

    async ficha(id: string, actor: Actor) {
        const viaIpc = ipc();
        if (viaIpc) return viaIpc('ficha', { id }) as ReturnType<typeof consultarFicha>;
        exigir(actor, podeAgenda(actor, 'ver'), 'Sem permissão para ver a agenda de contactos.');
        return consultarFicha(exec, id);
    },

    async contagem(pedido: PedidoExportacao, actor: Actor): Promise<number> {
        const viaIpc = ipc();
        if (viaIpc) return viaIpc('contagem', { pedido });
        exigir(actor, podeAgenda(actor, 'ver'), 'Sem permissão para ver a agenda de contactos.');
        return contar(exec, filtrosDaExportacao(pedido));
    },

    async revelarNif(id: string, actor: Actor): Promise<string> {
        const viaIpc = ipc();
        if (viaIpc) {
            const r = await viaIpc('revelar-nif', { id });
            await sincronizarAuditoria(r?.auditoria);
            return String(r?.nif || '');
        }
        exigir(actor, podeAgenda(actor, 'revelar_nif'), 'Sem permissão para ver o NIF/BI completo.');
        const r = await revelarNif(exec, id);
        if (!r) throw new Error('Cliente não encontrado.');
        await ServicoAuditoria.addLog('view', 'client', `Revelou o NIF/BI do cliente ${r.nome} na agenda de contactos`, actor!.id, actor!.name, undefined, undefined,
            { module: 'agenda_contactos', clientId: id, accao: 'revelar_nif' });
        return r.nif;
    },

    /** Linhas do ficheiro a exportar (permissões e auditoria antes de qualquer dado sair). */
    async exportar(pedido: PedidoExportacao, actor: Actor): Promise<LinhaExportacao[]> {
        const viaIpc = ipc();
        if (viaIpc) {
            const r = await viaIpc('exportar', { pedido });
            await sincronizarAuditoria(r?.auditoria);
            return r?.linhas || [];
        }
        const recusa = recusaExportacao(actor, pedido);
        if (recusa) throw new Error(recusa);
        const linhas = await linhasExportacao(exec, pedido, pedido.campos.includes('nif'));
        await ServicoAuditoria.addLog('export', 'client',
            `Exportou ${linhas.length} contacto(s) de clientes em ${pedido.formato.toUpperCase()} (${pedido.ambito === 'um' ? `cliente ${linhas[0]?.nome || ''}` : pedido.ambito})`,
            actor!.id, actor!.name, undefined, undefined,
            { module: 'agenda_contactos', ambito: pedido.ambito, formato: pedido.formato, registos: linhas.length, campos: pedido.campos, filtros: descreverFiltros(filtrosDaExportacao(pedido)), incluiNif: pedido.campos.includes('nif') });
        return linhas;
    },

    /** Edição rápida de email, morada ou telefone alternativo (o processo principal exige «Gerir Clientes»). */
    async editarContacto(id: string, campo: 'email' | 'address' | 'alternativePhone', valor: string, actor: Actor) {
        exigir(actor, podeAgenda(actor, 'editar'), 'Sem permissão para editar contactos de clientes.');
        const limpo = valor.trim();
        if (campo === 'email' && limpo && !EMAIL_VALIDO.test(limpo)) throw new Error('O email é inválido.');
        if (campo === 'alternativePhone' && limpo && limpo.replace(/\D/gu, '').length < 9) throw new Error('O telefone alternativo é inválido.');
        const anterior = await db.get<{ name: string; valor: string | null }>(`SELECT name, ${campo} AS valor FROM clients WHERE id = ? AND deletedAt IS NULL`, [id]);
        if (!anterior) throw new Error('Cliente não encontrado.');
        const agora = new Date().toISOString();
        if (campo === 'email') await db.run('UPDATE clients SET email = ?, updatedAt = ? WHERE id = ?', [limpo, agora, id]);
        else if (campo === 'address') await db.run('UPDATE clients SET address = ?, updatedAt = ? WHERE id = ?', [limpo, agora, id]);
        else await db.run('UPDATE clients SET alternativePhone = ?, updatedAt = ? WHERE id = ?', [limpo, agora, id]);
        const rotulo = campo === 'email' ? 'email' : campo === 'address' ? 'morada' : 'telefone alternativo';
        await ServicoAuditoria.addLog('update', 'client', `Actualizou o ${rotulo} do cliente ${anterior.name} na agenda de contactos`, actor!.id, actor!.name,
            { [campo]: anterior.valor ?? '' }, { [campo]: limpo }, { module: 'agenda_contactos', clientId: id });
    },
};
