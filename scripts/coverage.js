'use strict';
// Runs the test suite with V8 code coverage and enforces minimum thresholds.
// Usage: node scripts/coverage.js
const { spawnSync } = require('node:child_process');

const thresholds = { lines: 90, branches: 80, functions: 90 };

const result = spawnSync(process.execPath, [
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-exclude=test/**',
    '--test-coverage-exclude=test-helpers/**',
    '--test-coverage-exclude=scripts/**',
    '--test-coverage-exclude=e2e/**'
], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '1', TERM: process.env.TERM || 'xterm-256color' }
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

if (result.status !== 0) {
    process.exit(result.status || 1);
}

// Parse the "all files" summary line, e.g.:
// "ℹ all files |  99.62 |  94.12 |  99.00 |"
const plain = (result.stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
const match = plain.match(/all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
if (!match) {
    console.error('Could not parse coverage summary from test output.');
    process.exit(1);
}

// Per-module advisory: list lib files below 90% line coverage (non-fatal).
const fileLines = plain.matchAll(/^ℹ\s+(\S+\.js)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/gm);
const weak = [];
for (const m of fileLines) {
    const file = m[1];
    const lines = parseFloat(m[2]);
    if (file.startsWith('lib') && lines < 90) weak.push(`${file}: ${lines}%`);
}
if (weak.length) {
    console.log('\nAdvisory: lib files below 90% line coverage:');
    weak.forEach(w => console.log('  - ' + w));
}

const lines = parseFloat(match[1]);
const branches = parseFloat(match[2]);
const functions = parseFloat(match[3]);

console.log(`\nCoverage: lines ${lines}%, branches ${branches}%, functions ${functions}%`);
console.log(`Thresholds: lines ${thresholds.lines}%, branches ${thresholds.branches}%, functions ${thresholds.functions}%`);

let failed = false;
if (lines < thresholds.lines) { console.error(`Lines coverage ${lines}% below threshold ${thresholds.lines}%`); failed = true; }
if (branches < thresholds.branches) { console.error(`Branch coverage ${branches}% below threshold ${thresholds.branches}%`); failed = true; }
if (functions < thresholds.functions) { console.error(`Function coverage ${functions}% below threshold ${thresholds.functions}%`); failed = true; }

if (failed) process.exit(1);
console.log('Coverage thresholds met.');