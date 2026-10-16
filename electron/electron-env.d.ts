/// <reference types="node" />

declare module 'nodemailer' {
  const nodemailer: any;
  export = nodemailer;
}

declare module 'bcryptjs' {
  const bcrypt: any;
  export default bcrypt;
  export = bcrypt;
}

declare module 'better-sqlite3-multiple-ciphers' {
  const Database: any;
  export default Database;
  export = Database;
}

declare namespace Electron {
  interface IpcRendererEvent {
    sender: any;
    senderId: number;
    ports: any[];
  }
  interface IpcMainInvokeEvent {
    sender: any;
    senderId: number;
    ports: any[];
  }
  interface OpenDialogOptions {
    properties?: string[];
    [key: string]: any;
  }
  interface SaveDialogOptions {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    [key: string]: any;
  }
}

declare module 'electron' {
  export const app: any;
  export const BrowserWindow: any;
  export const ipcMain: any;
  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, listener: (...args: any[]) => void): void;
    removeListener(channel: string, listener: (...args: any[]) => void): void;
    send(channel: string, ...args: any[]): void;
    sendSync(channel: string, ...args: any[]): any;
    [key: string]: any;
  };
  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: any): void;
  };
  export const dialog: any;
  export const protocol: any;
  export const Menu: any;
  export const safeStorage: any;
  export const Notification: any;
  export const screen: any;
  export const session: any;
  export const shell: any;
  export interface IpcRendererEvent extends Electron.IpcRendererEvent {}
  export interface IpcMainInvokeEvent extends Electron.IpcMainInvokeEvent {}
  export interface OpenDialogOptions extends Electron.OpenDialogOptions {}
}
