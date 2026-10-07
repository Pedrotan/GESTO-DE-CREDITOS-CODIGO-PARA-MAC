const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    const asarHtml = path.resolve('release-admin/win-unpacked/resources/app.asar/dist-admin/index-admin.html');
    console.log('Testing with sandbox: false');
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.resolve('release-admin/win-unpacked/resources/app.asar/dist-electron-admin/preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            sandbox: false,
        }
    });

    win.webContents.on('did-fail-load', (event, code, desc, url) => {
        console.log('FAIL:', code, desc, url);
    });

    win.webContents.on('preload-error', (event, preloadPath, error) => {
        console.error('PRELOAD ERROR:', preloadPath, error);
    });

    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log('CONSOLE:', level, message, `(${sourceId}:${line})`);
    });

    win.webContents.on('render-process-gone', (event, details) => {
        console.error('RENDER PROCESS GONE:', details);
        app.quit();
    });

    win.webContents.on('did-finish-load', () => {
        console.log('FINISHED LOADING:', win.webContents.getURL());
        win.webContents.executeJavaScript('document.body.innerHTML').then(html => {
            console.log('BODY HTML LENGTH:', html.length);
            console.log('BODY HTML PREVIEW:', html.slice(0, 300));
            app.quit();
        }).catch(err => {
            console.error('EXECUTE JS ERROR:', err);
            app.quit();
        });
    });

    win.loadFile(asarHtml);
});
