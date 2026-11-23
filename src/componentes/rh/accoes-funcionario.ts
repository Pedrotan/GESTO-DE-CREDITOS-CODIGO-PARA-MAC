// Acções sobre funcionários partilhadas pela lista, pela ficha e pelos relatórios: imprimir a ficha individual,
// emitir a declaração de serviço (numerada) e exportar a lista filtrada em Excel ou PDF.
import { ServicoRH, type ActorRH, type Cargo, type Contrato, type Departamento, type Funcionario } from '@/servicos/rh/ServicoRH';
import { gerarRelatorioPdf } from '@/bibliotecas/rh/pdf-rh';
import { gerarRelatorioPessoal } from './relatorios-pessoais';
import { exportToExcel } from '@/bibliotecas/ExcelHelper';
import { estadoBI, ROTULO_ESTADO_BI } from '@/bibliotecas/rh/bi-validade';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { antiguidade, dataPt, kz } from './comum-rh';

/** Guarda um PDF gerado pelo sistema na subpasta da pasta pessoal do funcionário (declarações, relatórios, férias e ausências). */
export async function arquivarPdf(funcionarioId: string, chave: 'declaracoes' | 'relatorios' | 'recibos' | 'ausencias', nome: string, ficheiro: { fileName: string; dataUrl: string }, origem: string, actor: ActorRH) {
    await ServicoRH.carregarDocumento({ funcionario_id: funcionarioId, categoria: 'outros', nome, ficheiro_nome: ficheiro.fileName, data_url: ficheiro.dataUrl,
        pasta_id: `sys:${chave}`, origem }, 20, actor);
}

export type ContextoRH = { cargos: Cargo[]; departamentos: Departamento[]; contratos: Contrato[] };
const nome = (lista: Array<{ id: string; nome: string }>, id: string | null | undefined) => lista.find(x => x.id === id)?.nome || '—';
const ESTADO: Record<string, string> = { activo: 'Activo', suspenso: 'Suspenso', cessado: 'Terminado' };
const contratoActivo = (ctx: ContextoRH, id: string) => ctx.contratos.find(c => c.funcionario_id === id && c.estado === 'activo');

/** Descarrega um PDF já gerado (data URL). */
export function descarregarPdf(pdf: { fileName: string; dataUrl: string }) {
    const a = document.createElement('a');
    a.href = pdf.dataUrl; a.download = pdf.fileName; a.click();
}

/** Ficha individual completa em PDF A4: descarrega e arquiva em Relatórios pessoais (sem permissão de gestão, fica só a descarga). */
export async function imprimirFicha(f: Funcionario, ctx: ContextoRH, settings: unknown, actor: ActorRH, salarios: boolean) {
    const r = await gerarRelatorioPessoal('ficha', f, ctx, settings, actor, salarios);
    descarregarPdf(r.pdf);
    await arquivarPdf(f.id, r.chave, r.nome, r.pdf, r.origem, actor).catch(() => undefined);
}

/** Declaração de serviço a partir do modelo activo: numerada, descarregada e arquivada em Declarações. */
export async function emitirDeclaracaoServico(f: Funcionario, ctx: ContextoRH, settings: unknown, actor: ActorRH, finalidade = '') {
    const r = await gerarRelatorioPessoal('declaracao', f, ctx, settings, actor, true, { finalidade });
    descarregarPdf(r.pdf);
    await arquivarPdf(f.id, r.chave, r.nome, r.pdf, r.origem, actor);
}

/** Exporta a lista (filtrada ou seleccionada) em Excel ou PDF. */
export function exportarFuncionarios(lista: Funcionario[], ctx: ContextoRH, formato: 'excel' | 'pdf', settings: unknown, actor: ActorRH, salarios: boolean, filtros = '') {
    const hoje = luandaTodayKey();
    const linhas = lista.map(f => ({
        'N.º': f.numero_mecanografico, Nome: f.nome, Cargo: nome(ctx.cargos, f.cargo_id), Departamento: nome(ctx.departamentos, f.departamento_id), Vínculo: f.vinculo || '',
        Admissão: dataPt(f.data_admissao), Antiguidade: antiguidade(f.data_admissao, f.data_saida || hoje),
        ...(salarios ? { 'Salário base (Kz)': (contratoActivo(ctx, f.id)?.salario_base_minor || 0) / 100 } : {}),
        BI: f.bi_numero || '', 'Situação do BI': ROTULO_ESTADO_BI[estadoBI(f.bi_validade, hoje, 90).estado], Telefone: f.telefone || '', Email: f.email || '', Estado: ESTADO[f.estado] || f.estado,
    }));
    if (formato === 'excel') { exportToExcel(linhas, `funcionarios-${hoje}`); return; }
    const colunas = Object.keys(linhas[0] || { 'N.º': '', Nome: '' });
    gerarRelatorioPdf({
        titulo: 'Lista de funcionários', subtitulo: `${lista.length} funcionário(s) · ${dataPt(hoje)}`,
        colunas: colunas.map(c => ({ titulo: c, tipo: c.startsWith('Salário') ? 'numero' as const : 'texto' as const })),
        linhas: linhas.map(l => colunas.map(c => (l as Record<string, string | number>)[c] ?? '')),
    }, filtros, settings, actor.name);
}
