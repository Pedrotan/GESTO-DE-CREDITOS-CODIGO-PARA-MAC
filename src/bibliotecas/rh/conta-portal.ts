// Utilizador e senha temporária da conta do portal do funcionário (funções puras, testáveis sem base de dados).
export type Existente = { username?: string | null; email?: string | null };

/** Utilizador a partir do nome completo: minúsculas, sem acentos, palavras separadas por ponto (ex.: pedro.de.morais.tango). */
export function utilizadorDoNome(nome: string, existentes: Existente[] = []) {
    const base = nome.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
        .replace(/[^a-z0-9]+/gu, '.').replace(/^\.+|\.+$/gu, '').slice(0, 60) || 'funcionario';
    const usados = new Set(existentes.flatMap(u => [u.username, u.email]).filter(Boolean).map(v => String(v).toLowerCase()));
    let candidato = base;
    for (let n = 2; usados.has(candidato); n++) candidato = `${base}${n}`;
    return candidato;
}

/** Senha aleatória de 10 caracteres com maiúscula, minúscula, algarismo e símbolo (sem caracteres que se confundem). */
export function senhaAleatoria(tamanho = 10) {
    const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!?'];
    const todos = grupos.join('');
    const aleatorio = (n: number) => { const v = new Uint32Array(1); crypto.getRandomValues(v); return v[0] % n; };
    const letras = grupos.map(g => g[aleatorio(g.length)]);
    while (letras.length < tamanho) letras.push(todos[aleatorio(todos.length)]);
    for (let i = letras.length - 1; i > 0; i--) { const j = aleatorio(i + 1); [letras[i], letras[j]] = [letras[j], letras[i]]; }
    return letras.join('');
}
