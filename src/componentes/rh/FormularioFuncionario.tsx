// Cadastro e edição de funcionário, no padrão do cadastro de clientes: modal larga com cabeçalho escuro, navegação por
// secções, cartões numerados em grelha de 4 colunas e rodapé fixo. Valida ao sair de cada campo e ao guardar, recusa
// duplicados, guarda rascunho a cada 10 s e serve para «Novo» e «Editar» (abrindo numa secção e campo indicados).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Switch } from '@/componentes/ui/switch';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Camera, CheckCircle2, FileUp, Plus, Trash2, X } from 'lucide-react';
import { ServicoRH, CATEGORIAS_DOCUMENTO, type AbonoInicial, type ActorRH, type Cargo, type CategoriaDocumento, type Contrato, type Departamento, type Funcionario, type FuncionarioRubrica, type Rubrica, type Seccao } from '@/servicos/rh/ServicoRH';
import { chefeSugerido } from '@/bibliotecas/rh/hierarquia-rh';
import { RH_VINCULOS, FORMATO_BI } from '@/bibliotecas/rh/esquema-rh';
import { valorNumerico, valorTexto } from '@/bibliotecas/rh/parametros-rh';
import { validarDatasBI } from '@/bibliotecas/rh/bi-validade';
import { ANGOLAN_BANKS, angolanIbanProblem, formatAngolanIBAN, identifyBankFromIBAN } from '@/bibliotecas/ibanHelper';
import { PROVINCIAS_DPA, municipiosDaProvincia, provinciaDPA } from '@/bibliotecas/dpa-angola';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { toast } from '@/ganchos/usar-toast';
import { deslocarDentro, executar, kz, lerFicheiro, paraMinor, seccaoVisivel } from './comum-rh';
import { DialogoContrato } from './DialogosFuncionario';
import { calculoRubrica } from './CatalogoSubsidios';

export type SeccaoFormulario = 'pessoais' | 'identificacao' | 'contactos' | 'empresa' | 'contrato' | 'subsidios' | 'documentos';
/** Onde abrir a edição: secção e, opcionalmente, o campo a focar (ex.: «Completar agora» da ficha). */
export type AlvoEdicao = { seccao?: SeccaoFormulario; campo?: string };

type Props = {
    open: boolean; onClose: () => void; onSaved: () => void; actor: ActorRH;
    funcionario?: Funcionario | null; seccaoInicial?: AlvoEdicao; departamentos: Departamento[]; cargos: Cargo[]; seccoes?: Seccao[];
    funcionarios?: Funcionario[]; contratos?: Contrato[]; rubricas?: Rubrica[]; anosValidadeBI: number; maxMb?: number;
    horarios?: Array<{ id: string; nome: string; activo?: number; entrada?: string; saida?: string }>;
};

const SECCOES: Array<{ id: SeccaoFormulario; titulo: string; descricao: string; cor: string }> = [
    { id: 'pessoais', titulo: 'Dados pessoais', descricao: 'Fotografia, número, nome e dados pessoais.', cor: 'blue' },
    { id: 'identificacao', titulo: 'Identificação', descricao: 'Bilhete de identidade, NIF e Segurança Social.', cor: 'indigo' },
    { id: 'contactos', titulo: 'Contactos e banco', descricao: 'Telefones, email, morada e conta para o salário.', cor: 'emerald' },
    { id: 'empresa', titulo: 'Na empresa', descricao: 'Cargo, vínculo, carreira, horário e chefe directo.', cor: 'purple' },
    { id: 'contrato', titulo: 'Contrato inicial', descricao: 'Tipo, datas, salário base e contrato assinado.', cor: 'amber' },
    { id: 'subsidios', titulo: 'Subsídios e abonos', descricao: 'Escolha do catálogo da empresa. O valor é calculado a partir do salário base.', cor: 'teal' },
    { id: 'documentos', titulo: 'Documentos e observações', descricao: 'Vão para a pasta pessoal do funcionário.', cor: 'slate' },
];
const CORES: Record<string, { borda: string; faixa: string; numero: string; titulo: string }> = {
    blue: { borda: 'border-blue-200/80', faixa: 'bg-blue-50/80 border-blue-100', numero: 'bg-blue-600', titulo: 'text-blue-900' },
    indigo: { borda: 'border-indigo-200/80', faixa: 'bg-indigo-50/80 border-indigo-100', numero: 'bg-indigo-600', titulo: 'text-indigo-900' },
    emerald: { borda: 'border-emerald-200/80', faixa: 'bg-emerald-50/80 border-emerald-100', numero: 'bg-emerald-600', titulo: 'text-emerald-900' },
    purple: { borda: 'border-purple-200/80', faixa: 'bg-purple-50/80 border-purple-100', numero: 'bg-purple-600', titulo: 'text-purple-900' },
    amber: { borda: 'border-amber-200/80', faixa: 'bg-amber-50/80 border-amber-100', numero: 'bg-amber-600', titulo: 'text-amber-900' },
    teal: { borda: 'border-teal-200/80', faixa: 'bg-teal-50/80 border-teal-100', numero: 'bg-teal-600', titulo: 'text-teal-900' },
    slate: { borda: 'border-slate-200', faixa: 'bg-slate-50 border-slate-100', numero: 'bg-slate-700', titulo: 'text-slate-900' },
};
/** Secção de cada campo (para marcar a secção com erro e abrir a edição no sítio certo). */
const SECCAO_DO_CAMPO: Record<string, SeccaoFormulario> = {
    foto_url: 'pessoais', numero_mecanografico: 'pessoais', nome: 'pessoais', data_nascimento: 'pessoais', sexo: 'pessoais', estado_civil: 'pessoais', nacionalidade: 'pessoais',
    bi_numero: 'identificacao', bi_emissao: 'identificacao', bi_validade: 'identificacao', nif: 'identificacao', numero_inss: 'identificacao',
    telefone: 'contactos', telefone_alternativo: 'contactos', email: 'contactos', morada: 'contactos', provincia: 'contactos', municipio: 'contactos', banco: 'contactos', iban: 'contactos',
    data_admissao: 'empresa', departamento_id: 'empresa', cargo_id: 'empresa', vinculo: 'empresa', carreira: 'empresa', chefe_id: 'empresa', horario_id: 'empresa',
    contrato_inicio: 'contrato', contrato_fim: 'contrato', salario: 'contrato',
};
const ORDEM_CAMPOS = Object.keys(SECCAO_DO_CAMPO);
const NENHUM = '__nenhum__';
const NACIONALIDADES = ['Angolana', 'Portuguesa', 'Brasileira', 'Cabo-verdiana', 'Moçambicana', 'São-tomense', 'Guineense', 'Congolesa (RDC)', 'Congolesa (Rep.)', 'Namibiana', 'Sul-africana', 'Outra'];
const CHAVE_RASCUNHO = 'rh-rascunho-novo-funcionario';

type ContratoForm = { tipo: Contrato['tipo']; inicio: string; fim: string; periodo_experiencia_fim: string; salario: number; horas_semanais: number; dias_ferias: number };
type SubsidioForm = { chave: string; rubrica_id: string; valor: number; existenteId?: string; inicio?: string };
type DocumentoForm = { chave: string; ficheiro: File; categoria: CategoriaDocumento; validade: string };

const formatarTelefone = (v: string) => v.replace(/\D/gu, '').slice(0, 9).replace(/^(\d{3})(\d{0,3})(\d{0,3}).*/u, (_m, a, b, c) => [a, b, c].filter(Boolean).join(' '));
const somarDias = (dataIso: string, dias: number) => { const d = new Date(`${dataIso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const dataCurta = (v?: string | null) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');

/** Recorte quadrado ao centro, 400 px, em JPEG (fotografia do funcionário). */
async function recortarFoto(ficheiro: File) {
    const url = await lerFicheiro(ficheiro);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Imagem inválida.')); i.src = url; });
    const lado = Math.min(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    canvas.getContext('2d')!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 400, 400);
    return canvas.toDataURL('image/jpeg', 0.85);
}

function Campo({ id, label, obrig, erro, dica, className, children }: { id: string; label: string; obrig?: boolean; erro?: string; dica?: ReactNode; className?: string; children: ReactNode }) {
    return (
        <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
            <label htmlFor={`ff-${id}`} className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{label}{obrig && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}</label>
            {children}
            {erro ? <span role="alert" className="text-xs font-semibold text-red-600">{erro}</span> : dica ? <span className="text-xs text-slate-500">{dica}</span> : null}
        </div>
    );
}

export function FormularioFuncionario({ open, onClose, onSaved, actor, funcionario, seccaoInicial, departamentos, cargos, seccoes = [], funcionarios = [], contratos = [], rubricas: rubricasProp, anosValidadeBI, maxMb = 2, horarios = [] }: Props) {
    const { users } = useAuth();
    const { companySettings } = useData();
    const edicao = Boolean(funcionario);
    const hoje = luandaTodayKey();
    const provinciaEmpresa = provinciaDPA((companySettings as { location?: string })?.location) || provinciaDPA(companySettings?.address);
    const vazio = useCallback((): Partial<Funcionario> => ({ estado: 'activo', data_admissao: luandaTodayKey(), reformado: 0, nacionalidade: 'Angolana', provincia: provinciaEmpresa || null }), [provinciaEmpresa]);
    const contratoVazio = (): ContratoForm => ({ tipo: 'indeterminado', inicio: luandaTodayKey(), fim: '', periodo_experiencia_fim: '', salario: 0, horas_semanais: 40, dias_ferias: 22 });

    const [f, setF] = useState<Partial<Funcionario>>(vazio());
    const [contrato, setContrato] = useState<ContratoForm>(contratoVazio());
    const [comContrato, setComContrato] = useState(true);
    const [tocados, setTocados] = useState<{ inicio: boolean; experimental: boolean }>({ inicio: false, experimental: false });
    const [contratoAssinado, setContratoAssinado] = useState<File | null>(null);
    const [subsidios, setSubsidios] = useState<SubsidioForm[]>([]);
    const [removidos, setRemovidos] = useState<string[]>([]);
    const [documentos, setDocumentos] = useState<DocumentoForm[]>([]);
    const [escolhaSubsidio, setEscolhaSubsidio] = useState('');
    const [visitados, setVisitados] = useState<Set<string>>(new Set());
    const [mostrarTodos, setMostrarTodos] = useState(false);
    const [sujo, setSujo] = useState(false);
    const [aGuardar, setAGuardar] = useState(false);
    const [activa, setActiva] = useState<SeccaoFormulario>('pessoais');
    const [rascunho, setRascunho] = useState<null | { guardadoEm: string }>(null);
    const [renovar, setRenovar] = useState(false);
    const [portalModo, setPortalModo] = useState<'sem' | 'existente'>('sem');
    const [rubricas, setRubricas] = useState<Rubrica[]>(rubricasProp || []);
    const [parametros, setParametros] = useState<Awaited<ReturnType<typeof ServicoRH.parametros>>>([]);
    const corpo = useRef<HTMLDivElement>(null);
    const ficheirosDocs = useRef<HTMLInputElement>(null);
    const contratoActual = funcionario ? contratos.find(c => c.funcionario_id === funcionario.id && c.estado === 'activo') : undefined;

    // Abrir: preenche com o funcionário (edição) ou vazio; oferece o rascunho guardado do «Novo».
    useEffect(() => {
        if (!open) return;
        setVisitados(new Set()); setMostrarTodos(false); setSujo(false); setRemovidos([]); setDocumentos([]); setContratoAssinado(null); setEscolhaSubsidio('');
        setTocados({ inicio: false, experimental: false });
        void ServicoRH.parametros().then(setParametros);
        if (!rubricasProp) void ServicoRH.rubricas().then(setRubricas); else setRubricas(rubricasProp);
        if (funcionario) {
            setF({ ...funcionario });
            setPortalModo(funcionario.utilizador_id ? 'existente' : 'sem');
            setComContrato(false);
            setRascunho(null);
            void ServicoRH.rubricasFuncionario(funcionario.id).then((lista: FuncionarioRubrica[]) => setSubsidios(lista.filter(x => !x.fim || x.fim >= luandaTodayKey())
                .map(x => ({ chave: x.id, rubrica_id: x.rubrica_id, valor: x.valor_minor / 100, existenteId: x.id, inicio: x.inicio }))));
            return;
        }
        setF(vazio()); setContrato(contratoVazio()); setComContrato(true); setSubsidios([]); setPortalModo('sem');
        void ServicoRH.proximoNumero().then(numero => setF(prev => ({ ...prev, numero_mecanografico: prev.numero_mecanografico || numero })));
        try { const r = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || 'null'); setRascunho(r?.f ? { guardadoEm: r.guardadoEm } : null); } catch { setRascunho(null); }
    }, [open, funcionario]); // eslint-disable-line react-hooks/exhaustive-deps

    // «Gerir catálogo →» abre noutro separador: ao voltar, a lista do catálogo actualiza-se.
    useEffect(() => {
        if (!open) return;
        const actualizar = () => void ServicoRH.rubricas().then(setRubricas);
        window.addEventListener('focus', actualizar);
        return () => window.removeEventListener('focus', actualizar);
    }, [open]);

    // Subsídios com «Atribuir automaticamente» entram já seleccionados no «Novo».
    useEffect(() => {
        if (!open || edicao) return;
        const auto = rubricas.filter(r => r.activo && !r.sistema && (r as Rubrica & { auto_atribuir?: number }).auto_atribuir);
        if (auto.length) setSubsidios(s => (s.length ? s : auto.map(r => ({ chave: crypto.randomUUID(), rubrica_id: r.id, valor: (r.valor_padrao_minor || 0) / 100 }))));
    }, [open, edicao, rubricas]);

    // Abrir a edição numa secção (e campo) — «Editar» de cada secção da ficha e «Completar agora».
    useEffect(() => {
        if (!open || !seccaoInicial?.seccao) return;
        const t = setTimeout(() => {
            const campo = seccaoInicial.campo ? document.getElementById(`ff-${seccaoInicial.campo}`) : null;
            deslocarDentro(corpo.current, campo?.parentElement || corpo.current?.querySelector(`#ff-sec-${seccaoInicial.seccao}`) || null, false);
            actualizarActiva();
            campo?.focus({ preventScroll: true });
        }, 150);
        return () => clearTimeout(t);
    }, [open, seccaoInicial]);

    // Rascunho automático do «Novo» a cada 10 s (sem a fotografia nem os ficheiros).
    const estadoRef = useRef({ f, contrato, comContrato, subsidios });
    estadoRef.current = { f, contrato, comContrato, subsidios };
    const sujoRef = useRef(sujo);
    sujoRef.current = sujo;
    useEffect(() => {
        if (!open || edicao) return;
        const t = setInterval(() => {
            if (!sujoRef.current) return;
            try { localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ ...estadoRef.current, f: { ...estadoRef.current.f, foto_url: undefined }, guardadoEm: new Date().toISOString() })); } catch { /* sem armazenamento */ }
        }, 10_000);
        return () => clearInterval(t);
    }, [open, edicao]);
    const recuperarRascunho = () => {
        try {
            const r = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || 'null');
            if (r?.f) { setF(prev => ({ ...prev, ...r.f, numero_mecanografico: prev.numero_mecanografico })); setContrato(r.contrato || contratoVazio()); setComContrato(r.comContrato ?? true); setSubsidios(r.subsidios || []); setSujo(true); }
        } catch { /* rascunho ilegível */ }
        setRascunho(null);
    };
    const descartarRascunho = () => { try { localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* sem armazenamento */ } setRascunho(null); };

    const set = (campo: keyof Funcionario, valor: unknown) => { setF(prev => ({ ...prev, [campo]: valor })); setSujo(true); };
    const setC = (parte: Partial<ContratoForm>) => { setContrato(c => ({ ...c, ...parte })); setSujo(true); };
    const visitar = (campo: string) => setVisitados(v => (v.has(campo) ? v : new Set(v).add(campo)));
    const cargo = cargos.find(c => c.id === f.cargo_id);
    const carreiras = useMemo(() => {
        const lista = valorTexto(parametros, 'carreiras', hoje, '').split(';').map(s => s.trim()).filter(Boolean);
        return [...new Set([...lista, ...(f.carreira ? [f.carreira] : [])])];
    }, [parametros, hoje, f.carreira]);
    const diasExperimental = (tipo: Contrato['tipo']) => valorNumerico(parametros, tipo === 'determinado' ? 'periodo_experimental_dias_determinado' : 'periodo_experimental_dias_indeterminado', hoje, tipo === 'determinado' ? 30 : 60);

    // Contrato: o início acompanha a admissão e o fim do período experimental é sugerido pelo tipo, até o utilizador os mudar.
    useEffect(() => {
        if (edicao || !open) return;
        setContrato(c => {
            const inicio = tocados.inicio ? c.inicio : (f.data_admissao || c.inicio);
            const periodo = tocados.experimental || !inicio ? c.periodo_experiencia_fim : somarDias(inicio, diasExperimental(c.tipo));
            return inicio === c.inicio && periodo === c.periodo_experiencia_fim ? c : { ...c, inicio, periodo_experiencia_fim: periodo };
        });
    }, [f.data_admissao, contrato.tipo, contrato.inicio, tocados, parametros, open, edicao]); // eslint-disable-line react-hooks/exhaustive-deps

    const salarioBase = edicao ? contratoActual?.salario_base_minor || 0 : paraMinor(contrato.salario);
    const catalogo = rubricas.filter(r => r.activo && !r.sistema && r.tipo === 'abono');
    // Valor mensal ao vivo: % do salário base, valor fixo, ou valor por dia × 30 dias (estimativa; o mês real desconta as faltas).
    const valorMensal = (s: SubsidioForm) => { const r = rubricas.find(x => x.id === s.rubrica_id); return r?.por_dia ? paraMinor(s.valor) * 30 : r?.forma === 'percentagem' ? Math.round(salarioBase * r.percentagem) : paraMinor(s.valor); };
    const totalSubsidios = subsidios.reduce((t, s) => t + valorMensal(s), 0);

    // Validação: a mensagem de cada campo com problema (inclui duplicados contra os funcionários carregados).
    const erros = useMemo(() => {
        const e: Record<string, string> = {};
        if (!f.numero_mecanografico?.trim()) e.numero_mecanografico = 'Indique o n.º mecanográfico.';
        if (!f.nome?.trim() || f.nome.trim().length < 3) e.nome = 'Indique o nome completo.';
        if (f.data_nascimento && f.data_nascimento > `${Number(hoje.slice(0, 4)) - 14}${hoje.slice(4)}`) e.data_nascimento = 'Idade inferior a 14 anos (mínimo legal para trabalhar).';
        if (f.bi_numero && !FORMATO_BI.test(f.bi_numero)) e.bi_numero = 'Formato: 9 algarismos, 2 letras e 3 algarismos (ex.: 002658949BA031).';
        const datasBI = validarDatasBI(f.bi_emissao, f.bi_validade, hoje);
        if (datasBI.length) e.bi_validade = datasBI.join(' ');
        if (f.telefone && f.telefone.replace(/\D/gu, '').length !== 9) e.telefone = 'O telefone tem 9 algarismos (9XX XXX XXX).';
        if (f.telefone_alternativo && f.telefone_alternativo.replace(/\D/gu, '').length !== 9) e.telefone_alternativo = 'O telefone tem 9 algarismos.';
        if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(f.email)) e.email = 'Email inválido.';
        const problemaIban = angolanIbanProblem(f.iban || '');
        if (problemaIban) e.iban = problemaIban;
        if (!f.cargo_id) e.cargo_id = 'Escolha o cargo.';
        if (!f.vinculo) e.vinculo = 'Escolha o vínculo.';
        if (!f.carreira) e.carreira = 'Escolha o grupo / regime de carreira.';
        if (!f.data_admissao) e.data_admissao = 'Indique a data de admissão.';
        if (!edicao && comContrato) {
            if (!(contrato.salario > 0)) e.salario = 'Indique o salário base.';
            if (contrato.tipo === 'determinado' && !contrato.fim) e.contrato_fim = 'Indique o fim do contrato a termo certo.';
            else if (contrato.fim && contrato.fim <= contrato.inicio) e.contrato_fim = 'O fim tem de ser depois do início.';
        }
        // Duplicados (o serviço volta a verificar na base de dados ao gravar).
        const norm = (v?: string | null) => (v || '').replace(/\s+/gu, '').toUpperCase();
        for (const [campo, rotulo] of [['numero_mecanografico', 'n.º'], ['bi_numero', 'BI'], ['nif', 'NIF'], ['iban', 'IBAN'], ['email', 'email']] as Array<[keyof Funcionario, string]>) {
            const v = norm(f[campo] as string);
            const outro = v ? funcionarios.find(x => x.id !== f.id && norm(x[campo] as string) === v) : undefined;
            if (outro && !e[campo]) e[campo] = `Este ${rotulo} já pertence a ${outro.nome} (n.º ${outro.numero_mecanografico}).`;
        }
        return e;
    }, [f, contrato, comContrato, edicao, funcionarios, hoje]);
    const erro = (campo: string) => (mostrarTodos || visitados.has(campo) ? erros[campo] : undefined);
    const seccaoComErro = (s: SeccaoFormulario) => Object.keys(erros).some(c => SECCAO_DO_CAMPO[c] === s && (mostrarTodos || visitados.has(c)));

    // Realça a secção visível na navegação (calculada a cada deslocamento do corpo).
    const actualizarActiva = () => { const id = seccaoVisivel(corpo.current, 'section[id^="ff-sec-"]'); if (id) setActiva(id.replace('ff-sec-', '') as SeccaoFormulario); };
    const irPara = (s: SeccaoFormulario) => deslocarDentro(corpo.current, corpo.current?.querySelector(`#ff-sec-${s}`) || null);

    const fechar = () => {
        if (sujo && !window.confirm('Há alterações por guardar. Fechar sem guardar?')) return;
        onClose();
    };

    const guardar = async (outro: boolean) => {
        setMostrarTodos(true);
        const primeiro = ORDEM_CAMPOS.find(c => erros[c]) || Object.keys(erros)[0];
        if (primeiro) {
            const s = SECCAO_DO_CAMPO[primeiro];
            if (s) irPara(s);
            setTimeout(() => { const campo = document.getElementById(`ff-${primeiro}`); if (campo) { deslocarDentro(corpo.current, campo.parentElement); campo.focus({ preventScroll: true }); } }, 300);
            toast({ variant: 'destructive', title: 'Há campos por corrigir', description: erros[primeiro] });
            return;
        }
        setAGuardar(true);
        const dados: Partial<Funcionario> = { ...f, iban: f.iban ? f.iban.replace(/\s+/gu, '') : f.iban, utilizador_id: portalModo === 'existente' ? f.utilizador_id || null : null };
        const ok = await executar(async () => {
            let id = funcionario?.id;
            if (funcionario) {
                await ServicoRH.actualizarFuncionario(funcionario.id, dados, actor);
                for (const existenteId of removidos) await ServicoRH.terminarRubrica(existenteId, luandaTodayKey(), actor);
                for (const s of subsidios.filter(x => !x.existenteId)) {
                    const r = rubricas.find(x => x.id === s.rubrica_id);
                    await ServicoRH.atribuirRubrica(funcionario.id, { rubrica_id: s.rubrica_id, valor_minor: r?.forma === 'percentagem' ? 0 : paraMinor(s.valor), inicio: luandaTodayKey() }, actor);
                }
            } else {
                const abonos: AbonoInicial[] = subsidios.map(s => ({ rubrica_id: s.rubrica_id, valor_minor: rubricas.find(r => r.id === s.rubrica_id)?.forma === 'percentagem' ? 0 : paraMinor(s.valor) }));
                id = await ServicoRH.criarFuncionario(dados, comContrato ? {
                    tipo: contrato.tipo, inicio: contrato.inicio, fim: contrato.fim || null, periodo_experiencia_fim: contrato.periodo_experiencia_fim || null,
                    salario_base_minor: paraMinor(contrato.salario), horas_semanais: contrato.horas_semanais, dias_ferias: contrato.dias_ferias,
                } : null, actor, abonos);
            }
            // Contrato assinado e documentos vão para a pasta pessoal do funcionário.
            const anexos = [...(contratoAssinado ? [{ ficheiro: contratoAssinado, categoria: 'contratual' as CategoriaDocumento, validade: '', nome: 'Contrato assinado' }] : []),
                ...documentos.map(d => ({ ...d, nome: d.ficheiro.name.replace(/\.[^.]+$/u, '') }))];
            for (const a of anexos) {
                await ServicoRH.carregarDocumento({ funcionario_id: id!, categoria: a.categoria, nome: a.nome, ficheiro_nome: a.ficheiro.name, data_url: await lerFicheiro(a.ficheiro),
                    data_emissao: null, data_validade: a.validade || null, confidencial: false, substitui: null }, maxMb, actor);
            }
        }, funcionario ? 'Ficha do funcionário actualizada' : 'Funcionário registado');
        setAGuardar(false);
        if (!ok) return;
        setSujo(false);
        if (!funcionario) { try { localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* sem armazenamento */ } }
        onSaved();
        if (outro && !funcionario) {
            setF(vazio()); setContrato(contratoVazio()); setComContrato(true); setSubsidios([]); setDocumentos([]); setContratoAssinado(null);
            setVisitados(new Set()); setMostrarTodos(false); setTocados({ inicio: false, experimental: false });
            void ServicoRH.proximoNumero().then(numero => setF(prev => ({ ...prev, numero_mecanografico: numero })));
            corpo.current?.scrollTo({ top: 0 });
            return;
        }
        onClose();
    };

    const escolherFoto = async (ficheiro?: File | null) => {
        if (!ficheiro) return;
        if (!/^image\/(jpeg|png)$/u.test(ficheiro.type)) return void toast({ variant: 'destructive', title: 'Fotografia', description: 'Use uma imagem JPG ou PNG.' });
        if (ficheiro.size > 2 * 1024 * 1024) return void toast({ variant: 'destructive', title: 'Fotografia', description: 'A fotografia tem de ter até 2 MB.' });
        try { set('foto_url', await recortarFoto(ficheiro)); } catch (e) { toast({ variant: 'destructive', title: 'Fotografia', description: (e as Error).message }); }
    };
    const juntarDocumentos = (lista: FileList | null) => {
        if (!lista?.length) return;
        const todos = [...lista];
        const grandes = todos.filter(x => x.size > maxMb * 1024 * 1024);
        if (grandes.length) toast({ variant: 'destructive', title: 'Ficheiro grande demais', description: `${grandes.map(x => x.name).join(', ')}: até ${maxMb} MB.` });
        setDocumentos(d => [...d, ...todos.filter(x => x.size <= maxMb * 1024 * 1024).map(ficheiro => ({ chave: crypto.randomUUID(), ficheiro, categoria: 'identificacao' as CategoriaDocumento, validade: '' }))]);
        setSujo(true);
    };

    const inp = 'h-10 rounded-xl border-slate-200 bg-white text-sm';
    const grelha = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4';
    const seccao = (s: SeccaoFormulario, numero: number, conteudo: ReactNode, extra?: ReactNode) => {
        const def = SECCOES.find(x => x.id === s)!;
        const c = CORES[def.cor];
        return (
            <section id={`ff-sec-${s}`} className={cn('scroll-mt-3 overflow-hidden rounded-2xl border bg-white shadow-xs dark:border-slate-700 dark:bg-slate-900', c.borda)}>
                <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 dark:border-slate-700 dark:bg-slate-800/60', c.faixa)}>
                    <div className="flex items-center gap-3">
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-xs', c.numero)}>{numero}</span>
                        <div><h3 className={cn('text-base font-bold dark:text-white', c.titulo)}>{edicao && s === 'contrato' ? 'Contrato actual' : def.titulo}</h3><p className="text-xs text-slate-600 dark:text-slate-400">{def.descricao}</p></div>
                    </div>
                    {extra}
                </div>
                <div className="p-5 md:p-6">{conteudo}</div>
            </section>
        );
    };

    return (
        <Dialog open={open} onOpenChange={value => !value && fechar()}>
            <DialogContent className="flex h-[92vh] max-h-[96vh] w-full max-w-[96vw] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl xl:max-w-7xl 2xl:max-w-[1440px] [&>button]:text-white">
                <DialogHeader className="relative m-0 shrink-0 border-b border-slate-800 bg-[#0B1527] px-8 py-5 text-left text-white">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-white">{edicao ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-slate-300">Os campos com * são obrigatórios. Pode completar o resto mais tarde na ficha.</DialogDescription>
                </DialogHeader>
                <nav aria-label="Secções do formulário" className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-6 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                    {SECCOES.map((s, i) => (
                        <button key={s.id} type="button" onClick={() => irPara(s.id)} aria-current={activa === s.id ? 'step' : undefined}
                            className={cn('relative whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                                activa === s.id ? 'bg-blue-50 text-blue-900 dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
                            {i + 1} {s.id === 'contrato' ? 'Contrato' : s.id === 'documentos' ? 'Documentos' : s.id === 'subsidios' ? 'Subsídios' : s.titulo}
                            {seccaoComErro(s.id) && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" aria-label="tem erros" />}
                        </button>
                    ))}
                </nav>

                <div ref={corpo} onScroll={actualizarActiva} className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-slate-50/50 p-4 md:p-6 lg:p-8 dark:bg-slate-950">
                    {rascunho && !edicao && (
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
                            <span className="flex-1">Há um rascunho de novo funcionário guardado a {new Date(rascunho.guardadoEm).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}. Recuperar rascunho?</span>
                            <Button size="sm" onClick={recuperarRascunho}>Recuperar</Button>
                            <Button size="sm" variant="outline" onClick={descartarRascunho}>Descartar</Button>
                        </div>
                    )}

                    {seccao('pessoais', 1, <>
                        <div className="mb-5 flex flex-wrap items-center gap-5">
                            {f.foto_url ? <img src={f.foto_url} alt="Fotografia do funcionário" className="h-[84px] w-[84px] rounded-2xl object-cover" />
                                : <span className="flex h-[84px] w-[84px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 text-slate-400"><Camera className="h-7 w-7" aria-hidden="true" /></span>}
                            <div className="space-y-1.5">
                                <div className="flex gap-2">
                                    <label className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500">
                                        {f.foto_url ? 'Mudar foto' : 'Carregar foto'}
                                        <input id="ff-foto_url" type="file" accept="image/jpeg,image/png" className="sr-only" onChange={e => { void escolherFoto(e.target.files?.[0]); e.target.value = ''; }} />
                                    </label>
                                    {f.foto_url && <Button type="button" variant="ghost" size="sm" onClick={() => set('foto_url', null)}>Retirar</Button>}
                                </div>
                                <p className="text-xs text-slate-500">JPG ou PNG, até 2 MB. Recortada em quadrado.</p>
                            </div>
                        </div>
                        <div className={grelha}>
                            <Campo id="numero_mecanografico" label="N.º mecanográfico" obrig erro={erro('numero_mecanografico')} dica={edicao ? 'Não se altera na edição' : 'Gerado automaticamente'}>
                                <Input id="ff-numero_mecanografico" className={inp} value={f.numero_mecanografico || ''} disabled={edicao} onBlur={() => visitar('numero_mecanografico')} onChange={e => set('numero_mecanografico', e.target.value)} />
                            </Campo>
                            <Campo id="nome" label="Nome completo" obrig erro={erro('nome')} className="sm:col-span-2 lg:col-span-3">
                                <Input id="ff-nome" className={inp} value={f.nome || ''} placeholder="Ex.: Maria da Conceição Neto" onBlur={() => visitar('nome')} onChange={e => set('nome', e.target.value)} />
                            </Campo>
                            <Campo id="data_nascimento" label="Data de nascimento" erro={erro('data_nascimento')}>
                                <Input id="ff-data_nascimento" type="date" className={inp} max={hoje} value={f.data_nascimento || ''} onBlur={() => visitar('data_nascimento')} onChange={e => set('data_nascimento', e.target.value)} />
                            </Campo>
                            <Campo id="sexo" label="Sexo">
                                <Select value={f.sexo || NENHUM} onValueChange={v => set('sexo', v === NENHUM ? null : v)}>
                                    <SelectTrigger id="ff-sexo" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Seleccionar</SelectItem><SelectItem value="M">Masculino</SelectItem><SelectItem value="F">Feminino</SelectItem></SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="estado_civil" label="Estado civil">
                                <Select value={f.estado_civil || NENHUM} onValueChange={v => set('estado_civil', v === NENHUM ? null : v)}>
                                    <SelectTrigger id="ff-estado_civil" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Seleccionar</SelectItem>{['Solteiro(a)', 'Casado(a)', 'União de facto', 'Divorciado(a)', 'Viúvo(a)'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="nacionalidade" label="Nacionalidade">
                                <Select value={f.nacionalidade || 'Angolana'} onValueChange={v => set('nacionalidade', v)}>
                                    <SelectTrigger id="ff-nacionalidade" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent>{[...new Set([...NACIONALIDADES, ...(f.nacionalidade ? [f.nacionalidade] : [])])].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                        </div>
                    </>)}

                    {seccao('identificacao', 2, (
                        <div className={grelha}>
                            <Campo id="bi_numero" label="N.º do BI" erro={erro('bi_numero')}>
                                <Input id="ff-bi_numero" className={cn(inp, 'font-mono')} value={f.bi_numero || ''} placeholder="000000000LA000" maxLength={14} onBlur={() => visitar('bi_numero')}
                                    onChange={e => { const bi = e.target.value.toUpperCase().replace(/[^0-9A-Z]/gu, ''); setF(p => ({ ...p, bi_numero: bi, nif: !p.nif || p.nif === p.bi_numero ? bi : p.nif })); setSujo(true); }} />
                            </Campo>
                            <Campo id="bi_emissao" label="Emissão do BI">
                                <Input id="ff-bi_emissao" type="date" className={inp} max={hoje} value={f.bi_emissao || ''} onBlur={() => visitar('bi_validade')} onChange={e => set('bi_emissao', e.target.value)} />
                            </Campo>
                            <Campo id="bi_validade" label="Validade do BI" erro={erro('bi_validade')}
                                dica={!f.bi_validade && f.bi_emissao ? <button type="button" className="font-bold text-blue-600 hover:underline" onClick={() => set('bi_validade', somarDias(f.bi_emissao!, Math.round(anosValidadeBI * 365.25) - 1))}>Usar emissão + {anosValidadeBI} anos</button> : undefined}>
                                <Input id="ff-bi_validade" type="date" className={inp} min={f.bi_emissao || undefined} value={f.bi_validade || ''} onBlur={() => visitar('bi_validade')} onChange={e => set('bi_validade', e.target.value)} />
                            </Campo>
                            <Campo id="nif" label="NIF" erro={erro('nif')} dica="Por defeito, igual ao n.º do BI">
                                <Input id="ff-nif" className={inp} value={f.nif || ''} onBlur={() => visitar('nif')} onChange={e => set('nif', e.target.value.toUpperCase())} />
                            </Campo>
                            <Campo id="numero_inss" label="N.º de Segurança Social (INSS)">
                                <Input id="ff-numero_inss" className={inp} value={f.numero_inss || ''} onChange={e => set('numero_inss', e.target.value)} />
                            </Campo>
                            <div className="flex items-end sm:col-span-2 lg:col-span-3">
                                <label className="flex h-10 cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    <Switch checked={Boolean(f.reformado)} onCheckedChange={v => set('reformado', v ? 1 : 0)} /> Reformado no activo (INSS especial)
                                </label>
                            </div>
                        </div>
                    ))}

                    {seccao('contactos', 3, (
                        <div className={grelha}>
                            <Campo id="telefone" label="Telefone" erro={erro('telefone')}>
                                <Input id="ff-telefone" inputMode="tel" className={inp} value={f.telefone || ''} placeholder="9XX XXX XXX" onBlur={() => visitar('telefone')} onChange={e => set('telefone', formatarTelefone(e.target.value))} />
                            </Campo>
                            <Campo id="telefone_alternativo" label="Telefone alternativo" erro={erro('telefone_alternativo')}>
                                <Input id="ff-telefone_alternativo" inputMode="tel" className={inp} value={f.telefone_alternativo || ''} placeholder="9XX XXX XXX" onBlur={() => visitar('telefone_alternativo')} onChange={e => set('telefone_alternativo', formatarTelefone(e.target.value))} />
                            </Campo>
                            <Campo id="email" label="Email" erro={erro('email')} className="sm:col-span-2">
                                <Input id="ff-email" type="email" className={inp} value={f.email || ''} placeholder="nome@exemplo.com" onBlur={() => visitar('email')} onChange={e => set('email', e.target.value.trim())} />
                            </Campo>
                            <Campo id="morada" label="Morada" className="sm:col-span-2">
                                <Input id="ff-morada" className={inp} value={f.morada || ''} onChange={e => set('morada', e.target.value)} />
                            </Campo>
                            <Campo id="provincia" label="Província">
                                <SearchableSelect className={inp} value={f.provincia || ''} placeholder="Seleccionar" searchPlaceholder="Pesquisar província…"
                                    options={PROVINCIAS_DPA.map(p => ({ value: p, label: p }))} onValueChange={v => { setF(p => ({ ...p, provincia: v, municipio: null })); setSujo(true); }} />
                            </Campo>
                            <Campo id="municipio" label="Município">
                                <SearchableSelect className={inp} value={f.municipio || ''} placeholder={f.provincia ? 'Seleccionar' : 'Escolha a província'} searchPlaceholder="Pesquisar município…" disabled={!f.provincia}
                                    options={municipiosDaProvincia(f.provincia).map(m => ({ value: m, label: m }))} onValueChange={v => set('municipio', v)} />
                            </Campo>
                            <Campo id="banco" label="Banco">
                                <Select value={f.banco || NENHUM} onValueChange={v => set('banco', v === NENHUM ? null : v)}>
                                    <SelectTrigger id="ff-banco" className={inp}><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Seleccionar banco</SelectItem>
                                        {[...new Set([...ANGOLAN_BANKS.map(b => b.name), ...(f.banco ? [f.banco] : [])])].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="iban" label="IBAN" obrig erro={erro('iban')} className="sm:col-span-2 lg:col-span-3" dica="O banco é detectado a partir do IBAN">
                                <Input id="ff-iban" className={cn(inp, 'font-mono')} value={f.iban ? formatAngolanIBAN(f.iban) : ''} placeholder="AO06 0000 0000 0000 0000 0000 0" onBlur={() => visitar('iban')}
                                    onChange={e => { const iban = e.target.value.replace(/\s+/gu, '').toUpperCase(); const banco = identifyBankFromIBAN(iban); setF(p => ({ ...p, iban, banco: banco ? banco.name : p.banco })); setSujo(true); }} />
                            </Campo>
                        </div>
                    ))}

                    {seccao('empresa', 4, (
                        <div className={grelha}>
                            <Campo id="data_admissao" label="Data de admissão" erro={erro('data_admissao')}>
                                <Input id="ff-data_admissao" type="date" className={inp} value={f.data_admissao || ''} onBlur={() => visitar('data_admissao')} onChange={e => set('data_admissao', e.target.value)} />
                            </Campo>
                            <Campo id="departamento_id" label="Departamento">
                                <Select value={f.departamento_id || NENHUM} onValueChange={v => {
                                    const dep = v === NENHUM ? null : v;
                                    setF(p => { const c = cargos.find(x => x.id === p.cargo_id); return { ...p, departamento_id: dep, seccao_id: dep === p.departamento_id ? p.seccao_id : null, cargo_id: c?.departamento_id && dep && c.departamento_id !== dep ? null : p.cargo_id }; });
                                    setSujo(true);
                                }}>
                                    <SelectTrigger id="ff-departamento_id" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Seleccionar</SelectItem>{departamentos.filter(d => d.activo || d.id === f.departamento_id).map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                            {seccoes.some(s => s.departamento_id === f.departamento_id) && (
                                <Campo id="seccao_id" label="Secção" dica="O responsável da secção é o chefe directo sugerido">
                                    <Select value={f.seccao_id || NENHUM} onValueChange={v => set('seccao_id', v === NENHUM ? null : v)}>
                                        <SelectTrigger id="ff-seccao_id" className={inp}><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value={NENHUM}>Sem secção (directamente no departamento)</SelectItem>
                                            {seccoes.filter(s => s.departamento_id === f.departamento_id && (s.activo || s.id === f.seccao_id)).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                                    </Select>
                                </Campo>
                            )}
                            <Campo id="cargo_id" label="Cargo" obrig erro={erro('cargo_id')} dica={f.departamento_id ? 'Filtrado pelo departamento' : undefined}>
                                <Select value={f.cargo_id || NENHUM} onValueChange={v => { const c = cargos.find(x => x.id === v); setF(p => ({ ...p, cargo_id: v === NENHUM ? null : v, departamento_id: p.departamento_id || c?.departamento_id || null })); visitar('cargo_id'); setSujo(true); }}>
                                    <SelectTrigger id="ff-cargo_id" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Seleccionar</SelectItem>
                                        {cargos.filter(c => (c.activo || c.id === f.cargo_id) && (!f.departamento_id || !c.departamento_id || c.departamento_id === f.departamento_id)).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="vinculo" label="Vínculo" obrig erro={erro('vinculo')}>
                                <Select value={f.vinculo || NENHUM} onValueChange={v => { set('vinculo', v === NENHUM ? null : v); visitar('vinculo'); }}>
                                    <SelectTrigger id="ff-vinculo" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Seleccionar</SelectItem>{[...new Set([...RH_VINCULOS, ...(f.vinculo ? [f.vinculo] : [])])].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="carreira" label="Grupo / regime de carreira" obrig erro={erro('carreira')} dica="Lista no parâmetro «carreiras» das Configurações">
                                <Select value={f.carreira || NENHUM} onValueChange={v => { set('carreira', v === NENHUM ? null : v); visitar('carreira'); }}>
                                    <SelectTrigger id="ff-carreira" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Seleccionar</SelectItem>{carreiras.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="categoria" label="Categoria"><Input id="ff-categoria" className={inp} value={f.categoria || ''} placeholder="Ex.: Técnico Médio" onChange={e => set('categoria', e.target.value)} /></Campo>
                            <Campo id="escalao" label="Escalão / letra"><Input id="ff-escalao" className={inp} value={f.escalao || ''} maxLength={4} placeholder="A" onChange={e => set('escalao', e.target.value.toUpperCase())} /></Campo>
                            <Campo id="unidade_organica" label="Unidade orgânica">
                                <Input id="ff-unidade_organica" className={inp} value={f.unidade_organica || ''} placeholder={departamentos.find(d => d.id === f.departamento_id)?.nome || 'Ex.: Direcção Administrativa'} onChange={e => set('unidade_organica', e.target.value)} />
                            </Campo>
                            <Campo id="horario_id" label="Horário">
                                <Select value={f.horario_id || NENHUM} onValueChange={v => set('horario_id', v === NENHUM ? null : v)}>
                                    <SelectTrigger id="ff-horario_id" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value={NENHUM}>Horário normal</SelectItem>{horarios.filter(h => h.activo !== 0 && h.id !== 'horario-normal').map(h => <SelectItem key={h.id} value={h.id}>{h.nome}{h.entrada ? ` (${h.entrada}–${h.saida})` : ''}</SelectItem>)}</SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="chefe_id" label="Chefe directo" dica={(() => {
                                const s = chefeSugerido({ id: f.id || '', departamento_id: f.departamento_id || null, seccao_id: f.seccao_id }, { departamentos, seccoes });
                                const nome = s.id ? funcionarios.find(x => x.id === s.id)?.nome : null;
                                if (!f.chefe_id && nome) return `Sem escolha, responde a ${nome} (responsável ${s.origem === 'seccao' ? 'da secção' : 'do departamento'}).`;
                                return 'Recebe os pedidos e aprova férias, faltas e o ponto';
                            })()}>
                                <SearchableSelect className={inp} value={f.chefe_id || ''} placeholder="Seleccionar" searchPlaceholder="Pesquisar funcionário…"
                                    options={[{ value: '', label: 'Sem chefe directo' }, ...funcionarios.filter(x => x.estado === 'activo' && x.id !== f.id).map(x => ({ value: x.id, label: x.nome, subLabel: `N.º ${x.numero_mecanografico}` }))]}
                                    onValueChange={v => set('chefe_id', v || null)} />
                            </Campo>
                            <Campo id="portal" label="Portal do funcionário" className="sm:col-span-2">
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <Select value={portalModo} onValueChange={v => { setPortalModo(v as typeof portalModo); if (v === 'sem') set('utilizador_id', null); }}>
                                        <SelectTrigger id="ff-portal" className={cn(inp, 'sm:w-64')}><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="sem">Sem conta</SelectItem><SelectItem value="existente">Associar a utilizador existente</SelectItem></SelectContent>
                                    </Select>
                                    {portalModo === 'existente' && (
                                        <SearchableSelect className={cn(inp, 'flex-1')} value={f.utilizador_id || ''} placeholder="Escolher utilizador" searchPlaceholder="Pesquisar utilizador…"
                                            options={(users || []).map(u => ({ value: u.id, label: u.name, subLabel: u.username || u.email || undefined }))} onValueChange={v => set('utilizador_id', v || null)} />
                                    )}
                                </div>
                            </Campo>
                        </div>
                    ))}

                    {edicao ? seccao('contrato', 5, contratoActual ? (
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="grid flex-1 grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                                <div><div className="text-xs text-slate-500">Tipo</div><b>{contratoActual.tipo === 'indeterminado' ? 'Tempo indeterminado' : 'Termo certo'}</b></div>
                                <div><div className="text-xs text-slate-500">Início / fim</div><b>{dataCurta(contratoActual.inicio)} — {contratoActual.fim ? dataCurta(contratoActual.fim) : 'sem termo'}</b></div>
                                <div><div className="text-xs text-slate-500">Salário base</div><b>{kz(contratoActual.salario_base_minor)}</b></div>
                                <div><div className="text-xs text-slate-500">Horas / férias</div><b>{contratoActual.horas_semanais} h · {contratoActual.dias_ferias} dias</b></div>
                            </div>
                            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRenovar(true)}>Renovar / novo contrato</Button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                            Sem contrato activo. <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRenovar(true)}>Registar contrato</Button>
                        </div>
                    )) : seccao('contrato', 5, comContrato ? (
                        <div className={grelha}>
                            <Campo id="contrato_tipo" label="Tipo">
                                <Select value={contrato.tipo} onValueChange={v => setC({ tipo: v as Contrato['tipo'], fim: v === 'determinado' ? contrato.fim : '' })}>
                                    <SelectTrigger id="ff-contrato_tipo" className={inp}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="indeterminado">Tempo indeterminado</SelectItem><SelectItem value="determinado">Termo certo</SelectItem></SelectContent>
                                </Select>
                            </Campo>
                            <Campo id="contrato_inicio" label="Início" dica="Por defeito, a data de admissão">
                                <Input id="ff-contrato_inicio" type="date" className={inp} value={contrato.inicio} onChange={e => { setTocados(t => ({ ...t, inicio: true })); setC({ inicio: e.target.value }); }} />
                            </Campo>
                            <Campo id="contrato_fim" label="Fim (termo certo)" obrig={contrato.tipo === 'determinado'} erro={erro('contrato_fim')}>
                                <Input id="ff-contrato_fim" type="date" className={inp} min={contrato.inicio} value={contrato.fim} disabled={contrato.tipo !== 'determinado'} onBlur={() => visitar('contrato_fim')} onChange={e => setC({ fim: e.target.value })} />
                            </Campo>
                            <Campo id="contrato_experimental" label="Fim do período experimental" dica={`Sugerido: ${diasExperimental(contrato.tipo)} dias (configurável)`}>
                                <Input id="ff-contrato_experimental" type="date" className={inp} min={contrato.inicio} value={contrato.periodo_experiencia_fim} onChange={e => { setTocados(t => ({ ...t, experimental: true })); setC({ periodo_experiencia_fim: e.target.value }); }} />
                            </Campo>
                            <Campo id="salario" label={`Salário base${cargo?.salario_referencia_minor ? ` (ref. ${kz(cargo.salario_referencia_minor)})` : ''}`} obrig erro={erro('salario')}>
                                <div onBlur={() => visitar('salario')}><CurrencyInput id="ff-salario" className={inp} value={contrato.salario} onValueChange={v => setC({ salario: v })} /></div>
                            </Campo>
                            <Campo id="contrato_horas" label="Horas semanais"><Input id="ff-contrato_horas" type="number" min={1} max={60} className={inp} value={contrato.horas_semanais} onChange={e => setC({ horas_semanais: Number(e.target.value) })} /></Campo>
                            <Campo id="contrato_ferias" label="Dias de férias / ano"><Input id="ff-contrato_ferias" type="number" min={0} max={60} className={inp} value={contrato.dias_ferias} onChange={e => setC({ dias_ferias: Number(e.target.value) })} /></Campo>
                            <Campo id="contrato_assinado" label="Contrato assinado" dica={contratoAssinado ? `${contratoAssinado.name} · vai para Contratos` : 'PDF, JPG, PNG ou DOCX'}>
                                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500">
                                    <FileUp className="h-4 w-4" aria-hidden="true" /> {contratoAssinado ? 'Mudar ficheiro' : 'Escolher ficheiro'}
                                    <input id="ff-contrato_assinado" type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={e => { setContratoAssinado(e.target.files?.[0] || null); setSujo(true); }} />
                                </label>
                            </Campo>
                        </div>
                    ) : <p className="text-sm text-slate-500">O contrato pode ser registado depois, na ficha do funcionário.</p>,
                    <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><Switch checked={comContrato} onCheckedChange={v => { setComContrato(v); setSujo(true); }} /> Registar já o contrato</label>)}

                    {seccao('subsidios', 6, <>
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                            <SearchableSelect className={cn(inp, 'flex-1')} value={escolhaSubsidio} placeholder="Pesquisar e adicionar subsídio do catálogo…" searchPlaceholder="Pesquisar subsídio…"
                                emptyMessage="Nenhum subsídio disponível no catálogo."
                                options={catalogo.filter(r => r.periodicidade !== 'pontual' && !subsidios.some(s => s.rubrica_id === r.id)).map(r => ({ value: r.id, label: r.nome, subLabel: calculoRubrica(r) }))}
                                onValueChange={setEscolhaSubsidio} />
                            <Button type="button" variant="outline" className="h-10 rounded-xl" disabled={!escolhaSubsidio}
                                onClick={() => { const r = rubricas.find(x => x.id === escolhaSubsidio); setSubsidios(s => [...s, { chave: crypto.randomUUID(), rubrica_id: escolhaSubsidio, valor: (r?.valor_padrao_minor || 0) / 100 }]); setEscolhaSubsidio(''); setSujo(true); }}><Plus className="mr-1.5 h-4 w-4" /> Adicionar</Button>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    <tr><th className="px-4 py-2.5">Subsídio</th><th className="px-4 py-2.5">Cálculo</th><th className="px-4 py-2.5">Incidência</th><th className="px-4 py-2.5 text-right">Valor mensal</th><th className="w-12 px-2 py-2.5"><span className="sr-only">Remover</span></th></tr>
                                </thead>
                                <tbody>
                                    {subsidios.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Nenhum subsídio escolhido.</td></tr> : subsidios.map(s => {
                                        const r = rubricas.find(x => x.id === s.rubrica_id);
                                        return (
                                            <tr key={s.chave} className="border-t border-slate-100 dark:border-slate-800">
                                                <td className="px-4 py-3 font-semibold">{r?.nome || '—'}{s.existenteId && <span className="ml-2 text-[11px] font-normal text-slate-500">desde {dataCurta(s.inicio)}</span>}</td>
                                                <td className="px-4 py-3">{r?.forma === 'percentagem' && !r.por_dia ? calculoRubrica(r) : (
                                                    <span className="flex items-center gap-2">{r?.por_dia ? 'Por dia' : 'Valor fixo'} {!s.existenteId && <span className="w-36"><CurrencyInput className="h-8 rounded-lg text-sm" aria-label={`Valor de ${r?.nome}`} value={s.valor} onValueChange={v => { setSubsidios(l => l.map(x => x.chave === s.chave ? { ...x, valor: v } : x)); setSujo(true); }} /></span>}</span>
                                                )}</td>
                                                <td className="px-4 py-3">
                                                    {r && <span className="flex flex-wrap gap-1">
                                                        {r.incidencia_confirmada === 0 ? <span className="rounded-full bg-rh-warn-bg px-2 py-0.5 text-[11px] font-semibold text-rh-warn">Incidência a confirmar</span> : <>
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{r.incide_irt ? 'IRT' : 'Isento de IRT'}</span>
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{r.incide_inss ? 'INSS' : 'Sem INSS'}</span></>}
                                                    </span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">{salarioBase || r?.forma !== 'percentagem' ? <>{kz(valorMensal(s))}{r?.por_dia ? <div className="text-[10px] font-normal text-slate-500">≈ 30 dias</div> : null}</> : <span className="font-normal text-slate-400">indique o salário</span>}</td>
                                                <td className="px-2 py-3 text-center">
                                                    <button type="button" aria-label={`Remover ${r?.nome}`} title="Remover" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                                                        onClick={() => { if (s.existenteId) setRemovidos(l => [...l, s.existenteId!]); setSubsidios(l => l.filter(x => x.chave !== s.chave)); setSujo(true); }}><X className="h-4 w-4" /></button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-3 flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
                            <span className="text-slate-600 dark:text-slate-300">Os descontos (Segurança Social, IRT e faltas) são calculados no processamento do mês.</span>
                            <b className="tabular-nums">Total mensal de subsídios: {kz(totalSubsidios)}</b>
                        </div>
                    </>, <a href="#/rh/configuracoes?seccao=subsidios" target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-blue-700 hover:underline">Gerir catálogo →</a>)}

                    {seccao('documentos', 7, (
                        <div className={grelha}>
                            <div className="sm:col-span-2">
                                <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); juntarDocumentos(e.dataTransfer.files); }}
                                    className="rounded-xl border-2 border-dashed border-slate-300 p-5 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                                    Arraste o BI, certificados ou outros documentos, ou{' '}
                                    <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => ficheirosDocs.current?.click()}>escolha do computador</button>.
                                    <div className="mt-1 text-xs text-slate-500">Até {maxMb} MB cada. Vão para a pasta pessoal do funcionário.</div>
                                    <input ref={ficheirosDocs} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={e => { juntarDocumentos(e.target.files); e.target.value = ''; }} />
                                </div>
                                {documentos.length > 0 && (
                                    <ul className="mt-3 space-y-2">
                                        {documentos.map(d => (
                                            <li key={d.chave} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-sm sm:grid-cols-[1fr_170px_150px_auto] dark:border-slate-700">
                                                <span className="truncate font-semibold" title={d.ficheiro.name}>{d.ficheiro.name}</span>
                                                <Select value={d.categoria} onValueChange={v => setDocumentos(l => l.map(x => x.chave === d.chave ? { ...x, categoria: v as CategoriaDocumento } : x))}>
                                                    <SelectTrigger className="h-9 rounded-lg text-xs" aria-label={`Tipo de documento de ${d.ficheiro.name}`}><SelectValue /></SelectTrigger>
                                                    <SelectContent>{CATEGORIAS_DOCUMENTO.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Input type="date" className="h-9 rounded-lg text-xs" aria-label={`Validade de ${d.ficheiro.name}`} value={d.validade} onChange={e => setDocumentos(l => l.map(x => x.chave === d.chave ? { ...x, validade: e.target.value } : x))} />
                                                <button type="button" aria-label={`Retirar ${d.ficheiro.name}`} className="justify-self-end rounded p-1 text-slate-500 hover:text-red-600" onClick={() => setDocumentos(l => l.filter(x => x.chave !== d.chave))}><Trash2 className="h-4 w-4" /></button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <Campo id="observacoes" label="Observações" className="sm:col-span-2">
                                <Textarea id="ff-observacoes" rows={5} className="rounded-xl border-slate-200" value={f.observacoes || ''} onChange={e => set('observacoes', e.target.value)} />
                            </Campo>
                        </div>
                    ))}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    <div className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
                        <span className={cn('h-2 w-2 rounded-full', Object.keys(erros).length ? 'bg-amber-500' : 'bg-emerald-500')} />
                        {Object.keys(erros).length ? `${Object.keys(erros).length} campo(s) por completar ou corrigir` : 'Pronto a guardar'}{!edicao && sujo ? ' · rascunho guardado a cada 10 s' : ''}
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
                        <Button type="button" variant="outline" onClick={fechar} className="h-11 rounded-xl border-slate-200 px-6 font-semibold text-slate-700 hover:bg-slate-100">Cancelar</Button>
                        {!edicao && <Button type="button" variant="outline" disabled={aGuardar} onClick={() => void guardar(true)} className="h-11 rounded-xl border-slate-200 px-5 font-semibold">Guardar e adicionar outro</Button>}
                        <Button type="button" disabled={aGuardar} onClick={() => void guardar(false)} className="flex h-11 items-center gap-2 rounded-xl border-none bg-blue-600 px-8 font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700">
                            <CheckCircle2 className="h-4 w-4" /> {aGuardar ? 'A guardar…' : edicao ? 'Guardar alterações' : 'Guardar funcionário'}
                        </Button>
                    </div>
                </div>

                {renovar && funcionario && <DialogoContrato funcionarioId={funcionario.id} actual={contratoActual} actor={actor} onClose={() => setRenovar(false)} onSaved={onSaved} />}
            </DialogContent>
        </Dialog>
    );
}
