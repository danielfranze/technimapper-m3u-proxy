/**
 * Graceful-shutdown helper: coordination between the HTTP server, the running
 * sync and the cron scheduler, extracted from server.ts so it is testable.
 */
import type { Server } from 'http';
interface ShutdownLogger {
    info(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
interface ShutdownDeps {
    server: Server;
    waitForSync: () => Promise<void>;
    stopBackgroundCron: () => void;
    dispose: () => void;
    logger: ShutdownLogger;
    shutdownTimeoutMs: number;
}
/**
 * Performs a graceful shutdown sequence: closes the server, waits for a running
 * sync to finish, then disposes services. Returns after the process should exit.
 * If something still hangs after `shutdownTimeoutMs`, the sequence logs the
 * timeout; callers are expected to exit.
 */
declare function runShutdown(signal: string, deps: ShutdownDeps): Promise<void>;
/**
 * Creates the SIGTERM/SIGINT signal handlers used by the entry point.
 * @param onShutdown Called with the signal name when a shutdown starts.
 */
declare function installShutdownHandlers(onShutdown: (signal: string) => void): void;
export { runShutdown, installShutdownHandlers };
