'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHdhrRoutes = registerHdhrRoutes;
const express_1 = __importDefault(require("express"));
const hdhrModule = __importStar(require("../hdhr.js"));
/**
 * @param {import('express').Express} app
 * @param {any} ctx
 */
function registerHdhrRoutes(app, ctx) {
    const { getState } = ctx;
    const hdhrConfig = ctx.hdhrConfig || { enabled: false };
    if (!hdhrConfig.enabled)
        return;
    const hdhrRouter = express_1.default.Router();
    const withBaseUrl = handler => (req, res) => {
        const baseUrl = hdhrModule.baseUrlFrom(req.protocol, req.get('host'));
        if (!baseUrl)
            return res.status(400).json({ error: 'Invalid Host header' });
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
        if (!entry)
            return res.status(404).type('text/plain').send('Stream not found');
        return res.redirect(302, entry.url);
    });
    app.use('/hdhr', hdhrRouter);
}
//# sourceMappingURL=hdhr.js.map