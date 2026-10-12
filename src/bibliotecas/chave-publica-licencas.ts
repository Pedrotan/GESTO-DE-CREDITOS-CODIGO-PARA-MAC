// Chaves públicas do Tango Master (a privada correspondente fica só no cofre do Master). Verificam a assinatura
// das licenças na aplicação e no servidor da rede local. Ao gerar um novo par de chaves no Master, ACRESCENTE a nova
// chave pública a MASTER_PUBLIC_KEYS (não substitua): as licenças já emitidas com as chaves anteriores continuam válidas.
export const MASTER_PUBLIC_KEY = `MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAzFQN/2fT+dbBHEazX3y5f3XktN2cdQuftgjY+IGvw6XpHrkTXr9G0luzFEXSX4G+dcnzXGA9glEDA86L4bP8LAlqK81HO9b8l6e5P7LbDPFpi25c8kDvdJLEhhoU5P7qv3ZA9Y7xMRR+sdOlqKi6adQ0eSLnTEl+bxPOc4e5CeEhl8r9fmWNFnwLeoR61ff2+etUMmtLtQ33GekSaw7vLb0fmScaUY9AHEcaiR/HiOyfTiicCOhUooNZM+3esjhWFNUq0NoeH8pPnn1Vo8QvGpFQKVzTCYxYYpabN5OvN/ardtffayx9R0ceJLsmAbk8x/co0pCV4AxdvPZShknguvBIOdKBeW08yAfGZvlTGfZZIvpHPjgwnXFwo3+h9nPa11KFwVAWX4/yEfAtv31aP52o6AmbyP3M0ExLqVdNaG2WXaDupXU3VvBN7d3U7uK6fDbrOSGhTV+HsAT2kdTE8GdQ9VHTrGdCDgnOXh3+FPmjycdw6KDn2ggUDsruN3KnAgMBAAE=`;

export const MASTER_PUBLIC_KEYS: readonly string[] = [
    // Chave actual (gerada a 12/10/2026, RSA 3072).
    MASTER_PUBLIC_KEY,
    // Chave anterior (RSA 2048): licenças emitidas antes de 12/10/2026.
    `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvd9xIaqvoTNpZXyx7zOT7Oqa8dIoTQL8pNA8+n+KbRNS6KcwhCjMa2Ve6iWLjE0D2wSKThWjbKR6MDKGls83QmN5EsYADjjyXcaV54+HrwY3n/hHUWnwv4rq3Whuxk+Emvm48EE8OJLgfAd1Gr6ACm62kAg9XFsYHTWPWoNts67KNjdPPnjHid0S97CEe6l3KahOKXLf52gwThec1iOxPIqK7+c9eu+rK/7NyHtlTZ8vR+p9YmitXy7HVhUw3YsfAt0WJ3hZYBm0R8JmC0QRelAaemXtNXgun1tbqLFdBgSSKw+samsdlbswGwyY+CshsO/DZzvU+gXWsRhrNpYhLQIDAQAB`,
];
