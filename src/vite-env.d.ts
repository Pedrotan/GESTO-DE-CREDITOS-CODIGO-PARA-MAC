/// <reference types="vite/client" />

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'react/jsx-dev-runtime' {
  export const jsxDEV: any;
  export const Fragment: any;
}



// Definidos pelo vite.config.ts: versão do package.json e identificador da build (aviso de versão nova na web).
declare const __TANGO_APP_VERSION__: string;
declare const __TANGO_BUILD_ID__: string;
