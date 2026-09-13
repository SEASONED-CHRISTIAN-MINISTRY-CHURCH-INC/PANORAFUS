'use strict';

const fs = require('node:fs');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('node:child_process');
const {
  extractDocumentSummary,
  getInstitutionIndex,
  mergeMonthlyActivity,
  searchInstitutions
} = require('../src/repository-data');
const { createDashboardSnapshot, generateDashboardMarkdown } = require('../src/dashboard');
const { createSyndicationSnapshot, mergeSyndicationItems } = require('../src/syndication');
const { createServer } = require('../src/server');

const repoRoot = path.resolve(__dirname, '..');

test('institution index parses repository-backed entries', () => {
  const institutions = getInstitutionIndex(repoRoot);
  assert.ok(institutions.length > 50);

  const vatican = institutions.find((entry) => entry.institution === 'Holy See (Vatican)');
  assert.ok(vatican);
  assert.equal(vatican.region, 'Europe');

  const searchResults = searchInstitutions(repoRoot, 'Al-Azhar');
  assert.ok(searchResults.some((entry) => entry.institution.includes('Al-Azhar')));
});

test('dashboard generation removes manual placeholders', () => {
  const snapshot = createDashboardSnapshot(repoRoot);
  const markdown = generateDashboardMarkdown(snapshot);
  assert.ok(markdown.includes('PANORAFUS.AI'));
  assert.match(markdown, /TRENDING "PANORAFUS\.AI" TODAY THROUGH THE SIX CONTINENTS\./);
  assert.equal(markdown.includes('TBD'), false);
  assert.ok(snapshot.kpis.institutionsIndexed > 0);
  assert.equal(snapshot.trending.totalRegions, 6);
  assert.equal(snapshot.trending.activeRegions, 6);
  assert.equal(snapshot.trending.topRegion.region, 'Americas');
  const june = snapshot.monthlyActivity.find((entry) => entry.month === 'June');
  const july = snapshot.monthlyActivity.find((entry) => entry.month === 'July');
  assert.ok(june.totalActivity > 0);
  assert.ok(july.totalActivity > 0);
});

test('monthly activity fallback preserves prior metrics by month identity', () => {
  const merged = mergeMonthlyActivity([
    { monthIndex: 5, month: 'June', commits: 0, docsTouched: 0, workflowChanges: 0, codeChanges: 0, totalActivity: 0 },
    { monthIndex: 6, month: 'July', commits: 1, docsTouched: 1, workflowChanges: 0, codeChanges: 0, totalActivity: 2 }
  ], [
    { monthIndex: 6, month: 'July', commits: 41, docsTouched: 62, workflowChanges: 12, codeChanges: 0, totalActivity: 115 },
    { monthIndex: 5, month: 'June', commits: 2, docsTouched: 2, workflowChanges: 0, codeChanges: 0, totalActivity: 4 }
  ]);

  assert.deepEqual(merged, [
    { monthIndex: 5, month: 'June', commits: 2, docsTouched: 2, workflowChanges: 0, codeChanges: 0, totalActivity: 4 },
    { monthIndex: 6, month: 'July', commits: 41, docsTouched: 62, workflowChanges: 12, codeChanges: 0, totalActivity: 115 }
  ]);
});

test('content syndication workflow pushes generated artifacts directly', () => {
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'content-syndication.yml');
  assert.ok(fs.existsSync(workflowPath));
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /git push origin HEAD:\$\{\{ github\.ref_name \}\}/);
  assert.doesNotMatch(workflow, /create-pull-request/);
});

test('platform API serves health, institution, and chatbot responses', async () => {
  const server = createServer({ repoRoot, host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.config.chat.provider, 'local');

    const regionResponse = await fetch(`http://127.0.0.1:${port}/api/institutions/europe`);
    assert.equal(regionResponse.status, 200);
    const region = await regionResponse.json();
    assert.equal(region.filterType, 'region');
    assert.ok(region.total > 0);

    const chatResponse = await fetch(`http://127.0.0.1:${port}/api/chat?q=What does PANORAFUS say about robotic services?`);
    assert.equal(chatResponse.status, 200);
    const chat = await chatResponse.json();
    assert.ok(chat.answer.includes('PANORAFUS.AI'));
    assert.ok(Array.isArray(chat.citations));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('syndication snapshot uses document summaries instead of raw commit subjects', () => {
  const snapshot = createSyndicationSnapshot(repoRoot);
  const aboutPage = snapshot.items.find((item) => item.file === 'ABOUT_PANORAFUS.md');
  assert.ok(aboutPage);
  assert.match(aboutPage.summary, /global devotional platform designed to help people around the world read, search, comment, and discuss the Word of God/i);
  assert.doesNotMatch(aboutPage.summary, /Add devotional PANORAFUS description/i);
  assert.match(aboutPage.committedAt, /Z$/);
});

test('syndication snapshot uses title fallback for short branding-only content', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'panorafus-syndication-'));
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'ABOUT_PANORAFUS.md'), [
      '# About PANORAFUS.AI',
      '',
      'PANORAFUS.AI is a devotional platform carrying the Word of God across the globe with clarity, unity, and purpose.'
    ].join('\n'));
    fs.writeFileSync(path.join(fixtureRoot, 'SUMMARY.md'), [
      '# Summary',
      '',
      'PANORAFUS.AI',
      '',
      'Website: panorafus.ai'
    ].join('\n'));

    execFileSync('git', ['init', '-b', 'main'], { cwd: fixtureRoot });
    execFileSync('git', ['config', 'user.name', 'PANORAFUS Tests'], { cwd: fixtureRoot });
    execFileSync('git', ['config', 'user.email', 'tests@panorafus.local'], { cwd: fixtureRoot });
    execFileSync('git', ['add', 'ABOUT_PANORAFUS.md', 'SUMMARY.md'], { cwd: fixtureRoot });
    execFileSync('git', ['commit', '-m', 'Seed docs'], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-09-06T03:21:43-04:00',
        GIT_COMMITTER_DATE: '2026-09-06T03:21:43-04:00'
      }
    });

    const snapshot = createSyndicationSnapshot(fixtureRoot);
    const summaryPage = snapshot.items.find((item) => item.file === 'SUMMARY.md');
    assert.ok(summaryPage);
    assert.equal(summaryPage.summary, 'Summary');
    assert.equal(summaryPage.committedAt, '2026-09-06T07:21:43Z');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('syndication merge preserves prior items after current updates', () => {
  const merged = mergeSyndicationItems(
    [
      { file: 'ABOUT_PANORAFUS.md', summary: 'Updated about', committedAt: '2026-09-06T17:30:09Z' },
      { file: 'README.md', summary: 'Updated readme', committedAt: '2026-09-06T17:30:09Z' }
    ],
    [
      { file: 'SUMMARY.md', summary: 'Summary', committedAt: '2026-09-06T07:21:43Z' },
      { file: 'README.md', summary: 'Old readme', committedAt: '2026-09-06T07:21:43Z' }
    ],
    3
  );

  assert.deepEqual(merged.map((item) => item.file), ['ABOUT_PANORAFUS.md', 'README.md', 'SUMMARY.md']);
});

test('syndication merge keeps the newest duplicate item per file', () => {
  const merged = mergeSyndicationItems(
    [
      { file: 'README.md', summary: 'Older current readme', committedAt: '2026-09-06T07:21:43Z' }
    ],
    [
      { file: 'README.md', summary: 'Newer previous readme', committedAt: '2026-09-06T17:30:09Z' }
    ],
    1
  );

  assert.equal(merged[0].summary, 'Newer previous readme');
});

test('syndication merge prepends new files without evicting unchanged published items', () => {
  const merged = mergeSyndicationItems(
    [
      { file: 'REIGN_OF_DEATH_ETERNAL_LIFE.md', summary: 'New devotional', committedAt: '2026-09-13T18:10:48Z' },
      { file: 'README.md', summary: 'Updated readme', committedAt: '2026-09-13T18:10:47Z' },
      { file: 'SUMMARY.md', summary: 'Updated summary', committedAt: '2026-09-13T18:10:46Z' }
    ],
    [
      { file: 'README.md', summary: 'Published readme', committedAt: '2026-09-11T19:51:04Z' },
      { file: 'SATANS_VICTORY_SATANS_DEFEAT.md', summary: 'Published satan study', committedAt: '2026-09-13T18:10:44Z' },
      { file: 'SECURITY.md', summary: 'Published security', committedAt: '2026-09-13T18:10:45Z' },
      { file: 'SUMMARY.md', summary: 'Published summary', committedAt: '2026-09-11T19:51:04Z' }
    ],
    5
  );

  assert.deepEqual(merged.map((item) => item.file), [
    'REIGN_OF_DEATH_ETERNAL_LIFE.md',
    'README.md',
    'SUMMARY.md',
    'SECURITY.md',
    'SATANS_VICTORY_SATANS_DEFEAT.md'
  ]);
});

test('syndication merge reorders updated published files by recency', () => {
  const merged = mergeSyndicationItems(
    [
      { file: 'PANORAFUS_DASHBOARD.md', summary: 'Updated dashboard', committedAt: '2026-09-13T18:10:49Z' }
    ],
    [
      { file: 'README.md', summary: 'Published readme', committedAt: '2026-09-13T18:10:48Z' },
      { file: 'REIGN_OF_DEATH_ETERNAL_LIFE.md', summary: 'Published devotional', committedAt: '2026-09-13T18:10:47Z' },
      { file: 'SUMMARY.md', summary: 'Published summary', committedAt: '2026-09-13T18:10:46Z' },
      { file: 'PANORAFUS_DASHBOARD.md', summary: 'Published dashboard', committedAt: '2026-09-13T18:04:07Z' }
    ],
    4
  );

  assert.equal(merged[0].file, 'PANORAFUS_DASHBOARD.md');
  assert.equal(merged[0].summary, 'Updated dashboard');
  assert.equal(merged[1].file, 'README.md');
  assert.equal(merged[2].file, 'REIGN_OF_DEATH_ETERNAL_LIFE.md');
  assert.equal(merged[3].file, 'SUMMARY.md');
});

test('syndication merge respects a zero item limit', () => {
  const merged = mergeSyndicationItems(
    [
      { file: 'REIGN_OF_DEATH_ETERNAL_LIFE.md', summary: 'New devotional', committedAt: '2026-09-13T18:10:48Z' }
    ],
    [
      { file: 'README.md', summary: 'Published readme', committedAt: '2026-09-13T18:10:47Z' }
    ],
    0
  );

  assert.deepEqual(merged, []);
});

test('syndication merge lets a newer unpublished item displace the oldest full-feed entry', () => {
  const merged = mergeSyndicationItems(
    [
      { file: 'REIGN_OF_DEATH_ETERNAL_LIFE.md', summary: 'New devotional', committedAt: '2026-09-13T18:10:48Z' }
    ],
    [
      { file: 'README.md', summary: 'Published readme', committedAt: '2026-09-13T18:10:47Z' },
      { file: 'SUMMARY.md', summary: 'Published summary', committedAt: '2026-09-13T18:10:46Z' },
      { file: 'SATANS_VICTORY_SATANS_DEFEAT.md', summary: 'Published satan study', committedAt: '2026-09-13T18:10:45Z' }
    ],
    3
  );

  assert.deepEqual(merged.map((item) => item.file), [
    'REIGN_OF_DEATH_ETERNAL_LIFE.md',
    'README.md',
    'SUMMARY.md'
  ]);
});

test('syndication snapshot reads previous published items from disk', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'panorafus-snapshot-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'public', 'api'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'ABOUT_PANORAFUS.md'), [
      '# About PANORAFUS.AI',
      '',
      'PANORAFUS.AI is a devotional platform carrying the Word of God across the globe with clarity, unity, and purpose.'
    ].join('\n'));
    fs.writeFileSync(path.join(fixtureRoot, 'SUMMARY.md'), [
      '# Summary',
      '',
      'PANORAFUS.AI',
      '',
      'Website: panorafus.ai'
    ].join('\n'));
    fs.writeFileSync(path.join(fixtureRoot, 'FIRST_THINGS_LAST_THINGS.md'), [
      '# FIRST THINGS - LAST THINGS',
      '',
      'PANORAFUS.AI presents the beginning and the end under the Lordship of Jesus Christ.'
    ].join('\n'));
    fs.writeFileSync(path.join(fixtureRoot, 'public', 'api', 'syndication.json'), JSON.stringify({
      generatedAt: '2026-09-06T08:00:00Z',
      items: [
        {
          title: 'Summary',
          summary: 'Summary',
          file: 'SUMMARY.md',
          committedAt: '2026-09-06T07:21:43Z',
          url: 'https://github.com/jpaul11-code/PANORAFUS/blob/main/SUMMARY.md',
          sha: 'previous-sha'
        }
      ]
    }, null, 2));

    execFileSync('git', ['init', '-b', 'main'], { cwd: fixtureRoot });
    execFileSync('git', ['config', 'user.name', 'PANORAFUS Tests'], { cwd: fixtureRoot });
    execFileSync('git', ['config', 'user.email', 'tests@panorafus.local'], { cwd: fixtureRoot });
    execFileSync('git', ['add', 'ABOUT_PANORAFUS.md', 'FIRST_THINGS_LAST_THINGS.md'], { cwd: fixtureRoot });
    execFileSync('git', ['commit', '-m', 'Seed about'], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-09-06T03:21:43-04:00',
        GIT_COMMITTER_DATE: '2026-09-06T03:21:43-04:00'
      }
    });

    const snapshot = createSyndicationSnapshot(fixtureRoot);
    assert.ok(snapshot.items.some((item) => item.file === 'SUMMARY.md'));
    assert.ok(snapshot.items.some((item) => item.file === 'ABOUT_PANORAFUS.md'));
    assert.ok(snapshot.items.some((item) => item.file === 'FIRST_THINGS_LAST_THINGS.md'));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('document summary fallback uses the title for short branding-only content', () => {
  const summary = extractDocumentSummary([
    '# PANORAFUS.AI',
    '',
    '> **PANORAFUS.AI** — The Pivotal Head of the Global Network',
    '',
    'Website: panorafus.ai'
  ].join('\n'), 'PANORAFUS.AI', 'README.md');

  assert.equal(summary, 'PANORAFUS.AI');
});
