import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
// Check if --custom or custom parameter is present
const isCustom = args.includes('--custom');

if (isCustom) {
  console.log("Starting full custom build & clean process...");

  // 1. Clean folders
  const folders = ['release', 'release-admin', 'dist', 'dist-admin', 'dist-electron', 'dist-electron-admin'];
  const rootDir = process.cwd();
  for (const folder of folders) {
    try {
      const folderPath = join(rootDir, folder);
      rmSync(folderPath, { recursive: true, force: true });
      console.log(`Deleted folder: ${folderPath}`);
    } catch (e) {
      console.error(`Error deleting folder ${folder}:`, e.message);
    }
  }

  // Helper to execute commands
  const runCmd = (cmd, cmdArgs) => {
    console.log(`Executing: ${cmd} ${cmdArgs.join(' ')}`);
    const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: true });
    if (res.status !== 0) {
      console.error(`Error: Command '${cmd} ${cmdArgs.join(' ')}' failed with exit code ${res.status}`);
      process.exit(res.status || 1);
    }
  };

  // 2. Stop running apps
  console.log("Stopping active application processes...");
  runCmd('powershell', ['-noprofile', '-command', '"Stop-Process -Name Tango*, Angola*, rcedit-x64 -Force -ErrorAction SilentlyContinue"']);

  // 3. Build ERP
  console.log("--- BUILDING ERP CLIENT ---");
  runCmd('npx', ['vite', 'build']);
  
  console.log("--- BUILDING ERP ELECTRON ---");
  runCmd('npm', ['run', 'build:electron']);
  
  console.log("--- PACKAGING ERP EXE ---");
  runCmd('npx', ['electron-builder', '--win', 'nsis']);

  // 4. Build MASTER/ADMIN
  console.log("--- BUILDING MASTER CLIENT ---");
  runCmd('npx', ['vite', 'build', '--config', 'vite.config.admin.ts']);
  
  console.log("--- BUILDING MASTER ELECTRON ---");
  runCmd('npm', ['run', 'build:electron:admin']);
  
  console.log("--- PACKAGING MASTER EXE ---");
  runCmd('npx', ['electron-builder', '--config', 'electron-builder-admin.json', '--win', 'nsis']);

  console.log("All builds completed successfully!");
} else {
  // Normal Vite build
  console.log("Running standard vite build...");
  const cleanArgs = args.filter(a => a !== '--custom');
  const res = spawnSync('npx', ['vite', 'build', ...cleanArgs], { stdio: 'inherit', shell: true });
  process.exit(res.status || 0);
}
