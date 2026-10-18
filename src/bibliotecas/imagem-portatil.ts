import { getFileUrl } from './utils';

/** Converte ficheiros do computador/blob/SVG em bytes de imagem que funcionam também na web e nos PDFs. */
export async function portableCompanyImage(value: string): Promise<string> {
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value) && value.length <= 1_000_000) return value;
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve(); image.onerror = () => reject(new Error('Não foi possível ler a imagem da empresa para sincronizar.'));
    });
    image.crossOrigin = 'anonymous';
    image.src = getFileUrl(value);
    await loaded;
    for (const max of [1024, 768, 512, 256]) {
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Não foi possível preparar o logótipo para sincronizar.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/png');
        if (result.length <= 1_000_000) return result;
    }
    throw new Error('A imagem da empresa é demasiado grande para sincronizar.');
}
