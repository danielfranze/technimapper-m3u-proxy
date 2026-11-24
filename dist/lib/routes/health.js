'use strict';
/**
 * Health endpoints.
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerHealthRoutes(app, ctx) {
    const { getState, version } = ctx;
    function healthPayload() {
        const snapshot = getState();
        const hasPlaylist = snapshot.cachedM3u8 !== null;
        const status = !snapshot.configured || (hasPlaylist && snapshot.sync.consecutiveFailures < 3) ? 'ok' : 'degraded';
        return {
            status,
            version,
            configured: snapshot.configured,
            playlistAvailable: hasPlaylist,
            lastSync: snapshot.config.lastSync,
            lastAttemptAt: snapshot.sync.lastAttemptAt,
            lastError: snapshot.sync.lastError,
            lastErrorAt: snapshot.sync.lastErrorAt,
            lastDurationMs: snapshot.sync.lastDurationMs,
            consecutiveFailures: snapshot.sync.consecutiveFailures,
            channels: snapshot.config.channels.length,
            mappedChannels: Object.keys(snapshot.config.mapping).length,
            uptimeSeconds: Math.round(process.uptime()),
            syncQueueLength: ctx.syncCoordinator.queueLength,
            syncBackoffMs: ctx.syncCoordinator.backoffRemainingMs()
        };
    }
    app.get('/health', (req, res) => res.json(healthPayload()));
    app.get('/health/live', (req, res) => {
        res.json({ status: 'ok', version, uptimeSeconds: Math.round(process.uptime()) });
    });
    app.get('/health/ready', (req, res) => {
        const payload = healthPayload();
        const ready = !getState().configured || (payload.playlistAvailable && payload.status === 'ok');
        res.status(ready ? 200 : 503).json({ ...payload, status: ready ? payload.status : 'degraded' });
    });
}
export { registerHealthRoutes };
//# sourceMappingURL=health.js.map