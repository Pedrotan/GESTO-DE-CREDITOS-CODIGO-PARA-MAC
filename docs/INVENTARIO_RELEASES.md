# Inventário de builds e plano de atualização

Não há instaladores, bases, ZIPs, certificados ou chaves privadas versionados no workspace. `release`, `dist*`, `*.zip`, bases, logs e material de assinatura são ignorados pelo Git.

Builds distribuídos anteriormente não podem ser enumerados a partir deste diretório. O proprietário da distribuição deve preencher versão, hash SHA-256, canal, plataforma, data e destinatários. Versões anteriores à rotação `kid=tango-license-2026-01`, às sessões no processo principal e ao formato de backup portátil devem ser classificadas como atualização obrigatória.

| Versão/hash | Canal | Plataforma | Distribuição | Ação |
|---|---|---|---|---|
| A inventariar externamente | — | — | — | bloquear ou atualizar |

Ambientes: desenvolvimento usa dados sintéticos; homologação usa cópia mascarada e chaves próprias; produção usa secrets, base, tenant e assinatura separados. Nunca reutilizar credenciais entre ambientes.
