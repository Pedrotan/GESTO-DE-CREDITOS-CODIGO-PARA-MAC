import { getPendingSyncCount, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';

// Antes de reiniciar (desktop) ou recarregar (web) para uma versão nova: nada do que está a ser editado se perde.
// Um formulário aberto noutra janela de diálogo bloqueia o reinício até ser guardado ou fechado, e as alterações
// ainda por enviar para a nuvem são enviadas primeiro.

/** Marca a janela do próprio aviso de actualização (não conta como trabalho aberto). */
export const UPDATE_DIALOG_ATTR = 'data-tango-update';

// Campos que guardam trabalho: a palavra-passe («Sessão expirada», MFA) e os campos escondidos não contam.
const WORK_FIELDS = 'input:not([type="password"]):not([type="hidden"]), textarea, select, [contenteditable="true"]';

/** Página de entrada: ainda não há sessão nem trabalho que se possa perder. */
const onLoginPage = () => typeof window !== 'undefined' && /^#\/entrar\b/.test(window.location.hash);

/** Janelas de edição abertas além do aviso de actualização. */
export const openEditors = (root: ParentNode = document) => onLoginPage() ? [] :
    Array.from(root.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
        .filter(element => !element.closest(`[${UPDATE_DIALOG_ATTR}]`) && element.getAttribute('data-state') !== 'closed' && !!element.querySelector(WORK_FIELDS));

/** Há algum formulário ou janela de edição aberta além do aviso de actualização? */
export const hasOpenEditor = (root: ParentNode = document) => openEditors(root).length > 0;

/** Título da primeira janela de edição aberta, para dizer ao utilizador qual tem de fechar. */
export const openEditorTitle = (root: ParentNode = document) => {
    const editor = openEditors(root)[0];
    const title = editor?.querySelector('h2, [id$="-title"]')?.textContent?.trim();
    return title || null;
};

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
