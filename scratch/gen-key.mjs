import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const sshDir = path.join(homedir(), '.ssh');
const keyPath = path.join(sshDir, 'id_ed25519');
const pubPath = `${keyPath}.pub`;

if (!existsSync(keyPath)) {
  execSync(`ssh-keygen -t ed25519 -N "" -f "${keyPath}" -q`);
}

const pubKey = readFileSync(pubPath, 'utf8').trim();
console.log('PUBLIC_KEY:' + pubKey);
