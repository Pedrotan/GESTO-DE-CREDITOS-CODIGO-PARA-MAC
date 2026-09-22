import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata uma data com segurança, evitando RangeError: Invalid time value
 */

/**
 * Formata uma data com segurança, evitando RangeError: Invalid time value
 */
export function formatDateSafe(
  date: string | number | Date | null | undefined,
  formatStr?: string,
  options: { locale?: any } = { locale: ptBR }
): string {
  if (!date) return '---';
  try {
    const d = new Date(date);
    if (!isValid(d)) return '---';
    if (formatStr) {
      return format(d, formatStr, options);
    }
    return d.toLocaleDateString('pt-AO');
  } catch (e) {
    return '---';
  }
}

export function getFileUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith('data:') || path.startsWith('file:') || path.startsWith('safe-file:')) return path;
  
  // Normalizar barras invertidas do Windows para barras normais
  const normalizedPath = path.replace(/\\/g, '/');
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  
  const hasDriveLetter = /^[a-zA-Z]:/.test(normalizedPath);
  const encodedPath = encodeURI(normalizedPath);
  
  if (isElectron) {
    return hasDriveLetter ? `safe-file:///${encodedPath}` : `safe-file://${encodedPath}`;
  } else {
    return hasDriveLetter ? `file:///${encodedPath}` : `file://${encodedPath}`;
  }
}




