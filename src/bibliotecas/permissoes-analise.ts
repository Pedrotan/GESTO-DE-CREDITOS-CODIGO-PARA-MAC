// Leitura das permissões para pessoas: nome legível, diferenças antes/depois, conflitos de segregação de
// funções e ações críticas. Usado nos editores de perfis e de utilizadores e na matriz em PDF.
import { CONFLITOS_SEGREGAO_FUNCOES, DESCRICOES_ACOES, MODULOS_SISTEMA, type AcaoModulo } from '@/tipos/controlo-acesso';

export const ALL_PERMISSIONS = MODULOS_SISTEMA.flatMap(module => module.acoesDisponiveis.map(action => `${module.id}.${action}`));

export function describePermission(id: string) {
    const [moduleId, action] = id.split('.');
    const module = MODULOS_SISTEMA.find(item => item.id === moduleId);
    const info = DESCRICOES_ACOES[action as AcaoModulo];
    return { id, module: module?.nome || moduleId, action: info?.nome || action, label: `${module?.nome || moduleId} · ${info?.nome || action}`, critical: Boolean(info?.critica), description: info?.descricao || '' };
}

export function diffPermissions(before: Iterable<string>, after: Iterable<string>) {
    const a = new Set(before);
    const b = new Set(after);
    return {
        added: [...b].filter(id => !a.has(id)).sort(),
        removed: [...a].filter(id => !b.has(id)).sort(),
    };
}

export function segregationConflicts(permissions: Iterable<string>) {
    const set = new Set(permissions);
    return CONFLITOS_SEGREGAO_FUNCOES.filter(conflict => conflict.permissoesConflitantes.every(id => set.has(id)));
}

export const criticalPermissions = (permissions: Iterable<string>) => [...permissions].filter(id => describePermission(id).critical);
