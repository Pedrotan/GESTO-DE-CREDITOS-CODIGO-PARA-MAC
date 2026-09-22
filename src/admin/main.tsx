import "@/bibliotecas/suppress-warnings";
import React from 'react';
import ReactDOM from 'react-dom/client';
import AppAdmin from './AppAdmin.tsx';
import { ErrorBoundary } from '@/componentes/ErrorBoundary';
import '@/index.css';
import { installStructuredConsole } from '@/bibliotecas/logger-estruturado';

installStructuredConsole('tango-master-renderer');

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <AppAdmin />
        </ErrorBoundary>
    </React.StrictMode>,
);
