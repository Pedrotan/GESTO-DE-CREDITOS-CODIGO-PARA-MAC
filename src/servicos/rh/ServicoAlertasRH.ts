// Tarefa diária de alertas do RH e do BI dos clientes. Na arquitectura local-first os dados de cada empresa estão
// nos computadores (e cifrados na nuvem), por isso a tarefa corre na aplicação: ao entrar e de 30 em 30 minutos.
// É idempotente (id = chave única), por isso vários computadores da mesma empresa podem corrê-la sem duplicar.
import { db } from '@/bibliotecas/bd';
import { gerarAlertas, type Alerta } from '@/bibliotecas/rh/alertas-rh';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoRH, type ActorRH } from './ServicoRH';
import { ServicoTempoRH } from './ServicoTempoRH';
import { ServicoSalariosRH } from './ServicoSalariosRH';
import { ServicoFeriasRH } from './ServicoFeriasRH';

export type AlertaRH = Alerta & { estado: 'novo' | 'lido' | 'resolvido'; lido_em: string | null; resolvido_em: string | null; criado_em: string };
const agora = () => new Date().toISOString();

export class ServicoAlertasRH {
    static abertos() {
        return db.all<AlertaRH>(`SELECT * FROM rh_alerta WHERE estado <> 'resolvido' ORDER BY prioridade, data_alerta`).catch(() => [] as AlertaRH[]);
    }

    static async marcarLido(id: string, actor: ActorRH) {
        await db.run(`UPDATE rh_alerta SET estado = 'lido', lido_por = ?, lido_em = ? WHERE id = ? AND estado = 'novo'`, [actor.id, agora(), id]);
    }

    /** Só os alertas informativos se resolvem à mão; os de acção resolvem-se quando a acção é feita. */
    static async resolver(id: string, actor: ActorRH) {
        await db.run(`UPDATE rh_alerta SET estado = 'resolvido', resolvido_por = ?, resolvido_em = ? WHERE id = ? AND estado <> 'resolvido'`, [actor.id, agora(), id]);
    }

    /** Corre a tarefa: devolve os alertas novos criados agora. */
    static async executar(actor: ActorRH, opcoes: { gerirRH: boolean; gerirClientes: boolean }) {
        const hoje = luandaTodayKey();
        if (opcoes.gerirRH) await ServicoFeriasRH.sincronizar(actor).catch(() => 0);
        const [funcionarios, contratos, documentos, planos, processamentos, ausencias, parametros, existentes, clientes] = await Promise.all([
            ServicoRH.funcionarios(), ServicoRH.contratos(), ServicoRH.documentos(), ServicoFeriasRH.planos(), ServicoSalariosRH.processamentos(),
            ServicoTempoRH.ausencias(), ServicoRH.parametros(), db.all<AlertaRH>('SELECT * FROM rh_alerta').catch(() => [] as AlertaRH[]),
            db.all<{ id: string; name: string; nif: string | null; expiryDate: string | null; deletedAt: string | null }>(
                'SELECT id, name, nif, expiryDate, deletedAt FROM clients WHERE deletedAt IS NULL').catch(() => []),
        ]);
        const num = (chave: string, omissao: number) => valorNumerico(parametros, chave, hoje, omissao);
        const alertas = gerarAlertas({
            hoje, funcionarios, contratos, documentos, planos, processamentos, ausenciasPendentes: ausencias.filter(a => a.estado === 'pendente').length, clientes,
            parametros: { alertaFeriasDias: num('alerta_ferias_dias', 5), mesNatal: num('subsidio_natal_mes', 11), prazoEntregaDia: num('prazo_entrega_dia', 10),
                alertaPrazosDias: num('alerta_prazos_dias', 5), biDiasAviso: num('bi_dias_aviso', 90) },
        });
        const porId = new Map(existentes.map(a => [a.id, a]));
        const actuais = new Set(alertas.map(a => a.id));
        const when = agora();
        const statements: Array<{ sql: string; params: unknown[] }> = [];
        const novos: Alerta[] = [];
        for (const a of alertas) {
            const e = porId.get(a.id);
            if (!e) {
                novos.push(a);
                statements.push({ sql: `INSERT OR IGNORE INTO rh_alerta (id, tipo, referencia_id, funcionario_id, mensagem, data_alerta, destinatario_perfil, prioridade, accao, estado, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?)`, params: [a.id, a.tipo, a.referencia_id, a.funcionario_id, a.mensagem, a.data_alerta, a.destinatario_perfil, a.prioridade, a.accao, when] });
            } else if (e.estado !== 'resolvido' && e.mensagem !== a.mensagem) {
                // Não duplica: o alerta aberto só actualiza a mensagem (ex.: dias em falta).
                statements.push({ sql: `UPDATE rh_alerta SET mensagem = ?, actualizado_em = ? WHERE id = ? AND estado <> 'resolvido'`, params: [a.mensagem, when, a.id] });
            }
        }
        // Alertas abertos que já não se verificam (acção feita ou data passada) passam a resolvidos.
        for (const e of existentes) {
            if (e.estado !== 'resolvido' && !actuais.has(e.id))
                statements.push({ sql: `UPDATE rh_alerta SET estado = 'resolvido', resolvido_por = 'tarefa-diaria', resolvido_em = ? WHERE id = ? AND estado <> 'resolvido'`, params: [when, e.id] });
        }
        for (let i = 0; i < statements.length; i += 200) await db.transaction(statements.slice(i, i + 200));
        // BI dos clientes: data do último alerta (só com permissão de gerir clientes).
        if (opcoes.gerirClientes) {
            const marcar = novos.filter(a => a.tipo === 'bi_cliente' && a.referencia_id).map(a => a.referencia_id!);
            for (let i = 0; i < marcar.length; i += 200)
                await db.transaction(marcar.slice(i, i + 200).map(id => ({ sql: 'UPDATE clients SET biAlertSentAt = ? WHERE id = ?', params: [hoje, id] }))).catch(() => undefined);
        }
        return novos;
    }
}
