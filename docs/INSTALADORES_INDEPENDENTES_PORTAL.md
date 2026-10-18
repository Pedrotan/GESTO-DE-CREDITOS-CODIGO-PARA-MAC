# Instaladores independentes e página de entrada — 18/10/2026

O customInit partilhado executava taskkill para os três nomes de executável em qualquer instalação. Agora a condição APP_ID fecha apenas o aplicativo que está a ser atualizado: Master Gen ou ERP (incluindo o nome antigo TangoERP). O outro aplicativo mantém-se aberto. Os comandos build:erp/build:master e a compilação conjunta também deixaram de chamar stop-apps. A ferramenta stop-apps continua disponível para uso explícito no desenvolvimento.

A página de entrada tem fundo à altura do conteúdo/janela, largura ampliada em monitores grandes, disposição móvel, funcionalidades selecionáveis e efeitos de entrada e luz de fundo. prefers-reduced-motion desativa os efeitos. Os fluxos de identificação, registo e autorização mantêm os seus handlers.

Validar manualmente num Windows de teste: manter Master Gen aberto e atualizar ERP; depois manter ERP aberto e atualizar Master Gen. Cada atualização pode fechar a sua própria versão em execução. Não executar instaladores no computador de trabalho apenas para testar, pois isso encerraria a versão correspondente e alteraria a instalação.

Verificações: typecheck completo passou; renderer ERP/Master e processos Electron compilaram. Na VPS, a página servida tem o mesmo SHA-256 do index publicado e /api/health responde healthy/connected_local_pg. No navegador, a seleção de funcionalidades altera o texto e Iniciar Sessão abre Identificar Empresa. O conteúdo completo do cartão permanece acessível em ecrã estreito. O teste de instalação com ambos os aplicativos em execução não foi realizado nesta máquina.
