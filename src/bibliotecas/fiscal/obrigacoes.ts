/**
 * Obrigações fiscais recorrentes ligadas à facturação electrónica e ao SAF-T (AO).
 * Os prazos marcados com `verificar` devem ser confirmados pelo contabilista certificado.
 */
export interface Obrigacao {
  id: string;
  titulo: string;
  descricao: string;
  data: Date;
  recorrencia: 'anual' | 'mensal' | 'continua' | 'personalizada';
  base: string;
  verificar?: boolean;
  aplicavel?: string;
}

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 23, 59);
const lastDay = (y: number, m: number) => new Date(y, m, 0, 23, 59);

function nextAnnual(now: Date, month: number, day: number) {
  const t = d(now.getFullYear(), month, day);
  return t >= now ? t : d(now.getFullYear() + 1, month, day);
}

export function obrigacoes(now = new Date()): Obrigacao[] {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const ivaDue = lastDay(y, m + 1 > 12 ? 1 : m + 1);
  if (m === 12) ivaDue.setFullYear(y + 1);
  const seriesOpen = d(y, 12, 16);

  return [
    {
      id: 'saft-contab', titulo: 'SAF-T (AO) de contabilidade', recorrencia: 'anual',
      descricao: `Submissão do ficheiro SAF-T de contabilidade do exercício ${nextAnnual(now, 4, 10).getFullYear() - 1}.`,
      data: nextAnnual(now, 4, 10), base: 'Decreto Presidencial 71/25 — até 10 de Abril do ano seguinte',
    },
    {
      id: 'saft-inv', titulo: 'Ficheiro de inventário (31/12)', recorrencia: 'anual',
      descricao: 'Comunicação do inventário encerrado a 31 de Dezembro.',
      data: nextAnnual(now, 2, 15), base: 'Até 15 de Fevereiro do ano seguinte',
      aplicavel: 'Só se a empresa tiver inventários (normalmente não se aplica à actividade de crédito).',
    },
    {
      id: 'series', titulo: 'Pedir séries para o próximo ano', recorrencia: 'anual',
      descricao: 'A partir de 16 de Dezembro a AGT aceita séries para o ano seguinte. Pedir uma por cada tipo de documento usado (FR, FT, NC, RG…), incluindo séries de contingência.',
      data: seriesOpen >= now ? seriesOpen : d(y + 1, 12, 16), base: 'Serviço solicitarSerie — regra do ano da série',
    },
    {
      id: 'iva', titulo: 'Declaração periódica de IVA', recorrencia: 'mensal',
      descricao: 'Apuramento do IVA do mês anterior com base no Mapa de Impostos.',
      data: ivaDue, base: 'Código do IVA — último dia do mês seguinte', verificar: true,
    },
    {
      id: 'fe-24h', titulo: 'Comunicação das facturas à AGT', recorrencia: 'continua',
      descricao: 'Cada documento deve ser comunicado em tempo real. Depois de 24h sem contingência aprovada, a AGT marca-o como válido com penalização.',
      data: now, base: 'Especificação técnica AGT — estado P (consultarFactura)',
    },
    {
      id: 'emissao-5d', titulo: 'Emissão da factura', recorrencia: 'continua',
      descricao: 'A factura deve ser emitida até 5 dias úteis após a operação (cobrança de juros, comissões, mora).',
      data: now, base: 'Regime Jurídico das Facturas (DP 71/25)', verificar: true,
    },
  ];
}

export const diasAte = (data: Date, now = new Date()) => Math.ceil((data.getTime() - now.getTime()) / 86_400_000);
