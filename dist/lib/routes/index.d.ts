/**
 * Route registration for all HTTP routes.
 *
 * Re-exported from the individual modules for backwards compatibility; see
 * `registerAllRoutes()` below.
 */
import type { Express } from 'express';
import type { RouteContext } from '../app/types.js';
declare function registerAllRoutes(app: Express, ctx: RouteContext): void;
export { registerAllRoutes };
