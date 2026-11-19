import { useEffect, useState } from 'react';
import './carregamento.css';

/** Depois deste tempo o esqueleto explica a demora e oferece recarregar (ex.: ligação à internet em baixo). */
const DEMORA_MS = 15_000;

function useEstadoLigacao() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [demorado, setDemorado] = useState(false);
  useEffect(() => {
    const ligado = () => setOffline(false);
    const desligado = () => setOffline(true);
    window.addEventListener('online', ligado);
    window.addEventListener('offline', desligado);
    const temporizador = window.setTimeout(() => setDemorado(true), DEMORA_MS);
    return () => { window.removeEventListener('online', ligado); window.removeEventListener('offline', desligado); window.clearTimeout(temporizador); };
  }, []);
  return { offline, demorado };
}

export function LoadingSkeleton() {
  const { offline, demorado } = useEstadoLigacao();
  const aviso = offline
    ? 'Sem ligação à internet. O sistema continua sozinho assim que a ligação voltar.'
    : demorado
      ? 'O servidor está a demorar a responder. Verifique a ligação à internet ou tente novamente.'
      : null;
  return (
    <div className="tango-skeleton" role="status" aria-live="polite" aria-busy="true" aria-label="A carregar o sistema">
      <aside className="tango-skeleton-sidebar" aria-hidden="true">
        <span className="tango-skeleton-block tango-skeleton-brand" />
        {Array.from({ length: 7 }, (_, index) => <span key={index} className="tango-skeleton-block tango-skeleton-nav" />)}
      </aside>
      <div className="tango-skeleton-main">
        <div aria-hidden="true">
          <div className="tango-skeleton-header"><span className="tango-skeleton-block tango-skeleton-heading" /><span className="tango-skeleton-block tango-skeleton-avatar" /></div>
          <span className="tango-skeleton-block tango-skeleton-caption" />
          <div className="tango-skeleton-cards">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="tango-skeleton-card"><span className="tango-skeleton-block" /><span className="tango-skeleton-block" /></div>)}
          </div>
          <div className="tango-skeleton-table">
            {Array.from({ length: 6 }, (_, index) => <span key={index} className="tango-skeleton-block tango-skeleton-row" />)}
          </div>
        </div>
        <p className="tango-skeleton-message">A preparar o sistema. Aguarde um momento…</p>
        {aviso && (
          <div className="tango-skeleton-aviso">
            <span>{aviso}</span>
            {!offline && <button type="button" className="tango-skeleton-botao" onClick={() => window.location.reload()}>Tentar novamente</button>}
          </div>
        )}
      </div>
    </div>
  );
}
