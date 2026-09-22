import React, { useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

export type AlertModalType = 'success' | 'error' | 'warning' | 'info' | 'success_premium';

export interface AlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    description: string;
    type: AlertModalType;
    actionLabel?: string;
    cancelLabel?: string;
    showCancel?: boolean;
    variant?: 'default' | 'destructive';
}

export function AlertModal(props: AlertModalProps) {
    const { isOpen } = props;

    // Guarda sempre a versão mais recente das props sem entrar nas dependências do efeito:
    // liga-las ao efeito fazia-o disparar Swal.fire() de novo a cada render do pai
    // (onClose/onConfirm são funções inline recriadas a cada render), substituindo o
    // popup por baixo do clique do utilizador e dando a impressão de que o "OK" não respondia.
    const propsRef = useRef(props);
    propsRef.current = props;

    useEffect(() => {
        if (!isOpen) return;

        const {
            title,
            description,
            type,
            actionLabel = 'OK',
            cancelLabel = 'Cancelar',
            showCancel = false,
            variant = 'default',
        } = propsRef.current;

        const swalIcon = type === 'error' ? 'error'
            : type === 'warning' ? 'warning'
            : type === 'info' ? 'info'
            : 'success';

        Swal.fire({
            title: title || 'Aviso',
            html: description || '',
            icon: swalIcon,
            showCancelButton: showCancel,
            confirmButtonText: actionLabel,
            cancelButtonText: cancelLabel,
            confirmButtonColor: variant === 'destructive' ? '#e11d48' : '#059669',
            cancelButtonColor: '#64748b',
            customClass: {
                popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
                title: 'text-2xl font-bold tracking-tight text-slate-900',
                htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
                confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base transition-all hover:scale-105',
                cancelButton: 'px-6 py-3 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm sm:text-base transition-all'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                if (propsRef.current.onConfirm) propsRef.current.onConfirm();
            }
            propsRef.current.onClose();
        });
        // Disparar apenas quando isOpen passa a true — o resto é lido de propsRef.current.
         
    }, [isOpen]);

    return null;
}


