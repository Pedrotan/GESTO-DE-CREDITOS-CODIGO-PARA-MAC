// Recursos Humanos: estrutura, funcionários, contratos, histórico salarial, rubricas, parâmetros legais e
// arquivo digital. Cada alteração grava a auditoria na mesma transacção (com o valor anterior quando muda
// um salário). O processo principal confirma as permissões de escrita de cada tabela.
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { validarDatasBI } from '@/bibliotecas/rh/bi-validade';
import { validarEscaloes, type IrtEscalao, type IrtTabela, type ParametroRH } from '@/bibliotecas/rh/parametros-rh';

export type ActorRH = { id: string; name: string; role?: string; permissions?: string[] };
type Statement = { sql: string; params?: unknown[]; expectChanges?: number };

export type Departamento = { id: string; nome: string; responsavel_id: string | null; activo: number };
export type Cargo = { id: string; nome: string; departamento_id: string | null; salario_referencia_minor: number; activo: number };
export type EstadoFuncionario = 'activo' | 'suspenso' | 'cessado';
export type Funcionario = {
    id: string; numero_mecanografico: string; nome: string; data_nascimento: string | null; sexo: string | null; estado_civil: string | null;
    nif: string | null; bi_numero: string | null; bi_emissao: string | null; bi_validade: string | null; numero_inss: string | null;
    morada: string | null; telefone: string | null; email: string | null; iban: string | null; banco: string | null;
    data_admissao: string; data_saida: string | null; cargo_id: string | null; departamento_id: string | null; horario_id: string | null;
    estado: EstadoFuncionario; foto_url: string | null; utilizador_id: string | null; reformado: number; observacoes: string | null;
    criado_em: string; actualizado_em: string | null;
};
export type Dependente = { id: string; funcionario_id: string; nome: string; parentesco: string | null; data_nascimento: string | null };
export type Contrato = {
    id: string; funcionario_id: string; tipo: 'indeterminado' | 'determinado'; inicio: string; fim: string | null; periodo_experiencia_fim: string | null;
    salario_base_minor: number; horas_semanais: number; dias_ferias: number; documento_id: string | null; estado: 'activo' | 'terminado'; motivo_fim: string | null;
    criado_em: string;
};
export type HistoricoSalarial = {
    id: string; funcionario_id: string; contrato_id: string | null; salario_anterior_minor: number | null; salario_novo_minor: number;
    data_efeito: string; motivo: string; criado_em: string; criado_por_nome: string | null;
};
export type Rubrica = {
    id: string; codigo: string; nome: string; tipo: 'abono' | 'desconto'; forma: 'fixo' | 'percentagem' | 'quantidade'; percentagem: number;
    incide_inss: number; incide_irt: number; limite_isento_irt_minor: number; limite_isento_irt_pct: number; conta_contabilistica: string | null;
    ordem_no_recibo: number; sistema: number; activo: number;
};
export type FuncionarioRubrica = {
    id: string; funcionario_id: string; rubrica_id: string; valor_minor: number; quantidade: number; inicio: string; fim: string | null;
};
export type CategoriaDocumento = 'identificacao' | 'contratual' | 'academica' | 'saude' | 'disciplinar' | 'salarial' | 'outros';
export type DocumentoRH = {
    id: string; funcionario_id: string; categoria: CategoriaDocumento; nome: string; ficheiro_nome: string; mime: string; tamanho: number;
    data_emissao: string | null; data_validade: string | null; confidencial: number; estado: 'activo' | 'substituido' | 'arquivado';
    substituido_por: string | null; carregado_por_nome: string | null; criado_em: string;
};

export const CATEGORIAS_DOCUMENTO: Array<{ id: CategoriaDocumento; nome: string; validade: boolean; confidencial?: boolean }> = [
    { id: 'identificacao', nome: 'Identificação', validade: true },
    { id: 'contratual', nome: 'Contratual', validade: true },
    { id: 'academica', nome: 'Académica e profissional', validade: false },
    { id: 'saude', nome: 'Saúde e ausências', validade: true, confidencial: true },
    { id: 'disciplinar', nome: 'Disciplinar', validade: false, confidencial: true },
    { id: 'salarial', nome: 'Salarial', validade: false },
    { id: 'outros', nome: 'Outros', validade: false },
];
export const CATEGORIAS_CONFIDENCIAIS = new Set<CategoriaDocumento>(['saude', 'disciplinar']);
const MIMES_DOCUMENTO = /^data:(application\/pdf|image\/(png|jpe?g)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,/u;

const agora = () => new Date().toISOString();
const texto = (valor: unknown) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
const data = (valor: unknown) => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(valor) ? valor.slice(0, 10) : null);
const minor = (valor: unknown) => {
    const n = Math.round(Number(valor));
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Valor monetário inválido.');
    return n;
};

export const auditoriaRH = (actor: ActorRH, action: string, details: string, metadata: Record<string, unknown>,
    anterior?: unknown, novo?: unknown, when = agora()): Statement => ({
    sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, 'rh', ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), when, actor.id, actor.name, action, details,
        anterior === undefined ? null : JSON.stringify(anterior), novo === undefined ? null : JSON.stringify(novo), JSON.stringify(metadata)],
});

export class ServicoRH {
    // ── Estrutura ─────────────────────────────────────────────────────────────────
    static departamentos() {
        return db.all<Departamento>('SELECT id, nome, responsavel_id, activo FROM rh_departamento ORDER BY nome').catch(() => []);
    }

    static async guardarDepartamento(input: { id?: string; nome: string; responsavel_id?: string | null; activo?: boolean }, actor: ActorRH) {
        const nome = texto(input.nome);
        if (!nome) throw new Error('Indique o nome do departamento.');
        const when = agora();
        if (input.id) {
            await db.transaction([
                { sql: 'UPDATE rh_departamento SET nome = ?, responsavel_id = ?, activo = ?, actualizado_em = ? WHERE id = ?',
                    params: [nome, input.responsavel_id || null, input.activo === false ? 0 : 1, when, input.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o departamento ${nome}`, { departamentoId: input.id }, undefined, undefined, when),
            ]);
            return input.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: 'INSERT INTO rh_departamento (id, nome, responsavel_id, activo, criado_em, criado_por) VALUES (?, ?, ?, 1, ?, ?)',
                params: [id, nome, input.responsavel_id || null, when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou o departamento ${nome}`, { departamentoId: id }, undefined, undefined, when),
        ]);
        return id;
    }

    static cargos() {
        return db.all<Cargo>('SELECT id, nome, departamento_id, salario_referencia_minor, activo FROM rh_cargo ORDER BY nome').catch(() => []);
    }

    static async guardarCargo(input: { id?: string; nome: string; departamento_id?: string | null; salario_referencia_minor?: number; activo?: boolean }, actor: ActorRH) {
        const nome = texto(input.nome);
        if (!nome) throw new Error('Indique o nome do cargo.');
        const referencia = minor(input.salario_referencia_minor || 0);
        const when = agora();
        if (input.id) {
            await db.transaction([
                { sql: 'UPDATE rh_cargo SET nome = ?, departamento_id = ?, salario_referencia_minor = ?, activo = ?, actualizado_em = ? WHERE id = ?',
                    params: [nome, input.departamento_id || null, referencia, input.activo === false ? 0 : 1, when, input.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou o cargo ${nome}`, { cargoId: input.id }, undefined, undefined, when),
            ]);
            return input.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: 'INSERT INTO rh_cargo (id, nome, departamento_id, salario_referencia_minor, activo, criado_em, criado_por) VALUES (?, ?, ?, ?, 1, ?, ?)',
                params: [id, nome, input.departamento_id || null, referencia, when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou o cargo ${nome}`, { cargoId: id }, undefined, undefined, when),
        ]);
        return id;
    }

    // ── Funcionários ──────────────────────────────────────────────────────────────
    static funcionarios() {
        return db.all<Funcionario>('SELECT * FROM rh_funcionario ORDER BY nome').catch(() => []);
    }

    static funcionario(id: string) {
        return db.get<Funcionario>('SELECT * FROM rh_funcionario WHERE id = ?', [id]);
    }

    static async proximoNumero() {
        const row = await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM rh_funcionario').catch(() => undefined);
        let n = Number(row?.total || 0) + 1;
        for (;;) {
            const numero = String(n).padStart(4, '0');
            const existe = await db.get<{ id: string }>('SELECT id FROM rh_funcionario WHERE numero_mecanografico = ?', [numero]).catch(() => undefined);
            if (!existe) return numero;
            n += 1;
        }
    }

    private static validarFuncionario(f: Partial<Funcionario>) {
        const erros: string[] = [];
        if (!texto(f.nome)) erros.push('Indique o nome do funcionário.');
        if (!texto(f.numero_mecanografico)) erros.push('Indique o número mecanográfico.');
        if (!data(f.data_admissao)) erros.push('Indique a data de admissão.');
        if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(f.email)) erros.push('O email é inválido.');
        if (f.iban && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}$/u.test(f.iban.replace(/\s+/gu, '').toUpperCase())) erros.push('O IBAN é inválido.');
        erros.push(...validarDatasBI(f.bi_emissao, f.bi_validade, luandaTodayKey()));
        if (erros.length) throw new Error(erros.join(' '));
    }

    private static linhaFuncionario(f: Partial<Funcionario>) {
        return [
            texto(f.numero_mecanografico), texto(f.nome), data(f.data_nascimento), texto(f.sexo), texto(f.estado_civil), texto(f.nif),
            texto(f.bi_numero), data(f.bi_emissao), data(f.bi_validade), texto(f.numero_inss), texto(f.morada), texto(f.telefone),
            texto(f.email), f.iban ? f.iban.replace(/\s+/gu, '').toUpperCase() : null, texto(f.banco), data(f.data_admissao), data(f.data_saida),
            f.cargo_id || null, f.departamento_id || null, f.horario_id || null, f.estado || 'activo', texto(f.foto_url), f.utilizador_id || null,
            f.reformado ? 1 : 0, texto(f.observacoes),
        ];
    }

    /** Cria o funcionário e, se indicado, o primeiro contrato (e a primeira linha do histórico salarial). */
    static async criarFuncionario(f: Partial<Funcionario>, contrato: Omit<Contrato, 'id' | 'funcionario_id' | 'estado' | 'motivo_fim' | 'criado_em' | 'documento_id'> | null, actor: ActorRH) {
        this.validarFuncionario(f);
        const id = crypto.randomUUID();
        const when = agora();
        const statements: Statement[] = [{
            sql: `INSERT INTO rh_funcionario (id, numero_mecanografico, nome, data_nascimento, sexo, estado_civil, nif, bi_numero, bi_emissao, bi_validade,
                    numero_inss, morada, telefone, email, iban, banco, data_admissao, data_saida, cargo_id, departamento_id, horario_id, estado, foto_url,
                    utilizador_id, reformado, observacoes, criado_em, criado_por)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [id, ...this.linhaFuncionario(f), when, actor.id], expectChanges: 1,
        }];
        if (contrato) statements.push(...this.instrucoesContrato(id, contrato, null, 'Admissão', actor, when));
        statements.push(auditoriaRH(actor, 'create', `Registou o funcionário ${f.nome} (n.º ${f.numero_mecanografico})`, { funcionarioId: id }, undefined, undefined, when));
        await db.transaction(statements);
        return id;
    }

    static async actualizarFuncionario(id: string, f: Partial<Funcionario>, actor: ActorRH) {
        this.validarFuncionario(f);
        const anterior = await this.funcionario(id);
        if (!anterior) throw new Error('Funcionário não encontrado.');
        const when = agora();
        const linha = this.linhaFuncionario(f);
        await db.transaction([
            { sql: `UPDATE rh_funcionario SET numero_mecanografico = ?, nome = ?, data_nascimento = ?, sexo = ?, estado_civil = ?, nif = ?, bi_numero = ?,
                    bi_emissao = ?, bi_validade = ?, numero_inss = ?, morada = ?, telefone = ?, email = ?, iban = ?, banco = ?, data_admissao = ?,
                    data_saida = ?, cargo_id = ?, departamento_id = ?, horario_id = ?, estado = ?, foto_url = ?, utilizador_id = ?, reformado = ?,
                    observacoes = ?, actualizado_em = ? WHERE id = ?`,
                params: [...linha, when, id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Alterou a ficha do funcionário ${f.nome}`, { funcionarioId: id },
                { ...anterior, foto_url: undefined }, { ...f, foto_url: undefined }, when),
        ]);
    }

    static dependentes(funcionarioId: string) {
        return db.all<Dependente>('SELECT id, funcionario_id, nome, parentesco, data_nascimento FROM rh_dependente WHERE funcionario_id = ? ORDER BY nome', [funcionarioId]).catch(() => []);
    }

    static async adicionarDependente(funcionarioId: string, d: { nome: string; parentesco?: string; data_nascimento?: string }, actor: ActorRH) {
        if (!texto(d.nome)) throw new Error('Indique o nome do dependente.');
        const when = agora();
        await db.transaction([
            { sql: 'INSERT INTO rh_dependente (id, funcionario_id, nome, parentesco, data_nascimento, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
                params: [crypto.randomUUID(), funcionarioId, texto(d.nome), texto(d.parentesco), data(d.data_nascimento), when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Acrescentou o dependente ${d.nome}`, { funcionarioId }, undefined, undefined, when),
        ]);
    }

    static async removerDependente(id: string, funcionarioId: string, actor: ActorRH) {
        await db.transaction([
            { sql: 'DELETE FROM rh_dependente WHERE id = ? AND funcionario_id = ?', params: [id, funcionarioId], expectChanges: 1 },
            auditoriaRH(actor, 'delete', 'Retirou um dependente', { funcionarioId, dependenteId: id }),
        ]);
    }

    // ── Contratos e histórico salarial ────────────────────────────────────────────
    static contratos(funcionarioId?: string) {
        return funcionarioId
            ? db.all<Contrato>('SELECT * FROM rh_contrato WHERE funcionario_id = ? ORDER BY inicio DESC', [funcionarioId]).catch(() => [])
            : db.all<Contrato>('SELECT * FROM rh_contrato ORDER BY inicio DESC').catch(() => []);
    }

    static historicoSalarial(funcionarioId: string) {
        return db.all<HistoricoSalarial>('SELECT * FROM rh_historico_salarial WHERE funcionario_id = ? ORDER BY data_efeito DESC, criado_em DESC', [funcionarioId]).catch(() => []);
    }

    private static instrucoesContrato(funcionarioId: string, c: Pick<Contrato, 'tipo' | 'inicio' | 'fim' | 'periodo_experiencia_fim' | 'salario_base_minor' | 'horas_semanais' | 'dias_ferias'>,
        salarioAnterior: number | null, motivo: string, actor: ActorRH, when: string): Statement[] {
        if (!data(c.inicio)) throw new Error('Indique a data de início do contrato.');
        if (c.tipo === 'determinado' && !data(c.fim)) throw new Error('O contrato a termo certo precisa da data de fim.');
        if (c.fim && data(c.fim)! <= data(c.inicio)!) throw new Error('O fim do contrato tem de ser posterior ao início.');
        const salario = minor(c.salario_base_minor);
        if (salario <= 0) throw new Error('Indique o salário base do contrato.');
        const horas = Number(c.horas_semanais) || 40;
        const dias = Math.round(Number(c.dias_ferias) || 22);
        const contratoId = crypto.randomUUID();
        return [
            { sql: `UPDATE rh_contrato SET estado = 'terminado', motivo_fim = ?, actualizado_em = ? WHERE funcionario_id = ? AND estado = 'activo'`,
                params: [motivo, when, funcionarioId] },
            { sql: `INSERT INTO rh_contrato (id, funcionario_id, tipo, inicio, fim, periodo_experiencia_fim, salario_base_minor, horas_semanais, dias_ferias, estado, criado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?)`,
                params: [contratoId, funcionarioId, c.tipo, data(c.inicio), data(c.fim), data(c.periodo_experiencia_fim), salario, horas, dias, when, actor.id], expectChanges: 1 },
            { sql: `INSERT INTO rh_historico_salarial (id, funcionario_id, contrato_id, salario_anterior_minor, salario_novo_minor, data_efeito, motivo, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), funcionarioId, contratoId, salarioAnterior, salario, data(c.inicio), motivo, when, actor.id, actor.name], expectChanges: 1 },
        ];
    }

    /** Novo contrato (renovação, mudança de tipo ou aumento): o anterior termina e fica no histórico. */
    static async novoContrato(funcionarioId: string, c: Pick<Contrato, 'tipo' | 'inicio' | 'fim' | 'periodo_experiencia_fim' | 'salario_base_minor' | 'horas_semanais' | 'dias_ferias'>, motivo: string, actor: ActorRH) {
        if (!texto(motivo)) throw new Error('Indique o motivo (renovação, aumento, promoção…).');
        const actual = await db.get<Contrato>(`SELECT * FROM rh_contrato WHERE funcionario_id = ? AND estado = 'activo'`, [funcionarioId]).catch(() => undefined);
        const when = agora();
        await db.transaction([
            ...this.instrucoesContrato(funcionarioId, c, actual?.salario_base_minor ?? null, motivo.trim(), actor, when),
            auditoriaRH(actor, 'update', `Novo contrato do funcionário ${funcionarioId}: ${motivo.trim()}`, { funcionarioId },
                actual ? { salario_base_minor: actual.salario_base_minor, tipo: actual.tipo, inicio: actual.inicio, fim: actual.fim } : undefined,
                { salario_base_minor: c.salario_base_minor, tipo: c.tipo, inicio: c.inicio, fim: c.fim }, when),
        ]);
    }

    /** Termina o contrato activo (cessação): o funcionário passa a «cessado» na data indicada. */
    static async cessarContrato(funcionarioId: string, dataSaida: string, motivo: string, actor: ActorRH) {
        if (!data(dataSaida) || !texto(motivo)) throw new Error('Indique a data de saída e o motivo.');
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_contrato SET estado = 'terminado', motivo_fim = ?, fim = COALESCE(fim, ?), actualizado_em = ? WHERE funcionario_id = ? AND estado = 'activo'`,
                params: [motivo.trim(), data(dataSaida), when, funcionarioId] },
            { sql: `UPDATE rh_funcionario SET estado = 'cessado', data_saida = ?, actualizado_em = ? WHERE id = ?`, params: [data(dataSaida), when, funcionarioId], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Cessou o contrato do funcionário ${funcionarioId}: ${motivo.trim()}`, { funcionarioId, dataSaida }, undefined, undefined, when),
        ]);
    }

    // ── Rubricas ──────────────────────────────────────────────────────────────────
    static rubricas() {
        return db.all<Rubrica>('SELECT * FROM rh_rubrica ORDER BY ordem_no_recibo, nome').catch(() => []);
    }

    static async guardarRubrica(r: Partial<Rubrica>, actor: ActorRH) {
        const codigo = texto(r.codigo)?.toUpperCase().replace(/[^A-Z0-9_]/gu, '_');
        const nome = texto(r.nome);
        if (!codigo || !nome) throw new Error('Indique o código e o nome da rubrica.');
        if (!['abono', 'desconto'].includes(String(r.tipo))) throw new Error('Escolha se a rubrica é abono ou desconto.');
        if (!['fixo', 'percentagem', 'quantidade'].includes(String(r.forma))) throw new Error('Forma de cálculo inválida.');
        const pct = Number(r.percentagem) || 0;
        const isentoPct = Number(r.limite_isento_irt_pct) || 0;
        if (pct < 0 || pct > 10 || isentoPct < 0 || isentoPct > 1) throw new Error('Percentagem inválida.');
        const when = agora();
        const valores = [nome, r.tipo, r.forma, pct, r.incide_inss ? 1 : 0, r.incide_irt ? 1 : 0, minor(r.limite_isento_irt_minor || 0), isentoPct,
            texto(r.conta_contabilistica), Math.round(Number(r.ordem_no_recibo) || 100), r.activo === 0 ? 0 : 1];
        if (r.id) {
            const anterior = await db.get<Rubrica>('SELECT * FROM rh_rubrica WHERE id = ?', [r.id]);
            await db.transaction([
                { sql: `UPDATE rh_rubrica SET nome = ?, tipo = ?, forma = ?, percentagem = ?, incide_inss = ?, incide_irt = ?, limite_isento_irt_minor = ?,
                        limite_isento_irt_pct = ?, conta_contabilistica = ?, ordem_no_recibo = ?, activo = ?, actualizado_em = ? WHERE id = ?`,
                    params: [...valores, when, r.id], expectChanges: 1 },
                auditoriaRH(actor, 'update', `Alterou a rubrica ${anterior?.codigo || codigo}`, { rubricaId: r.id }, anterior, r, when),
            ]);
            return r.id;
        }
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: `INSERT INTO rh_rubrica (id, codigo, nome, tipo, forma, percentagem, incide_inss, incide_irt, limite_isento_irt_minor, limite_isento_irt_pct,
                    conta_contabilistica, ordem_no_recibo, activo, sistema, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                params: [id, codigo, ...valores, when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou a rubrica ${codigo} — ${nome}`, { rubricaId: id }, undefined, r, when),
        ]);
        return id;
    }

    static rubricasFuncionario(funcionarioId: string) {
        return db.all<FuncionarioRubrica>('SELECT * FROM rh_funcionario_rubrica WHERE funcionario_id = ? ORDER BY inicio DESC', [funcionarioId]).catch(() => []);
    }

    static todasRubricasFuncionarios() {
        return db.all<FuncionarioRubrica>('SELECT * FROM rh_funcionario_rubrica').catch(() => []);
    }

    static async atribuirRubrica(funcionarioId: string, input: { rubrica_id: string; valor_minor: number; quantidade?: number; inicio: string; fim?: string | null }, actor: ActorRH) {
        if (!input.rubrica_id || !data(input.inicio)) throw new Error('Escolha a rubrica e a data de início.');
        if (input.fim && data(input.fim)! < data(input.inicio)!) throw new Error('O fim tem de ser depois do início.');
        const when = agora();
        const id = crypto.randomUUID();
        await db.transaction([
            { sql: `INSERT INTO rh_funcionario_rubrica (id, funcionario_id, rubrica_id, valor_minor, quantidade, inicio, fim, criado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, funcionarioId, input.rubrica_id, minor(input.valor_minor), Number(input.quantidade) || 1, data(input.inicio), data(input.fim), when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Atribuiu uma rubrica fixa ao funcionário ${funcionarioId}`, { funcionarioId, rubricaId: input.rubrica_id }, undefined, input, when),
        ]);
        return id;
    }

    /** Termina uma rubrica fixa (não apaga: fica a data de fim, para os meses anteriores continuarem certos). */
    static async terminarRubrica(id: string, fim: string, actor: ActorRH) {
        if (!data(fim)) throw new Error('Indique a data de fim.');
        const when = agora();
        await db.transaction([
            { sql: 'UPDATE rh_funcionario_rubrica SET fim = ?, actualizado_em = ? WHERE id = ?', params: [data(fim), when, id], expectChanges: 1 },
            auditoriaRH(actor, 'update', 'Terminou uma rubrica fixa de funcionário', { funcionarioRubricaId: id, fim }, undefined, undefined, when),
        ]);
    }

    // ── Parâmetros legais e tabela do IRT ─────────────────────────────────────────
    static parametros() {
        return db.all<ParametroRH>('SELECT id, chave, valor, descricao, vigencia_inicio, vigencia_fim FROM rh_parametro ORDER BY chave, vigencia_inicio DESC').catch(() => []);
    }

    /**
     * Novo valor de um parâmetro a partir de uma data: a versão anterior fica com vigência até à véspera
     * (nunca é alterada nem apagada, para os processamentos antigos continuarem a usar o seu valor).
     */
    static async novoValorParametro(chave: string, valor: string, inicio: string, actor: ActorRH) {
        if (!data(inicio) || !texto(valor)) throw new Error('Indique o valor e a data de início de vigência.');
        const todos = await this.parametros();
        const anteriores = todos.filter(p => p.chave === chave);
        if (!anteriores.length) throw new Error('Parâmetro desconhecido.');
        if (anteriores.some(p => p.vigencia_inicio >= data(inicio)!)) throw new Error('Já existe uma versão com início nessa data ou depois.');
        const vigente = anteriores.find(p => !p.vigencia_fim);
        const vespera = new Date(Date.parse(`${data(inicio)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
        const when = agora();
        await db.transaction([
            ...(vigente ? [{ sql: 'UPDATE rh_parametro SET vigencia_fim = ? WHERE id = ? AND vigencia_fim IS NULL', params: [vespera, vigente.id], expectChanges: 1 }] : []),
            { sql: `INSERT INTO rh_parametro (id, chave, valor, descricao, vigencia_inicio, vigencia_fim, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
                params: [crypto.randomUUID(), chave, valor.trim(), vigente?.descricao || anteriores[0].descricao || null, data(inicio), when, actor.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `Novo valor do parâmetro ${chave}: ${valor.trim()} a partir de ${data(inicio)}`, { chave },
                vigente ? { valor: vigente.valor, vigencia_inicio: vigente.vigencia_inicio } : undefined, { valor: valor.trim(), vigencia_inicio: data(inicio) }, when),
        ]);
    }

    static tabelasIrt() {
        return db.all<IrtTabela>('SELECT id, ano, lei_referencia, vigencia_inicio, vigencia_fim FROM rh_irt_tabela ORDER BY vigencia_inicio DESC').catch(() => []);
    }

    static escaloesIrt(tabelaId?: string) {
        return tabelaId
            ? db.all<IrtEscalao>('SELECT * FROM rh_irt_escalao WHERE tabela_id = ? ORDER BY ordem', [tabelaId]).catch(() => [])
            : db.all<IrtEscalao>('SELECT * FROM rh_irt_escalao ORDER BY tabela_id, ordem').catch(() => []);
    }

    /** Nova versão da tabela do IRT (ex.: OGE 2027). A anterior termina na véspera; as antigas não mudam. */
    static async novaTabelaIrt(input: { ano: number; lei_referencia: string; vigencia_inicio: string; escaloes: IrtEscalao[] }, actor: ActorRH) {
        const inicio = data(input.vigencia_inicio);
        if (!inicio || !texto(input.lei_referencia) || !Number.isInteger(input.ano)) throw new Error('Indique o ano, a lei e o início de vigência.');
        const erros = validarEscaloes(input.escaloes);
        if (erros.length) throw new Error(erros.join(' '));
        const tabelas = await this.tabelasIrt();
        if (tabelas.some(t => t.vigencia_inicio >= inicio)) throw new Error('Já existe uma tabela com início nessa data ou depois.');
        const vigente = tabelas.find(t => !t.vigencia_fim);
        const vespera = new Date(Date.parse(`${inicio}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            ...(vigente ? [{ sql: 'UPDATE rh_irt_tabela SET vigencia_fim = ? WHERE id = ? AND vigencia_fim IS NULL', params: [vespera, vigente.id], expectChanges: 1 }] : []),
            { sql: `INSERT INTO rh_irt_tabela (id, ano, lei_referencia, vigencia_inicio, vigencia_fim, criado_em, criado_por) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
                params: [id, input.ano, input.lei_referencia.trim(), inicio, when, actor.id], expectChanges: 1 },
            ...[...input.escaloes].sort((a, b) => a.ordem - b.ordem).map((e, i) => ({
                sql: `INSERT INTO rh_irt_escalao (id, tabela_id, ordem, limite_inferior_minor, limite_superior_minor, parcela_fixa_minor, taxa) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                params: [`${id}-${i + 1}`, id, i + 1, minor(e.limite_inferior_minor), e.limite_superior_minor === null ? null : minor(e.limite_superior_minor), minor(e.parcela_fixa_minor), Number(e.taxa)],
                expectChanges: 1,
            })),
            auditoriaRH(actor, 'create', `Nova tabela do IRT ${input.ano} (${input.lei_referencia.trim()}) a partir de ${inicio}`, { tabelaId: id }, undefined, input.escaloes, when),
        ]);
        return id;
    }

    // ── Arquivo digital ───────────────────────────────────────────────────────────
    static documentos(funcionarioId?: string) {
        return funcionarioId
            ? db.all<DocumentoRH>('SELECT * FROM rh_documento WHERE funcionario_id = ? ORDER BY criado_em DESC', [funcionarioId]).catch(() => [])
            : db.all<DocumentoRH>('SELECT * FROM rh_documento ORDER BY criado_em DESC').catch(() => []);
    }

    static async ficheiroDocumento(documentoId: string) {
        const row = await db.get<{ data_url: string }>('SELECT data_url FROM rh_documento_ficheiro WHERE documento_id = ?', [documentoId]);
        return row?.data_url || null;
    }

    /**
     * Carrega um documento. Um novo documento da mesma categoria e nome (ex.: novo BI) não apaga o anterior:
     * o antigo passa a «substituído». As categorias Saúde e Disciplinar ficam sempre confidenciais.
     */
    static async carregarDocumento(input: { funcionario_id: string; categoria: CategoriaDocumento; nome: string; ficheiro_nome: string; data_url: string;
        data_emissao?: string | null; data_validade?: string | null; confidencial?: boolean; substitui?: string | null }, maxMb: number, actor: ActorRH) {
        if (!texto(input.nome)) throw new Error('Indique o nome do documento.');
        if (!CATEGORIAS_DOCUMENTO.some(c => c.id === input.categoria)) throw new Error('Categoria inválida.');
        if (!MIMES_DOCUMENTO.test(input.data_url)) throw new Error('O ficheiro tem de ser PDF, JPG, PNG ou DOCX.');
        const tamanho = Math.floor((input.data_url.length - input.data_url.indexOf(',') - 1) * 3 / 4);
        if (tamanho > maxMb * 1024 * 1024) throw new Error(`O ficheiro é demasiado grande (máximo ${maxMb} MB).`);
        if (input.data_emissao && input.data_validade && data(input.data_validade)! <= data(input.data_emissao)!) throw new Error('A validade tem de ser posterior à emissão.');
        const mime = input.data_url.slice(5, input.data_url.indexOf(';'));
        const confidencial = CATEGORIAS_CONFIDENCIAIS.has(input.categoria) || Boolean(input.confidencial);
        const id = crypto.randomUUID();
        const when = agora();
        const hoje = luandaTodayKey().replace(/-/gu, '');
        const extensao = input.ficheiro_nome.includes('.') ? input.ficheiro_nome.slice(input.ficheiro_nome.lastIndexOf('.')).toLowerCase() : '';
        const normalizado = `${hoje}-${input.nome.trim().normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, '').toLowerCase()}${extensao}`;
        await db.transaction([
            ...(input.substitui ? [{ sql: `UPDATE rh_documento SET estado = 'substituido', substituido_por = ?, actualizado_em = ? WHERE id = ? AND estado = 'activo'`,
                params: [id, when, input.substitui], expectChanges: 1 }] : []),
            { sql: `INSERT INTO rh_documento (id, funcionario_id, categoria, nome, ficheiro_nome, mime, tamanho, data_emissao, data_validade, confidencial, estado,
                    carregado_por, carregado_por_nome, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?)`,
                params: [id, input.funcionario_id, input.categoria, input.nome.trim(), normalizado, mime, tamanho, data(input.data_emissao), data(input.data_validade),
                    confidencial ? 1 : 0, actor.id, actor.name, when], expectChanges: 1 },
            { sql: 'INSERT INTO rh_documento_ficheiro (documento_id, data_url) VALUES (?, ?)', params: [id, input.data_url], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Carregou o documento «${input.nome.trim()}» (${input.categoria}) do funcionário ${input.funcionario_id}`,
                { funcionarioId: input.funcionario_id, documentoId: id, substitui: input.substitui || null }, undefined, undefined, when),
        ]);
        return id;
    }

    static async arquivarDocumento(id: string, actor: ActorRH) {
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_documento SET estado = 'arquivado', actualizado_em = ? WHERE id = ? AND estado <> 'arquivado'`, params: [when, id], expectChanges: 1 },
            auditoriaRH(actor, 'delete', 'Arquivou um documento do funcionário', { documentoId: id }, undefined, undefined, when),
        ]);
    }

}
