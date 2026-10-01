export const formatCurrency = (value: number | string | undefined | null, currency: string = 'AOA'): string => {
  const num = Number(value || 0);
  if (isNaN(num)) return `0,00 ${currency}`;
  return new Intl.NumberFormat('pt-AO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num) + ' ' + currency;
};

export const formatCurrencyCompact = (value: number): string => {
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: 'AOA',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
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
  return new Intl.NumberFormat('pt-AO').format(value);
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
export const getAdaptiveDonutValue = (value: number | string | undefined | null, currency: string = 'AOA'): AdaptiveDonutValue => {
  const num = Number(value || 0);
  const abs = Math.abs(num);
  const fullFormatted = formatCurrency(num, currency);
  const fullRawNumber = fullFormatted.replace(',00', '').replace(/\s*AOA/i, '').trim();

  // Triliões (>= 1.000.000.000.000)
  if (abs >= 1_000_000_000_000) {
    const formatted = (num / 1_000_000_000_000).toLocaleString('pt-AO', {
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
    const formatted = (num / 1_000_000_000).toLocaleString('pt-AO', {
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
    const formatted = (num / 1_000_000).toLocaleString('pt-AO', {
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
    const formatted = (num / 1_000).toLocaleString('pt-AO', {
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
  const formatted = num.toLocaleString('pt-AO', {
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




