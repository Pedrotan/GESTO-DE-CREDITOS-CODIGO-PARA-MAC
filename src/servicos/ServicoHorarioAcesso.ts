import { describeDenial, evaluateAccess, normalizeAccessSchedule, type AccessSchedule } from '@/bibliotecas/horario-acesso';
import { SHARED_SETTING_KEYS, ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';

// Leitura das regras de horário de acesso e mensagem a mostrar a quem fica sem acesso.

/** Mensagem guardada quando a sessão termina por horário, para o ecrã de login a mostrar. */
export const ACCESS_DENIED_MESSAGE_KEY = 'tango_access_denied_message';

export const loadAccessSchedule = async (): Promise<AccessSchedule> =>
    normalizeAccessSchedule(await ServicoDefinicoesPartilhadas.get(SHARED_SETTING_KEYS.accessSchedule).catch(() => null));

/** Motivo pelo qual o utilizador não pode entrar agora (com a hora a que pode voltar), ou null. */
export const accessDenialFor = async (user: { id: string; role?: string }): Promise<string | null> => {
    const decision = evaluateAccess(await loadAccessSchedule(), user);
    return decision.allowed ? null : describeDenial(decision);
};
