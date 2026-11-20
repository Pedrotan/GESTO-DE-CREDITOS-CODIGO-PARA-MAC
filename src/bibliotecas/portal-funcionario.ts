// Funcionário (perfil «Funcionário» só com o portal): não vê nada de créditos nem da gestão da empresa. O menu, as
// páginas e os avisos do cabeçalho ficam reduzidos ao portal do funcionário (recibos, férias, dispensas, documentos).
import { PERMISSOES_PORTAL_FUNCIONARIO as PERMISSOES_PORTAL, parsePermissionList } from './conta-principal.ts';

/** Perfil «Funcionário» sem outras permissões (uma excepção atribuída à mão devolve o sistema normal). */
export const ehSoFuncionario = (user: { role?: unknown; permissions?: unknown } | null | undefined) =>
    Boolean(user) && String(user!.role) === 'employee' && parsePermissionList(user!.permissions).every(p => PERMISSOES_PORTAL.has(p));

/** Páginas que o funcionário pode abrir. */
export const ROTAS_FUNCIONARIO = ['/rh/portal', '/termos-e-politicas'] as const;
export const rotaPermitidaFuncionario = (pathname: string) => ROTAS_FUNCIONARIO.some(r => pathname === r || pathname.startsWith(`${r}/`));
