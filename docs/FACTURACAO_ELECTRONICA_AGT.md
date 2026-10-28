# Facturação Electrónica AGT e SAF-T (AO)

Página **Relatórios Fiscais** (`#/relatorios-fiscais`, permissão `manage_fiscal`) reescrita como centro fiscal,
preparada para a Facturação Electrónica da AGT (Decreto Presidencial 71/25, Decreto Executivo 683/25,
especificação técnica `schemaVersion 2.0` publicada no Quiosque AGT) e para o SAF-T (AO) 1.01_01.

## Separadores
- **Visão geral** — base, impostos, total facturado, taxa de validação AGT, alertas (24 h sem comunicar, rejeitados,
  pagamentos por facturar, séries a esgotar), próximos prazos, Relatório Económico Global (mantido).
- **Facturação electrónica** — documentos FR/FT/NC/ND/RG; *Facturar pagamentos* gera uma FR por pagamento com os
  juros e a mora (o capital nunca é facturado; idempotência `pay:<id>`); validar antes de emitir, JSON exacto,
  correcção de rejeitados (novo número, estado C), anulação por nota de crédito, PDF com QR Code AGT.
- **Séries** — pedir (`solicitarSerie`) e sincronizar (`listarSeries`); cada série pertence a um computador.
- **SAF-T (AO)** — pré-validação (sequências, hashes recalculados, NIF, totais, isenções) e geração com histórico SHA-256.
- **Mapa de impostos**, **Calendário fiscal**, **Configuração AGT** (ambiente, chaves, software certificado, perfis
  fiscais por encargo) e **Auditoria** (operações + chamadas à AGT).

## Arquitectura
| Camada | Ficheiros |
|---|---|
| Regras puras (testadas) | `src/bibliotecas/fiscal/regras.ts`, `saft-ao.ts`, `tipos.ts`, `obrigacoes.ts` |
| Esquema SQLite | `src/bibliotecas/fiscal/esquema-fiscal.ts` (em `LEDGER_PROTECTION_SQL`; triggers de imutabilidade) |
| Serviço | `src/servicos/ServicoFiscal.ts` (SQL literal → lista branca regenerada) |
| Ponte AGT | `src/bibliotecas/fiscal/ponte-agt.ts` → desktop: IPC `agt-*` (`electron/main.ts`); web: `POST /api/agt` (`vercel-api/agt.js`) |
| Núcleo de assinaturas | `vercel-api/_agt-nucleo.js` (JWS RS256, hash SAF-T RSA-SHA1, chamadas aos 7 serviços) |
| Fila em segundo plano | `src/componentes/fiscal/FilaFiscalGlobal.tsx` (envio em lotes de 30 + `obterEstado` com espera crescente) |

As chaves privadas **nunca** chegam ao navegador. No desktop ficam cifradas com `safeStorage` por conta de empresa;
na VPS em `AGT_KEYS_DIR/<tenant>/`. A ponte só assina documentos com os 8 campos da especificação e pedidos que ela
própria envia à AGT. O `jwsSoftwareSignature` é fixo (o produtor assina uma vez o `softwareInfoDetail`), por isso a
chave do produtor não é distribuída.

## Vários computadores
Cada série pertence ao computador que a pediu (`deviceId`). Dois postos sincronizados nunca repetem números. O
número é reservado na mesma transacção que grava o documento (`expectChanges`), e cada documento só é enviado à AGT
pelo computador que o emitiu.

## Para entrar em produção
1. Certificação do software na AGT → preencher (Super Administrador) n.º de certificação, versão da assinatura,
   `jwsSoftwareSignature` e NIF do produtor.
2. Adesão da empresa à facturação electrónica; registo do estabelecimento; importar a chave do contribuinte.
3. Importar a chave do hash SAF-T (RSA 1024 — o XSD limita o Hash a 172 caracteres).
4. Confirmar os perfis fiscais com o contabilista (códigos de isenção do Anexo 6.4, verba e taxa de IS do Anexo 6.3).
5. Homologação: pedir série → `registarFactura` devolve `requestID` → `obterEstado` devolve V/I. Só depois produção.

Sem comunicação activa a página funciona em **modo simulação**: séries de simulação, documentos marcados
«sem validade fiscal», excluídos do SAF-T.

## Testes
`tests/facturacao-agt.test.ts` — arredondamentos, construção e validação, assinaturas da ponte, pedidos assinados,
SAF-T. Com `SAFT_XSD_PATH=<SAFTAO1.01_01.xsd>` e `xmllint`, o XML gerado é validado contra o XSD oficial.
