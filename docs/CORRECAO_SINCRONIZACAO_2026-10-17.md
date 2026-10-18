# Sincronização web e desktop — 17/10/2026

## Arquitectura e diagnóstico

O desktop guarda os dados em SQLite através do processo principal Electron; a web usa sql.js com persistência em IndexedDB. Cada dispositivo envia operações cifradas com AES-GCM para `/api/sync`. A VPS executa `server.mjs`, encaminha para `vercel-api/sync.js` e guarda o histórico cifrado no PostgreSQL. O cursor indica até onde o dispositivo leu esse histórico; não prova que todos os registos foram aplicados.

Falhas confirmadas por leitura do código e testes locais:

- A captura de escritas dependia de duas preferências em localStorage, mesmo com uma configuração de sincronização activa. Passa a usar a ligação activa.
- Uma resposta HTTP 200 sem `success: true` podia apagar a fila e apresentar sucesso. A confirmação e a estrutura da página são agora obrigatórias antes de apagar operações.
- Operações impossíveis de decifrar eram descartadas enquanto o cursor avançava. Agora ficam cifradas num armazenamento IndexedDB separado e voltam a ser tentadas, inclusive depois de corrigir a chave.
- O estado verde dependia apenas da fila de envio. Agora considera páginas remotas por receber, transacções incompletas, conflitos pendentes e operações ilegíveis.
- Uma fotografia de reparação v4 reenvia os registos existentes de ambos os clientes. Usa `INSERT OR IGNORE`: recupera registos ausentes sem substituir registos existentes. Não resolve diferenças em registos já existentes nem elimina conflitos financeiros automaticamente.
- As inserções retidas por falta de dependências voltam a ser tentadas após receber as páginas.

As capturas mostram a divergência, mas não permitem atribuir a ocorrência real a uma destas falhas. Não foi inspeccionado o histórico autenticado da VPS nem alterada a base real da empresa.

## Aplicação

Publicar o frontend web actualizado na VPS pelo procedimento habitual (`npm run build:web`; o servidor usa a pasta `vercel-web`). Gerar o instalador Windows com o procedimento habitual do projecto (`npm run build:erp`) e instalá-lo preservando os dados locais. Não executar `clean-data`.

Abrir primeiro a web actualizada com os dados existentes e deixar terminar o envio. Abrir o desktop actualizado, ligado ao mesmo domínio HTTPS, NIF e Código de Acesso. O desktop recebe a fotografia de reparação e também envia a sua, permitindo recuperar registos ausentes em ambos os lados. A reparação é automática uma vez por conta local; a fila conserva o trabalho que ainda não foi enviado.

Validar clientes, créditos, prestações e pagamentos nos dois dispositivos. Criar um registo de teste autorizado em cada lado e confirmar a sua chegada ao outro. Se aparecerem conflitos, rever as operações na interface de conflitos. Se houver operações ilegíveis, confirmar a chave em ambos os dispositivos; o histórico anteriormente cifrado com um código diferente requer esse código ou uma nova fotografia enviada por um dispositivo que ainda possua os dados.

## Publicação e validação realizadas

- 12 testes locais passaram: aplicação transaccional, conflitos, web → desktop com clientes/créditos/pagamentos, rejeição de HTTP 200 inválido e recuperação de cargas ilegíveis após corrigir a chave. A verificação TypeScript da aplicação passou.
- Os frontends web e desktop e o processo Electron compilaram com sucesso.
- VPS acedida por SSH em `191.215.45.104`; aplicação em `/root/tango-erp`, contentor `tango_erp_app`, PostgreSQL no contentor `tango_postgres`. O domínio HTTPS e `/api/health` responderam normalmente, com `connected_local_pg`.
- Confirmado que o serviço de sincronização na VPS correspondia exactamente ao código local anterior. Foi actualizado apenas esse ficheiro e compilado o frontend numa pasta temporária. Os novos assets foram copiados antes de substituir `index.html`, mantendo os assets antigos para páginas já abertas e sem reiniciar a API.
- Backup anterior em `/root/tango-sync-backup-20261017/` (fonte e arquivo `vercel-web.tgz`). O hash do HTML obtido pelo domínio HTTPS corresponde ao novo HTML compilado.
- Após autorização explícita, a análise dentro da VPS decifrou 236 operações da empresa com a chave actual: nenhuma ilegível. Foram encontradas operações de clientes, créditos, pagamentos e 12 prestações, mas nenhuma fotografia financeira completa. Existem também comandos de versões antigas não reconhecidos pela allowlist actual. Isto confirma que o transporte até ao servidor funciona e aponta para recepção/aplicação no cliente; não prova qual erro ocorreu na instalação desktop. O relatório mostrou apenas contagens e tipos, sem dados pessoais, montantes ou códigos. Uma análise adicional com identificadores foi bloqueada pela revisão automática e não foi executada.
- Instalador Windows gerado com sucesso em `release/TangoGestaoCreditos_Setup.exe`, reutilizando a distribuição local Electron 33.0.0. O empacotamento passou após usar as autoridades de certificação do sistema para os downloads necessários.

Falta actualizar a página já aberta no navegador e instalar a versão desktop corrigida, depois confirmar a recuperação dos dados reais. Os testes locais usam PostgreSQL simulado para o transporte e SQL real para a aplicação dos registos; não substituem essa confirmação nos dois clientes da empresa.
