import express from 'express';
import * as hdhrModule from '../hdhr.js';
import type { AppState } from '../state-store.js';
interface HdhrCtx {
    getState(): AppState;
    hdhrConfig?: hdhrModule.HdhrConfig;
}
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
declare function registerHdhrRoutes(app: express.Express, ctx: HdhrCtx): void;
export { registerHdhrRoutes };
