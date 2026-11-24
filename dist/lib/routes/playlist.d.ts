import type { Express } from 'express';
import type { AppState } from '../state-store.js';
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
declare function registerPlaylistRoutes(app: Express, ctx: {
    getState(): AppState;
    playlistPaths?: string[];
}): void;
export { registerPlaylistRoutes };
