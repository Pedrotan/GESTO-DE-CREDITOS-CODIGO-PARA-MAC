import { forwardRef, useCallback, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { sanitizeRichHtml } from '@/bibliotecas/sanitizar-html';

type EditorCartaProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> & {
    html: string;
};

/** Cada montagem repõe o rascunho, mesmo quando o painel do separador monta mais tarde. */
export const EditorCarta = forwardRef<HTMLDivElement, EditorCartaProps>(function EditorCarta({ html, ...props }, forwardedRef) {
    const elementRef = useRef<HTMLDivElement | null>(null);
    const attachRef = useCallback((element: HTMLDivElement | null) => {
        elementRef.current = element;
        if (typeof forwardedRef === 'function') forwardedRef(element);
        else if (forwardedRef) forwardedRef.current = element;
    }, [forwardedRef]);

    useLayoutEffect(() => {
        const element = elementRef.current;
        const safeHtml = sanitizeRichHtml(html);
        // Não substituir o DOM enquanto se escreve se já representa o estado: preserva o cursor.
        if (element && element.innerHTML !== safeHtml) element.innerHTML = safeHtml;
    }, [html]);

    return <div {...props} ref={attachRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" />;
});
