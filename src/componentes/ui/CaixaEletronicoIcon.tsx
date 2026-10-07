import React from 'react';
import { cn } from '@/bibliotecas/utils';

export interface CaixaEletronicoIconProps extends React.ComponentPropsWithoutRef<'svg'> {
  className?: string;
  size?: number | string;
}

/**
 * Ícone representativo de Caixa Eletrónico (ATM / Multicaixa).
 * Segue fielmente o padrão geométrico dos ícones Lucide (viewBox 0 0 24 24, stroke 2px).
 */
export function CaixaEletronicoIcon({ className, size = 20, ...props }: CaixaEletronicoIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      {...props}
    >
      {/* Corpo / Terminal do Caixa Eletrónico */}
      <rect x="3" y="2" width="18" height="20" rx="2.5" />
      {/* Ecrã interativo do ATM */}
      <rect x="6" y="5" width="12" height="6" rx="1" />
      {/* Ranhura de inserção de cartão */}
      <line x1="6" y1="13" x2="10.5" y2="13" />
      {/* Teclado numérico / PIN */}
      <circle cx="14.5" cy="13" r="0.75" fill="currentColor" />
      <circle cx="17.2" cy="13" r="0.75" fill="currentColor" />
      {/* Ranhura dispensadora de dinheiro */}
      <rect x="6" y="16" width="12" height="3" rx="0.5" />
      {/* Nota a sair do dispensador */}
      <line x1="8.5" y1="17.5" x2="15.5" y2="17.5" />
    </svg>
  );
}

export default CaixaEletronicoIcon;
