// Chat interno: regras partilhadas pela página (anexos, ficha de cliente, datas e estado de presença).
import type { ChatAttachment, ChatClientCard, ChatMessage } from '../tipos/credito.ts';

/** Cada ficheiro até 5 MB e cada mensagem até 6 MB: a mensagem viaja inteira na sincronização (máx. ≈ 11 MB cifrada). */
export const CHAT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const CHAT_MAX_MESSAGE_BYTES = 6 * 1024 * 1024;
/** Fotografias maiores do que isto são reduzidas (lado maior 1600 px) antes de enviar. */
const IMAGE_SHRINK_BYTES = 1.2 * 1024 * 1024;
export const CHAT_ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt,.ods';
const ACCEPTED = /^(image\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.ms-excel$|application\/vnd\.oasis\.opendocument\.|text\/(plain|csv)$)/iu;

export const tamanhoLegivel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

/** «Hoje», «Ontem» ou a data (separadores da conversa). */
export const rotuloDia = (data: Date, hoje = new Date()) => {
    const dia = (valor: Date) => new Date(valor.getFullYear(), valor.getMonth(), valor.getDate()).getTime();
    const diferenca = Math.round((dia(hoje) - dia(data)) / 86_400_000);
    if (diferenca === 0) return 'Hoje';
    if (diferenca === 1) return 'Ontem';
    return data.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: diferenca > 300 ? 'numeric' : undefined });
};

export type Presenca = { online: boolean; lastSeen: string | null } | undefined;
/** Texto do estado de alguém: só «Online» com sinal recente do servidor; sem dados da nuvem não se inventa nada. */
export const estadoPresenca = (presenca: Presenca, disponivel: boolean, agora = Date.now()): { online: boolean; texto: string } => {
    if (presenca?.online) return { online: true, texto: 'Online' };
    if (!disponivel) return { online: false, texto: 'Estado desconhecido (sem ligação à nuvem)' };
    const visto = presenca?.lastSeen ? Date.parse(presenca.lastSeen) : NaN;
    if (!Number.isFinite(visto)) return { online: false, texto: 'Offline' };
    const minutos = Math.max(1, Math.round((agora - visto) / 60_000));
    if (minutos < 60) return { online: false, texto: `Visto há ${minutos} min` };
    return { online: false, texto: `Visto às ${new Date(visto).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}` };
};

type ClienteFicha = {
    id: string; name: string; nif?: string | null; phone?: string | null; email?: string | null; address?: string | null;
    creditLimit?: number | null; usedCredit?: number | null; availableCredit?: number | null; status?: string | null; riskLevel?: string | null;
};
/** Ficha do cliente partilhada no chat: só os dados de identificação e de crédito (sem documentos nem coordenadas). */
export const fichaCliente = (cliente: ClienteFicha): ChatClientCard => ({
    id: cliente.id, name: cliente.name,
    nif: cliente.nif || undefined, phone: cliente.phone || undefined, email: cliente.email || undefined, address: cliente.address || undefined,
    creditLimit: Number(cliente.creditLimit) || 0, usedCredit: Number(cliente.usedCredit) || 0, availableCredit: Number(cliente.availableCredit) || 0,
    status: cliente.status || undefined, riskLevel: cliente.riskLevel || undefined,
});

/** Resumo de uma mensagem (lista de conversas e notificações). */
export const resumoMensagem = (mensagem: Pick<ChatMessage, 'content' | 'attachments' | 'clientCard'>) => {
    const texto = mensagem.content.trim();
    if (texto) return texto;
    if (mensagem.clientCard) return `Ficha de cliente: ${mensagem.clientCard.name}`;
    const ficheiros = mensagem.attachments || [];
    if (ficheiros.length === 1) return ficheiros[0].mime.startsWith('image/') ? 'Fotografia' : ficheiros[0].name;
    return ficheiros.length ? `${ficheiros.length} ficheiros` : '';
};

/** Erro de validação de um ficheiro novo ('' quando pode seguir). */
export const problemaFicheiro = (ficheiro: { name: string; type: string; size: number }, jaAnexados: number) => {
    if (!ACCEPTED.test(ficheiro.type || '')) return `«${ficheiro.name}»: só imagens, PDF, Word, Excel ou texto.`;
    if (ficheiro.size > CHAT_MAX_FILE_BYTES && !ficheiro.type.startsWith('image/')) return `«${ficheiro.name}» tem mais de ${tamanhoLegivel(CHAT_MAX_FILE_BYTES)}.`;
    if (jaAnexados >= 6) return 'Máximo de 6 ficheiros por mensagem.';
    return '';
};

const lerComoDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ''));
    leitor.onerror = () => reject(leitor.error || new Error('Não foi possível ler o ficheiro.'));
    leitor.readAsDataURL(blob);
});

/** Reduz uma fotografia grande (lado maior 1600 px, JPEG 0,82); fica igual se não for possível. */
const reduzirImagem = async (ficheiro: File): Promise<Blob> => {
    if (ficheiro.size <= IMAGE_SHRINK_BYTES || !/^image\/(jpeg|png|webp)$/u.test(ficheiro.type) || typeof createImageBitmap === 'undefined') return ficheiro;
    try {
        const imagem = await createImageBitmap(ficheiro);
        const escala = Math.min(1, 1600 / Math.max(imagem.width, imagem.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(imagem.width * escala);
        canvas.height = Math.round(imagem.height * escala);
        canvas.getContext('2d')?.drawImage(imagem, 0, 0, canvas.width, canvas.height);
        const reduzida = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        return reduzida && reduzida.size < ficheiro.size ? reduzida : ficheiro;
    } catch {
        return ficheiro;
    }
};

/** Anexo pronto a enviar (fotografias grandes já reduzidas). */
export const lerAnexo = async (ficheiro: File): Promise<ChatAttachment> => {
    const conteudo = await reduzirImagem(ficheiro);
    if (conteudo.size > CHAT_MAX_FILE_BYTES) throw new Error(`«${ficheiro.name}» tem mais de ${tamanhoLegivel(CHAT_MAX_FILE_BYTES)}.`);
    const reduzida = conteudo !== ficheiro;
    return {
        id: crypto.randomUUID(),
        name: reduzida ? ficheiro.name.replace(/\.(png|webp)$/iu, '.jpg') : ficheiro.name,
        mime: reduzida ? 'image/jpeg' : (ficheiro.type || 'application/octet-stream'),
        size: conteudo.size,
        dataUrl: await lerComoDataUrl(conteudo),
    };
};
