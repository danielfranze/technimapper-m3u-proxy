/**
 * Graceful-shutdown helper: coordination between the HTTP server, the running
 * sync and the cron scheduler, extracted from server.ts so it is testable.
 */
/**
 * Performs a graceful shutdown sequence: closes the server, waits for a running
 * sync to finish, then disposes services. Returns after the process should exit.
 * If something still hangs after `shutdownTimeoutMs`, the sequence logs the
 * timeout; callers are expected to exit.
 */
async function runShutdown(signal, deps) {
    const { server, waitForSync, stopBackgroundCron, dispose, logger, shutdownTimeoutMs } = deps;
    logger.info(`${signal} received - shutting down gracefully.`);
    stopBackgroundCron();
    const hardStop = setTimeout(() => {
        logger.error('Graceful shutdown timed out - forcing exit.');
    }, shutdownTimeoutMs);
    hardStop.unref();
    try {
        await new Promise((resolve) => {
            server.close(async () => {
                try {
                    await waitForSync(); // let a running sync finish (and persist) first
                }
                catch (err) {
                    logger.error('Running sync failed during shutdown:', err instanceof Error ? err.message : String(err));
                }
                resolve();
            });
            if (typeof server.closeIdleConnections === 'function')
                server.closeIdleConnections();
        });
    }
    finally {
        try {
            dispose();
        }
        catch {
            /* ignore */
        }
        clearTimeout(hardStop);
    }
}
/**
 * Creates the SIGTERM/SIGINT signal handlers used by the entry point.
 * @param onShutdown Called with the signal name when a shutdown starts.
 */
function installShutdownHandlers(onShutdown) {
    process.on('SIGTERM', () => onShutdown('SIGTERM'));
    process.on('SIGINT', () => onShutdown('SIGINT'));
}
export { installShutdownHandlers, runShutdown };
//# sourceMappingURL=shutdown.js.map