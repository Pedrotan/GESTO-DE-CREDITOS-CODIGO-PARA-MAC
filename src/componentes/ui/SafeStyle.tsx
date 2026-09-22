// Safe CSS injection component to replace dangerouslySetInnerHTML
// This component uses a style element with text content instead of innerHTML

import { useEffect, useRef } from 'react';

interface SafeStyleProps {
    css: string;
    id?: string;
}

export function SafeStyle({ css, id }: SafeStyleProps) {
    const styleRef = useRef<HTMLStyleElement | null>(null);

    useEffect(() => {
        if (!styleRef.current) {
            styleRef.current = document.createElement('style');
            if (id) {
                styleRef.current.id = id;
            }
            document.head.appendChild(styleRef.current);
        }

        // Use textContent instead of innerHTML for safety
        styleRef.current.textContent = css;

        return () => {
            if (styleRef.current && styleRef.current.parentNode) {
                styleRef.current.parentNode.removeChild(styleRef.current);
            }
        };
    }, [css, id]);

    return null;
}
