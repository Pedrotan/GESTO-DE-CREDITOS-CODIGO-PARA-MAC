import { useEffect, useState } from 'react';
import { LoadingSkeleton } from './LoadingSkeleton';

interface SplashScreenProps {
  message?: string;
}

export const SplashScreen = ({
  message = "Tango Gestão de Creditos ERP"
}: SplashScreenProps) => {
  const [demorado, setDemorado] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDemorado(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (demorado) return <LoadingSkeleton />;
  return (
  <div
    role="status"
    aria-live="polite"
    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-300 select-none"
  >
    <div className="flex flex-col items-center gap-8">
      {/* Pre-Loader Estilo 1 Ampliado - 3 anéis concêntricos com cores oficiais Tango */}
      <div className="relative w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center">
        {/* Anel Externo - Azul Corporativo Tango (#0f4c81) */}
        <div
          className="absolute inset-0 rounded-full border-[4px] border-transparent border-t-[#0f4c81] animate-[tangoSpin_2s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 6px rgba(15, 76, 129, 0.45))' }}
        />

        {/* Anel Médio - Laranja Vibrante Tango (#F37021) */}
        <div
          className="absolute inset-[14px] sm:inset-[16px] rounded-full border-[4px] border-transparent border-t-[#F37021] animate-[tangoSpinReverse_2.6s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 6px rgba(243, 112, 33, 0.5))' }}
        />

        {/* Anel Interno - Dourado / Âmbar Tango (#f59e0b) */}
        <div
          className="absolute inset-[28px] sm:inset-[32px] rounded-full border-[4px] border-transparent border-t-[#f59e0b] animate-[tangoSpin_1.4s_linear_infinite]"
          style={{ filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.55))' }}
        />

        {/* Núcleo Central: Logótipo institucional */}
        <div className="relative z-10 flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 pointer-events-none">
          <img
            src="/logo.png"
            alt="Tango Logo"
            className="w-14 h-14 sm:w-16 sm:h-16 object-contain opacity-90"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      </div>

      {/* Identidade textual Tango ERP no estilo anterior */}
      <div className="flex flex-col items-center text-center">
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase italic">
          {message}
        </h2>
        <p className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">
          Segurança • Performance • Gestão
        </p>
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
};
