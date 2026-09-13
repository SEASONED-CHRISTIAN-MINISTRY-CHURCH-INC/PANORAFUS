'use strict';

const fs = require('fs');
const path = require('path');
const { createDashboardSnapshot } = require('./dashboard');
const { getRecentContentUpdates } = require('./repository-data');

const SYNDICATION_ITEM_LIMIT = 12;

function xmlEscape(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toGitHubUrl(file) {
  return `https://github.com/jpaul11-code/PANORAFUS/blob/main/${file}`;
}

function readPreviousSyndicationSnapshot(repoRoot) {
  const previousSnapshotPath = path.join(repoRoot, 'public', 'api', 'syndication.json');
  if (!fs.existsSync(previousSnapshotPath)) {
    return { generatedAt: null, items: [] };
  }

  try {
    const snapshot = JSON.parse(fs.readFileSync(previousSnapshotPath, 'utf8'));
    return {
      generatedAt: snapshot.generatedAt || null,
      items: Array.isArray(snapshot.items) ? snapshot.items : []
    };
  } catch (error) {
    return { generatedAt: null, items: [] };
  }
}

function mergeSyndicationItems(currentItems, previousItems, limit = SYNDICATION_ITEM_LIMIT) {
  const dedupeNewest = (items) => {
    const mergedByFile = new Map();

    for (const item of items) {
      if (!item || !item.file) {
        continue;
      }
      const existing = mergedByFile.get(item.file);
      const itemTime = Date.parse(item.committedAt || '') || 0;
      const existingTime = existing ? (Date.parse(existing.committedAt || '') || 0) : -1;
      if (!existing || itemTime > existingTime) {
        mergedByFile.set(item.file, item);
      }
    }

    return mergedByFile;
  };
  const sortByRecency = (items) => [...items].sort((left, right) => {
    const leftTime = Date.parse(left.committedAt || '') || 0;
    const rightTime = Date.parse(right.committedAt || '') || 0;
    return rightTime - leftTime;
  });
  const priorItems = Array.isArray(previousItems) ? previousItems : [];
  const currentByFile = dedupeNewest(currentItems);

  if (priorItems.length === 0) {
    return sortByRecency(currentByFile.values()).slice(0, limit);
  }

  const previousByFile = dedupeNewest(priorItems);
  const publishedFiles = new Set(previousByFile.keys());
  const updatedPublishedItems = sortByRecency(
    [...publishedFiles].map((file) => {
      const currentItem = currentByFile.get(file);
      const previousItem = previousByFile.get(file);
      const currentTime = Date.parse(currentItem?.committedAt || '') || 0;
      const previousTime = Date.parse(previousItem?.committedAt || '') || 0;
      return currentTime > previousTime ? currentItem : previousItem;
    })
  );
  const unpublishedCurrentItems = sortByRecency(
    [...currentByFile.values()].filter((item) => !publishedFiles.has(item.file))
  );
  const availableNewSlots = limit > 0 ? Math.max(1, limit - updatedPublishedItems.length) : 0;

  return sortByRecency([
    ...unpublishedCurrentItems.slice(0, availableNewSlots),
    ...updatedPublishedItems
  ]).slice(0, limit);
}

function createSyndicationSnapshot(repoRoot) {
  const dashboard = createDashboardSnapshot(repoRoot);
  const root = path.resolve(repoRoot || path.resolve(__dirname, '..'));
  const updates = getRecentContentUpdates(root, SYNDICATION_ITEM_LIMIT);
  const previousSnapshot = readPreviousSyndicationSnapshot(root);
  const previousItems = previousSnapshot.items;
  const currentItems = updates.map((item) => ({
    title: item.title,
    summary: item.summary,
    file: item.file,
    committedAt: item.committedAt,
    url: toGitHubUrl(item.file),
    sha: item.sha
  }));

  return {
    generatedAt: dashboard.generatedAt,
    dashboard,
    items: mergeSyndicationItems(currentItems, previousItems, SYNDICATION_ITEM_LIMIT)
  };
}

function createJsonFeed(snapshot) {
  return JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'PANORAFUS.AI Content Syndication Feed',
    home_page_url: 'https://www.seasonedchristianministrychurch.com',
    feed_url: 'https://www.seasonedchristianministrychurch.com/panorafus/syndication/feed.json',
    description: 'Repository-backed PANORAFUS.AI content and metrics updates.',
    items: snapshot.items.map((item) => ({
      id: `${item.file}:${item.sha}`,
      url: item.url,
      title: item.title,
      summary: item.summary,
      date_published: item.committedAt
    }))
  }, null, 2);
}

function createRssFeed(snapshot) {
  const items = snapshot.items.map((item) => `
    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.url)}</link>
      <guid>${xmlEscape(`${item.file}:${item.sha}`)}</guid>
      <pubDate>${new Date(item.committedAt).toUTCString()}</pubDate>
      <description>${xmlEscape(item.summary)}</description>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PANORAFUS.AI Content Syndication Feed</title>
    <link>https://www.seasonedchristianministrychurch.com</link>
    <description>Repository-backed PANORAFUS.AI content and metrics updates.</description>
    <lastBuildDate>${new Date(snapshot.generatedAt).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function createEmailDigest(snapshot) {
  return `# PANORAFUS.AI Weekly Content Digest

Generated at: ${snapshot.generatedAt}

## Dashboard Summary

- Documentation files tracked: ${snapshot.dashboard.kpis.documentationFiles}
- Workflow automations tracked: ${snapshot.dashboard.kpis.workflows}
- Institutions indexed: ${snapshot.dashboard.kpis.institutionsIndexed}

## Recent Content Updates

${snapshot.items.map((item) => `- **${item.title}** — ${item.summary} ([source](${item.url}))`).join('\n')}
`;
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function writeSyndicationArtifacts(repoRoot, outputDir) {
  const root = path.resolve(repoRoot || path.resolve(__dirname, '..'));
  const targetDir = path.resolve(outputDir || path.join(root, 'public', 'syndication'));
  const snapshot = createSyndicationSnapshot(root);
  ensureDir(targetDir);
  fs.writeFileSync(path.join(targetDir, 'feed.json'), createJsonFeed(snapshot));
  fs.writeFileSync(path.join(targetDir, 'feed.xml'), createRssFeed(snapshot));
  fs.writeFileSync(path.join(targetDir, 'email-digest.md'), createEmailDigest(snapshot));
  return snapshot;
}

module.exports = {
  createSyndicationSnapshot,
  mergeSyndicationItems,
  writeSyndicationArtifacts
};
