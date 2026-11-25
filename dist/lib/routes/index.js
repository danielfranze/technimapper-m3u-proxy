'use strict';
import { registerHealthRoutes } from './health.js';
import { registerConfigRoutes } from './config.js';
import { registerMappingRoutes } from './mapping.js';
import { registerPlaylistRoutes } from './playlist.js';
import { registerHdhrRoutes } from './hdhr.js';
import { registerMetricsRoutes } from './metrics.js';
function registerAllRoutes(app, ctx) {
    const { logger } = ctx;
    registerHealthRoutes(app, ctx);
    registerConfigRoutes(app, ctx);
    registerMappingRoutes(app, ctx);
    registerPlaylistRoutes(app, ctx);
    registerHdhrRoutes(app, ctx);
    registerMetricsRoutes(app, ctx);
    // 404 for unknown API routes, then central error handler
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
    app.use(createErrorHandlerFrom(logger));
}
// Lazy indirection so the error handler stays a separate concern.
import { createErrorHandler } from '../http-security.js';
function createErrorHandlerFrom(logger) {
    return createErrorHandler({ error(...args) { logger.error(...args); } });
}
export { registerAllRoutes };
//# sourceMappingURL=index.js.map