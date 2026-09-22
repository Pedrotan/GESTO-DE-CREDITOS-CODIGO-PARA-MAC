import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NaoEncontrado = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-4 text-center overflow-hidden">
      <div className="w-full max-w-6xl animate-in fade-in zoom-in duration-1000 flex flex-col items-center justify-center">
        {/* Top Text - Premium scale */}
        <h2 className="text-3xl md:text-5xl font-medium text-slate-400 mb-2 opacity-80">Oops...</h2>

        {/* Massive 404 - High Presence */}
        <h1 className="text-[120px] md:text-[240px] font-black leading-none text-primary/75 tracking-tighter mb-2 drop-shadow-sm">
          404
        </h1>

        {/* Subtitle - Bold & Clear */}
        <p className="text-xl md:text-3xl font-bold text-slate-700 mb-8 capitalize tracking-widest">
          Página não encontrada
        </p>

        {/* Illustration - Maximized but capped to prevent scroll */}
        <div className="relative mb-8 group w-full flex justify-center">
          <img

            alt="Conexão não encontrada"
            className="w-full max-w-[900px] max-h-[30vh] object-contain drop-shadow-2xl transform transition-all group-hover:scale-[1.02] duration-700"
          />
        </div>

        {/* Action Button - High Impact */}
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-2xl bg-primary px-16 py-5 text-2xl font-bold text-primary-foreground shadow-2xl shadow-primary/20 hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all"
        >
          Voltar ao Início
        </a>
      </div>

      {/* Immersive Branding Footer */}
      <div className="absolute bottom-8 opacity-20 select-none text-center bg-primary px-16 py-5 font-bold  text-primary-foreground shadow-2xl shadow-primary/20">
        <p className="mt-8 text-[9px] text-slate-400 uppercase tracking-[0.2em] font-black">
          Tango Gestão de Créditos • Segurança Máxima
        </p>
      </div>
    </div>
  );
};

export default NaoEncontrado;



