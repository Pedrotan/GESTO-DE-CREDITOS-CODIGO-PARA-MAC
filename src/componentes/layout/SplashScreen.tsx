export const SplashScreen = () => (
  <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-[9999] animate-in fade-in duration-500">
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-pulse"></div>
        <div className="absolute inset-0 border-t-4 border-primary rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <img src="/logo.png" alt="" className="w-12 h-12 opacity-50 grayscale" onError={(e) => e.currentTarget.style.display = 'none'} />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase italic">Tango Gestão de Creditos ERP</h2>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-32 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out_infinite]"></div>
          </div>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Segurança • Performance • Gestão</p>
      </div>
    </div>
    <style>{`
      @keyframes loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `}</style>
  </div>
);
