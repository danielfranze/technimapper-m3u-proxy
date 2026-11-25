import { fileURLToPath } from 'node:url';
import path from 'node:path';
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import pkg from '../package.json' with { type: 'json' };

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = '.github/scripts/release-notes.sh';
const hasBash = !spawnSync('bash', ['--version']).error;

const notesFor = (version: string): string => execFileSync('bash', [script, version], { cwd: root, encoding: 'utf8' });

test('CHANGELOG.md has an entry for the current package version (needed by the release workflow)', { skip: !hasBash && 'bash not available' }, () => {
    const notes = notesFor(pkg.version as string);
    assert.ok(notes.trim().length > 0, `CHANGELOG.md needs a section "## [${pkg.version}]"`);
    assert.ok(!/^## \[/m.test(notes), 'release notes must not contain the next version section');
});

test('release-notes.sh prints nothing for an unknown version', { skip: !hasBash && 'bash not available' }, () => {
    assert.equal(notesFor('9.9.9'), '');
});
