# Tango Gestão de Créditos - Sistema de Gestao de Credito (v3.0.2)

Sistema profissional para gestao de carteiras de microcredito, clientes, contratos, pagamentos, contabilidade, cobranca e analise de risco.

## Funcionalidades Principais

- Gestao de clientes, creditos, pagamentos e contratos.
- Workflow de aprovacao de credito com regras de limite, risco e permissao.
- Scoring de clientes e recomendacao de limite/taxa.
- Hub de cobranca via WhatsApp com modelos de mensagem.
- Automacao diaria de cobranca para creditos vencidos.
- Contencioso juridico com emissao de carta formal de cobranca.
- Garantias, lixeira, auditoria, notificacoes e chat interno.
- Relatorios financeiros, fiscais e analiticos em PDF/Excel.
- Modo Electron com base SQLite local e sincronizacao master/slave.

## Desenvolvimento

```sh
npm install
npm run dev
npm run build
```

## Empacotamento

```sh
npm run build:erp
npm run build:master
```

## Seguranca

- Nao versionar `private_key.json`, certificados, chaves `.pem`, `.p12` ou `.key`.
- Fazer backup da base antes de operacoes destrutivas.
- Rever permissoes de utilizadores antes de ativar operacoes financeiras.
