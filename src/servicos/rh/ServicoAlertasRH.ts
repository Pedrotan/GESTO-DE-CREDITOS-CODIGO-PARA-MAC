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
import { ServicoPontoRH, agoraLuanda } from './ServicoPontoRH';
import { alertasPonto } from '@/bibliotecas/rh/ponto-alertas';
import type { ConfigPonto } from '@/bibliotecas/rh/ponto-calculo';
import { ServicoRelogiosPonto, relogioOnline } from './ServicoRelogiosPonto';

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

    private static async alertasDoPonto(hoje: string, actor: ActorRH): Promise<{ alertas: Alerta[]; config: ConfigPonto | null; emails: Map<string, string> }> {
        // Primeiro as marcações novas dos relógios com ligação directa (se houver).
        await ServicoRelogiosPonto.recolher(actor).catch(() => null);
        const [ano, mes] = hoje.split('-').map(Number);
        const anterior = new Date(Date.UTC(ano, mes - 2, 1));
        const [{ grelha, contexto }, justificacoes, extraAno, estadoAnterior] = await Promise.all([
            ServicoPontoRH.grelha(ano, mes), ServicoPontoRH.justificacoes(),
            db.all<{ funcionario_id: string; total: number }>(
                `SELECT funcionario_id, SUM(COALESCE(minutos_extra, 0)) AS total FROM rh_ponto WHERE data >= ? AND data < ? GROUP BY funcionario_id`,
                [`${ano}-01-01`, `${hoje.slice(0, 7)}-01`]).catch(() => [] as Array<{ funcionario_id: string; total: number }>),
            ServicoPontoRH.estadoMes(anterior.getUTCFullYear(), anterior.getUTCMonth() + 1),
        ]);
        const alertas = alertasPonto({
            hoje, agora: agoraLuanda(), config: contexto.config, linhas: grelha.linhas,
            extraAnoAnterioresMin: new Map(extraAno.map(x => [x.funcionario_id, Number(x.total) || 0] as const)),
            justificacoesPendentes: justificacoes.filter(j => j.estado === 'pendente'),
            // O livro novo começa em Novembro de 2026: os meses anteriores não pedem fecho.
            mesAnteriorFechado: estadoAnterior === 'fechado' || ano * 12 + mes <= 2026 * 12 + 11,
        });
        // O próprio funcionário também é avisado na sua conta (sem marcação e entrada sem saída).
        const avisos = alertas.filter(a => a.tipo === 'ponto_sem_marcacao' || a.tipo === 'ponto_sem_saida').flatMap(a => {
            const utilizador = contexto.funcionarios.find(f => f.id === a.funcionario_id)?.utilizador_id;
            return utilizador ? [{ sql: `INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, 'warning', 0, ?)`,
                params: [`${a.id}:aviso`, utilizador, a.tipo === 'ponto_sem_marcacao' ? 'Ainda não marcou a entrada' : 'Falta marcar a saída', a.mensagem, agora()] }] : [];
        });
        if (avisos.length) await db.transaction(avisos).catch(() => undefined);
        // Relógios sem contacto há mais de 1 hora.
        const relogios = await ServicoRelogiosPonto.relogios().catch(() => []);
        for (const r of relogios.filter(x => !relogioOnline(x))) {
            alertas.push({ id: `ponto_relogio_offline:${r.device_id}:${hoje}`, tipo: 'ponto_relogio_offline', referencia_id: r.device_id, funcionario_id: null,
                mensagem: `Relógio «${r.nome}» sem contacto ${r.ultimo_contacto ? `desde ${new Date(r.ultimo_contacto).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' })}` : 'desde que foi registado'}.`,
                data_alerta: hoje, destinatario_perfil: 'rh', prioridade: 2, accao: '/rh/ponto' });
        }
        const emails = new Map(contexto.funcionarios.map(f => [f.id, String((f as { email?: string | null }).email || '')] as const).filter(([, e]) => e));
        return { alertas, config: contexto.config, emails };
    }

    /** Alertas novos do ponto também por e-mail (se activo): ao RH e, nos avisos pessoais, ao próprio funcionário. */
    private static async enviarEmailsPonto(novos: Alerta[], config: ConfigPonto | null, emails: Map<string, string>) {
        if (!config?.alertas_email) return;
        const doPonto = novos.filter(a => a.tipo.startsWith('ponto_'));
        if (!doPonto.length) return;
        const mensagens: Array<{ para: string; assunto: string; texto: string }> = [];
        const rh = config.email_rh.trim();
        if (rh) mensagens.push({ para: rh, assunto: `Livro de ponto: ${doPonto.length} alerta(s) novo(s)`, texto: doPonto.map(a => `• ${a.mensagem}`).join('\n') });
        for (const a of doPonto.filter(x => (x.tipo === 'ponto_sem_marcacao' || x.tipo === 'ponto_sem_saida') && x.funcionario_id)) {
            const para = emails.get(a.funcionario_id!);
            if (para) mensagens.push({ para, assunto: a.tipo === 'ponto_sem_marcacao' ? 'Ainda não marcou a entrada' : 'Falta marcar a saída', texto: a.mensagem });
        }
        await ServicoRelogiosPonto.enviarEmails(mensagens);
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
        const alertas: Alerta[] = gerarAlertas({
            hoje, funcionarios, contratos, documentos, planos, processamentos, ausenciasPendentes: ausencias.filter(a => a.estado === 'pendente').length, clientes,
            parametros: { alertaFeriasDias: num('alerta_ferias_dias', 5), mesNatal: num('subsidio_natal_mes', 11), prazoEntregaDia: num('prazo_entrega_dia', 10),
                alertaPrazosDias: num('alerta_prazos_dias', 5), biDiasAviso: num('bi_dias_aviso', 90) },
        });
        // Livro de ponto (secção 7.7): sem marcação, entrada sem saída, atrasos repetidos, horas extra acima do limite,
        // justificações por decidir e mês por fechar.
        const ponto = opcoes.gerirRH ? await this.alertasDoPonto(hoje, actor).catch(() => null) : null;
        if (ponto) alertas.push(...ponto.alertas);
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
        if (ponto) await this.enviarEmailsPonto(novos, ponto.config, ponto.emails).catch(() => undefined);
        return novos;
    }
}
