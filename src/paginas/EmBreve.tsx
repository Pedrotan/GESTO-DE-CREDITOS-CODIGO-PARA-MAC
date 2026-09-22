import { MainLayout } from '@/componentes/layout/MainLayout';
import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  subtitle: string;
}

export default function ComingSoon({ title, subtitle }: ComingSoonProps) {
  return (
    <MainLayout title={title} subtitle={subtitle}>
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="card-elevated p-12 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-secondary/20">
            <Construction className="h-10 w-10 text-secondary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground">Em Desenvolvimento</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Esta funcionalidade está em desenvolvimento e estará disponível em breve.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}




