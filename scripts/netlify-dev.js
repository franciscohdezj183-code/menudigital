import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules', 'netlify-cli', 'bin', 'run.js');
// La ruta relativa evita el doble escapado de comillas que cmd.exe aplica a rutas con espacios.
const targetPort = '5197';
const vite = `node node_modules/vite/bin/vite.js --port ${targetPort} --strictPort`;
const child = spawn(process.execPath, [cli, 'dev', '--command', vite, '--target-port', targetPort, '--no-open', ...process.argv.slice(2)], { cwd: root, env: process.env, stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
