'use strict';

const crypto = require('crypto');

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerPlaylistRoutes(app, ctx) {
    const { getState } = ctx;
    const playlistPaths = ctx.playlistPaths || ['/playlist.m3u8', '/playlist.m3u'];

    function playlistEtag(content) {
        return `"${crypto.createHash('sha1').update(content).digest('hex')}"`;
    }

    const servePlaylist = (req, res) => {
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
    playlistPaths.forEach(route => app.get(route, servePlaylist));
}

module.exports = { registerPlaylistRoutes };
