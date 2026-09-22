import { useEffect, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';

export interface FormDraftOptions<T extends Record<string, any>> {
    /** Extra state to persist alongside form values (e.g. documents, bankCoordinates, custom state) */
    extraState?: Record<string, any>;
    /** Callback called when extra state is restored from draft */
    onRestoreExtraState?: (extra: any) => void;
    /** If false, draft persistence is disabled */
    enabled?: boolean;
    /** Optional callback when draft is restored */
    onDraftRestored?: () => void;
}

const STORAGE_PREFIX = 'tango_form_draft_';

export function getFormDraft<T = any>(key: string): { formValues: T; extraState?: any; updatedAt: number } | null {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function saveFormDraft(key: string, formValues: any, extraState?: any) {
    try {
        if (!key) return;
        localStorage.setItem(
            `${STORAGE_PREFIX}${key}`,
            JSON.stringify({
                formValues,
                extraState: extraState || null,
                updatedAt: Date.now(),
            })
        );
    } catch (e) {
        console.warn(`[saveFormDraft] Failed to save draft for ${key}:`, e);
    }
}

export function clearFormDraft(key: string) {
    try {
        localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch (e) {
        console.warn(`[clearFormDraft] Failed to clear draft for ${key}:`, e);
    }
}

/**
 * Descarta todos os rascunhos de formulários guardados.
 * Usado ao mudar de página: fechar a modal por engano mantém o que estava a ser
 * preenchido, mas sair da página é uma desistência explícita do cadastro.
 */
export function clearAllFormDrafts() {
    try {
        Object.keys(localStorage)
            .filter((k) => k.startsWith(STORAGE_PREFIX))
            .forEach((k) => localStorage.removeItem(k));
    } catch (e) {
        console.warn('[clearAllFormDrafts] Failed to clear drafts:', e);
    }
}

/**
 * Última rota vista. Vive no módulo, e não num ref, porque cada página monta o
 * seu próprio MainLayout: um ref seria reinicializado a cada navegação e a
 * mudança de rota nunca chegaria a ser detectada.
 */
let ultimaRota: string | null = null;

/**
 * Descarta os rascunhos quando a rota muda de facto.
 * Na primeira chamada apenas regista a rota, sem limpar nada.
 */
export function discardDraftsOnRouteChange(pathname: string) {
    if (ultimaRota !== null && ultimaRota !== pathname) {
        clearAllFormDrafts();
    }
    ultimaRota = pathname;
}

export function useFormDraft<T extends Record<string, any>>(
    draftKey: string,
    form: UseFormReturn<T>,
    options?: FormDraftOptions<T>
) {
    const isRestoredRef = useRef(false);
    const enabled = options?.enabled !== false;
    const extraStateRef = useRef(options?.extraState);
    extraStateRef.current = options?.extraState;
    const onRestoreExtraStateRef = useRef(options?.onRestoreExtraState);
    onRestoreExtraStateRef.current = options?.onRestoreExtraState;
    const onDraftRestoredRef = useRef(options?.onDraftRestored);
    onDraftRestoredRef.current = options?.onDraftRestored;

    // 1. Restore draft on mount
    useEffect(() => {
        if (!enabled || isRestoredRef.current || !draftKey) return;
        isRestoredRef.current = true;

        const draft = getFormDraft<T>(draftKey);
        if (draft && draft.formValues) {
            // Restore form values
            form.reset({
                ...form.getValues(),
                ...draft.formValues,
            });

            // Restore extra state if callback provided
            if (draft.extraState && onRestoreExtraStateRef.current) {
                onRestoreExtraStateRef.current(draft.extraState);
            }

            if (onDraftRestoredRef.current) {
                onDraftRestoredRef.current();
            }
        }
    }, [draftKey, enabled, form]);

    // 2. Watch form changes and extraState changes, then debounced save
    useEffect(() => {
        if (!enabled || !draftKey) return;

        let saveTimeout: any = null;

        const saveCurrent = () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                const currentValues = form.getValues();
                // Check if there is any user-filled value (non-empty)
                const hasData = Object.values(currentValues).some((v) => {
                    if (v === '' || v === null || v === undefined) return false;
                    if (Array.isArray(v) && v.length === 0) return false;
                    return true;
                });

                const extra = extraStateRef.current;
                const hasExtra = extra && Object.values(extra).some((v) => {
                    if (v === '' || v === null || v === undefined) return false;
                    if (Array.isArray(v) && v.length === 0) return false;
                    return true;
                });

                if (hasData || hasExtra) {
                    saveFormDraft(draftKey, currentValues, extra);
                }
            }, 300);
        };

        const subscription = form.watch(() => {
            saveCurrent();
        });

        // Also save when extraState changes
        saveCurrent();

        return () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            subscription.unsubscribe();
        };
    }, [draftKey, form, options?.extraState, enabled]);

    const clearDraft = () => {
        clearFormDraft(draftKey);
    };

    return {
        clearDraft,
        hasDraft: () => !!getFormDraft(draftKey),
    };
}
