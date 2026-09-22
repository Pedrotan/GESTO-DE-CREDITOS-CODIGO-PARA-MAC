// Deteção do ambiente de execução da aplicação.
// A app corre em três contextos distintos:
//  1. Desktop (Electron)            -> onboarding completo permitido
//  2. Web local / LAN / dev         -> onboarding completo permitido (rede privada)
//  3. Web pública (Vercel)          -> onboarding público BLOQUEADO por segurança
//
// A flag VITE_PUBLIC_WEB é injetada em tempo de build apenas pelo
// scripts/build-vercel.mjs, pelo que os builds desktop e LAN não são afetados.

export const isElectron =
    typeof window !== 'undefined' && !!(window as any).electronAPI;

export const isPublicWebBuild =
    import.meta.env.VITE_PUBLIC_WEB === 'true' && !isElectron;
