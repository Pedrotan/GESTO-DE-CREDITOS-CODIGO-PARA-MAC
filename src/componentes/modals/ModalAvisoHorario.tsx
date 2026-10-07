import React, { useState } from 'react';
import { AlertTriangle, X, MessageCircle, Copy, Check, Clock } from 'lucide-react';
import { Dialog, DialogContent } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { useToast } from '@/ganchos/usar-toast';

export interface ModalAvisoHorarioProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: string;
  motivo?: string;
  proximoAcesso?: string | null;
  contatoAdminWhatsApp?: string;
  nomeUtilizador?: string;
}

export function ModalAvisoHorario({
  aberto,
  aoFechar,
  titulo = 'HORÁRIO DE ACESSO EXPIRADO?',
  motivo,
  proximoAcesso,
  contatoAdminWhatsApp = '244941537486',
  nomeUtilizador
}: ModalAvisoHorarioProps) {
  const { toast } = useToast();
  const [copiado, setCopiado] = useState(false);

  // Mensagem padronizada e explícita formatada
  const mensagemSMSCompleta = `TANGO ERP - AVISO DE SEGURANÇA:
O seu horário de expediente autorizado no sistema terminou. Para garantir a conformidade e a segurança dos dados, o acesso foi temporariamente suspenso.

${proximoAcesso ? `Previsão de retorno: ${proximoAcesso}.\n\n` : ''}Caso necessite de mais horário de trabalho ou de uma extensão excecional para concluir as suas tarefas, por favor contacte o Administrador do Sistema.`;

  const handleCopiarSMS = () => {
    navigator.clipboard.writeText(mensagemSMSCompleta);
    setCopiado(true);
    toast({
      title: 'Mensagem copiada',
      description: 'O texto explicativo foi copiado para a área de transferência.'
    });
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleContactarAdmin = () => {
    const textoMensagem = encodeURIComponent(
      `Olá Administrador, o meu horário de acesso ao sistema Tango ERP expirou${
        nomeUtilizador ? ` (Utilizador: ${nomeUtilizador})` : ''
      }. Solicito por favor mais horário ou uma extensão temporária para concluir as minhas tarefas pendentes.`
    );
    const numeroLimpo = contatoAdminWhatsApp.replace(/\D/g, '');
    const url = `https://wa.me/${numeroLimpo}?text=${textoMensagem}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={aberto} onOpenChange={open => { if (!open) aoFechar(); }}>
      <DialogContent className="max-w-[380px] sm:max-w-[420px] p-0 border-none bg-transparent shadow-none overflow-visible">
        {/* Container do Card no padrão visual fornecido */}
        <div className="relative bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 pt-12 shadow-2xl border border-slate-100 dark:border-slate-800 text-center animate-in zoom-in-95 duration-200">
          
          {/* Badge suspenso amarelo/âmbar com ícone de triângulo de aviso (exato padrão da imagem) */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/35 border-4 border-white dark:border-slate-900 transition-transform hover:scale-105">
            <AlertTriangle className="h-10 w-10 text-white stroke-[2.5]" />
          </div>

          {/* Botão fechar (X) discreto no canto superior direito */}
          <button
            type="button"
            onClick={aoFechar}
            className="absolute top-4 right-4 h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 flex items-center justify-center transition-colors focus:outline-none"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>

          {/* Título em destaque */}
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mt-2">
            {titulo}
          </h3>

          {/* Linha divisória horizontal sutil */}
          <div className="w-full border-t border-slate-100 dark:border-slate-800 my-4" />

          {/* Corpo do texto explicativo (SMS / Alerta de Horário) */}
          <div className="space-y-3 px-1 text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
            <p>
              {motivo || 'O seu período de expediente no sistema terminou. Para garantir a segurança das operações bancárias, a sessão foi encerrada de forma segura.'}
            </p>

            {proximoAcesso && (
              <div className="flex items-center justify-center gap-1.5 py-1 px-3 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-semibold border border-amber-200/60 dark:border-amber-900/50">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{proximoAcesso}</span>
              </div>
            )}

            <p className="font-semibold text-slate-800 dark:text-slate-200 pt-1">
              Caso necessite de mais horário para continuar a trabalhar, por favor contacte o <span className="text-amber-600 dark:text-amber-400 font-bold">Administrador do Sistema</span> para solicitar uma extensão de horário.
            </p>
          </div>

          {/* Botão de copiar texto da SMS */}
          <div className="mt-3.5 flex justify-center">
            <button
              type="button"
              onClick={handleCopiarSMS}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-amber-600 transition-colors"
            >
              {copiado ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Texto da mensagem copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copiar texto da mensagem SMS</span>
                </>
              )}
            </button>
          </div>

          {/* Dois botões inferiores no padrão exato da imagem */}
          <div className="flex items-center gap-3 mt-5">
            {/* Botão Esquerdo: Borda amarela / Fundo branco */}
            <button
              type="button"
              onClick={aoFechar}
              className="flex-1 h-12 rounded-xl border-2 border-amber-500 bg-white hover:bg-amber-50/70 text-amber-600 dark:bg-slate-900 dark:text-amber-400 dark:hover:bg-amber-950/30 font-bold text-sm transition-all focus:outline-none active:scale-[0.98]"
            >
              Entendido
            </button>

            {/* Botão Direito: Amarelo preenchido sólido */}
            <button
              type="button"
              onClick={handleContactarAdmin}
              className="flex-1 h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all shadow-md shadow-amber-500/25 flex items-center justify-center gap-1.5 focus:outline-none active:scale-[0.98]"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Contactar Admin</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
