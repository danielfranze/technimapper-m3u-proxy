'use strict';

import express from 'express';
import * as hdhrModule from '../hdhr.js';

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerHdhrRoutes(app, ctx) {
    const { getState } = ctx;
    const hdhrConfig = ctx.hdhrConfig || { enabled: false };

    if (!hdhrConfig.enabled) return;

    const hdhrRouter = express.Router();

    const withBaseUrl = handler => (req: any, res: any) => {
        const baseUrl = hdhrModule.baseUrlFrom(req.protocol, req.get('host'));
        if (!baseUrl) return res.status(400).json({ error: 'Invalid Host header' });
        return handler(req, res, baseUrl);
    };

    hdhrRouter.use((_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    hdhrRouter.get('/discover.json', withBaseUrl((_req, res, baseUrl) => res.json(hdhrModule.discoverPayload(baseUrl, hdhrConfig, getState().config.detectedModel))));
    hdhrRouter.get('/lineup_status.json', (_req: any, res: any) => res.json(hdhrModule.LINEUP_STATUS));
    hdhrRouter.get('/lineup.json', withBaseUrl((_req, res, baseUrl) => res.json(hdhrModule.lineupPayload(getState().lineupEntries, baseUrl))));

    hdhrRouter.post('/lineup.post', (_req: any, res: any) => res.sendStatus(200));

    hdhrRouter.get('/stream/:id', (req: any, res: any) => {
        const entry = getState().lineupEntries.find(item => item.guideNumber === req.params.id);
        if (!entry) return res.status(404).type('text/plain').send('Stream not found');
        return res.redirect(302, entry.url);
    });

    app.use('/hdhr', hdhrRouter);
}

export { registerHdhrRoutes };
