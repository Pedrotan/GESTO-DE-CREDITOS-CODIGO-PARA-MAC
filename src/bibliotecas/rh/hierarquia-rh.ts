// Hierarquia da empresa: departamentos com secções, níveis dos cargos e o chefe directo de cada funcionário.
// O chefe directo é o escolhido na ficha; sem escolha, é o responsável da secção e, depois, o do departamento.
// Funções puras (sem base de dados), usadas no organograma, na ficha, no portal e nos avisos dos pedidos.

export type NivelCargo = 1 | 2 | 3 | 4 | 5;
export const NIVEIS_CARGO: Array<{ nivel: NivelCargo; nome: string; descricao: string }> = [
    { nivel: 1, nome: 'Direcção', descricao: 'Director / administrador do departamento' },
    { nivel: 2, nome: 'Chefia', descricao: 'Chefe de secção ou de serviço' },
    { nivel: 3, nome: 'Coordenação', descricao: 'Coordenador, supervisor ou encarregado' },
    { nivel: 4, nome: 'Técnico', descricao: 'Técnico superior, técnico, especialista' },
    { nivel: 5, nome: 'Apoio', descricao: 'Administrativo, operacional, auxiliar' },
];
export const nomeNivel = (nivel: number | null | undefined) => NIVEIS_CARGO.find(n => n.nivel === nivel)?.nome || 'Sem nível';

type DeptH = { id: string; nome: string; responsavel_id: string | null; activo?: number };
type SeccaoH = { id: string; nome: string; departamento_id: string; responsavel_id: string | null; activo?: number };
type CargoH = { id: string; nome: string; nivel?: number | null };
type FuncH = { id: string; nome: string; estado?: string; departamento_id: string | null; seccao_id?: string | null; cargo_id: string | null; chefe_id?: string | null };
export type EstruturaH = { departamentos: DeptH[]; seccoes: SeccaoH[]; cargos: CargoH[]; funcionarios: FuncH[] };

export type OrigemChefe = 'ficha' | 'seccao' | 'departamento' | null;

/** Chefe que a estrutura indica (responsável da secção; se for o próprio ou não houver, o do departamento). */
export function chefeSugerido(f: Pick<FuncH, 'id' | 'departamento_id' | 'seccao_id'>, e: Pick<EstruturaH, 'departamentos' | 'seccoes'>): { id: string | null; origem: OrigemChefe } {
    const seccao = f.seccao_id ? e.seccoes.find(s => s.id === f.seccao_id) : undefined;
    if (seccao?.responsavel_id && seccao.responsavel_id !== f.id) return { id: seccao.responsavel_id, origem: 'seccao' };
    const dep = f.departamento_id ? e.departamentos.find(d => d.id === f.departamento_id) : undefined;
    if (dep?.responsavel_id && dep.responsavel_id !== f.id) return { id: dep.responsavel_id, origem: 'departamento' };
    return { id: null, origem: null };
}

/** Chefe directo efectivo: o da ficha, senão o sugerido pela estrutura. */
export function chefeDirecto(f: FuncH, e: Pick<EstruturaH, 'departamentos' | 'seccoes'>): { id: string | null; origem: OrigemChefe } {
    if (f.chefe_id && f.chefe_id !== f.id) return { id: f.chefe_id, origem: 'ficha' };
    return chefeSugerido(f, e);
}

/** Subordinados directos (pelo chefe efectivo), só funcionários não cessados. */
export function subordinados(chefeId: string, e: EstruturaH) {
    return e.funcionarios.filter(f => f.id !== chefeId && f.estado !== 'cessado' && chefeDirecto(f, e).id === chefeId);
}

/** Linha de chefias acima do funcionário (chefe, chefe do chefe…), parando num ciclo. */
export function cadeiaChefia(funcionarioId: string, e: EstruturaH) {
    const cadeia: FuncH[] = [];
    const vistos = new Set([funcionarioId]);
    let actual = e.funcionarios.find(f => f.id === funcionarioId);
    while (actual) {
        const chefe = chefeDirecto(actual, e).id;
        if (!chefe || vistos.has(chefe)) break;
        vistos.add(chefe);
        actual = e.funcionarios.find(f => f.id === chefe);
        if (actual) cadeia.push(actual);
    }
    return cadeia;
}

/**
 * Escolher «chefeId» como chefe directo de «funcionarioId» cria um ciclo (o chefe passaria a responder, directa ou
 * indirectamente, ao próprio funcionário)? Devolve a mensagem de erro ou null.
 */
export function cicloChefia(funcionarioId: string, chefeId: string | null | undefined, e: EstruturaH): string | null {
    if (!chefeId) return null;
    if (chefeId === funcionarioId) return 'O chefe directo não pode ser o próprio funcionário.';
    const base = { ...e, funcionarios: e.funcionarios.map(f => (f.id === funcionarioId ? { ...f, chefe_id: chefeId } : f)) };
    const vistos = new Set<string>([funcionarioId]);
    let actual = base.funcionarios.find(f => f.id === chefeId);
    while (actual) {
        if (vistos.has(actual.id)) return `${actual.nome} já responde (directa ou indirectamente) a este funcionário: escolher este chefe criava um ciclo na hierarquia.`;
        vistos.add(actual.id);
        const proximo = chefeDirecto(actual, base).id;
        if (!proximo) return null;
        if (proximo === funcionarioId) return `${actual.nome} já responde (directa ou indirectamente) a este funcionário: escolher este chefe criava um ciclo na hierarquia.`;
        actual = base.funcionarios.find(f => f.id === proximo);
    }
    return null;
}

export type SeccaoOrganograma = { seccao: SeccaoH | null; responsavel: FuncH | null; membros: FuncH[] };
export type DepartamentoOrganograma = { departamento: DeptH | null; responsavel: FuncH | null; seccoes: SeccaoOrganograma[]; total: number };

const nivelDe = (f: FuncH, e: EstruturaH) => e.cargos.find(c => c.id === f.cargo_id)?.nivel ?? 9;
const ordenar = (lista: FuncH[], e: EstruturaH) => [...lista].sort((a, b) => nivelDe(a, e) - nivelDe(b, e) || a.nome.localeCompare(b.nome, 'pt'));

/** Organograma por departamento → secção → funcionários (por nível do cargo). «Sem departamento» fica no fim. */
export function organograma(e: EstruturaH): DepartamentoOrganograma[] {
    const activos = e.funcionarios.filter(f => f.estado !== 'cessado');
    const pessoa = (id: string | null) => (id ? activos.find(f => f.id === id) || null : null);
    const deps = e.departamentos.filter(d => d.activo !== 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    const resultado: DepartamentoOrganograma[] = deps.map(d => {
        const doDep = activos.filter(f => f.departamento_id === d.id);
        const seccoes = e.seccoes.filter(s => s.departamento_id === d.id && s.activo !== 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
        const blocos: SeccaoOrganograma[] = seccoes.map(s => ({
            seccao: s, responsavel: pessoa(s.responsavel_id),
            membros: ordenar(doDep.filter(f => f.seccao_id === s.id && f.id !== s.responsavel_id && f.id !== d.responsavel_id), e),
        }));
        const semSeccao = doDep.filter(f => (!f.seccao_id || !seccoes.some(s => s.id === f.seccao_id)) && f.id !== d.responsavel_id && !seccoes.some(s => s.responsavel_id === f.id));
        if (semSeccao.length) blocos.push({ seccao: null, responsavel: null, membros: ordenar(semSeccao, e) });
        return { departamento: d, responsavel: pessoa(d.responsavel_id), seccoes: blocos, total: doDep.length };
    });
    const orfaos = activos.filter(f => !f.departamento_id || !deps.some(d => d.id === f.departamento_id));
    if (orfaos.length) resultado.push({ departamento: null, responsavel: null, seccoes: [{ seccao: null, responsavel: null, membros: ordenar(orfaos, e) }], total: orfaos.length });
    return resultado;
}
