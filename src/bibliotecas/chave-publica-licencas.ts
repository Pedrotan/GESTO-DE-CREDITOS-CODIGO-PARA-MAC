// Chaves públicas do Tango Master (a privada correspondente fica só no cofre do Master). Verificam a assinatura
// das licenças na aplicação e no servidor da rede local. Ao gerar um novo par de chaves no Master, ACRESCENTE a nova
// chave pública a MASTER_PUBLIC_KEYS (não substitua): as licenças já emitidas com as chaves anteriores continuam válidas.
export const MASTER_PUBLIC_KEY = `MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAzbDXru+CWC+mUmCJPbvtC+2GiwP5Uxncpq3i3vs5WkfvQL005v3a4amuenMX9bH5k/PcUOJgIJ+YNGQCpRU5M5vJEPTsu2ddT7g1umKkalk0ev5TULfPhHoeTCHSM1P2X7Uy9+WopT2ojld0RNPPDjOika7BTJK/eWrw/8D2+NoHEvpMlyhFKaBPZh5q2FIrRN27qxa17oTIflyQE895EKrLE4YXwJHvqcX/zSZbka/d5X/w1+uolFNkjHe3Ylb+OOdhLn3TBfW2Hf/6PKMO7vD4r+eNvKFR30IgiKYrojbo7LzFsTFqACzfDLhCFHNj592oaiAKpF/CLAa41CdYiR+Jifp63x7WIrn7kWnBvrIRJDoUupw4HF3twmeUO72infwPMkIFWR1k3ziBxKNGaaAMyMOwJjFIsZvAjYKxqRJqCBybihLFZrgg39SusojjrXwNoJD4rnTaQSLouOgmqqYGOCLHxN/7pfWBf0o4zO7pdUD30zVgbdqPAh1GNU8xAgMBAAE=`;

export const MASTER_PUBLIC_KEYS: readonly string[] = [
    // Chave actual (gerada a 12/10/2026 às 20:08, depois da reinstalação do Master).
    MASTER_PUBLIC_KEY,
    // Chave de 12/10/2026 (18:55 a 20:05).
    `MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAzFQN/2fT+dbBHEazX3y5f3XktN2cdQuftgjY+IGvw6XpHrkTXr9G0luzFEXSX4G+dcnzXGA9glEDA86L4bP8LAlqK81HO9b8l6e5P7LbDPFpi25c8kDvdJLEhhoU5P7qv3ZA9Y7xMRR+sdOlqKi6adQ0eSLnTEl+bxPOc4e5CeEhl8r9fmWNFnwLeoR61ff2+etUMmtLtQ33GekSaw7vLb0fmScaUY9AHEcaiR/HiOyfTiicCOhUooNZM+3esjhWFNUq0NoeH8pPnn1Vo8QvGpFQKVzTCYxYYpabN5OvN/ardtffayx9R0ceJLsmAbk8x/co0pCV4AxdvPZShknguvBIOdKBeW08yAfGZvlTGfZZIvpHPjgwnXFwo3+h9nPa11KFwVAWX4/yEfAtv31aP52o6AmbyP3M0ExLqVdNaG2WXaDupXU3VvBN7d3U7uK6fDbrOSGhTV+HsAT2kdTE8GdQ9VHTrGdCDgnOXh3+FPmjycdw6KDn2ggUDsruN3KnAgMBAAE=`,
    // Chave anterior (RSA 2048): licenças emitidas antes de 12/10/2026.
    `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvd9xIaqvoTNpZXyx7zOT7Oqa8dIoTQL8pNA8+n+KbRNS6KcwhCjMa2Ve6iWLjE0D2wSKThWjbKR6MDKGls83QmN5EsYADjjyXcaV54+HrwY3n/hHUWnwv4rq3Whuxk+Emvm48EE8OJLgfAd1Gr6ACm62kAg9XFsYHTWPWoNts67KNjdPPnjHid0S97CEe6l3KahOKXLf52gwThec1iOxPIqK7+c9eu+rK/7NyHtlTZ8vR+p9YmitXy7HVhUw3YsfAt0WJ3hZYBm0R8JmC0QRelAaemXtNXgun1tbqLFdBgSSKw+samsdlbswGwyY+CshsO/DZzvU+gXWsRhrNpYhLQIDAQAB`,
];
