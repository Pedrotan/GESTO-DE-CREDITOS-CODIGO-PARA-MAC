import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Button } from '@/componentes/ui/button';
import { ScrollArea } from '@/componentes/ui/scroll-area';
import { Download, BookOpen, ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { generateGenericReportPDF } from '@/bibliotecas/pdf';
import { useToast } from '@/ganchos/usar-toast';

export default function Guide() {
    const { user } = useAuth();
    const { companySettings } = useData();
    const { toast } = useToast();
    const isSuperAdmin = user?.role === 'super_admin';

    const generatePDF = (title: string, content: string[]) => {
        generateGenericReportPDF(title, content, companySettings, user?.name);
        toast({
            title: "Download Iniciado",
            description: `O arquivo ${title}.pdf foi gerado com sucesso.`
        });
    };

    const manualContent = [
        "# Manual Operacional Detalhado - Tango Gestão de Créditos v3.0.0",
        "Este guia serve como referência principal para todos os operadores e gestores do sistema.",
        "",
        "## 1. Gestão de Fluxo de Caixa e Dashboard",
        "- Visão Consolidada: O Dashboard principal oferece uma visão em tempo real de 'Entradas' (Pagamentos Confirmados) vs 'Saídas' (Créditos Libertados).",
        "- Ticket Médio: O sistema calcula automaticamente o valor médio por contrato para análise de perfil de empréstimo.",
        "- Ranking de Clientes: Monitorize visualmente o ranking de devedores e o nível de risco associado.",
        "- Gráficos de Receita: Acompanhe a evolução mensal para prever necessidades de liquidez.",
        "",
        "## 2. Aprovações e Limites Críticos",
        "- Níveis de Alerta: Transações que excedem o teto operacional do cargo são bloqueadas e enviadas para a fila de 'Aprovações'.",
        "- Regras de Negócio: Defina limites diários e mensais na página de 'Limites de Transação' para mitigar riscos de liquidez.",
        "- Contratos: Só são gerados automaticamente após a aprovação formal de um administrador.",
        "- Fluxo de Status: Um crédito passa por 'Pendente' -> 'Aprovado/Rejeitado' -> 'Ativo' (após entrega do capital).",
        "- Protocolo de Atualização de Limites: Para atualizar qualquer valor (Diário, Mensal ou Operação), é obrigatório desativar a função, guardar o estado desativado, e só então reativar com as novas definições para que o sistema aceite a gravação.",
        "",
        "## 3. Relatórios e Auditoria",
        "- Relatórios Analíticos: Exportação de dados consolidados com filtragem por período de até 12 meses.",
        "- Logs de Atividade: Cada clique e alteração é registada. Pode filtrar logs por utilizador para auditoria interna precisa.",
        "- Formatos: Todos os relatórios seguem o padrão visual A4 com títulos em negrito (tamanho 28) para fácil leitura física.",
        "- Exportação de Fichas: A ficha do cliente inclui todo o histórico financeiro e documentos anexados.",
        "",
        "## 4. Comunicação e Chat",
        "- Chat Interno: Comunicação direta entre staff com notificações exclusivas via ícone de mensagens no cabeçalho.",
        "- Integração WhatsApp: Envio de lembretes e comprovativos para clientes via API direta Wa.me.",
        "- Verificação de Número: Antes de cadastrar, utilize o botão 'Testar no Navegador' para validar a conta do cliente.",
        "",
        "## 5. Configurações de Penalização (Mora)",
        "- Ativação Individual: Defina taxas de juro de mora personalizadas por cliente.",
        "- Cálculo Diário: O sistema aplica mora sobre o saldo em atraso automaticamente nos relatórios de cobrança.",
        "- Tolerância: Configure dias de carência antes do primeiro cálculo de penalização.",
        "",
        "## 6. Relatórios Fiscais (SAF-T e Facturas Electrónicas)",
        "- Acesso Restrito: Disponível apenas para Super Administradores e Administradores.",
        "- SAF-T (AO): Ficheiro XML padronizado contendo todos os dados fiscais e contabilísticos da empresa para auditoria pela AGT.",
        "- Conteúdo SAF-T: Inclui cabeçalho com dados da empresa, clientes, produtos/serviços, regimes de IVA, movimentos contabilísticos e documentos comerciais.",
        "- Períodos: Pode gerar SAF-T anual, mensal ou trimestral conforme necessidade.",
        "- Factura Electrónica: Documento fiscal digital obrigatório desde 1 de Janeiro de 2026, emitido através do sistema certificado.",
        "- Validação: Antes de submeter à AGT, valide sempre os ficheiros em https://saft.ao para evitar rejeições.",
        "- Segurança: Cada factura electrónica inclui hash de segurança e QR Code para autenticação e combate à fraude.",
        "- Numeração: O sistema garante numeração sequencial obrigatória das facturas conforme legislação angolana.",
        "",
        "## 7. Hub de Cobrança e Histórico de Contacto",
        "- Gestão Centralizada: O Hub permite filtrar clientes com pagamentos em atraso e enviar mensagens em massa.",
        "- Modelos Dinâmicos: Utilize templates pré-configurados que preenchem automaticamente o nome do cliente e valor em dívida.",
        "- Registo de Contacto: O sistema grava automaticamente a data e hora do último contacto realizado.",
        "- Evitar Duplicidade: Se um cliente já foi contactado no dia atual, aparecerá um aviso em laranja '(Hoje)' no Hub.",
        "",
        "## 8. Indicadores de Estado (Cabeçalho)",
        "- Internet: Ícone de Wi-Fi verde/vermelho indica a conectividade externa.",
        "- Sincronização Local (Rede):",
        "  - Ícone de Servidor (Azul): Esta máquina é a central e gere as comunicações da rede local.",
        "  - Ícone de Nuvem (Laranja): Modo Cliente, a sincronizar dados com o servidor central.",
        "  - Ícone de Nuvem Cortada (Cinzento): Modo Local independente (Standalone).",
        "",
        "## 9. Assinaturas Digitais e Manutenção",
        "- Signatários Autorizados: Em Configurações > Assinaturas, defina quem pode assinar documentos digitalmente.",
        "- Modo de Manutenção: Permite bloquear o acesso ao sistema para manutenção, podendo definir 'Módulos Exceção' que continuam operacionais para utilizadores autorizados.",
        "",
        "## 10. Auditoria Financeira Preventiva (Deep Scan)",
        "- Funcionamento: O módulo de Auditoria executa uma varredura profunda em tempo real, comparando lançamentos contabilísticos com o saldo real dos contratos.",
        "- Deteção de Fugas: O sistema identifica se houve saída de capital sem o correspondente lançamento no Livro Diário, gerando alertas de 'Fuga Monetária'.",
        "- Integridade Blockchain: Cada registro possui um hash único vinculado ao registro anterior. Se houver manipulação externa da base de dados, a auditoria detectará a quebra da corrente.",
        "- Protocolo de Pânico: Em caso de detecção de irregularidades críticas, o botão 'Congelar Movimentação' pode ser usado para travar síncronamente todas as operações financeiras do sistema.",
        "",
        "## 11. Rendimento e Taxa de Esforço",
        "- Cadastro de Rendimento: Ao registar ou editar um cliente, indique o 'Rendimento Mensal' (líquido). É a base da taxa de esforço e da análise de risco.",
        "- Preenchimento Automático: No Simulador, ao seleccionar um cliente registado, o sistema carrega o rendimento, os créditos activos e as prestações em curso (outros encargos).",
        "- Taxa de Esforço: (nova prestação + outros encargos mensais com créditos) ÷ rendimento mensal líquido. Verde abaixo de 30%, amarelo até ao limite da empresa (por omissão 33%) e vermelho acima.",
        "",
        "## 12. Simulador de Crédito (padrão dos bancos angolanos)",
        "- Produtos: Crédito Pessoal, Salário, Consumo, Microcrédito e Empresa, com limites, TAN, comissões e sistema configuráveis em Configurações › Produtos de Crédito.",
        "- Custos: TAN (e taxa mensal TAN ÷ 12), TAEG pela TIR dos fluxos reais, MTIC, comissão de abertura e de processamento, seguro e Imposto do Selo (utilização e juros).",
        "- Risco: calculado pela taxa de esforço, histórico de pagamentos, créditos activos e garantias; ajusta a TAN e pode ser alterado com justificação registada na auditoria.",
        "- Ficha de Simulação (PDF): número único, código de verificação e QR code, plano completo, incumprimento, validade, assinaturas e página de termos e legislação.",
        "- Histórico: filtros por período, cliente e estado (simulada, convertida em pedido, expirada); reabrir, duplicar e converter em pedido de crédito para Aprovações.",
        "",
        "## 10. Segurança e Recuperação de 2FA",
        "- Perda de Dispositivo: Caso um utilizador perca o acesso ao seu aplicativo autenticador, deve contactar um Super Administrador.",
        "- Desativação por Admin: No menu 'Utilizadores', o Super Admin pode utilizar o ícone de escudo azul (ShieldX) para desativar manualmente a proteção 2FA do colaborador, permitindo o acesso imediato via senha.",
        "- Reativação: Após recuperar o acesso, o utilizador deve reconfigurar o 2FA no seu perfil para manter a conta segura.",
        "",
        "## 11. Cadastro Otimizado (Angola-API)",
        "- Validação de BI: Ao cadastrar um novo cliente, utilize o botão de lupa (Pesquisa) ao lado do campo NIF/BI.",
        "- Auto-preenchimento: O sistema consultará a base de dados nacional e preencherá automaticamente o nome completo, reduzindo erros de dactilografia e agilizando o atendimento.",
        "- Requisito: Esta funcionalidade requer uma ligação ativa à internet no terminal."
    ];

    const techContent = [
        "# Documentação Arquitetural e Técnica",
        "Informação vital para manutenção e escalonamento da infraestrutura.",
        "",
        "## 1. Fórmulas Financeiras de Núcleo",
        "O sistema utiliza o método de Juro Simples para transparência e facilidade de auditoria:",
        "- Cálculo Base: `Total = Principal * (1 + (Taxa / 100))`",
        "- Prestação Mensal: `Valor = Total / Prestações`",
        "- Cálculo de Mora Diário: `Mora_Dia = (Saldo_Atraso * Taxa_Mora) / 100` / 30 (ajustado ao período)",
        "- Amortização: Os pagamentos primeiro abatem Juros de Mora, depois Juros Correntes e por fim o Capital Principal.",
        "",
        "## 2. Persistência de Dados (SQLite Adapter)",
        "- Motor: SQLite3 integrado via `sql.js` para operações locais ultra-rápidas.",
        "- Storage: Os dados são persistidos no sistema de ficheiros ou IndexedDB, garantindo soberania total da informação.",
        "- Migrações: Suporte para adição dinâmica de colunas (ALTER TABLE com blocos try-catch para retrocompatibilidade).",
        "- Integridade: Utilização de `FOREIGN KEY` com `ON DELETE CASCADE` para manter dados relacionados consistentes.",
        "",
        "## 3. Máscaras Monetárias (cents-to-decimal)",
        "- Componente: `CurrencyInput.tsx` utiliza `Intl.NumberFormat` com locale `pt-AO`.",
        "- Máscara: Multiplicador/Divisor de 100 para evitar erros de floating point típicos de Javascript.",
        "- Suffix: Formatação fixa de 'AOA' integrada no componente visual.",
        "",
        "## 4. Localização e Timezones",
        "- Standard: Todas as datas são forçadas para `Africa/Luanda` via `Intl API`.",
        "- Formatos: Utilização de `dd/MM/yyyy` conforme o padrão angolano.",
        "- Sincronização: O timestamp ISO é usado internamente para garantir ordenação correta nos logs.",
        "",
        "## 5. UI & Design System",
        "- Componentes: Baseado em Radix UI e Shadcn/UI para acessibilidade.",
        "- Estética: Glassmorphism suave com `backdrop-blur` e gradientes controlados.",
        "- Responsividade: Layout adaptável para terminais de balcão e dispositivos tablet.",
        "- Feedback: Notificações contextuais via Sonner e modais de alerta personalizados.",
        "",
        "## 6. Alçadas (Limites de Transação)",
        "- Modelo: cada perfil tem limites por tipo de operação (aprovação, desembolso, numerário, anulação, perdão, estorno, abate, exportação), por operação, diários e mensais. Sem limite definido, a operação fica bloqueada.",
        "- Cadeia: Gestor → Administrador → Diretor → dupla aprovação acima do nível máximo; o risco Alto do cliente e a taxa de esforço podem exigir um nível acima. Pedidos sem decisão sobem sozinhos ao nível seguinte.",
        "- Contagem: dia civil e mês civil na hora de Angola. O consumo fica em `limit_ledger` e é verificado por guardas SQL (`limit_locks`) dentro da transacção da operação; o processo principal do Electron volta a verificar a alçada.",
        "- Governação: versões imutáveis em `limit_policy_versions`, com motivo, data de entrada em vigor e segundo administrador para aumentos grandes ou desativações; exceções temporárias em `limit_exceptions`. Tudo fica na Auditoria com gravidade Alta.",
        "",
        "## 7. Geração de Ficheiros Fiscais (SAF-T e E-Invoice)",
        "- Módulo: `saftGenerator.ts` e `eInvoiceGenerator.ts` localizados em `/src/lib/`.",
        "- Estrutura SAF-T: XML conforme norma OECD StandardAuditFile-Tax:AO_1.01_01.",
        "- Componentes SAF-T: Header (dados empresa), MasterFiles (clientes, impostos), SourceDocuments (facturas, pagamentos).",
        "- Algoritmo Hash: Implementado hash simples de 40 caracteres para validação de integridade das facturas electrónicas.",
        "- QR Code: Gerado automaticamente com formato: `InvoiceNo*NIF*Date*Total*Hash` para validação rápida pela AGT.",
        "- Conformidade IVA: Serviços financeiros marcados como isentos (código ISE) com taxa 0% conforme legislação.",
        "- Escape XML: Todas as strings passam por `escapeXML()` para prevenir erros de parsing e injeção de código.",
        "- Download: Utiliza Blob API para gerar ficheiros XML localmente sem necessidade de servidor externo.",
        "- Validação Pré-Submissão: Recomendado uso de validadores externos (SAFT.AO) antes de envio oficial à AGT.",
        "",
        "## 8. Arquitetura de Sincronização Local (Hybrid Sync)",
        "- Fluxo de Dados: Implementado via IPC (Inter-Process Communication) com Electron.",
        "- Server Mode: Instancia um servidor Express local que aceita pedidos de sincronização via `syncPasskey`.",
        "- Client Mode: Realiza pedidos de `upsert` síncronos ao servidor. A URL de sincronização deve apontar para o IP da máquina servidora.",
        "- Sync API Key: Encriptada em repouso. Opcional para comunicações em rede local fidedigna, mas recomendada.",
        "- Estado de UI: Acompanhamento em tempo real no `Header.tsx` via `ContextoDados.serverInfo` e `connectedClients`.",
        "",
        "## 9. Persistência de Histórico de Contacto",
        "- Modificação de Schema: Inclusão da coluna `lastContacted` do tipo `TEXT` (ISO Date String) na tabela `clients`.",
        "- Ciclo de Vida: No disparo do `openWhatsApp`, o sistema invoca `updateClient` para persistir o timestamp atual.",
        "- Lógica Visual: Comparação de `toDateString()` no frontend para disparar alertas de duplicidade (Hoje).",
        "",
        "## 10. Configurações Avançadas e Módulos Exceção",
        "- Authorized Signers: Os IDs de utilizadores autorizados são guardados como JSON stringificado na tabela `company_settings`.",
        "- Bypass de Manutenção: O campo `allowedModulesDuringMaintenance` permite que rotas específicas (ex: 'creditos', 'pagamentos') permaneçam acessíveis mesmo com o sinalizador global de manutenção ativo.",
        "",
        "## 11. Implementação TOTP (RFC 6238)",
        "- Algoritmo: Utilização de HMAC-SHA1 com segredo Base32 de 160 bits (32 caracteres).",
        "- Validação: Janela de tempo de 30 segundos com suporte a drift de +/- 1 ciclo (total 90s) para compensar dessincronização de relógios.",
        "- Persistência: O segredo é encriptado em repouso na coluna `twoFactorSecret` da tabela `users`.",
        "- Confiança de Sessão (Bypass): Uma vez validado o 2FA, a recuperação de sessão por inatividade exige apenas a palavra-passe, pois a identidade já foi confirmada para aquele ciclo de vida do navegador.",
        "- Segurança de Brute-Force: O contador `failedAttempts` é incrementado a cada falha. O bloqueio `status = 'blocked'` é aplicado diretamente na base de dados SQLite via `ContextoAutenticacao`.",
        "",
        "## 10. Segurança Avançada (Autenticação 2FA)",
        "- Ativação: No Perfil do Utilizador, pode ativar a proteção por código de 6 dígitos.",
        "- Aplicativos Compatíveis: Utilize o Google Authenticator, Microsoft Authenticator ou Authy.",
        "- Funcionamento Offline: O sistema de códigos NÃO precisa de internet no telemóvel nem no computador para validar o acesso.",
        "- Bloqueio de Segurança: Após 3 tentativas de login falhadas (senha ou 2FA), a conta é bloqueada automaticamente. Um Super Administrador deve desbloquear o utilizador manualmente no menu 'Utilizadores'.",
        "- Recuperação de Sessão: Se a sua sessão expirar, o sistema pedirá apenas a palavra-passe para voltar, pois o 2FA já foi validado no início do acesso atual.",
        "- Protocolo de Recuperação Admin: Implementada a função `disable2FA` para Super Admins em `Utilizadores.tsx`. Esta função apaga as chaves `twoFactorEnabled` e `twoFactorSecret` do registo do utilizador no SQLite.",
        "- Resgate em Caso de Emergência (Lifeline): Se o próprio Super Administrador perder o dispositivo, poderá usar a 'Chave de Resgate' (Master Key) no ecrã de 'Esqueci-me da senha'. Esta ação força a desativação do 2FA do Super Admin e redefine a sua senha para o padrão: Admin@123.",
        "",
        "## 11. Integração Angola-API (REST)",
        "- Endpoints: Utilização do serviço `ServicoAngolaAPI.ts` para chamadas assíncronas ao gateway `angolaapi.herokuapp.com`.",
        "- Payload: Consulta via `GET /validate/bi/[BI]`. Resposta em JSON com mapeamento para o campo `name` do formulário de clientes.",
        "- Tratamento de Erros: Implementado fallback e notificações (toast) para quando a API está offline ou o documento é inexistente.",
        "",
        "## 12. Segurança de Base de Dados (Multiple Ciphers)",
        "- Encriptação: Utilização de `better-sqlite3-multiple-ciphers` para proteção em repouso dos dados financeiros.",
        "- Derivação de Chave (KDF): A chave de encriptação é gerada dinamicamente com base em identificadores únicos de hardware da máquina servidora, impedindo que a base de dados seja lida em computadores não autorizados.",
        "- Performance: O worker thread da base de dados utiliza pragmas de alta performance (`WAL mode`, `synchronous = NORMAL`) para garantir escrita segura sem lentidão na UI.",
        "- Isolamento: O acesso ao SQLite é feito exclusivamente via IPC, protegendo o núcleo de ataques via frontend."
    ];

    return (
        <MainLayout title="Guia do Sistema" subtitle="Manuais e Documentação Técnica">
            <div className="w-full">
                <Tabs defaultValue="manual" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-8">
                        <TabsTrigger value="manual" className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4" />
                            Manual do Utilizador
                        </TabsTrigger>
                        <TabsTrigger value="tech" className="flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4" />
                            Documentação Técnica
                        </TabsTrigger>
                    </TabsList>

                    {/* User Manual Tab */}
                    <TabsContent value="manual">
                        <Card className="card-elevated border-none shadow-xl">
                            <CardHeader className="flex flex-row items-center justify-between border-b pb-6">
                                <div>
                                    <CardTitle className="text-2xl font-bold text-primary">Manual de Operação</CardTitle>
                                    <CardDescription>Instruções detalhadas para o máximo proveito do sistema.</CardDescription>
                                </div>
                                <Button onClick={() => generatePDF("Manual do Utilizador", manualContent)} variant="outline" className="gap-2 font-semibold">
                                    <Download className="h-4 w-4" />
                                    Baixar Manual PDF
                                </Button>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <ScrollArea className="h-[600px] w-full rounded-md p-6 bg-slate-50/50">
                                    <article className="prose prose-slate max-w-none">
                                        {manualContent.map((line, i) => {
                                            if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-bold mb-6 text-primary border-b-2 border-primary/20 pb-2">{line.replace('# ', '')}</h1>
                                            if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold mt-8 mb-4 text-foreground flex items-center gap-2">
                                                <CheckCircle2 className="h-5 w-5 text-success" />
                                                {line.replace('## ', '')}
                                            </h2>
                                            if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-semibold mt-6 mb-2 text-indigo-700">{line.replace('### ', '')}</h3>
                                            if (line.trim() === '') return <div key={i} className="h-4" />
                                            if (line.startsWith('- ')) return <li key={i} className="ml-6 py-1 text-muted-foreground list-disc">{line.replace('- ', '')}</li>
                                            if (line.match(/^\d\./)) return <div key={i} className="font-bold text-slate-800 mt-4 mb-2">{line}</div>
                                            return <p key={i} className="mb-3 text-muted-foreground leading-relaxed antialiased">{line}</p>
                                        })}
                                    </article>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Technical Docs Tab */}
                    <TabsContent value="tech">
                        <Card className="card-elevated border-indigo-100 bg-indigo-50/5">
                            <CardHeader className="flex flex-row items-center justify-between border-b border-indigo-100 pb-6">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-indigo-700 text-2xl font-bold">
                                        <Lock className="h-6 w-6" />
                                        Documentação Técnica
                                    </CardTitle>
                                    <CardDescription>Arquitetura, fórmulas e segurança. (Acesso Restrito)</CardDescription>
                                </div>
                                {isSuperAdmin && (
                                    <Button onClick={() => generatePDF("Documentacao Tecnica", techContent)} variant="outline" className="gap-2 border-indigo-200 hover:bg-indigo-50 text-indigo-700 font-semibold">
                                        <Download className="h-4 w-4" />
                                        Baixar Docs Tech
                                    </Button>
                                )}
                            </CardHeader>
                            <CardContent className="pt-6">
                                {isSuperAdmin ? (
                                    <ScrollArea className="h-[600px] w-full rounded-md border border-indigo-100 p-6 bg-white">
                                        <article className="prose prose-indigo max-w-none font-mono text-sm leading-relaxed">
                                            {techContent.map((line, i) => {
                                                if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold mb-6 text-indigo-900 border-b-2 border-indigo-200 pb-2">{line.replace('# ', '')}</h1>
                                                if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-8 mb-4 text-indigo-800 bg-indigo-100/50 p-2 rounded">{line.replace('## ', '')}</h2>
                                                if (line.startsWith('### ')) return <h3 key={i} className="text-md font-bold mt-6 mb-2 text-indigo-700">{line.replace('### ', '')}</h3>
                                                if (line.trim() === '') return <div key={i} className="h-2" />
                                                return <p key={i} className="mb-2 text-slate-600">{line}</p>
                                            })}
                                        </article>
                                    </ScrollArea>
                                ) : (
                                    <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-muted/20 rounded-lg border-2 border-dashed border-indigo-200">
                                        <Lock className="h-16 w-16 text-indigo-300 mb-4" />
                                        <h3 className="text-2xl font-bold text-slate-800">Acesso Restrito</h3>
                                        <p className="text-muted-foreground max-w-sm mt-3 text-lg leading-relaxed">
                                            Esta documentação contém detalhes sensíveis sobre a infraestrutura do sistema. Por favor, solicite privilégios de Super Administrador para visualizar.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </MainLayout>
    );
}




