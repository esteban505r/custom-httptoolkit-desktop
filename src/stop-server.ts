import * as ChildProcess from 'child_process';
import * as http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { delay } from '@httptoolkit/util';

import { SERVER_PORTS, checkPortsInUse } from './port-checks.ts';

const execFileAsync = promisify(execFile);

const isRunning = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        if (e.code === 'ESRCH') return false;
        else throw e;
    }
}

export async function stopServer(proc: ChildProcess.ChildProcess, token: string) {
    await softShutdown(token)
        .catch(console.log); // If that fails, continue shutting down anyway

    // In each case, that triggers a clean shutdown. We want to make sure it definitely shuts
    // down though, so we poll the process state, and kill it if it's still running in 3 seconds.

    const deadline = Date.now() + 3000;

    do {
        await delay(100);

        if (Date.now() >= deadline) {
            await hardKill(proc)
                .catch(console.warn); // Not much we can do if this fails really
            break;
        }
    } while (isRunning(proc.pid!))

    // The spawn wrapper can exit while the Node server keeps listening (detached
    // processes on macOS/Linux). Ensure the API/proxy ports are actually free.
    const portsStillInUse = await checkPortsInUse('127.0.0.1', [...SERVER_PORTS]);
    if (portsStillInUse.length > 0) {
        console.log('Server ports still in use, force-killing listeners:', portsStillInUse);
        await killProcessesOnPorts(portsStillInUse).catch(console.warn);
    }
}

function softShutdown(token: string) {
    // We first try to cleanly shut down the server, so it can clean up after itself.
    // On Mac & Linux, we could shut down the server with SIGTERM, with some fiddling to detach it
    // so that we kill the full shell script + node tree. On Windows that's not possible though,
    // because Windows doesn't support signals at all, and even workarounds to inject SIGINT don't
    // seem to work properly from Electron.

    // To handle all this, we send a HTTP request to the GraphQL API instead, which triggers the same thing.
    return new Promise<void>((resolve, reject) => {
        const req = http.request("http://127.0.0.1:45457/shutdown", {
            method: 'POST',
            headers: {
                'origin': 'app://httptoolkit', // CUSTOM: origin matches bundled UI protocol
                'authorization': `Bearer ${token}`
            }
        });
        req.on('error', (e) => {
            console.warn(`Error requesting server shutdown: ${e.message}`);
            // This often happens - not totally clear why, but seems likely that in the race to
            // shut down, the server doesn't successfully send a response first. If the server
            // is not reachable though, it's probably shut down already so we're all good.
            resolve();
        });
        req.end();

        req.on('response', (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Shutdown request received unexpected ${res.statusCode} response`));
                return;
            }

            const responseChunks: Buffer[] = [];
            res.on('data', (data) => responseChunks.push(data));
            res.on('error', reject);
            res.on('end', () => {
                const rawResponseBody = Buffer.concat(responseChunks);
                try {
                    const responseBodyString = rawResponseBody.toString('utf8');
                    const responseBody = JSON.parse(responseBodyString);

                    if (responseBody.success) {
                        resolve();
                    } else {
                        throw new Error(`Server shotdown failed: ${responseBodyString}`);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    });
}

async function killProcessesOnPorts(ports: number[]) {
    if (process.platform === 'win32') {
        for (const port of ports) {
            await new Promise<void>((resolve) => {
                ChildProcess.exec(
                    `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`,
                    () => resolve()
                );
            });
        }
        return;
    }

    for (const port of ports) {
        try {
            const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`]);
            const pids = stdout.trim().split('\n').filter(Boolean);
            for (const pid of pids) {
                process.kill(parseInt(pid, 10), 'SIGKILL');
            }
        } catch (e: any) {
            if (e.code !== 1) throw e; // lsof exit 1 = no matches
        }
    }
}

async function hardKill(proc: ChildProcess.ChildProcess) {
    if (process.platform !== "win32") {
        if (!proc.pid) return;
        try {
            process.kill(-proc.pid, 'SIGTERM');
            await delay(500);
        } catch (e) {
            console.warn('SIGTERM on server process group failed:', e);
        }
        try {
            process.kill(-proc.pid, 'SIGKILL');
        } catch (e) {
            console.warn('SIGKILL on server process group failed:', e);
        }
    } else {
        return new Promise<void>((resolve, reject) => {
            ChildProcess.exec(`taskkill /pid ${proc.pid} /T /F`, (error, stdout, stderr) => {
                if (error) {
                    console.log(stdout);
                    console.log(stderr);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
}