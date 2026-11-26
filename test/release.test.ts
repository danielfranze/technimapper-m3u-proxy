import path from 'node:path';
import { fileURLToPath } from 'node:url';

('use strict');

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import pkg from '../package.json' with { type: 'json' };
import lock from '../package-lock.json' with { type: 'json' };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = '.github/scripts/release-notes.sh';
const hasBash = !spawnSync('bash', ['--version']).error;

const notesFor = (version: string): string => execFileSync('bash', [script, version], { cwd: root, encoding: 'utf8' });

test('package.json and package-lock.json versions match', () => {
    assert.equal(lock.version, pkg.version, 'package-lock.json version must match package.json');
    assert.equal(
        lock.packages['']?.version,
        pkg.version,
        'package-lock.json root package version must match package.json',
    );
});

test('CHANGELOG.md has an entry for the current package version (needed by the release workflow)', {
    skip: !hasBash && 'bash not available',
}, () => {
    const notes = notesFor(pkg.version as string);
    assert.ok(notes.trim().length > 0, `CHANGELOG.md needs a section "## [${pkg.version}]"`);
    assert.ok(!/^## \[/m.test(notes), 'release notes must not contain the next version section');
});

test('release-notes.sh prints nothing for an unknown version', { skip: !hasBash && 'bash not available' }, () => {
    assert.equal(notesFor('9.9.9'), '');
});
