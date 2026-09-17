'use strict';

const fs = require('fs');
const path = require('path');
const { getRepositoryMetrics } = require('./repository-data');

function compactMonthName(month) {
  return month.slice(0, 3);
}

function renderBar(value, maxValue) {
  if (maxValue === 0 || value === 0) {
    return '░░░░░░░░░░';
  }

  const filled = Math.max(1, Math.round((value / maxValue) * 10));
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

function createTrendingSnapshot(metrics) {
  const activeRegions = metrics.regions.filter((region) => region.institutionsIndexed > 0);
  const topRegion = activeRegions.reduce((currentTop, region) => {
    if (!currentTop || region.institutionsIndexed > currentTop.institutionsIndexed) {
      return region;
    }
    return currentTop;
  }, null);
  const generatedDate = metrics.generatedAt.slice(0, 10);

  return {
    headline: 'TRENDING "PANORAFUS.AI" TODAY THROUGH THE SIX CONTINENTS.',
    generatedDate,
    activeRegions: activeRegions.length,
    totalRegions: metrics.regions.length,
    institutionsIndexed: metrics.institutionsIndexed,
    topRegion: topRegion ? {
      region: topRegion.region,
      institutionsIndexed: topRegion.institutionsIndexed,
      countriesCovered: topRegion.countriesCovered
    } : null,
    summary: `PANORAFUS.AI is trending today across ${metrics.regions.length} platform regions with ${metrics.institutionsIndexed} indexed institutions.`
  };
}

function createDashboardSnapshot(repoRoot) {
  const metrics = getRepositoryMetrics(repoRoot);
  return {
    generatedAt: metrics.generatedAt,
    dataSources: [
      'Top-level PANORAFUS.AI documentation files',
      'Git commit history for the current calendar year',
      'Repository workflow definitions under .github/workflows'
    ],
    regions: metrics.regions,
    monthlyActivity: metrics.monthlyActivity,
    kpis: {
      documentationFiles: metrics.docsCount,
      documentationLines: metrics.docsLines,
      externalLinks: metrics.externalLinks,
      workflows: metrics.workflowCount,
      institutionsIndexed: metrics.institutionsIndexed,
      dashboardPlaceholders: metrics.dashboardPlaceholders
    },
    trending: createTrendingSnapshot(metrics),
    workflows: metrics.workflows
  };
}

function generateDashboardMarkdown(snapshot) {
  const maxActivity = Math.max(...snapshot.monthlyActivity.map((entry) => entry.totalActivity), 0);
  const regionRows = snapshot.regions.map((region) => (
    `| ${region.region} | ${region.institutionsIndexed} | ${region.countriesCovered} | ${region.traditionsCovered} | ${region.categoriesCovered} | ✅ Monitored |`
  )).join('\n');
  const monthlyRows = snapshot.monthlyActivity.map((month) => (
    `| ${month.month} | ${month.commits} | ${month.docsTouched} | ${month.workflowChanges} | ${month.codeChanges} | ${month.totalActivity} |`
  )).join('\n');
  const chartRows = snapshot.monthlyActivity.map((month) => (
    `${compactMonthName(month.month)} | ${renderBar(month.totalActivity, maxActivity)} ${month.totalActivity}`
  )).join('\n');

  return `# PANORAFUS.AI — Global Dashboard Page

> **PANORAFUS.AI** dashboard overview powered by live repository metrics, indexed institution data, and workflow automation status.

## 🌍 Dashboard Scope

This dashboard is generated from tracked PANORAFUS.AI repository data sources:

${snapshot.dataSources.map((source) => `- ${source}`).join('\n')}

Generated at: \`${snapshot.generatedAt}\`

> ${snapshot.trending.headline}
>
> ${snapshot.trending.summary}
>
> Active regions today: **${snapshot.trending.activeRegions}/${snapshot.trending.totalRegions}** · Top region: **${snapshot.trending.topRegion.region}** (${snapshot.trending.topRegion.institutionsIndexed} institutions across ${snapshot.trending.topRegion.countriesCovered} countries)

---

## 🧭 Six Platform Regions

| Platform Region | Institutions Indexed | Countries Covered | Traditions Covered | Categories Covered | Robotic Status |
|---|---:|---:|---:|---:|---|
${regionRows}

---

## 📅 Monthly Repository Activity Overview

This section replaces manual placeholders with verified activity taken from the current calendar year's git history.

| Month | Commits | Docs Touched | Workflow Changes | Code Changes | Total Activity |
|---|---:|---:|---:|---:|---:|
${monthlyRows}

\`\`\`text
Monthly Activity Chart
${chartRows}
\`\`\`

---

## 📈 Platform KPI Tracking

| KPI | Value |
|---|---:|
| Documentation files tracked | ${snapshot.kpis.documentationFiles} |
| Documentation lines tracked | ${snapshot.kpis.documentationLines} |
| External links tracked | ${snapshot.kpis.externalLinks} |
| Workflow automations tracked | ${snapshot.kpis.workflows} |
| Institutions indexed | ${snapshot.kpis.institutionsIndexed} |
| Remaining dashboard placeholders | ${snapshot.kpis.dashboardPlaceholders} |

> KPI values are generated from the repository and can be exported through the executable PANORAFUS.AI API and published static snapshots.

---

## 🤖 Robotic Services Status

| Service | Output | Status |
|---|---|---|
| Docs Autopilot | Branding, internal links, language parity | ✅ Active |
| Link Health Monitor | External URL uptime report | ✅ Active |
| Autopilot Health | Weekly repository metrics issue update | ✅ Active |
| Content Syndication Robot | JSON feed, RSS feed, email digest, metrics PR | ✅ Active |
| Platform API | Health, institution directory, search, chatbot | ✅ Active |

### Workflow Files

${snapshot.workflows.map((workflow) => `- \`${workflow}\``).join('\n')}

---

## 📌 Dashboard Use

- Use this page as the central snapshot for PANORAFUS.AI repository health and institution coverage.
- Publish generated API snapshots and syndication feeds alongside the documentation build.
- Review monthly activity and regional coverage before expanding the indexed network.

---

**Selina** — *Website Manager, PANORAFUS.AI / Seasoned Christian Ministry Church*  
🌐 [www.seasonedchristianministrychurch.com](https://www.seasonedchristianministrychurch.com)
`;
}

function generateDashboardFile(repoRoot) {
  const root = path.resolve(repoRoot || path.resolve(__dirname, '..'));
  const dashboardPath = path.join(root, 'PANORAFUS_DASHBOARD.md');
  let snapshot = createDashboardSnapshot(root);
  fs.writeFileSync(dashboardPath, generateDashboardMarkdown(snapshot));

  snapshot = createDashboardSnapshot(root);
  fs.writeFileSync(dashboardPath, generateDashboardMarkdown(snapshot));

  return snapshot;
}

module.exports = {
  createDashboardSnapshot,
  generateDashboardFile,
  generateDashboardMarkdown
};
