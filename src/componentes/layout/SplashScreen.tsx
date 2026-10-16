interface SplashScreenProps {
  message?: string;
  submessage?: string;
}

export const SplashScreen = ({
  message = "Tango Gestão de Créditos",
  submessage = "A carregar…"
}: SplashScreenProps) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-300 select-none"
  >
    <div className="flex flex-col items-center gap-6">
      {/* Pre-Loader Estilo 1 - Três anéis concêntricos com cores oficiais Tango */}
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Anel Externo - Azul Corporativo Tango (#0f4c81) */}
        <div
          className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#0f4c81] animate-[tangoSpin_2s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 4px rgba(15, 76, 129, 0.35))' }}
        />

        {/* Anel Médio - Laranja Vibrante Tango (#F37021) */}
        <div
          className="absolute inset-[6px] rounded-full border-[3px] border-transparent border-t-[#F37021] animate-[tangoSpinReverse_2.8s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 4px rgba(243, 112, 33, 0.4))' }}
        />

        {/* Anel Interno - Dourado / Âmbar Tango (#f59e0b) */}
        <div
          className="absolute inset-[14px] rounded-full border-[3px] border-transparent border-t-[#f59e0b] animate-[tangoSpin_1.4s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.45))' }}
        />

        {/* Núcleo Central: Logótipo institucional sutil */}
        <div className="relative z-10 flex items-center justify-center w-8 h-8 pointer-events-none">
          <img
            src="/logo.png"
            alt="Tango Logo"
            className="w-7 h-7 object-contain opacity-85"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      </div>

      {/* Identidade textual Tango ERP */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-wider uppercase">
          {message}
        </h2>
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F37021] animate-ping" />
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-400 tracking-widest uppercase">
            {submessage}
          </p>
        </div>
      </div>
    </div>

    <style>{`
      @keyframes tangoSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes tangoSpinReverse {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(-360deg); }
      }
    `}</style>
  </div>
);
