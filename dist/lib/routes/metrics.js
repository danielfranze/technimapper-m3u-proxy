'use strict';
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerMetricsRoutes(app, ctx) {
    const { getState, metrics, syncCoordinator } = ctx;
    app.get('/metrics', (req, res) => {
        const snapshot = getState();
        res.type('text/plain; version=0.0.4');
        res.send(`# HELP technimapper_http_requests_total Total HTTP requests\n` +
            `# TYPE technimapper_http_requests_total counter\n` +
            `technimapper_http_requests_total ${metrics.httpRequests}\n` +
            `# HELP technimapper_http_errors_total Total HTTP responses with status >= 400\n` +
            `# TYPE technimapper_http_errors_total counter\n` +
            `technimapper_http_errors_total ${metrics.httpErrors}\n` +
            `# HELP technimapper_sync_runs_total Successful sync runs\n` +
            `# TYPE technimapper_sync_runs_total counter\n` +
            `technimapper_sync_runs_total ${metrics.syncRuns}\n` +
            `# HELP technimapper_sync_failures_total Failed sync runs\n` +
            `# TYPE technimapper_sync_failures_total counter\n` +
            `technimapper_sync_failures_total ${metrics.syncFailures}\n` +
            `# HELP technimapper_sync_duration_ms Last sync duration in milliseconds\n` +
            `# TYPE technimapper_sync_duration_ms gauge\n` +
            `technimapper_sync_duration_ms ${metrics.syncDurationMs}\n` +
            `# HELP technimapper_configured Whether a receiver configuration exists\n` +
            `# TYPE technimapper_configured gauge\n` +
            `technimapper_configured ${snapshot.configured ? 1 : 0}\n` +
            `# HELP technimapper_channels_total Receiver channels in the last sync\n` +
            `# TYPE technimapper_channels_total gauge\n` +
            `technimapper_channels_total ${snapshot.config.channels.length}\n` +
            `# HELP technimapper_sync_queue_length Pending sync requests\n` +
            `# TYPE technimapper_sync_queue_length gauge\n` +
            `technimapper_sync_queue_length ${syncCoordinator.queueLength}\n`);
    });
}
export { registerMetricsRoutes };
//# sourceMappingURL=metrics.js.map