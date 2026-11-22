'use strict';

const express = require('express');
const hdhrModule = require('../hdhr.js');

/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerHdhrRoutes(app, ctx) {
    const { getState } = ctx;
    const hdhrConfig = ctx.hdhrConfig || { enabled: false };

    if (!hdhrConfig.enabled) return;

    const hdhrRouter = express.Router();

    const withBaseUrl = handler => (req, res) => {
        const baseUrl = hdhrModule.baseUrlFrom(req.protocol, req.get('host'));
        if (!baseUrl) return res.status(400).json({ error: 'Invalid Host header' });
        return handler(req, res, baseUrl);
    };

    hdhrRouter.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    hdhrRouter.get('/discover.json', withBaseUrl((req, res, baseUrl) => res.json(hdhrModule.discoverPayload(baseUrl, hdhrConfig, getState().config.detectedModel))));
    hdhrRouter.get('/lineup_status.json', (req, res) => res.json(hdhrModule.LINEUP_STATUS));
    hdhrRouter.get('/lineup.json', withBaseUrl((req, res, baseUrl) => res.json(hdhrModule.lineupPayload(getState().lineupEntries, baseUrl))));

    hdhrRouter.post('/lineup.post', (req, res) => res.sendStatus(200));

    hdhrRouter.get('/stream/:id', (req, res) => {
        const entry = getState().lineupEntries.find(item => item.guideNumber === req.params.id);
        if (!entry) return res.status(404).type('text/plain').send('Stream not found');
        return res.redirect(302, entry.url);
    });

    app.use('/hdhr', hdhrRouter);
}

module.exports = { registerHdhrRoutes };
