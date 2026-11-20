import { CHAVE_ADMIN_PRINCIPAL, lerAdminPrincipal, motivoRecusaDesignar, type AdminPrincipal } from '@/bibliotecas/administrador-principal';
import { ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';

type Pessoa = { id: string; name: string; role?: unknown; status?: unknown };

/** Administrador principal da empresa (ver administrador-principal.ts). */
export class ServicoAdminPrincipal {
    static async obter(): Promise<AdminPrincipal | null> {
        return lerAdminPrincipal(await ServicoDefinicoesPartilhadas.get(CHAVE_ADMIN_PRINCIPAL).catch(() => null));
    }

    /** Designa (ou transfere para) o alvo. Devolve a designação gravada. */
    static async designar(actor: Pessoa, alvo: Pessoa): Promise<AdminPrincipal> {
        const motivo = motivoRecusaDesignar(actor, alvo, await this.obter());
        if (motivo) throw new Error(motivo);
        const designacao: AdminPrincipal = { userId: alvo.id, nome: alvo.name, designadoPor: actor.id, designadoPorNome: actor.name, em: new Date().toISOString() };
        await ServicoDefinicoesPartilhadas.set(CHAVE_ADMIN_PRINCIPAL, JSON.stringify(designacao), actor.id);
        return designacao;
    }
}
