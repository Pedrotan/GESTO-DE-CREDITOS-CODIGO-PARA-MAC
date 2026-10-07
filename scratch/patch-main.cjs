const fs = require('fs');

// 1. Update electron-builder-admin.json
let builderConfig = fs.readFileSync('electron-builder-admin.json', 'utf-8');
builderConfig = builderConfig.replace('"dist-electron-admin/db-worker.cjs"', '"dist-electron-admin/**/*"');
fs.writeFileSync('electron-builder-admin.json', builderConfig, 'utf-8');
console.log('electron-builder-admin.json updated.');

// 2. Update electron/main.ts
let mainTs = fs.readFileSync('electron/main.ts', 'utf-8');
mainTs = mainTs.replace(
    'const disableRendererSandbox = process.env.TANGO_RENDERER_SANDBOX === "false" && !app.isPackaged;',
    'const disableRendererSandbox = process.env.TANGO_RENDERER_SANDBOX !== "true";'
);
mainTs = mainTs.replace(
    'minHeight: minimumWindowSize.height,\n    show: false,',
    'minHeight: minimumWindowSize.height,\n    show: false,\n    backgroundColor: "#020617",'
);
mainTs = mainTs.replace(
    'minHeight: minimumWindowSize.height,\r\n    show: false,',
    'minHeight: minimumWindowSize.height,\r\n    show: false,\r\n    backgroundColor: "#020617",'
);
fs.writeFileSync('electron/main.ts', mainTs, 'utf-8');
console.log('electron/main.ts updated.');
