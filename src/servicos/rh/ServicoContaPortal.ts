// Acesso ao portal do funcionário criado a partir da ficha: o RH marca «Criar acesso ao portal» e o sistema gera o
// utilizador (pelo nome completo) e uma senha aleatória, que o funcionário troca obrigatoriamente no primeiro acesso.
// A conta fica com o perfil «Funcionário» só com o portal: não vê créditos nem a gestão da empresa.
import bcrypt from 'bcryptjs';
import { db } from '@/bibliotecas/bd';
import { senhaAleatoria, utilizadorDoNome, type Existente } from '@/bibliotecas/rh/conta-portal';
import { auditoriaRH, type ActorRH, type Funcionario } from './ServicoRH';

const PERMISSOES = ['hr_self', 'rh_portal.ver', 'rh_portal.criar'];
export { utilizadorDoNome, senhaAleatoria } from '@/bibliotecas/rh/conta-portal';

export const CONTA_PORTAL_SQL = `INSERT INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, mustChangePassword)
                VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, 'active', 1)`;

export class ServicoContaPortal {
    /**
     * Cria a conta do portal e liga-a à ficha. Devolve o utilizador e a senha temporária (só mostrada agora: a base
     * guarda apenas o hash). O email é o da ficha, se nenhum utilizador o usar; senão, um endereço interno.
     */
    static async criar(f: Pick<Funcionario, 'id' | 'nome' | 'email' | 'utilizador_id'>, actor: ActorRH, existentes: Existente[]) {
        if (f.utilizador_id) throw new Error(`${f.nome} já tem acesso ao portal.`);
        const username = utilizadorDoNome(f.nome, existentes);
        const emailFicha = f.email?.trim().toLowerCase();
        const emailLivre = emailFicha && !existentes.some(u => [u.email, u.username].some(v => String(v || '').toLowerCase() === emailFicha));
        const email = emailLivre ? emailFicha! : `${username}@portal.interno`;
        const senha = senhaAleatoria();
        const id = crypto.randomUUID();
        const agora = new Date().toISOString();
        const iniciais = f.nome.split(/\s+/u).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'FU';
        await db.run(CONTA_PORTAL_SQL, [id, f.nome.trim(), email, username, bcrypt.hashSync(senha, 10), iniciais, agora, JSON.stringify(PERMISSOES)]);
        await db.transaction([
            { sql: 'UPDATE rh_funcionario SET utilizador_id = ? WHERE id = ?', params: [id, f.id], expectChanges: 1 },
            auditoriaRH(actor, 'create', `Criou o acesso ao portal de ${f.nome} (utilizador ${username})`, { funcionarioId: f.id, utilizadorId: id }, undefined, undefined, agora),
        ]);
        return { id, username, email, senha };
    }
}
