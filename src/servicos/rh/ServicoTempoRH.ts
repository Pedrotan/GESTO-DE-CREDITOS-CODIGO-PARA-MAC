// Recursos Humanos, tempo: horários, feriados, livro de ponto, ausências (faltas, dispensas, licenças) e
// documentos emitidos numerados. O ponto de um mês já processado (processamento normal fora do estado
// «aberto») fica só de leitura: para corrigir, reabre-se o processamento.
import { db } from '@/bibliotecas/bd';
import { calcularDia, diasUteis, ehDiaUtil, HORARIO_OMISSAO, type Ausencia, type Feriado, type Horario, type RegistoPonto, type TipoAusencia } from '@/bibliotecas/rh/ponto';
import { auditoriaRH, ServicoRH, type ActorRH } from './ServicoRH';

type Statement = { sql: string; params?: unknown[]; expectChanges?: number };
export type AusenciaRH = Ausencia & {
    motivo: string | null; documento_id: string | null; aprovado_por_nome: string | null; aprovado_em: string | null;
    anulado_por_nome: string | null; anulado_em: string | null; motivo_anulacao: string | null; documento_emitido_id: string | null;
    criado_em: string; criado_por_nome: string | null;
};
export type DocumentoEmitido = { id: string; funcionario_id: string; modelo: string; ano: number; sequencia: number; numero: string; dados_json: string; emitido_por_nome: string | null; emitido_em: string };

const agora = () => new Date().toISOString();
const hora = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/u.test(v.trim()) ? v.trim().padStart(5, '0') : null);
const data = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(v) ? v.slice(0, 10) : null);

export class ServicoTempoRH {
    // ── Bloqueio do mês ───────────────────────────────────────────────────────────
    /** O mês tem um processamento normal já calculado, aprovado, pago ou fechado? */
    static async mesBloqueado(dia: string) {
        const [ano, mes] = dia.split('-').map(Number);
        const row = await db.get<{ estado: string }>(`SELECT estado FROM rh_processamento WHERE ano = ? AND mes = ? AND tipo = 'normal' AND estado <> 'aberto'`, [ano, mes]).catch(() => undefined);
        return row?.estado || null;
    }

    private static async assertMesAberto(...dias: string[]) {
        for (const dia of new Set(dias.map(d => d.slice(0, 7)))) {
            const estado = await this.mesBloqueado(`${dia}-01`);
            if (estado) throw new Error(`O mês ${dia.split('-').reverse().join('/')} já foi processado (${estado}): o ponto e as ausências estão só de leitura. Reabra o processamento para corrigir.`);
        }
    }

    // ── Horários ──────────────────────────────────────────────────────────────────
    static horarios() {
        return db.all<Horario>('SELECT * FROM rh_horario ORDER BY nome').catch(() => [] as Horario[]);
    }

    static async guardarHorario(h: Partial<Horario>, actor: ActorRH) {
        const nome = h.nome?.trim();
        const entrada = hora(h.entrada);
        const saida = hora(h.saida);
        const dias = String(h.dias_semana || '').split(',').map(Number).filter(n => n >= 1 && n <= 7);
        if (!nome || !entrada || !saida) throw new Error('Indique o nome e as horas de entrada e saída (HH:MM).');
        if (!dias.length) throw new Error('Escolha pelo menos um dia de trabalho.');
        const intervalo = Math.max(0, Math.round(Number(h.intervalo_min) || 0));
        const tolerancia = Math.max(0, Math.round(Number(h.tolerancia_min) || 0));
        const when = agora();
        if (h.id) {
            await db.transaction([
                { sql: 'UPDATE rh_horario SET nome = ?, entrada = ?, saida = ?, intervalo_min = ?, dias_semana = ?, tolerancia_min = ?, activo = ?, actualizado_em = ? WHERE id = ?',
                    params: [nome, entrada, saida, intervalo, dias.join(','), tolerancia, h.activo === 0 ? 0 : 1, when, h.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o horário ${nome}`, { horarioId: h.id }, undefined, h, when),
            ]);
            return h.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: 'INSERT INTO rh_horario (id, nome, entrada, saida, intervalo_min, dias_semana, tolerancia_min, activo, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                params: [id, nome, entrada, saida, intervalo, dias.join(','), tolerancia, when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou o horário ${nome}`, { horarioId: id }, undefined, h, when),
        ]);
        return id;
    }

    // ── Feriados ──────────────────────────────────────────────────────────────────
    static feriados() {
        return db.all<Feriado>('SELECT * FROM rh_feriado ORDER BY substr(data, 6, 5)').catch(() => [] as Feriado[]);
    }

    static async guardarFeriado(f: { id?: string; data: string; nome: string; tipo: 'nacional' | 'empresa'; recorrente: boolean; activo?: boolean }, actor: ActorRH) {
        if (!data(f.data) || !f.nome?.trim()) throw new Error('Indique a data e o nome do feriado.');
        const when = agora();
        if (f.id) {
            await db.transaction([
                { sql: 'UPDATE rh_feriado SET data = ?, nome = ?, tipo = ?, recorrente = ?, activo = ? WHERE id = ?',
                    params: [data(f.data), f.nome.trim(), f.tipo, f.recorrente ? 1 : 0, f.activo === false ? 0 : 1, f.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o feriado ${f.nome.trim()}`, { feriadoId: f.id }, undefined, f, when),
            ]);
            return;
        }
        await db.transaction([
            { sql: `INSERT INTO rh_feriado (id, data, nome, tipo, recorrente, activo, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
                params: [crypto.randomUUID(), data(f.data), f.nome.trim(), f.tipo, f.recorrente ? 1 : 0, when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Acrescentou o feriado ${f.nome.trim()} (${data(f.data)})`, {}, undefined, f, when),
        ]);
    }

    // ── Tipos de ausência ─────────────────────────────────────────────────────────
    static tiposAusencia() {
        return db.all<TipoAusencia>('SELECT * FROM rh_tipo_ausencia ORDER BY sistema DESC, nome').catch(() => [] as TipoAusencia[]);
    }

    static async guardarTipoAusencia(t: Partial<TipoAusencia>, actor: ActorRH) {
        const nome = t.nome?.trim();
        const codigo = t.codigo?.trim().toUpperCase();
        if (!nome || !codigo) throw new Error('Indique o código e o nome do tipo de ausência.');
        const valores = [nome, t.justificada ? 1 : 0, t.remunerada ? 1 : 0, t.desconta_salario ? 1 : 0, t.desconta_ferias ? 1 : 0, t.exige_documento ? 1 : 0, t.activo === 0 ? 0 : 1];
        const when = agora();
        if (t.id) {
            await db.transaction([
                { sql: `UPDATE rh_tipo_ausencia SET nome = ?, justificada = ?, remunerada = ?, desconta_salario = ?, desconta_ferias = ?, exige_documento = ?, activo = ?, actualizado_em = ? WHERE id = ?`,
                    params: [...valores, when, t.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o tipo de ausência ${nome}`, { tipoId: t.id }, undefined, t, when),
            ]);
            return;
        }
        await db.transaction([
            { sql: `INSERT INTO rh_tipo_ausencia (id, codigo, nome, justificada, remunerada, desconta_salario, desconta_ferias, exige_documento, activo, sistema, criado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                params: [crypto.randomUUID(), codigo, ...valores, when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou o tipo de ausência ${codigo} — ${nome}`, {}, undefined, t, when),
        ]);
    }

    // ── Livro de ponto ────────────────────────────────────────────────────────────
    static pontosMes(ano: number, mes: number) {
        const prefixo = `${ano}-${String(mes).padStart(2, '0')}-%`;
        type Linha = RegistoPonto & { origem: string; observacoes: string | null; registado_por_nome: string | null };
        return db.all<Linha>('SELECT * FROM rh_ponto WHERE data LIKE ? ORDER BY data', [prefixo]).catch(() => [] as Linha[]);
    }

    private static async contexto(funcionarioId: string) {
        const [f, horarios, feriados] = await Promise.all([ServicoRH.funcionario(funcionarioId), this.horarios(), this.feriados()]);
        if (!f) throw new Error('Funcionário não encontrado.');
        const horario = horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
        return { funcionario: f, horario, feriados };
    }

    private static instrucaoPonto(funcionarioId: string, dia: string, entrada: string, saida: string, horario: Horario, feriados: Feriado[], origem: 'manual' | 'importado', observacoes: string | null, actor: ActorRH, when: string): Statement {
        const calculo = calcularDia(entrada, saida, horario, ehDiaUtil(dia, horario, feriados));
        return {
            sql: `INSERT INTO rh_ponto (id, funcionario_id, data, entrada, saida, horas_trabalhadas, horas_extra, minutos_atraso, origem, observacoes, registado_por, registado_por_nome, criado_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET entrada = excluded.entrada, saida = excluded.saida, horas_trabalhadas = excluded.horas_trabalhadas,
                  horas_extra = excluded.horas_extra, minutos_atraso = excluded.minutos_atraso, origem = excluded.origem, observacoes = excluded.observacoes,
                  registado_por = excluded.registado_por, registado_por_nome = excluded.registado_por_nome, actualizado_em = excluded.criado_em`,
            params: [`${funcionarioId}:${dia}`, funcionarioId, dia, entrada, saida, calculo.horas_trabalhadas, calculo.horas_extra, calculo.minutos_atraso, origem, observacoes, actor.id, actor.name, when],
        };
    }

    static async registarPonto(funcionarioId: string, dia: string, entradaBruta: string, saidaBruta: string, observacoes: string | null, actor: ActorRH) {
        const entrada = hora(entradaBruta);
        const saida = hora(saidaBruta);
        if (!data(dia) || !entrada || !saida) throw new Error('Indique a entrada e a saída (HH:MM).');
        await this.assertMesAberto(dia);
        const { horario, feriados, funcionario } = await this.contexto(funcionarioId);
        const anterior = await db.get<RegistoPonto>('SELECT * FROM rh_ponto WHERE id = ?', [`${funcionarioId}:${dia}`]).catch(() => undefined);
        const when = agora();
        await db.transaction([
            this.instrucaoPonto(funcionarioId, dia, entrada, saida, horario, feriados, 'manual', observacoes?.trim() || null, actor, when),
            auditoriaRH(actor, anterior ? 'update' : 'create', `Ponto de ${funcionario.nome} em ${dia}: ${entrada}–${saida}`, { funcionarioId, data: dia },
                anterior ? { entrada: anterior.entrada, saida: anterior.saida } : undefined, { entrada, saida }, when),
        ]);
    }

    static async removerPonto(funcionarioId: string, dia: string, actor: ActorRH) {
        await this.assertMesAberto(dia);
        const anterior = await db.get<RegistoPonto>('SELECT * FROM rh_ponto WHERE id = ?', [`${funcionarioId}:${dia}`]);
        if (!anterior) return;
        await db.transaction([
            { sql: 'DELETE FROM rh_ponto WHERE id = ?', params: [`${funcionarioId}:${dia}`], expectChanges: 1 },
            auditoriaRH(actor, 'delete', `Retirou o registo de ponto de ${dia}`, { funcionarioId, data: dia }, { entrada: anterior.entrada, saida: anterior.saida }),
        ]);
    }

    /** Importa marcações (CSV do relógio): cada linha substitui o registo desse funcionário nesse dia. */
    static async importarPonto(linhas: Array<{ numero: string; data: string; entrada: string; saida: string }>, actor: ActorRH) {
        const [funcionarios, horarios, feriados] = await Promise.all([ServicoRH.funcionarios(), this.horarios(), this.feriados()]);
        const porNumero = new Map(funcionarios.map(f => [f.numero_mecanografico, f]));
        const erros: string[] = [];
        const statements: Statement[] = [];
        const when = agora();
        for (const linha of linhas) {
            const f = porNumero.get(linha.numero) || porNumero.get(linha.numero.padStart(4, '0'));
            if (!f) { erros.push(`N.º ${linha.numero}: funcionário desconhecido.`); continue; }
            if (await this.mesBloqueado(linha.data)) { erros.push(`${linha.data}: mês já processado.`); continue; }
            const horario = horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
            try { statements.push(this.instrucaoPonto(f.id, linha.data, linha.entrada, linha.saida, horario, feriados, 'importado', null, actor, when)); }
            catch (error) { erros.push(`${linha.numero} ${linha.data}: ${(error as Error).message}`); }
        }
        if (statements.length) {
            statements.push(auditoriaRH(actor, 'import', `Importou ${statements.length} marcação(ões) de ponto`, { linhas: statements.length, erros: erros.length }, undefined, undefined, when));
            await db.transaction(statements);
        }
        return { importadas: statements.length ? statements.length - 1 : 0, erros };
    }

    // ── Ausências ─────────────────────────────────────────────────────────────────
    static ausencias() {
        return db.all<AusenciaRH>('SELECT * FROM rh_ausencia ORDER BY data_inicio DESC, criado_em DESC').catch(() => [] as AusenciaRH[]);
    }

    /**
     * Regista uma ausência para um ou vários funcionários (faltas em massa). Faltas lançadas pelo RH ficam
     * aprovadas, excepto se o tipo exigir documento e não houver anexo (ficam pendentes). Pedidos de dispensa
     * ficam pendentes até serem aprovados.
     */
    static async registarAusencias(input: { funcionarios: string[]; tipo_id: string; data_inicio: string; data_fim: string; horas?: number; motivo?: string; documento_id?: string | null; pedido_dispensa?: boolean }, actor: ActorRH) {
        const inicio = data(input.data_inicio);
        const fim = data(input.data_fim) || inicio;
        if (!input.funcionarios.length || !input.tipo_id || !inicio || !fim) throw new Error('Escolha o(s) funcionário(s), o tipo e as datas.');
        if (fim < inicio) throw new Error('A data de fim tem de ser igual ou posterior à de início.');
        const horas = Math.max(0, Number(input.horas) || 0);
        if (horas > 0 && inicio !== fim) throw new Error('Ausências por horas são de um só dia.');
        await this.assertMesAberto(inicio, fim);
        const tipos = await this.tiposAusencia();
        const tipo = tipos.find(t => t.id === input.tipo_id);
        if (!tipo) throw new Error('Tipo de ausência desconhecido.');
        const [horarios, feriados, funcionarios, existentes] = await Promise.all([this.horarios(), this.feriados(), ServicoRH.funcionarios(), this.ausencias()]);
        const estado = input.pedido_dispensa || (tipo.exige_documento && !input.documento_id) ? 'pendente' : 'aprovada';
        const when = agora();
        const statements: Statement[] = [];
        for (const funcionarioId of input.funcionarios) {
            const f = funcionarios.find(x => x.id === funcionarioId);
            if (!f) continue;
            if (existentes.some(a => a.funcionario_id === funcionarioId && a.estado !== 'anulada' && a.data_inicio <= fim && a.data_fim >= inicio))
                throw new Error(`${f.nome} já tem uma ausência registada nesse período.`);
            const horario = horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
            const dias = horas > 0 ? 0 : diasUteis(inicio, fim, horario, feriados);
            const id = crypto.randomUUID();
            statements.push({
                sql: `INSERT INTO rh_ausencia (id, funcionario_id, tipo_id, data_inicio, data_fim, dias, horas, motivo, documento_id, estado, pedido_dispensa,
                        aprovado_por, aprovado_por_nome, aprovado_em, criado_em, criado_por, criado_por_nome)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, funcionarioId, tipo.id, inicio, fim, dias, horas, input.motivo?.trim() || null, input.documento_id || null, estado, input.pedido_dispensa ? 1 : 0,
                    estado === 'aprovada' ? actor.id : null, estado === 'aprovada' ? actor.name : null, estado === 'aprovada' ? when : null, when, actor.id, actor.name],
                expectChanges: 1,
            });
            statements.push(auditoriaRH(actor, 'create', `${input.pedido_dispensa ? 'Pedido de dispensa' : tipo.nome} de ${f.nome}: ${inicio}${fim !== inicio ? ` a ${fim}` : ''}${horas ? ` (${horas} h)` : ''}`,
                { funcionarioId, ausenciaId: id, tipo: tipo.codigo, estado }, undefined, undefined, when));
        }
        await db.transaction(statements);
        return { registadas: statements.length / 2, estado };
    }

    /** Aprova um pedido pendente (dispensa ou ausência que aguardava documento). */
    static async aprovarAusencia(a: AusenciaRH, actor: ActorRH, documentoId?: string | null) {
        if (a.estado !== 'pendente') throw new Error('Só se aprovam ausências pendentes.');
        await this.assertMesAberto(a.data_inicio, a.data_fim);
        const tipo = (await this.tiposAusencia()).find(t => t.id === a.tipo_id);
        if (tipo?.exige_documento && !(documentoId || a.documento_id)) throw new Error(`O tipo «${tipo.nome}» exige um documento (ex.: atestado): anexe-o antes de aprovar.`);
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_ausencia SET estado = 'aprovada', documento_id = COALESCE(?, documento_id), aprovado_por = ?, aprovado_por_nome = ?, aprovado_em = ?, actualizado_em = ? WHERE id = ? AND estado = 'pendente'`,
                params: [documentoId || null, actor.id, actor.name, when, when, a.id], expectChanges: 1 },
            auditoriaRH(actor, 'approve', `Aprovou a ausência ${a.id}`, { ausenciaId: a.id, funcionarioId: a.funcionario_id }, undefined, undefined, when),
        ]);
    }

    /** Retirar uma falta: não apaga, marca como anulada com motivo e utilizador; o desconto desaparece no próximo cálculo. */
    static async anularAusencia(a: AusenciaRH, motivo: string, actor: ActorRH) {
        if (a.estado === 'anulada') return;
        if (!motivo?.trim() || motivo.trim().length < 5) throw new Error('Indique o motivo da anulação.');
        await this.assertMesAberto(a.data_inicio, a.data_fim);
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_ausencia SET estado = 'anulada', anulado_por = ?, anulado_por_nome = ?, anulado_em = ?, motivo_anulacao = ?, actualizado_em = ? WHERE id = ? AND estado <> 'anulada'`,
                params: [actor.id, actor.name, when, motivo.trim(), when, a.id], expectChanges: 1 },
            auditoriaRH(actor, 'cancel', `Anulou a ausência ${a.id}: ${motivo.trim()}`, { ausenciaId: a.id, funcionarioId: a.funcionario_id }, { estado: a.estado }, { estado: 'anulada' }, when),
        ]);
    }

    /** Justificar uma falta: muda o tipo (com ou sem remuneração) e guarda o comprovativo. */
    static async justificarAusencia(a: AusenciaRH, novoTipoId: string, documentoId: string | null, motivo: string, actor: ActorRH) {
        if (a.estado === 'anulada') throw new Error('A ausência está anulada.');
        await this.assertMesAberto(a.data_inicio, a.data_fim);
        const tipos = await this.tiposAusencia();
        const novo = tipos.find(t => t.id === novoTipoId);
        if (!novo?.justificada) throw new Error('Escolha um tipo de falta justificada.');
        if (novo.exige_documento && !(documentoId || a.documento_id)) throw new Error(`O tipo «${novo.nome}» exige um documento.`);
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_ausencia SET tipo_id = ?, documento_id = COALESCE(?, documento_id), motivo = ?, estado = 'aprovada',
                    aprovado_por = COALESCE(aprovado_por, ?), aprovado_por_nome = COALESCE(aprovado_por_nome, ?), aprovado_em = COALESCE(aprovado_em, ?), actualizado_em = ? WHERE id = ?`,
                params: [novo.id, documentoId || null, motivo?.trim() || a.motivo || null, actor.id, actor.name, when, when, a.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Justificou a ausência ${a.id} como «${novo.nome}»`, { ausenciaId: a.id, funcionarioId: a.funcionario_id },
                { tipo_id: a.tipo_id }, { tipo_id: novo.id }, when),
        ]);
    }

    // ── Documentos emitidos (dispensas, guias, declarações) ───────────────────────
    static documentosEmitidos(funcionarioId?: string) {
        return funcionarioId
            ? db.all<DocumentoEmitido>('SELECT * FROM rh_documento_emitido WHERE funcionario_id = ? ORDER BY emitido_em DESC', [funcionarioId]).catch(() => [] as DocumentoEmitido[])
            : db.all<DocumentoEmitido>('SELECT * FROM rh_documento_emitido ORDER BY emitido_em DESC').catch(() => [] as DocumentoEmitido[]);
    }

    /** Emite um documento com número sequencial por modelo e ano (ex.: DISP 2026/0003). */
    static async emitirDocumento(funcionarioId: string, modelo: string, prefixo: string, dados: Record<string, unknown>, actor: ActorRH, extra: Statement[] = []) {
        const ano = new Date().getFullYear();
        const ultimo = await db.get<{ seq: number }>('SELECT MAX(sequencia) AS seq FROM rh_documento_emitido WHERE modelo = ? AND ano = ?', [modelo, ano]).catch(() => undefined);
        const sequencia = Number(ultimo?.seq || 0) + 1;
        const numero = `${prefixo} ${ano}/${String(sequencia).padStart(4, '0')}`;
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_documento_emitido (id, funcionario_id, modelo, ano, sequencia, numero, dados_json, emitido_por, emitido_por_nome, emitido_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, funcionarioId, modelo, ano, sequencia, numero, JSON.stringify(dados), actor.id, actor.name, when], expectChanges: 1 },
            ...extra.map(s => ({ ...s, params: (s.params || []).map(p => (p === '$documento' ? id : p)) })),
            auditoriaRH(actor, 'create', `Emitiu o documento ${numero} (${modelo})`, { funcionarioId, documentoEmitidoId: id }, undefined, undefined, when),
        ]);
        return { id, numero, emitido_em: when };
    }

    /** Emite a dispensa (PDF numerado) de uma ausência aprovada e liga-a à ausência. */
    static async emitirDispensa(a: AusenciaRH, dados: Record<string, unknown>, actor: ActorRH) {
        if (a.estado !== 'aprovada') throw new Error('A dispensa só é emitida depois de aprovada.');
        if (a.documento_emitido_id) {
            const existente = (await this.documentosEmitidos(a.funcionario_id)).find(d => d.id === a.documento_emitido_id);
            if (existente) return { id: existente.id, numero: existente.numero, emitido_em: existente.emitido_em };
        }
        return this.emitirDocumento(a.funcionario_id, 'dispensa', 'DISP', { ...dados, ausenciaId: a.id }, actor, [
            { sql: 'UPDATE rh_ausencia SET documento_emitido_id = ? WHERE id = ? AND documento_emitido_id IS NULL', params: ['$documento', a.id], expectChanges: 1 },
        ]);
    }
}
