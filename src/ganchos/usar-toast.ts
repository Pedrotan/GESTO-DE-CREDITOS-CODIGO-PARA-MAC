import type { ReactNode } from 'react';
import type { ToastActionElement, ToastProps } from '@/componentes/ui/toast';
import { notificar } from '@/bibliotecas/alerta';

type ToastInput = ToastProps & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ToastActionElement;
};

const asText = (value: ReactNode): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
};

let nextId = 0;

const showToast = (props: ToastInput, icon: 'success' | 'error' | 'info' = 'info') => {
  const id = String(++nextId);
  void notificar(
    asText(props.title) || (icon === 'error' ? 'Erro' : 'Aviso'),
    asText(props.description),
    props.variant === 'destructive' ? 'error' : icon,
  );
  return { id, dismiss: () => undefined, update: (_next: ToastInput) => undefined };
};

export const toast = Object.assign(
  (props: ToastInput) => showToast(props),
  {
    success: (message: string) => showToast({ title: message }, 'success'),
    error: (message: string) => showToast({ title: message }, 'error'),
  },
);

export const useToast = () => ({
  toasts: [] as Array<ToastInput & { id: string }>,
  toast,
  dismiss: (_id?: string) => undefined,
});
