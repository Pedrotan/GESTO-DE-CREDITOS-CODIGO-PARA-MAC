// Comunicação do portal do funcionário com o RH: outros pedidos (ex.: subsídio de férias), o correio interno e os
// avisos (notificações) para o Gestor de RH e o Administrador principal. Cada pedido fica no painel do RH, que responde.
import { db } from '@/bibliotecas/bd';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { auditoriaRH, type ActorRH, type Funcionario } from './ServicoRH';

export type TipoPedido = 'subsidio_ferias' | 'declaracao' | 'outro';
export type EstadoPedido = 'pendente' | 'aprovado' | 'recusado';
export type PedidoRH = {
    id: string; funcionario_id: string; tipo: TipoPedido; ano: number | null; assunto: string; descricao: string | null; estado: EstadoPedido; resposta: string | null;
    criado_em: string; criado_por: string | null; criado_por_nome: string | null; respondido_em: string | null; respondido_por: string | null; respondido_por_nome: string | null;
};
export type MensagemRH = {
    id: string; funcionario_id: string; sentido: 'para_rh' | 'para_funcionario'; assunto: string; corpo: string; de_id: string | null; de_nome: string | null;
    lida: number; resposta_a: string | null; criado_em: string;
};
export const ROTULO_PEDIDO: Record<TipoPedido, string> = { subsidio_ferias: 'Subsídio de férias', declaracao: 'Declaração', outro: 'Outro pedido' };

type Pessoa = { id: string; role?: unknown; permissions?: unknown; status?: unknown };
/** Quem recebe os avisos dos pedidos: quem gere o RH e o Administrador principal. */
export const destinatariosRH = (users: Pessoa[], principalId?: string | null) => [...new Set(users
    .filter(u => !['blocked', 'inactive'].includes(String(u.status || 'active')))
    .filter(u => u.id === principalId || String(u.role) === 'hr_manager' || (String(u.role) !== 'super_admin' && ServicoControloAcesso.temPermissao(u as never, 'hr_manage')))
    .map(u => u.id))];

const NOTIFICACAO_SQL = `INSERT INTO notifications (id, userId, title, message, type, read, timestamp)
                    VALUES (?, ?, ?, ?, ?, 0, ?)`;
export const avisos = (destinatarios: string[], titulo: string, mensagem: string, quando: string) =>
    destinatarios.map(userId => ({ sql: NOTIFICACAO_SQL, params: [crypto.randomUUID(), userId, titulo, mensagem, 'info', quando] }));
const agora = () => new Date().toISOString();

export class ServicoPortalComunicacao {
    // ---------- Pedidos ----------
    static meusPedidos(funcionarioId: string) {
        return db.all<PedidoRH>('SELECT * FROM rh_pedido WHERE funcionario_id = ? ORDER BY criado_em DESC', [funcionarioId]).catch(() => [] as PedidoRH[]);
    }
    static todosPedidos() {
        return db.all<PedidoRH>('SELECT * FROM rh_pedido ORDER BY estado = \'pendente\' DESC, criado_em DESC').catch(() => [] as PedidoRH[]);
    }

    static async pedir(f: Funcionario, input: { tipo: TipoPedido; ano?: number | null; assunto?: string; descricao: string }, actor: ActorRH, destinatarios: string[]) {
        const descricao = input.descricao.trim();
        if (input.tipo !== 'subsidio_ferias' && descricao.length < 5) throw new Error('Explique o pedido.');
        const assunto = (input.assunto?.trim() || ROTULO_PEDIDO[input.tipo] + (input.ano ? ` ${input.ano}` : '')).slice(0, 120);
        const id = crypto.randomUUID();
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_pedido (id, funcionario_id, tipo, ano, assunto, descricao, estado, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`,
                params: [id, f.id, input.tipo, input.ano ?? null, assunto, descricao || null, when, actor.id, actor.name], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Pedido no portal: ${assunto}`, { funcionarioId: f.id, pedidoId: id }, undefined, undefined, when),
            ...avisos(destinatarios, `Pedido de ${f.nome}`, `${assunto}${descricao ? `: ${descricao.slice(0, 140)}` : ''}`, when),
        ]);
        return id;
    }

    static async responderPedido(p: PedidoRH, estado: 'aprovado' | 'recusado', resposta: string, actor: ActorRH, utilizadorDoFuncionario?: string | null) {
        const texto = resposta.trim();
        if (texto.length < 3) throw new Error('Escreva a resposta ao funcionário.');
        const when = agora();
        await db.transaction([
            { sql: `UPDATE rh_pedido SET estado = ?, resposta = ?, respondido_em = ?, respondido_por = ?, respondido_por_nome = ? WHERE id = ? AND estado = 'pendente'`,
                params: [estado, texto, when, actor.id, actor.name, p.id], expectChanges: 1 },
            auditoriaRH(actor, 'update', `${estado === 'aprovado' ? 'Aprovou' : 'Recusou'} o pedido «${p.assunto}»`, { funcionarioId: p.funcionario_id, pedidoId: p.id }, undefined, { resposta: texto }, when),
            ...avisos(utilizadorDoFuncionario ? [utilizadorDoFuncionario] : [], `Pedido ${estado}`, `${p.assunto}: ${texto.slice(0, 160)}`, when),
        ]);
    }

    // ---------- Correio interno ----------
    static correioDoFuncionario(funcionarioId: string) {
        return db.all<MensagemRH>('SELECT * FROM rh_correio WHERE funcionario_id = ? ORDER BY criado_em DESC', [funcionarioId]).catch(() => [] as MensagemRH[]);
    }
    static todoCorreio() {
        return db.all<MensagemRH>('SELECT * FROM rh_correio ORDER BY criado_em DESC').catch(() => [] as MensagemRH[]);
    }

    /** O funcionário escreve ao RH. */
    static async escreverAoRH(f: Funcionario, assunto: string, corpo: string, actor: ActorRH, destinatarios: string[], respostaA?: string | null) {
        const a = assunto.trim(); const c = corpo.trim();
        if (!a || c.length < 2) throw new Error('Escreva o assunto e a mensagem.');
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_correio (id, funcionario_id, sentido, assunto, corpo, resposta_a, criado_em, de_id, de_nome) VALUES (?, ?, 'para_rh', ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), f.id, a.slice(0, 160), c, respostaA || null, when, actor.id, actor.name], expectChanges: 1 },
            ...avisos(destinatarios, `Mensagem de ${f.nome}`, `${a}: ${c.slice(0, 140)}`, when),
        ]);
    }

    /** O RH escreve (ou responde) ao funcionário. */
    static async escreverAoFuncionario(funcionarioId: string, assunto: string, corpo: string, actor: ActorRH, utilizadorDoFuncionario?: string | null, respostaA?: string | null) {
        const a = assunto.trim(); const c = corpo.trim();
        if (!a || c.length < 2) throw new Error('Escreva o assunto e a mensagem.');
        const when = agora();
        await db.transaction([
            { sql: `INSERT INTO rh_correio (id, funcionario_id, sentido, assunto, corpo, resposta_a, criado_em, de_id, de_nome) VALUES (?, ?, 'para_funcionario', ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), funcionarioId, a.slice(0, 160), c, respostaA || null, when, actor.id, actor.name], expectChanges: 1 },
            ...avisos(utilizadorDoFuncionario ? [utilizadorDoFuncionario] : [], 'Mensagem do RH', `${a}: ${c.slice(0, 140)}`, when),
        ]);
    }

    static marcarLida(id: string) {
        return db.run('UPDATE rh_correio SET lida = 1 WHERE id = ?', [id]).catch(() => undefined);
    }
}
