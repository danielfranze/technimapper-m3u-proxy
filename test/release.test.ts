'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync, spawnSync } = require('node:child_process');
const pkg = require('../package.json');

const root = path.join(__dirname, '..');
const script = '.github/scripts/release-notes.sh';
const hasBash = !spawnSync('bash', ['--version']).error;

const notesFor = (version) => execFileSync('bash', [script, version], { cwd: root, encoding: 'utf8' });

test('CHANGELOG.md has an entry for the current package version (needed by the release workflow)', { skip: !hasBash && 'bash not available' }, () => {
    const notes = notesFor(pkg.version);
    assert.ok(notes.trim().length > 0, `CHANGELOG.md needs a section "## [${pkg.version}]"`);
    assert.ok(!/^## \[/m.test(notes), 'release notes must not contain the next version section');
});

test('release-notes.sh prints nothing for an unknown version', { skip: !hasBash && 'bash not available' }, () => {
    assert.equal(notesFor('9.9.9'), '');
});
