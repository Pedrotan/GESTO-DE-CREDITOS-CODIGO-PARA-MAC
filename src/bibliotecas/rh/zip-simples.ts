// ZIP sem compressão («stored»), suficiente para descarregar a pasta de um funcionário: PDF e imagens já vêm comprimidos.
// Sem dependências: cabeçalhos locais, directório central e CRC-32 (formato PKWARE APPNOTE).

const TABELA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

export function crc32(dados: Uint8Array) {
    let c = 0xffffffff;
    for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** Data/hora no formato MS-DOS do ZIP. */
function dataDos(d: Date) {
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora, dia };
}

/** Bytes de um data URL (base64). */
export function bytesDeDataUrl(dataUrl: string) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
}

/** Junta os ficheiros num ZIP; os nomes repetidos ganham « (2)», « (3)»… */
export function criarZip(ficheiros: Array<{ nome: string; dados: Uint8Array; data?: Date }>) {
    const codificar = new TextEncoder();
    const usados = new Map<string, number>();
    const partes: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let deslocamento = 0;
    for (const f of ficheiros) {
        let nome = f.nome.replace(/\\/gu, '/').replace(/^\/+/u, '');
        const n = (usados.get(nome) || 0) + 1;
        usados.set(nome, n);
        if (n > 1) nome = nome.replace(/(\.[^./]+)?$/u, m => ` (${n})${m}`);
        const nomeBytes = codificar.encode(nome);
        const crc = crc32(f.dados);
        const { hora, dia } = dataDos(f.data || new Date());
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
        local.setUint16(10, hora, true); local.setUint16(12, dia, true); local.setUint32(14, crc, true);
        local.setUint32(18, f.dados.length, true); local.setUint32(22, f.dados.length, true); local.setUint16(26, nomeBytes.length, true); local.setUint16(28, 0, true);
        partes.push(new Uint8Array(local.buffer), nomeBytes, f.dados);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
        c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true); c.setUint32(20, f.dados.length, true); c.setUint32(24, f.dados.length, true);
        c.setUint16(28, nomeBytes.length, true); c.setUint32(42, deslocamento, true);
        central.push(new Uint8Array(c.buffer), nomeBytes);
        deslocamento += 30 + nomeBytes.length + f.dados.length;
    }
    const tamanhoCentral = central.reduce((s, b) => s + b.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, ficheiros.length, true); fim.setUint16(10, ficheiros.length, true);
    fim.setUint32(12, tamanhoCentral, true); fim.setUint32(16, deslocamento, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)] as BlobPart[], { type: 'application/zip' });
}
