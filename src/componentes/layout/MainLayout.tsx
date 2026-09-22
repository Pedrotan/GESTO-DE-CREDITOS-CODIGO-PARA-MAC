import React, { ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TickerTaxas } from './TickerTaxas';
import { cn } from '@/bibliotecas/utils';
import { discardDraftsOnRouteChange } from '@/ganchos/usar-rascunho-formulario';

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('tango_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Mudar de página descarta os rascunhos de cadastro em aberto.
  // Fechar a modal (clique fora, Esc ou X) não mexe na rota, por isso nesse
  // caso o que estava preenchido mantém-se e volta ao reabrir o cadastro.
  const location = useLocation();
  useEffect(() => {
    discardDraftsOnRouteChange(location.pathname);
  }, [location.pathname]);

  const handleSetCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem('tango_sidebar_collapsed', String(collapsed));
    } catch {}
  };

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        setCollapsed={handleSetCollapsed}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden animate-in fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300",
          sidebarCollapsed ? "md:ml-20" : "md:ml-56 lg:ml-64",
          "ml-0"
        )}
      >
        {/* Cotações do BNA, acima do cabeçalho */}
        <TickerTaxas />

        <Header
          title={title}
          subtitle={subtitle}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">{children}</main>
        <footer className="shrink-0 border-t p-4 text-center text-[10px] text-muted-foreground/50">
          Desenvolvido por DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA | Cuanza Norte, N´dalatando
        </footer>
      </div>
    </div>
  );
}

