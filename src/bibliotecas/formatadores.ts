// Máscaras e utilitários de formatação e cálculo inspirados no padrão de engenharia do sistema de identificação angolano.

// --- Bilhete de Identidade angolano -----------------------------------------
// Padrão: 9 dígitos + 2 letras (código da província) + 3 dígitos.
// Exemplo: 006874906KN044

export function aplicarMascaraBI(valor: string): string {
  const limpo = (valor || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  let resultado = "";
  for (const caracter of limpo) {
    const posicao = resultado.length;
    if (posicao < 9) {
      if (/[0-9]/.test(caracter)) resultado += caracter;
    } else if (posicao < 11) {
      if (/[A-Z]/.test(caracter)) resultado += caracter;
    } else if (posicao < 14) {
      if (/[0-9]/.test(caracter)) resultado += caracter;
    }
  }
  return resultado;
}

export function validarBI(valor: string): boolean {
  return /^\d{9}[A-Z]{2}\d{3}$/.test((valor || "").trim().toUpperCase());
}

export const PROVINCIAS_BI: Record<string, string> = {
  BO: "Bengo",
  BE: "Benguela",
  BI: "Bié",
  CA: "Cabinda",
  CC: "Cuando Cubango",
  CN: "Cunene",
  HA: "Huambo",
  HL: "Huíla",
  KN: "Kwanza Norte",
  KS: "Kwanza Sul",
  LN: "Lunda Norte",
  LS: "Lunda Sul",
  LA: "Luanda",
  ML: "Malanje",
  MO: "Moxico",
  NE: "Namibe",
  UI: "Uíge",
  ZA: "Zaire"
};

export function inferirProvinciaDoBI(biNumero: string): string {
  const match = (biNumero || "").toUpperCase().match(/\d{9}([A-Z]{2})\d{3}/);
  if (!match) return "";
  const code = match[1];
  return PROVINCIAS_BI[code] ? `Província de ${PROVINCIAS_BI[code]}, Angola` : "";
}

// --- Idade -------------------------------------------------------------------
// Calculada a partir da data de nascimento (ISO YYYY-MM-DD);
// Adiciona T00:00:00 para evitar desvios de fuso horário local.

export function calcularIdade(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  const iso = String(dataNascimento).slice(0, 10);
  const nascimento = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aniversarioJaPassou =
    hoje.getMonth() > nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
  if (!aniversarioJaPassou) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

// Adiciona (ou subtrai) anos a uma data ISO (YYYY-MM-DD) devolvendo YYYY-MM-DD.
export function adicionarAnos(dataISO: string | null | undefined, anos: number): string {
  const iso = String(dataISO ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const ano = Number(m[1]) + anos;
  const mes = Number(m[2]); // 1-12
  let dia = Number(m[3]); // 1-31
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  if (dia > ultimoDiaDoMes) dia = ultimoDiaDoMes;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function normalizarDataISO(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null;

  if (typeof valor === "number" && Number.isFinite(valor)) {
    const ms = valor < 10_000_000_000 ? valor * 1000 : valor;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  const validarPartes = (ano: number, mes: number, dia: number): string | null => {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (
      data.getUTCFullYear() !== ano ||
      data.getUTCMonth() !== mes - 1 ||
      data.getUTCDate() !== dia
    ) {
      return null;
    }
    return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  };

  const ymd = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
  if (ymd) {
    return validarPartes(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  const dmy = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D|$)/);
  if (dmy) {
    return validarPartes(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  const parsed = new Date(texto);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
