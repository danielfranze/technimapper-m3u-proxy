/**
 * Registers all HTTP routes and the central 404/error handlers.
 */

import type { Express, Request, Response } from 'express';
import type { RouteContext } from '../app-types.js';
import { createErrorHandler } from '../http/middleware.js';
import { registerConfigRoutes } from './config.js';
import { registerHdhrRoutes } from './hdhr.js';
import { registerHealthRoutes } from './health.js';
import { registerMappingRoutes } from './mapping.js';
import { registerMetricsRoutes } from './metrics.js';
import { registerPlaylistRoutes } from './playlist.js';

function registerAllRoutes(app: Express, ctx: RouteContext): void {
    const { logger } = ctx;

    registerHealthRoutes(app, ctx);
    registerConfigRoutes(app, ctx);
    registerMappingRoutes(app, ctx);
    registerPlaylistRoutes(app, ctx);
    registerHdhrRoutes(app, ctx);
    registerMetricsRoutes(app, ctx);

    // 404 for unknown API routes, then central error handler
    app.use('/api', (_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));
    app.use(createErrorHandler(logger));
}

export { registerAllRoutes };
