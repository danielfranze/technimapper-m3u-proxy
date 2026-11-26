import type { Request, Response } from 'express';
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
function registerHdhrRoutes(app: express.Express, ctx: HdhrCtx): void {
    const { getState } = ctx;
    const hdhrConfig = ctx.hdhrConfig || {
        enabled: false,
        friendlyName: null,
        deviceId: '00000000',
        tunerCount: 0,
        warnings: [],
    };

    if (!hdhrConfig.enabled) return;

    const hdhrRouter = express.Router();

    const withBaseUrl =
        (handler: (req: Request, res: Response, baseUrl: string) => void) => (req: Request, res: Response) => {
            const baseUrl = hdhrModule.baseUrlFrom(req.protocol, req.get('host') || '');
            if (!baseUrl) return res.status(400).json({ error: 'Invalid Host header' });
            return handler(req, res, baseUrl);
        };

    hdhrRouter.use((_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    hdhrRouter.get(
        '/discover.json',
        withBaseUrl((_req, res, baseUrl) =>
            res.json(hdhrModule.discoverPayload(baseUrl, hdhrConfig, getState().config.detectedModel)),
        ),
    );
    hdhrRouter.get('/lineup_status.json', (_req: Request, res: Response) => res.json(hdhrModule.LINEUP_STATUS));
    hdhrRouter.get(
        '/lineup.json',
        withBaseUrl((_req, res, baseUrl) => res.json(hdhrModule.lineupPayload(getState().lineupEntries, baseUrl))),
    );

    hdhrRouter.post('/lineup.post', (_req: Request, res: Response) => res.sendStatus(200));

    hdhrRouter.get('/stream/:id', (req: Request, res: Response) => {
        const entry = getState().lineupEntries.find((item) => item.guideNumber === req.params.id);
        if (!entry) return res.status(404).type('text/plain').send('Stream not found');
        return res.redirect(302, entry.url);
    });

    app.use('/hdhr', hdhrRouter);
}

export { registerHdhrRoutes };
