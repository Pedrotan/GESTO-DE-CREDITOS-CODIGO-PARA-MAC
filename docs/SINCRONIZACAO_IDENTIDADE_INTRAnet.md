# Identidade empresarial e intranet — 18/10/2026

## Comportamento

- A intranet exige `features.intranet === true` numa licença válida. O escalão empresarial e o módulo multiempresa não ativam intranet. A mesma política é aplicada no processo principal e na interface; na web não aparece o indicador de servidor intranet.
- `company_settings` permanece excluída da replicação genérica porque contém segredos e configurações da máquina. A identidade tem agora campos próprios em `shared_settings`, transportados pela fila cifrada existente. Inclui nome/NIF, morada, contactos, sítio, localização, segmento, slogan, moeda, cores e os três logótipos (interface, relatórios e marca de água).
- Cada campo tem a data da sua alteração. Alterações de um campo não apagam outros; uma instalação nova só preenche campos ainda não partilhados. Após receber o perfil existente, o desktop publica automaticamente os campos locais em falta. A edição explícita na web ou desktop publica os campos alterados nos dois sentidos.
- Ficheiros locais e blobs são convertidos em imagens portáteis, reduzidas quando necessário para respeitar o limite da sincronização. Não são enviados caminhos do computador. O contexto de dados e os serviços que geram relatórios consomem o mesmo perfil partilhado.
- Remover um logótipo também sincroniza; a cópia local antiga não o faz reaparecer.
- Definições de empresa partilhadas (19/10/2026): coordenadas bancárias, modelos e cláusulas de contrato, signatários autorizados e assinatura digital, módulos activos (`enable*Module`, `enableProfileActivity` e as variantes «só administrador») e valores por omissão do simulador seguem o mesmo transporte, com as chaves `company_settings_v1:*`. São publicadas ao gravar as Definições (só os campos realmente alterados: um formulário carregado antes da sincronização não substitui o valor já partilhado) e semeadas na sincronização apenas se ainda não existirem na nuvem e não forem o valor por omissão. Na leitura são aplicadas por cima de `company_settings`. SMTP, chave de resgate, chaves de sincronização, licença e multiempresa nunca passam por aqui.
- O aviso «Verificar chave» foi substituído por «Itens por recuperar»: operações cifradas ilegíveis ficam guardadas e são novamente tentadas, sem interromper as restantes. Não se afirma que a chave atual está errada nem que o histórico está integralmente sincronizado.

## Atualização

Instalar a nova versão nos desktops, começando pelo computador que já tem a identidade completa. Ligá-lo à Internet e deixar sincronizar; depois atualizar a página web. Os dados existentes na outra máquina não podem ser publicados por um instalador antigo que ainda não tenha este transporte de identidade.

## Verificação

30 testes passaram: identidade nos dois sentidos, fila cifrada desktop→web, imagens portáteis, isolamento de empresas, preservação de segredos, remoção de imagem, conflitos cronológicos, licenças sem módulo e retenção/recuperação de operações ilegíveis. Typecheck completo passou.

## VPS

A produção ativa usa `/var/www/tango-erp` e a pasta `/app/vercel-web` incluída na imagem Docker. A pasta antiga `/root/tango-erp` não é servida pelo domínio. Publicar reconstruindo o serviço app e verificar o hash do HTML no contentor e no domínio.
