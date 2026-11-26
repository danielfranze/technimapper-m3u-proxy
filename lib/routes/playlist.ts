import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { AppState } from '../state-store.js';

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerPlaylistRoutes(app: Express, ctx: { getState(): AppState; playlistPaths?: string[] }): void {
    const { getState } = ctx;
    const playlistPaths: string[] = ctx.playlistPaths || ['/playlist.m3u8', '/playlist.m3u'];

    function playlistEtag(content: string): string {
        return `"${crypto.createHash('sha1').update(content).digest('hex')}"`;
    }

    const servePlaylist = (req: Request, res: Response) => {
        const snapshot = getState();
        if (snapshot.cachedM3u8 === null) {
            // Never serve an empty playlist: clients that clean up missing channels would delete all of them.
            res.set('Retry-After', '60');
            return res.status(503).type('text/plain').send('Playlist not available: no channels synced or mapped yet.');
        }

        const etag = playlistEtag(snapshot.cachedM3u8);
        res.set('ETag', etag);
        if (req.get('if-none-match') === etag) {
            res.set('Cache-Control', 'no-cache');
            return res.status(304).end();
        }

        res.set('Cache-Control', 'no-cache');
        return res.type('audio/x-mpegurl; charset=utf-8').send(snapshot.cachedM3u8);
    };
    playlistPaths.forEach((route) => {
        app.get(route, servePlaylist);
    });
}

export { registerPlaylistRoutes };
