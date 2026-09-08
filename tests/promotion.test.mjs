import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { GooglePlayPromotion, parsePromotion } from '../packages/google-play/dist/index.js';
const manifest = () => ({ packageName: 'com.example.app', sourceTrack: 'production', destinationTracks: ['alpha', 'beta'], versionCode: '58', sha256: 'a'.repeat(64) });
class Fake {
  calls = [];
  review = false;
  failCommit = false;
  tracks = ['production', 'alpha', 'beta', 'internal'].map(track => ({ track, releases: [{ name: track === 'production' ? '3.0.16' : '3.0.15', status: 'completed', versionCodes: [track === 'production' ? '58' : '57'], releaseNotes: [{ language: 'ko-KR', text: '업데이트' }], inAppUpdatePriority: 2, countryTargeting: { countries: [track === 'production' ? 'US' : 'KR'] } }] }));
  async request(r) {
    this.calls.push(structuredClone(r));
    const p = r.path;
    if (p.endsWith('/releases')) {
      const track = p.split('/').at(-2);
      return { releases: [{ track, releaseLifecycleState: this.review ? 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' : 'RELEASE_LIFECYCLE_STATE_PUBLISHED', activeArtifacts: [{ versionCode: track === 'production' ? 58 : 57 }] }] };
    }
    if (p.endsWith('/edits')) return { id: 'edit1' };
    if (p.endsWith('/edit1')) return { id: 'edit1', expiryTimeSeconds: String(Date.now() / 1000 + 3600) };
    if (p.endsWith('/tracks')) return { tracks: structuredClone(this.tracks) };
    if (p.endsWith('/bundles')) return { bundles: [{ versionCode: 58, sha256: 'a'.repeat(64) }] };
    if (r.method === 'PUT') { this.tracks = this.tracks.map(t => t.track === r.body.track ? structuredClone(r.body) : t); return r.body; }
    if (p.includes(':commit')) { if (this.failCommit) throw new Error('uncertain network outcome'); return {}; }
    if (p.endsWith(':validate')) return {};
    throw new Error(`Unexpected request ${p}`);
  }
}
test('promotion reuses exact bundle for two tracks and preserves source and targeting', async () => {
  const api = new Fake(), play = new GooglePlayPromotion(api), saved = [];
  const save = async j => saved.push(structuredClone(j));
  const source = structuredClone(api.tracks[0]);
  const j = await play.prepare(manifest(), save);
  assert.equal(j.phase, 'prepared');
  assert.equal(api.calls.filter(c => c.method === 'PUT').length, 0);
  await play.validate(j, save);
  await play.submit(j, save);
  assert.deepEqual(api.tracks[0], source);
  for (const t of api.tracks.slice(1, 3)) {
    assert.deepEqual(t.releases[0].versionCodes, ['58']);
    assert.deepEqual(t.releases[0].releaseNotes, source.releases[0].releaseNotes);
    assert.deepEqual(t.releases[0].countryTargeting, { countries: ['KR'] });
    assert.equal(t.releases[0].inAppUpdatePriority, 2);
  }
  assert.equal(api.calls.filter(c => c.path.includes(':commit')).length, 1);
  assert.ok(api.calls.find(c => c.path.endsWith(':commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW')));
  assert.equal(api.calls.filter(c => c.media || (c.method !== 'GET' && /bundles|testers|countryAvailability/.test(c.path))).length, 0);
  assert.deepEqual(saved.map(j => j.phase), ['creating', 'creating', 'prepared', 'validating', 'validated', 'committing', 'committed']);
});
test('review preflight prevents edit creation and review race prevents commit', async () => {
  const api = new Fake(), play = new GooglePlayPromotion(api);
  api.review = true;
  await assert.rejects(play.prepare(manifest(), async () => {}), { code: 'REVIEW_CONFLICT' });
  assert.ok(api.calls.every(c => c.method === 'GET'));
  api.review = false;
  const j = await play.prepare(manifest(), async () => {});
  await play.validate(j, async () => {});
  api.review = true;
  await assert.rejects(play.submit(j, async () => {}), { code: 'REVIEW_CONFLICT' });
  assert.ok(!api.calls.some(c => c.path.includes(':commit')));
});
test('uncertain commit remains committing and cannot be retried', async () => {
  const api = new Fake(), play = new GooglePlayPromotion(api);
  const j = await play.prepare(manifest(), async () => {});
  await play.validate(j, async () => {});
  api.failCommit = true;
  await assert.rejects(play.submit(j, async () => {}));
  assert.equal(j.phase, 'committing');
  await assert.rejects(play.submit(j, async () => {}), { code: 'INVALID_PHASE' });
  assert.equal(api.calls.filter(c => c.path.includes(':commit')).length, 1);
});
test('wrong digest, source, current destination and changed baseline fail closed', async () => {
  for (const fault of ['digest', 'source', 'destination', 'baseline']) {
    const api = new Fake(), play = new GooglePlayPromotion(api), m = manifest();
    if (fault === 'digest') m.sha256 = 'b'.repeat(64);
    if (fault === 'source') api.tracks[0].releases[0].versionCodes = ['56'];
    if (fault === 'destination') api.tracks[1].releases[0].versionCodes = ['58'];
    if (fault !== 'baseline') await assert.rejects(play.prepare(m, async () => {}));
    else {
      const j = await play.prepare(m, async () => {});
      api.tracks[1].releases[0].name = 'concurrent change';
      await assert.rejects(play.validate(j, async () => {}), { code: 'TRACK_CHANGED' });
    }
    assert.ok(!api.calls.some(c => c.method === 'PUT' || c.path.includes(':commit')));
  }
});
test('production destinations and duplicate targets are rejected', () => {
  assert.throws(() => parsePromotion({ ...manifest(), destinationTracks: ['production'] }));
  assert.throws(() => parsePromotion({ ...manifest(), destinationTracks: ['alpha', 'alpha'] }));
});
test('CLI offline promotion plan and command-specific option rejection', () => {
  const args = ['packages/cli/dist/index.js', 'play', 'promote-plan', '--manifest', 'examples/google-play.promotion.json'];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout);
  assert.equal(JSON.parse(result.stdout).remoteVerified, false);
  const invalid = spawnSync(process.execPath, [...args, '--execute'], { encoding: 'utf8' });
  assert.equal(JSON.parse(invalid.stdout).error.code, 'ARGUMENT');
  const write = spawnSync(process.execPath, args.map(a => a === 'promote-plan' ? 'promote-prepare' : a), { encoding: 'utf8' });
  assert.equal(JSON.parse(write.stdout).error.code, 'EXECUTION_REQUIRED');
});
test('every promotion skill example resolves to its specific CLI contract without writes', () => {
  const doc = readFileSync('skills/playstore-publisher/references/promotion.md', 'utf8');
  const examples = doc.split('\n').filter(line => line.startsWith('store-publisher play '));
  assert.equal(examples.length, 4);
  for (const line of examples) {
    const args = line.split(/\s+/).slice(1).filter(v => v !== '--execute').map(v => v === 'promotion.json' ? 'examples/google-play.promotion.json' : v);
    const result = spawnSync(process.execPath, ['packages/cli/dist/index.js', ...args], { encoding: 'utf8' });
    const parsed = JSON.parse(result.stdout);
    if (args[1] === 'promote-plan') assert.equal(parsed.offline, true);
    else assert.equal(parsed.error.code, 'EXECUTION_REQUIRED');
    const invalid = spawnSync(process.execPath, ['packages/cli/dist/index.js', ...args, '--bundletool', 'unused.jar'], { encoding: 'utf8' });
    assert.equal(JSON.parse(invalid.stdout).error.code, 'ARGUMENT');
  }
});
