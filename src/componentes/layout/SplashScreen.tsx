interface SplashScreenProps {
  message?: string;
}

export const SplashScreen = ({
  message = "Tango Gestão de Creditos ERP"
}: SplashScreenProps) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-300 select-none"
  >
    <div className="flex flex-col items-center gap-7">
      {/* Pre-Loader Estilo 1 Ampliado - 150px com 3 anéis concêntricos */}
      <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center">
        {/* Anel Externo - Azul Corporativo Tango (#0f4c81) */}
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#0f4c81] animate-[tangoSpin_2s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 6px rgba(15, 76, 129, 0.4))' }}
        />

        {/* Anel Médio - Laranja Vibrante Tango (#F37021) */}
        <div
          className="absolute inset-[10px] sm:inset-[12px] rounded-full border-4 border-transparent border-t-[#F37021] animate-[tangoSpinReverse_2.8s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 6px rgba(243, 112, 33, 0.45))' }}
        />

        {/* Anel Interno - Dourado / Âmbar Tango (#f59e0b) */}
        <div
          className="absolute inset-[22px] sm:inset-[26px] rounded-full border-4 border-transparent border-t-[#f59e0b] animate-[tangoSpin_1.4s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))' }}
        />

        {/* Núcleo Central: Logótipo institucional */}
        <div className="relative z-10 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 pointer-events-none">
          <img
            src="/logo.png"
            alt="Tango Logo"
            className="w-10 h-10 sm:w-12 sm:h-12 object-contain opacity-90"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      </div>

      {/* Identidade textual Tango ERP no estilo anterior */}
      <div className="flex flex-col items-center text-center">
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase italic">
          {message}
        </h2>
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
