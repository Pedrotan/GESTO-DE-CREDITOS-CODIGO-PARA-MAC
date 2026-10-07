import { SeccaoCabecalho } from './comum';

const TOPICS: Array<{ title: string; body: string[] }> = [
    {
        title: 'Partidas dobradas e fonte única de verdade',
        body: [
            'Cada operação gera um lançamento com linhas a débito e a crédito de igual valor. Todos os livros, cartões e auditorias são calculados a partir destas linhas (o razão).',
            'Um pagamento é repartido: Caixa/Bancos a débito pelo total; Carteira de Crédito a crédito pelo capital; Receita de Juros e Receita de Juros de Mora a crédito pelos juros. Assim a carteira só diminui pelo capital efectivamente amortizado.',
        ],
    },
    {
        title: 'Capital inicial e saldo disponível',
        body: [
            'Antes do primeiro crédito, registe a realização do capital social (Novo lançamento › Entrada de capital). O desembolso sai de Caixa (cliente que recebe em mão) ou de Bancos (transferência).',
            'Com o controlo de saldo activo (Regras de Controlo), um desembolso ou despesa superior às disponibilidades é recusado sem gravar nada.',
        ],
    },
    {
        title: 'Cadeia de integridade e selo HMAC',
        body: [
            'Cada lançamento guarda o hash SHA-256 do anterior: apagar, inserir ou alterar um lançamento quebra a cadeia.',
            'No aplicativo desktop, cada lançamento é ainda selado com HMAC-SHA256 por uma chave guardada fora da base de dados. Quem alterar a base de dados por fora e recalcular a cadeia continua a ser detectado. A versão web não tem esta chave e mostra o selo como indisponível.',
            'A trilha de utilizadores também é encadeada: um registo alterado aparece como "Alterado".',
        ],
    },
    {
        title: 'Auditorias',
        body: [
            'A Auditoria Completa executa todas as regras; os outros botões executam um grupo (integridade, conciliação de saldos, caixa e desembolsos, pagamentos, contratos e utilizadores). Cada execução fica no Histórico.',
            'Fuga monetária: os pagamentos confirmados têm de corresponder às entradas em Caixa/Bancos e o capital concedido às saídas. Divergência no saldo contratual calculado: o saldo de cada crédito (capital do plano − capital pago) tem de coincidir com o gravado e com a carteira no razão.',
            'Pagamentos registados ao fim-de-semana, em feriados nacionais de Angola ou fora do horário são assinalados e podem ser justificados por um administrador com motivo.',
        ],
    },
    {
        title: 'Estornos, abates e segregação de funções',
        body: [
            'Nenhum lançamento é editado ou apagado. Correcções fazem-se por estorno (lançamento inverso) pedido no Diário e aprovado por outro administrador.',
            'Créditos incobráveis podem ser abatidos ao activo com aprovação de outro administrador: usam primeiro as provisões contabilizadas e o restante é perda. A dívida continua em cobrança e o que for recebido é proveito de recuperação.',
        ],
    },
    {
        title: 'Fecho de período e botão de pânico',
        body: [
            'O fecho diário executa a auditoria completa e guarda a fotografia do razão (último lançamento, hash, totais). O fecho mensal bloqueia novos lançamentos nesse mês; só um administrador o reabre, com justificação.',
            'O botão de pânico congela toda a movimentação financeira em todos os dispositivos (pagamentos, desembolsos, estornos, lançamentos). Exige motivo e palavra-passe e só outro administrador pode desbloquear. Enquanto durar, aparece uma faixa vermelha em todas as páginas.',
        ],
    },
];

export function GuiaContabil() {
    return (
        <div>
            <SeccaoCabecalho title="Guia da contabilidade" description="Como funcionam o razão, os controlos e a auditoria desta página." />
            <div className="grid gap-4 md:grid-cols-2">
                {TOPICS.map(topic => (
                    <div key={topic.title} className="rounded-xl border bg-card p-5">
                        <p className="mb-2 font-bold">{topic.title}</p>
                        <div className="space-y-2 text-sm text-muted-foreground">{topic.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
                    </div>
                ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Os relatórios desta página são documentos internos de gestão. As demonstrações financeiras oficiais devem ser validadas pelo contabilista certificado da empresa.</p>
        </div>
    );
}
