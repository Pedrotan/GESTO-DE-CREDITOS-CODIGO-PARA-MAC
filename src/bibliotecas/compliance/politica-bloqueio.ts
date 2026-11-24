// Política de controlo do crédito pelo Compliance (especificação, secções 7.2, 8.5, 12 e 14): que efeito tem cada
// situação do cliente na concessão, no desembolso e no reforço. Faz parte do modelo de risco (versionada).
//
// Modos: «desligado» (não mostra nem impede), «aviso» (mostra o resultado mas não impede: modo predefinido) e
// «bloqueio» (impede). O bloqueio só pode ser activado com a validação jurídica registada (referência, data e
// responsável), porque a especificação exige validação funcional, técnica e jurídica antes de activar bloqueios.

export type ModoBloqueio = 'desligado' | 'aviso' | 'bloqueio';
export type Efeito = 'permitir' | 'rever' | 'pendente' | 'bloquear';
export type CodigoControlo =
    | 'sancao_confirmada' | 'medida_bloqueio' | 'kyc_recusado' | 'autorizacao_recusada'
    | 'kyc_em_verificacao' | 'kyc_nao_verificado' | 'screening_possivel' | 'screening_erro' | 'screening_por_fazer'
    | 'documento_expirado' | 'pep' | 'risco_elevado' | 'avaliacao_por_rever' | 'sem_avaliacao' | 'investigacao_em_curso';

export type PoliticaBloqueio = {
    modo: ModoBloqueio;
    efeitos: Partial<Record<CodigoControlo, Efeito>>;
    /** Dias de validade das autorizações de Compliance por omissão. */
    autorizacaoDias: number;
    validacaoJuridica: { referencia: string; data: string; responsavel: string } | null;
};

export const ROTULO_MODO: Record<ModoBloqueio, string> = {
    desligado: 'Desligado (não avisa nem impede)', aviso: 'Só avisar (não impede)', bloqueio: 'Bloquear (impede a operação)',
};
export const ROTULO_EFEITO: Record<Efeito, string> = { permitir: 'Permitir', rever: 'Requer autorização de Compliance', pendente: 'Pendente (resolver primeiro)', bloquear: 'Bloquear' };

export const CONTROLOS: Record<CodigoControlo, { titulo: string; fixo?: Efeito; padrao: Efeito; opcoes?: Efeito[] }> = {
    sancao_confirmada: { titulo: 'Correspondência confirmada em lista de sanções', fixo: 'bloquear', padrao: 'bloquear' },
    medida_bloqueio: { titulo: 'Medida de bloqueio ou encerramento da relação decidida numa investigação', fixo: 'bloquear', padrao: 'bloquear' },
    kyc_recusado: { titulo: 'Verificação de identidade recusada', fixo: 'bloquear', padrao: 'bloquear' },
    autorizacao_recusada: { titulo: 'Compliance recusou a operação', fixo: 'bloquear', padrao: 'bloquear' },
    kyc_em_verificacao: { titulo: 'Verificação de identidade por decidir', padrao: 'pendente', opcoes: ['pendente', 'rever', 'permitir'] },
    kyc_nao_verificado: { titulo: 'Identidade ainda não verificada', padrao: 'rever', opcoes: ['bloquear', 'pendente', 'rever', 'permitir'] },
    screening_possivel: { titulo: 'Possível correspondência em lista por decidir', padrao: 'pendente', opcoes: ['bloquear', 'pendente', 'rever'] },
    screening_erro: { titulo: 'Screening com erro (lista indisponível)', padrao: 'pendente', opcoes: ['pendente', 'rever'] },
    screening_por_fazer: { titulo: 'Screening por fazer ou desactualizado', padrao: 'rever', opcoes: ['pendente', 'rever', 'permitir'] },
    documento_expirado: { titulo: 'Documento de identificação expirado', padrao: 'rever', opcoes: ['bloquear', 'pendente', 'rever', 'permitir'] },
    pep: { titulo: 'Pessoa politicamente exposta', padrao: 'rever', opcoes: ['pendente', 'rever'] },
    risco_elevado: { titulo: 'Risco de Compliance elevado', padrao: 'rever', opcoes: ['bloquear', 'pendente', 'rever', 'permitir'] },
    avaliacao_por_rever: { titulo: 'Avaliação de risco à espera de revisão', padrao: 'pendente', opcoes: ['pendente', 'rever', 'permitir'] },
    sem_avaliacao: { titulo: 'Cliente sem avaliação de risco', padrao: 'rever', opcoes: ['pendente', 'rever', 'permitir'] },
    investigacao_em_curso: { titulo: 'Investigação de Compliance em curso', padrao: 'rever', opcoes: ['bloquear', 'pendente', 'rever', 'permitir'] },
};

export const POLITICA_BLOQUEIO_INICIAL: PoliticaBloqueio = { modo: 'aviso', efeitos: {}, autorizacaoDias: 30, validacaoJuridica: null };

/** Efeito de um controlo na política (os fixos não se configuram). */
export function efeitoDe(p: PoliticaBloqueio, codigo: CodigoControlo): Efeito {
    const c = CONTROLOS[codigo];
    if (c.fixo) return c.fixo;
    const v = p.efeitos[codigo];
    return v && (c.opcoes || []).includes(v) ? v : c.padrao;
}

export function lerPoliticaBloqueio(v: Partial<PoliticaBloqueio> | null | undefined): PoliticaBloqueio {
    const b = POLITICA_BLOQUEIO_INICIAL;
    const x = v || {};
    return {
        modo: (['desligado', 'aviso', 'bloqueio'] as ModoBloqueio[]).includes(x.modo as ModoBloqueio) ? x.modo! : b.modo,
        efeitos: { ...(x.efeitos || {}) },
        autorizacaoDias: Number.isInteger(x.autorizacaoDias) && x.autorizacaoDias! > 0 ? x.autorizacaoDias! : b.autorizacaoDias,
        validacaoJuridica: x.validacaoJuridica && x.validacaoJuridica.referencia ? x.validacaoJuridica : null,
    };
}

export function validarPoliticaBloqueio(p: PoliticaBloqueio): string[] {
    const erros: string[] = [];
    if (!(Number.isInteger(p.autorizacaoDias) && p.autorizacaoDias >= 1 && p.autorizacaoDias <= 180)) erros.push('A validade das autorizações tem de ser de 1 a 180 dias.');
    if (p.modo === 'bloqueio') {
        const v = p.validacaoJuridica;
        if (!v || v.referencia.trim().length < 3 || !/^\d{4}-\d{2}-\d{2}$/u.test(v.data) || v.responsavel.trim().length < 3) {
            erros.push('Para activar o bloqueio registe a validação jurídica (referência do parecer, data e responsável).');
        }
    }
    for (const [codigo, efeito] of Object.entries(p.efeitos)) {
        const c = CONTROLOS[codigo as CodigoControlo];
        if (!c) erros.push(`Controlo desconhecido: ${codigo}.`);
        else if (!c.fixo && !(c.opcoes || []).includes(efeito as Efeito)) erros.push(`Efeito inválido para «${c.titulo}».`);
    }
    return erros;
}
