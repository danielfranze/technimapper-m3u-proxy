'use strict';

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerPlaylistRoutes(app, ctx) {
    const { getState } = ctx;
    const playlistPaths = ctx.playlistPaths || ['/playlist.m3u8', '/playlist.m3u'];

    const servePlaylist = (req, res) => {
        const snapshot = getState();
        if (snapshot.cachedM3u8 === null) {
            res.set('Retry-After', '60');
            return res.status(503).type('text/plain').send('Playlist not available: no channels synced or mapped yet.');
        }
        res.set('Cache-Control', 'no-cache');
        return res.type('audio/x-mpegurl; charset=utf-8').send(snapshot.cachedM3u8);
    };
    playlistPaths.forEach(route => app.get(route, servePlaylist));
}

module.exports = { registerPlaylistRoutes };
