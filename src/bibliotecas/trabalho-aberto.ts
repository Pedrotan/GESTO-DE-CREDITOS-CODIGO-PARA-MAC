import { getPendingSyncCount, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';

// Antes de reiniciar (desktop) ou recarregar (web) para uma versão nova: nada do que está a ser editado se perde.
// Um formulário aberto noutra janela de diálogo bloqueia o reinício até ser guardado ou fechado, e as alterações
// ainda por enviar para a nuvem são enviadas primeiro.

/** Marca a janela do próprio aviso de actualização (não conta como trabalho aberto). */
export const UPDATE_DIALOG_ATTR = 'data-tango-update';

/** Há algum formulário ou janela de edição aberta além do aviso de actualização? */
export const hasOpenEditor = (root: ParentNode = document) =>
    Array.from(root.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
        .some(element => !element.closest(`[${UPDATE_DIALOG_ATTR}]`) && !!element.querySelector('input, textarea, select, [contenteditable="true"]'));

/**
 * Envia para a nuvem o que ainda está pendente (até 30 s). Devolve quantas alterações ficaram por enviar:
 * ficam guardadas localmente e seguem depois do reinício, por isso não impedem a actualização.
 */
export const flushPendingWork = async (timeoutMs = 30_000) => {
    try {
        await Promise.race([syncCloudNow(), new Promise(resolve => setTimeout(resolve, timeoutMs))]);
    } catch { /* sem nuvem configurada ou sem rede: os dados continuam guardados localmente */ }
    return getPendingSyncCount().catch(() => 0);
};
