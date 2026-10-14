/** Símbolo do Kwanza usado em todo o sistema. */
export const KWANZA_SYMBOL = 'Kz';
const KWANZA_CODES = new Set(['', 'AOA', 'KZ', 'KWANZA', 'KWANZAS']);
/**
 * Locale dos números: ponto nos milhares e vírgula nas casas decimais ("1.000.000,00"), o formato pedido
 * para o Kwanza. O 'pt-AO' do Intl usa espaço nos milhares; o 'pt-BR' tem exactamente este formato
 * (e agrupa desde os 4 dígitos: "1.500,50"). As datas continuam em 'pt-AO'.
 */
export const NUMBER_LOCALE = 'pt-BR';
const decimalFormatters = new Map<number, Intl.NumberFormat>();
const decimalFormatter = (digits: number) => {
  if (!decimalFormatters.has(digits)) decimalFormatters.set(digits, new Intl.NumberFormat(NUMBER_LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return decimalFormatters.get(digits)!;
};

/**
 * Formatação monetária única do sistema (ecrãs, relatórios, recibos e PDFs): "1.000.000,00 Kz" — ponto nos
 * milhares, vírgula decimal, sempre duas casas. Outras moedas: o mesmo número com o código (ex.: "1.000,00 USD").
 */
export const formatCurrency = (value: number | string | undefined | null, currency: string = 'AOA'): string => {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  const code = String(currency || 'AOA').trim().toUpperCase();
  return `${decimalFormatter(2).format(safe)} ${KWANZA_CODES.has(code) ? KWANZA_SYMBOL : code}`;
};

/** Número com vírgula decimal e ponto nos milhares (ex.: 1.234,50). */
export const formatDecimal = (value: number | string | undefined | null, digits = 2): string => {
  const num = Number(value ?? 0);
  return decimalFormatter(digits).format(Number.isFinite(num) ? num : 0);
};

/** Percentagem no formato angolano (ex.: 24,00%). */
export const formatPercent = (value: number | string | undefined | null, digits = 2): string => `${formatDecimal(value, digits)}%`;

/**
 * Lê um número escrito à maneira angolana: aceita "1.000.000,50", "1 000 000,50", "1000000,5", "1.500"
 * (ponto seguido de 3 dígitos = milhares) ou "24.5". Devolve NaN quando o texto não é um número.
 */
export const parseDecimalInput = (text: string | number | null | undefined): number => {
  if (typeof text === 'number') return text;
  const raw = String(text ?? '').replace(/\s/g, '').replace(/kz|aoa|%/gi, '');
  if (!raw) return NaN;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if ((raw.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
};

export const formatCurrencyCompact = (value: number): string => {
  return `${new Intl.NumberFormat('pt-AO', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} ${KWANZA_SYMBOL}`;
};

export const formatDate = (date: Date | string | undefined | null): string => {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  // Verificar se a data é válida
  if (isNaN(d.getTime())) return 'Data Inválida';

  return new Intl.DateTimeFormat('pt-AO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Luanda',
  }).format(d);
};

export const formatDateTime = (date: Date | string | undefined | null): string => {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Data Inválida';

  return new Intl.DateTimeFormat('pt-AO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Luanda',
  }).format(d);
};

export const formatDateTimeFull = (date: Date | string | undefined | null): string => {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Data Inválida';

  return new Intl.DateTimeFormat('pt-AO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Africa/Luanda',
  }).format(d);
};

export const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat(NUMBER_LOCALE).format(value);
};

/**
 * Formata um número de telefone angolano com a máscara +244 XXX XXX XXX.
 * Remove caracteres não numéricos, adiciona o prefixo +244 e espaços nos locais corretos.
 */
export const formatAngolanPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  let baseNumber = digits;
  if (digits.startsWith('244')) {
    baseNumber = digits.slice(3);
  }
  baseNumber = baseNumber.slice(0, 9);
  if (baseNumber.length === 0) return '';
  let formatted = '+244 ';
  if (baseNumber.length > 0) {
    formatted += baseNumber.slice(0, 3);
  }
  if (baseNumber.length > 3) {
    formatted += ' ' + baseNumber.slice(3, 6);
  }
  if (baseNumber.length > 6) {
    formatted += ' ' + baseNumber.slice(6, 9);
  }
  return formatted;
};

export interface AdaptiveDonutValue {
  main: string;
  suffix: string;
  currency: string;
  fullFormatted: string;
  fullRawNumber: string;
  isCompact: boolean;
  fontSize: string;
}

/**
 * Formata um montante financeiro para exibição adaptativa no centro de gráficos Donut/círculos,
 * garantindo legibilidade imediata sem reticências ou cortes de texto.
 */
export const getAdaptiveDonutValue = (value: number | string | undefined | null, currencyCode: string = 'AOA'): AdaptiveDonutValue => {
  const num = Number(value || 0);
  const abs = Math.abs(num);
  const currency = ['', 'AOA', 'KZ'].includes(String(currencyCode || '').toUpperCase()) ? KWANZA_SYMBOL : currencyCode;
  const fullFormatted = formatCurrency(num, currencyCode);
  const fullRawNumber = fullFormatted.replace(',00', '').replace(/\s*(AOA|Kz)$/i, '').trim();

  // Triliões (>= 1.000.000.000.000)
  if (abs >= 1_000_000_000_000) {
    const formatted = (num / 1_000_000_000_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });
    return {
      main: formatted,
      suffix: 'Tri',
      currency,
      fullFormatted,
      fullRawNumber,
      isCompact: true,
      fontSize: 'text-2xl',
    };
  }

  // Biliões / Mil Milhões (>= 1.000.000.000) - Ex: 67 600 000 000 -> 67,60 Bi
  if (abs >= 1_000_000_000) {
    const formatted = (num / 1_000_000_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });
    return {
      main: formatted,
      suffix: 'Bi',
      currency,
      fullFormatted,
      fullRawNumber,
      isCompact: true,
      fontSize: 'text-2xl',
    };
  }

  // Milhões (>= 1.000.000) - Ex: 15 600 000 -> 15,60 Mi
  if (abs >= 1_000_000) {
    const formatted = (num / 1_000_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });
    return {
      main: formatted,
      suffix: 'Mi',
      currency,
      fullFormatted,
      fullRawNumber,
      isCompact: true,
      fontSize: 'text-2xl',
    };
  }

  // Centenas de Milhares (>= 100.000) - Ex: 450 000 -> 450 mil
  if (abs >= 100_000) {
    const formatted = (num / 1_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return {
      main: formatted,
      suffix: 'mil',
      currency,
      fullFormatted,
      fullRawNumber,
      isCompact: true,
      fontSize: 'text-2xl',
    };
  }

  // Menor que 100.000 (Ex: 25 000 ou 1 500)
  const formatted = num.toLocaleString('pt-BR', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return {
    main: formatted,
    suffix: '',
    currency,
    fullFormatted,
    fullRawNumber,
    isCompact: false,
    fontSize: formatted.length > 8 ? 'text-lg' : 'text-xl',
  };
};




