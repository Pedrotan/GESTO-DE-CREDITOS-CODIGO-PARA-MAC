Guia de Alta Performance e Escalabilidade: Electron + SQLite
Este documento reúne a arquitetura ideal e as diretrizes técnicas para garantir que a aplicação mude de patamar, alcançando inicialização instantânea, consultas ultra-rápidas ao banco de dados e navegação interna fluida, sem congelamentos de interface.

🛠️ 1. Arquitetura do Sistema e Comunicação Segura
Para manter o aplicativo rápido e escalável, o processo de renderização (Front-end) deve focar exclusivamente na interface, comunicando-se com o processo principal de forma restrita e assíncrona.

🔹 IPC Limpo e Seguro (preload.js)
Bloqueie o acesso direto ao Node.js no front-end. Exponha apenas funções de canal controladas por uma lista branca (whitelist).

JavaScript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

const CANAIS_PERMITIDOS = [
  'db:buscar-registros',
  'db:salvar-registro',
  'db:executar-relatorio'
];

contextBridge.exposeInMainWorld('tangoAPI', {
  enviarMensagem: (canal, dados) => {
    if (CANAIS_PERMITIDOS.includes(canal)) {
      return ipcRenderer.invoke(canal, dados);
    }
    return Promise.reject(new Error(`Canal IPC não autorizado: ${canal}`));
  }
});
⚡ 2. Otimização Máxima do SQLite
O SQLite por padrão é configurado para máxima segurança contra falhas de hardware, o que o torna lento em operações de escrita contínua. Ajustar os PRAGMAs muda drasticamente este cenário.

🔹 Configuração de Inicialização (Engine Recomendada: better-sqlite3)
JavaScript
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'seu-banco.db'));

// Ativa o modo WAL: leituras e escritas acontecem simultaneamente sem travar
db.pragma('journal_mode = WAL');

// Sincronização normal: reduz gargalos de escrita mantendo excelente consistência
db.pragma('synchronous = NORMAL');

// Aloca ~64MB de memória RAM para cache de páginas consultadas com frequência
db.pragma('cache_size = -64000');
🔹 Indexação Estratégica (INDEX)
Tabelas com milhares de registos precisam de índices nas colunas usadas em filtros (WHERE) e ordenações (ORDER BY).

SQL
-- Exemplo: Otimizando a busca e histórico de vendas por cliente
CREATE INDEX IF NOT EXISTS idx_vendas_cliente_data 
ON vendas (cliente_id, data_venda);
🔹 Transações para Operações em Massa
Nunca execute múltiplos INSERT ou UPDATE isolados dentro de um loop tradicional. Agrupe-os em uma única transação de disco.

JavaScript
const inserirProduto = db.prepare('INSERT INTO produtos (nome, preco) VALUES (?, ?)');

// Transação nativa e otimizada
const cargaEmMassa = db.transaction((listaProdutos) => {
  for (const prod of listaProdutos) {
    inserirProduto.run(prod.nome, prod.preco);
  }
});

// Executa milhares de inserções abrindo o arquivo de disco apenas uma vez
cargaEmMassa(listaDeNovosProdutos);
🚀 3. Navegação Interna Instantânea (Renderer Process)
Como a interface roda em cima do Chromium, aplicar boas práticas de desenvolvimento web é vital para manter os 60 FPS estáveis.

🔹 Estratégia de Interface
Roteamento em SPA: Utilize apenas Single Page Applications (React, Vue ou Angular). A troca de ecrãs deve ser lógica e instantânea, evitando recarregar as páginas do Chromium do zero.

Virtualização de Listas Longas: Se for exibir históricos de faturamento, logs ou clientes, utilize bibliotecas de Windowing (ex: react-window ou vue-virtual-scroller).

Nota: Renderize no HTML apenas os elementos atualmente visíveis no ecrã. Renderizar mais de 500 elementos complexos de uma vez destrói a performance de scroll do navegador.

Paginação com LIMIT e OFFSET: Nunca traga coleções completas do banco de dados para a memória da interface de uma só vez.

🧵 4. Escalabilidade de Processos e Background
Para tarefas que exigem alto processamento de CPU (cálculos complexos, geração de PDFs, processamento de relatórios extensos), isole o fluxo.

+----------------------------------------+
|       Interface (Renderer / UI)       |
+----------------------------------------+
                   |  (IPC Seguro)
                   v
+----------------------------------------+
|         Processo Principal (Main)       |
+----------------------------------------+
                   |  (Delega carga pesada)
                   v
+----------------------------------------+
|      Worker Threads / UtilityProcess   |  <-->  [ SQLite / SQLCipher ]
+----------------------------------------+
Não bloqueie a Main Thread: O Processo Principal do Electron gerencia as janelas do sistema. Se rodar uma consulta que demore 2 segundos nele, a interface inteira vai parecer congelada para o utilizador.

Uso de Janelas Ocultas: Para sub-módulos pesados (como o ecrã de Configurações avançadas do ERP), crie a janela na inicialização de forma oculta com show: false. Quando o utilizador clicar em abrir, use apenas .show(). É instantâneo.

🔒 5. Segurança do Executável e dos Dados
Aplicações locais guardam os arquivos no disco rígido do cliente. Proteger o código e o banco contra engenharia reversa é um requisito de produção.

Criptografia do Banco de Dados: Substitua o driver padrão por soluções com suporte a SQLCipher para criptografar o ficheiro físico do banco de dados usando criptografia AES-256.

Prepared Statements Sempre: Nunca concatene strings geradas pelo utilizador diretamente nas instruções SQL. Utilize parâmetros dinâmicos (?) para impedir ataques de SQL Injection.

Ofuscação de Código: Utilize ferramentas como javascript-obfuscator antes de empacotar o executável final com o electron-builder, dificultando a leitura da lógica de chaves ou regras de negócio do sistema por terceiros.