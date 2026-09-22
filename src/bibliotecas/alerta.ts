import Swal, { SweetAlertOptions } from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

// Configuração base elegante e integrada ao Tango Gestão ERP
const customSwal = Swal.mixin({
    buttonsStyling: true,
    confirmButtonColor: '#059669', // Emerald / Tango Green
    cancelButtonColor: '#64748b',
    customClass: {
        popup: 'tango-swal-popup rounded-3xl p-6 shadow-2xl font-sans',
        title: 'text-2xl font-bold tracking-tight text-slate-900',
        htmlContainer: 'text-sm sm:text-base text-slate-600 leading-relaxed font-normal',
        confirmButton: 'px-6 py-3 rounded-xl font-bold text-white shadow-md text-sm sm:text-base transition-all hover:scale-105',
        cancelButton: 'px-6 py-3 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm sm:text-base transition-all'
    }
});

/**
 * Dispara um SweetAlert2 de Sucesso com o icónico visto animado
 */
export const alertaSucesso = (title: string, messageOrHtml: string, options?: SweetAlertOptions) => {
    return customSwal.fire({
        icon: 'success',
        title,
        html: messageOrHtml,
        confirmButtonText: 'OK',
        confirmButtonColor: '#059669',
        ...options
    });
};

/**
 * Dispara um SweetAlert2 de Erro
 */
export const alertaErro = (title: string, messageOrHtml: string, options?: SweetAlertOptions) => {
    return customSwal.fire({
        icon: 'error',
        title,
        html: messageOrHtml,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#e11d48',
        ...options
    });
};

/**
 * Dispara um SweetAlert2 de Aviso
 */
export const alertaAviso = (title: string, messageOrHtml: string, options?: SweetAlertOptions) => {
    return customSwal.fire({
        icon: 'warning',
        title,
        html: messageOrHtml,
        confirmButtonText: 'OK',
        confirmButtonColor: '#f59e0b',
        ...options
    });
};

/**
 * Dispara um SweetAlert2 de Informação
 */
export const alertaInfo = (title: string, messageOrHtml: string, options?: SweetAlertOptions) => {
    return customSwal.fire({
        icon: 'info',
        title,
        html: messageOrHtml,
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
        ...options
    });
};

/**
 * Dispara uma caixa de Confirmação com SweetAlert2
 */
export const alertaConfirmacao = async (
    title: string,
    messageOrHtml: string,
    confirmText = 'Sim, Confirmar',
    cancelText = 'Cancelar'
): Promise<boolean> => {
    const result = await customSwal.fire({
        icon: 'question',
        title,
        html: messageOrHtml,
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#64748b',
        reverseButtons: true
    });
    return result.isConfirmed;
};

export { Swal };
export default customSwal;
