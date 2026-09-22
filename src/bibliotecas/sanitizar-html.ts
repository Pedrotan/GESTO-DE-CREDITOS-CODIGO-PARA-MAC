const ALLOWED_TAGS = new Set([
    'P', 'BR', 'DIV', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'MARK',
    'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'TABLE', 'THEAD',
    'TBODY', 'TR', 'TH', 'TD', 'A'
]);
const ALLOWED_STYLE_PROPERTIES = new Set([
    'color', 'background-color', 'text-align', 'font-weight', 'font-style',
    'text-decoration', 'font-size', 'line-height', 'margin-left', 'padding-left'
]);

export function sanitizeRichHtml(input: unknown): string {
    const source = typeof input === 'string' ? input : '';
    if (typeof DOMParser === 'undefined') return source.replace(/<[^>]*>/g, '');
    const document = new DOMParser().parseFromString(source, 'text/html');
    const elements = Array.from(document.body.querySelectorAll('*'));
    for (const element of elements) {
        if (!ALLOWED_TAGS.has(element.tagName)) {
            element.replaceWith(...Array.from(element.childNodes));
            continue;
        }
        for (const attribute of Array.from(element.attributes)) {
            const name = attribute.name.toLowerCase();
            if (name.startsWith('on') || !['href', 'title', 'target', 'rel', 'class', 'style'].includes(name)) {
                element.removeAttribute(attribute.name);
            }
        }
        if (element.tagName === 'A') {
            const href = element.getAttribute('href') || '';
            if (!/^(https?:|mailto:|tel:)/i.test(href)) element.removeAttribute('href');
            element.setAttribute('rel', 'noopener noreferrer');
        } else {
            element.removeAttribute('href');
            element.removeAttribute('target');
            element.removeAttribute('rel');
        }
        const style = element.getAttribute('style');
        if (style) {
            const safeStyle = style.split(';').map(value => value.trim()).filter(Boolean).filter(declaration => {
                const [property, rawValue = ''] = declaration.split(':', 2);
                return ALLOWED_STYLE_PROPERTIES.has(property.trim().toLowerCase()) && !/url\s*\(|expression\s*\(/i.test(rawValue);
            }).join('; ');
            if (safeStyle) element.setAttribute('style', safeStyle);
            else element.removeAttribute('style');
        }
    }
    return document.body.innerHTML;
}
