/// <reference types="vite/client" />

declare module 'react' {
  export type ReactNode = any;
  export type FC<P = {}> = (props: P) => any;
  export interface CSSProperties { [key: string]: any; }
  const React: any;
  export default React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  type Element = any;
}
