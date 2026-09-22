const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

try {
    if (process.platform === 'win32') {
        try {
            execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
        } catch (e) {}
        try {
            execSync('taskkill /F /FI "WINDOWTITLE eq Tango*" /T', { stdio: 'ignore' });
        } catch (e) {}
    }
} catch (e) {}

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

const folders = [
    'Tango Gestão de Creditos ERP',
    'Tango Gestao de Creditos',
    'Tango Gestão de Créditos',
    'Tango Gestao de Creditos ERP',
    'tango-erp',
    'tango-gestao-e-creditos-erp',
    'tango-gestao-erp',
    'AngolaCreditoPro',
    'angola-credito-pro',
    'angola-crédito-pro',
    'angola-cr-dito-pro'
];

folders.forEach(name => {
    const target = path.join(appData, name);
    if (fs.existsSync(target)) {
        try {
            fs.rmSync(target, { recursive: true, force: true });
            console.log('✅ Removido:', target);
        } catch (err) {
            console.warn('⚠️ Erro ao remover:', target, err.message);
        }
    }
});

console.log('🎉 Dados limpos com sucesso! O sistema reiniciará no Onboarding.');
