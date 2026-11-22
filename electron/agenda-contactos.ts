// Agenda de contactos dos clientes no processo principal: as consultas, a revelação do NIF/BI e as exportações
// passam por aqui. As permissões são verificadas com a conta da sessão relida da base (nunca com o que o renderer
// diz) e cada exportação e cada «Revelar NIF» fica na auditoria com utilizador, data, âmbito, filtros, formato,
// n.º de registos e IP. O registo de auditoria volta ao renderer só para entrar na fila da sincronização.
import * as crypto from 'crypto';
import * as os from 'os';
import {
    consultarFicha, consultarLista, consultarResumo, contar, descreverFiltros, filtrosDaExportacao, idsDoFiltro, linhasExportacao,
    normalizarFiltros, podeAgenda, recusaExportacao, revelarNif, SQL_AUDITORIA, type ExecutorSql, type PedidoExportacao,
} from '../src/bibliotecas/contactos/agenda-contactos';

type Query = (type: string, sql: string, params?: unknown[]) => Promise<any>;

export function registarAgendaContactos(deps: {
    ipcMain: Electron.IpcMain;
    assertTrustedIpcSender: (event: Electron.IpcMainInvokeEvent) => void;
    autenticado: (event: Electron.IpcMainInvokeEvent) => any;
    runQuery: Query;
    aposAuditoria: () => void;
    ip: () => string;
}) {
    const exec: ExecutorSql = {
        all: (sql, params) => deps.runQuery('query', sql, params || []),
        get: (sql, params) => deps.runQuery('get', sql, params || []),
    };
    const contaActual = async (event: Electron.IpcMainInvokeEvent) => {
        const sessao = deps.autenticado(event);
        const linha = await deps.runQuery('get', 'SELECT id, name, role, isOwner, permissions FROM users WHERE id = ? LIMIT 1', [sessao?.id]).catch(() => null);
        return { ...sessao, ...(linha || {}) };
    };
    const exigir = (conta: any, accao: Parameters<typeof podeAgenda>[1], mensagem: string) => {
        if (!podeAgenda(conta, accao)) throw new Error(mensagem);
    };
    const auditar = async (conta: any, action: 'export' | 'view', details: string, metadata: Record<string, unknown>) => {
        const params = [crypto.randomUUID(), new Date().toISOString(), conta?.id || 'system', conta?.name || 'Utilizador', action, 'client', details, null, null,
            JSON.stringify({ source: 'electron-main', module: 'agenda_contactos', device: `${os.hostname()} · Aplicação desktop`, ip: deps.ip(), ...metadata })];
        await deps.runQuery('execute', SQL_AUDITORIA, params);
        deps.aposAuditoria();
        return { sql: SQL_AUDITORIA, params };
    };

    deps.ipcMain.handle('agenda-contactos', async (event, accao: string, payload: any) => {
        deps.assertTrustedIpcSender(event);
        const conta = await contaActual(event);
        exigir(conta, 'ver', 'Sem permissão para ver a agenda de contactos.');
        const p = payload && typeof payload === 'object' ? payload : {};
        switch (accao) {
            case 'listar': return consultarLista(exec, normalizarFiltros(p.filtros), Number(p.pagina) || 1, Number(p.porPagina) || 25);
            case 'resumo': return consultarResumo(exec, normalizarFiltros(p.filtros));
            case 'ids': return idsDoFiltro(exec, normalizarFiltros(p.filtros));
            case 'ficha': return consultarFicha(exec, String(p.id || ''));
            case 'contagem': {
                const pedido = p.pedido as PedidoExportacao;
                return contar(exec, filtrosDaExportacao(pedido));
            }
            case 'revelar-nif': {
                exigir(conta, 'revelar_nif', 'Sem permissão para ver o NIF/BI completo.');
                const r = await revelarNif(exec, String(p.id || ''));
                if (!r) throw new Error('Cliente não encontrado.');
                const auditoria = await auditar(conta, 'view', `Revelou o NIF/BI do cliente ${r.nome} na agenda de contactos`, { clientId: p.id, accao: 'revelar_nif' });
                return { nif: r.nif, auditoria };
            }
            case 'exportar': {
                const pedido = p.pedido as PedidoExportacao;
                if (!pedido || !Array.isArray(pedido.campos)) throw new Error('Pedido de exportação inválido.');
                const recusa = recusaExportacao(conta, pedido);
                if (recusa) throw new Error(recusa);
                const linhas = await linhasExportacao(exec, pedido, pedido.campos.includes('nif'));
                const filtros = filtrosDaExportacao(pedido);
                const auditoria = await auditar(conta, 'export',
                    `Exportou ${linhas.length} contacto(s) de clientes em ${pedido.formato.toUpperCase()} (${pedido.ambito === 'um' ? `cliente ${linhas[0]?.nome || ''}` : pedido.ambito})`,
                    { ambito: pedido.ambito, formato: pedido.formato, registos: linhas.length, campos: pedido.campos, filtros: descreverFiltros(filtros), incluiNif: pedido.campos.includes('nif') });
                return { linhas, auditoria };
            }
            default: throw new Error('Acção desconhecida da agenda de contactos.');
        }
    });
}
