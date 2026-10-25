import './carregamento.css';

export function LoadingSkeleton() {
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
      </div>
    </div>
  );
}
