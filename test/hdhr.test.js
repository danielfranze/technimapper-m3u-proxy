'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULTS, LINEUP_STATUS, resolveConfig, modelLabel, sanitizeModel, defaultFriendlyName,
    guideName, buildLineup, baseUrlFrom, discoverPayload, lineupPayload
} = require('../lib/hdhr');

const channels = [
    { name: '001 Das Erste HD', url: 'http://192.168.178.230:9100/disk/a.ts' },
    { name: '002 ZDF HD', url: 'http://192.168.178.230:9100/disk/b.ts' },
    { name: '3sat HD', url: 'http://192.168.178.230:9100/disk/c.ts' },
    { name: '004 Unmapped', url: 'http://192.168.178.230:9100/disk/d.ts' }
];

test('guideName removes a leading channel number but keeps names that start with a digit', () => {
    assert.equal(guideName('001 Das Erste HD'), 'Das Erste HD');
    assert.equal(guideName('12 Sport1'), 'Sport1');
    assert.equal(guideName('3sat HD'), '3sat HD');
    assert.equal(guideName('1-Live'), '1-Live');
    assert.equal(guideName('007'), '007');
    assert.equal(guideName('  RTL  '), 'RTL');
});

test('buildLineup lists only mapped channels, in receiver order, with the mapped ID as GuideNumber', () => {
    const lineup = buildLineup(channels, { '001 Das Erste HD': 1, '002 ZDF HD': '2', '3sat HD': 'ts-ch3' });
    assert.deepEqual(lineup, [
        { guideNumber: '1', guideName: 'Das Erste HD', url: 'http://192.168.178.230:9100/disk/a.ts' },
        { guideNumber: '2', guideName: 'ZDF HD', url: 'http://192.168.178.230:9100/disk/b.ts' },
        { guideNumber: '3', guideName: '3sat HD', url: 'http://192.168.178.230:9100/disk/c.ts' }
    ]);
});

test('buildLineup keeps stream URLs unambiguous: the first channel wins when an ID is used twice', () => {
    const lineup = buildLineup(channels, { '001 Das Erste HD': 5, '002 ZDF HD': 5, '3sat HD': 'ts-ch5' });
    assert.equal(lineup.length, 1);
    assert.equal(lineup[0].guideName, 'Das Erste HD');
});

test('buildLineup skips unsafe stream URLs and prototype-like names', () => {
    const odd = [{ name: 'constructor', url: 'http://192.168.1.1/a.ts' }, { name: 'Bad', url: 'javascript:alert(1)' }, { name: 'Ok', url: 'http://192.168.1.1/ok.ts' }];
    const lineup = buildLineup(odd, { Bad: 1, Ok: 2 });
    assert.deepEqual(lineup.map(e => e.guideName), ['Ok']);
    assert.deepEqual(buildLineup(odd, {}), []);
});

test('baseUrlFrom accepts normal Host headers and rejects anything else', () => {
    assert.equal(baseUrlFrom('http', '192.168.178.11:9191'), 'http://192.168.178.11:9191');
    assert.equal(baseUrlFrom('https', 'mapper.lan'), 'https://mapper.lan');
    assert.equal(baseUrlFrom('http', '[fe80::1]:3000'), 'http://[fe80::1]:3000');
    assert.equal(baseUrlFrom('ftp', 'host'), 'http://host');
    for (const bad of ['evil.com/path', 'a b', 'host@evil.com', 'host:99999x', '', undefined, 'host\r\nX: y', '<script>']) {
        assert.equal(baseUrlFrom('http', bad), null, String(bad));
    }
});

test('discover.json points BaseURL and LineupURL at /hdhr and defaults to 2 tuners', () => {
    const d = discoverPayload('http://192.168.178.11:9191', resolveConfig({}), 'DIGIT ISIO STC');
    assert.equal(d.BaseURL, 'http://192.168.178.11:9191/hdhr');
    assert.equal(d.LineupURL, 'http://192.168.178.11:9191/hdhr/lineup.json');
    assert.equal(d.ModelNumber, 'HDHR4-2DT');
    assert.equal(d.DeviceID, '12345678');
    assert.equal(d.TunerCount, 2);
    assert.equal(d.DeviceAuth, 'technisat123');
});

test('the tuner name is built from the detected model unless a custom name is set', () => {
    const auto = resolveConfig({});
    assert.equal(auto.friendlyName, null);
    assert.equal(discoverPayload('http://h', auto, 'DIGIT ISIO STC').FriendlyName, 'TechniSat DIGIT ISIO STC');
    assert.equal(discoverPayload('http://h', auto, 'DIGIT ISIO S/S1/S2').FriendlyName, 'TechniSat DIGIT ISIO S/S1/S2');
    assert.equal(discoverPayload('http://h', auto, null).FriendlyName, 'TechniSat');
    assert.equal(discoverPayload('http://h', resolveConfig({ HDHR_FRIENDLY_NAME: 'Wohnzimmer' }), 'DIGIT ISIO STC').FriendlyName, 'Wohnzimmer');
    assert.equal(defaultFriendlyName(undefined), 'TechniSat');
});

test('"-" and an empty HDHR_FRIENDLY_NAME mean automatic naming', () => {
    assert.equal(resolveConfig({ HDHR_FRIENDLY_NAME: '-' }).friendlyName, null);
    assert.equal(resolveConfig({ HDHR_FRIENDLY_NAME: '' }).friendlyName, null);
    assert.equal(resolveConfig({ HDHR_FRIENDLY_NAME: '   ' }).friendlyName, null);
    assert.equal(resolveConfig({ HDHR_FRIENDLY_NAME: 'a\r\nb' }).friendlyName, 'a  b');
});

test('modelLabel maps the discovered device type, sanitizeModel only accepts plain short strings', () => {
    assert.equal(modelLabel('STC'), 'DIGIT ISIO STC');
    assert.equal(modelLabel('S_SERIES'), 'DIGIT ISIO S/S1/S2');
    assert.equal(sanitizeModel('DIGIT ISIO STC'), 'DIGIT ISIO STC');
    assert.equal(sanitizeModel('  x\ny  '), 'x y');
    assert.equal(sanitizeModel('a'.repeat(100)).length, 60);
    for (const bad of [null, undefined, 42, {}, '', '   ']) assert.equal(sanitizeModel(bad), null, String(bad));
});

test('lineup.json points every channel at the redirect endpoint below /hdhr/stream', () => {
    const lineup = lineupPayload(buildLineup(channels, { '001 Das Erste HD': 1 }), 'http://h:9191');
    assert.deepEqual(lineup, [{ GuideNumber: '1', GuideName: 'Das Erste HD', URL: 'http://h:9191/hdhr/stream/1' }]);
    assert.deepEqual(lineupPayload([], 'http://h'), []);
    assert.equal(lineupPayload([{ guideNumber: 'a b', guideName: 'x', url: 'http://u' }], 'http://h')[0].URL, 'http://h/hdhr/stream/a%20b');
});

test('lineup_status.json reports an idle tuner that cannot be scanned in progress', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(LINEUP_STATUS)), { ScanInProgress: 0, ScanPossible: 1, Source: 'Cable', SourceList: ['Cable'] });
});

test('resolveConfig applies defaults, accepts valid overrides and warns about invalid ones', () => {
    assert.deepEqual(resolveConfig({}), { enabled: true, friendlyName: null, deviceId: DEFAULTS.deviceId, tunerCount: 2, warnings: [] });
    const ok = resolveConfig({ HDHR_ENABLED: 'false', HDHR_DEVICE_ID: 'abcdef12', HDHR_TUNER_COUNT: '3' });
    assert.deepEqual([ok.enabled, ok.deviceId, ok.tunerCount, ok.warnings.length], [false, 'ABCDEF12', 3, 0]);
    const bad = resolveConfig({ HDHR_DEVICE_ID: 'xyz', HDHR_TUNER_COUNT: '99' });
    assert.equal(bad.deviceId, '12345678');
    assert.equal(bad.tunerCount, 2);
    assert.equal(bad.warnings.length, 2);
});

test('hdhr helpers cover remaining branches', () => {
    const hdhr = require('../lib/hdhr');
    assert.equal(hdhr.modelLabel('S_SERIES'), 'DIGIT ISIO S/S1/S2');
    assert.equal(hdhr.defaultFriendlyName(null), 'TechniSat');
    assert.equal(hdhr.sanitizeModel(''), null);
    assert.equal(hdhr.sanitizeModel('   '), null);
    assert.equal(hdhr.guideName('123'), '123');
    assert.equal(hdhr.guideName('001 Das Erste HD'), 'Das Erste HD');

    const config = hdhr.resolveConfig({ HDHR_DEVICE_ID: 'bad', HDHR_TUNER_COUNT: '99', HDHR_FRIENDLY_NAME: '-' });
    assert.equal(config.deviceId, '12345678');
    assert.equal(config.tunerCount, 2);
    assert.equal(config.friendlyName, null);
    assert.ok(config.warnings.length >= 2);

    const lineup = hdhr.buildLineup(
        [{ name: 'A', url: 'http://192.168.1.20/a' }, { name: 'B', url: 'not a url' }],
        { A: 1, B: 2, Missing: 3 }
    );
    assert.deepEqual(lineup, [{ guideNumber: '1', guideName: 'A', url: 'http://192.168.1.20/a' }]);
});
