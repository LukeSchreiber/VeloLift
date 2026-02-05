import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Function to run a command with colored output prefix
function runProcess(name, command, args, cwd, color) {
    console.log(`\x1b[1m\x1b[37m[SYSTEM]\x1b[0m Starting ${name}...`);

    const proc = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) console.log(`${color}[${name}]\x1b[0m ${line}`);
        });
    });

    proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) console.error(`${color}[${name}]\x1b[0m ${line}`);
        });
    });

    return proc;
}

// 1. Start Frontend (Vite)
// frontend is now in a subdirectory 'frontend'
const frontendDir = path.join(rootDir, 'frontend');
const frontend = runProcess(
    'FRONTEND',
    'npm',
    ['run', 'dev', '--', '--host'],
    frontendDir,
    '\x1b[36m' // Cyan
);

// 2. Start Backend (VeloLift Velocity Tracker API)
// backend is now in 'velocitytracker'
const backendDir = path.join(rootDir, 'velocitytracker');
const backend = runProcess(
    'VELOCITY',
    'python3',
    ['run_server.py'], // Adjusted to run main.py directly or via uvicorn if needed
    backendDir,
    '\x1b[32m' // Green
);

// Handle exit
process.on('SIGINT', () => {
    console.log('\n\x1b[1m\x1b[31m[SYSTEM]\x1b[0m Shutting down all systems...');
    frontend.kill();
    backend.kill();
    process.exit();
});
