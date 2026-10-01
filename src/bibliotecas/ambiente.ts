// Deteção do ambiente de execução da aplicação.
// A app corre em dois contextos principais:
//  1. Desktop (Electron)            -> ambiente desktop local
//  2. Web (Vercel / Navegador Web)  -> acesso web remoto, exige ativação prévia da empresa via Tango Master Gen

export const isElectron =
    typeof window !== 'undefined' && !!(window as any).electronAPI;

// Qualquer acesso via navegador web (fora do Electron) é tratado como ambiente Web,
// exigindo validação das credenciais emitidas pelo Tango Master Gen
export const isPublicWebBuild =
    !isElectron || import.meta.env.VITE_PUBLIC_WEB === 'true';
