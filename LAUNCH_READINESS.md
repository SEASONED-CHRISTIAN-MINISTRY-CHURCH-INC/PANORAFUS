# PANORAFUS.AI Launch Readiness & Wix Handoff

This checklist distinguishes repository changes from external account and deployment work. It is an implementation handoff, not confirmation that PANORAFUS.COM or PANORAFUS.AI is live.

## Current go/no-go

**NO-GO for a public launch claim or production Wix/GitHub synchronization.** Repository work can be reviewed and tested, but domain ownership, Wix configuration, production hosting, DNS, Cloudflare routing, and live endpoints have not been verified. The intended GitHub-to-Wix data and publishing behavior also needs an authorized owner decision.

## Verified repository findings

- The application is a Node.js HTTP server started with `npm start`. It currently serves the platform API and static files; Wix functionality was not present.
- `POST /webhooks/github` now verifies GitHub's `X-Hub-Signature-256` against the exact raw request body using `PANORAFUS_GITHUB_WEBHOOK_SECRET`. It rejects unconfigured or invalid requests, limits bodies to 1 MiB, handles `ping`, and only acknowledges `ping` and `push`.
- A verified `push` is deliberately acknowledged with `processed: false`. No Wix API calls, content publication, or other side effects are implemented.
- The Cloudflare Worker forwards exactly `/webhooks/github` to `PANORAFUS_API_ORIGIN` without caching. The checked-in `infra/cloudflare/wrangler.toml` still uses `https://api.example.com` for that origin; it is a placeholder, not a supported live URL.
- The Worker’s checked-in static origin points to the organization’s GitHub Pages URL, but Pages configuration and live reachability still need administrator verification.
- `.github/workflows/mdbook.yml` builds the English, Spanish, French, Portuguese, and Arabic books on main pushes. Pages setup, artifact upload, and deployment are conditional on manual `workflow_dispatch`; this repository does not establish that a public book deployment has completed.
- PANORAFUS.COM is the user-confirmed target domain. Ownership, registrar, DNS, and Wix connection are not established by repository files. PANORAFUS.AI is project branding; domain ownership/configuration is unverified.

## Selina’s Wix and domain handoff

Use delegated, least-privilege access through the organization’s approved account process. Do not share passwords, payment details, or real secrets in issues, chat, commits, or this document.

1. **Confirm account ownership and decision makers.** An authorized domain/registrar administrator must verify control of PANORAFUS.COM and identify who can approve DNS changes. Selina should confirm her Wix site-manager permissions and whether Wix will host the primary public site. Verify PANORAFUS.AI separately before using it as a live domain.
2. **Choose the hosting layout.** Decide whether Wix hosts the public pages, whether mdBook stays on GitHub Pages (possibly on a separate subdomain), and which provider will run the Node API. Wix page hosting alone does not run this Node server. Do not point GitHub’s webhook at a Wix page unless an explicitly configured Wix integration or proxy supports the route.
3. **Prepare the site in Wix.** The authorized Wix administrator should select/confirm the site, grant Selina only the role needed to edit and publish, configure the approved brand/content, and connect the domain using the exact DNS instructions shown in Wix for the selected site. Record existing DNS and preserve mail-related MX/TXT records; do not replace nameservers or records without approval. Wait for DNS and HTTPS certificate provisioning before public acceptance tests.
4. **Prepare the API host.** Deploy this repository’s Node server with `npm start` (or its container) to a maintained HTTPS-capable host. Set `PANORAFUS_PORT`/`PANORAFUS_HOST` as required by that host and store `PANORAFUS_GITHUB_WEBHOOK_SECRET` in its secret manager. Configure the Cloudflare Worker’s `PANORAFUS_API_ORIGIN` to that API origin. Replace the placeholder only with an administrator-verified origin.
5. **Choose the public webhook route.** The Node app supports `POST https://<API_HOST>/webhooks/github` when deployed directly. `https://www.panorafus.com/webhooks/github` is supported only if PANORAFUS.COM resolves through an enabled Cloudflare Worker route that forwards this path to the configured API origin. DNS, Worker deployment/route assignment, TLS, API origin, and the proposed hostname are currently unverified; do not register that URL based on this document alone. A reverse proxy is another option if it forwards the path and raw body unchanged.
6. **Configure GitHub after the route is verified.** A repository administrator can add a Webhook under repository Settings, use the verified HTTPS URL, set content type to `application/json`, and store the same newly generated secret in GitHub and the API host’s secret manager. GitHub’s initial `ping` should receive HTTP 200. The current allowlist is `ping` and `push`; pushes receive HTTP 202 but are not processed. Do not enable or describe synchronization/publishing until its exact behavior and authorization are approved.
7. **Approve the Wix synchronization contract before implementation.** The owner must specify which repository content maps to which Wix collections/pages, triggering events, review/approval steps, deletion behavior, conflict handling, rollback, and whether any automated publication is allowed. Until then, the receiver remains a verified no-op for pushes.
8. **Publish only after approval.** Selina previews and approves Wix content, an authorized domain administrator confirms DNS/TLS, and an authorized repository/API administrator confirms production settings. Keep a rollback plan for Wix publication, DNS, Worker routes, and API deployment.

## End-to-end acceptance checklist

- [ ] Authorized administrators confirm PANORAFUS.COM ownership, chosen Wix site, DNS control, and hosting providers; PANORAFUS.AI is separately verified before use.
- [ ] Wix site preview is approved, Selina has the intended least-privilege role, and custom-domain HTTPS is healthy without breaking existing email DNS.
- [ ] The verified API host serves `GET /api/health` over HTTPS and its deployment secret is not exposed in health output or logs.
- [ ] The configured GitHub webhook’s signed `ping` returns 200; an invalid signature returns 401; an unset server secret returns 503; an event outside the allowlist is ignored.
- [ ] A signed `push` is observed as accepted but unprocessed. No Wix content changes until the owner-approved synchronization contract is implemented and tested.
- [ ] English and selected localized mdBook pages, platform/API endpoints, Wix pages, navigation, mobile layouts, domain redirects, and HTTPS are tested from outside the deployment network.
- [ ] GitHub Actions builds and the selected Pages/Wix/API publication steps complete successfully; a human confirms the actual public URLs and rollback path.

## CI, validation, and open work

- Baseline `npm test` passed before these implementation changes.
- The most recent listed main-branch mdBook run (2026-10-02, run 37033352410) completed successfully. Its push-triggered workflow run does not establish a Pages deployment because deployment remains conditional on manual `workflow_dispatch`.
- The CI-pinned mdBook 0.4.36 was installed for this review; the English, Spanish, French, Portuguese, and Arabic books built successfully. Chinese and Hindi are parity folders but are not built by the current workflow.
- The latest Issue #67 report (2026-09-28) lists outdated account-based GitHub links and Contributor Covenant URLs with trailing punctuation. Repository links were updated and punctuation was moved outside the URL markup; external link reachability could not be verified from this environment.
- The latest scheduled CodeQL run failed while uploading analysis, with: `CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled`. This is a repository code-scanning configuration conflict, not a Node or mdBook build failure; an authorized repository/security administrator must reconcile default setup with the advanced workflow.
- Open PR #40 proposes changing mdBook Pages deployment from manual to automatic on every main push. Keep it for explicit deployment-policy review; it is not duplicated here, and its repository metadata should use the current organization URL if adopted.
- Open PR #73 covers dual website references and generated artifacts. Review its diff and merge conflicts against current main before deciding; PANORAFUS.AI domain ownership remains unverified.
- Open PR #95 reports no additional mdBook build fix is required because that failure is resolved on main. Confirm the checks and let maintainers close/retire it rather than reimplementing it here.
- Open PRs #74, #76, #77, and #78 overlap localized documentation parity. Current main passed the baseline docs validator, so compare their current diffs/checks before accepting any; do not merge duplicate files blindly.
- Open PR #85 is a separate content change and is not a launch prerequisite. Issues #67 and #51 are automated link-health and autopilot reports, respectively; the link references reported in #67 are addressed in this branch, while #51 is not a deployment blocker.

**Release decision remains with authorized maintainers.** Passing repository tests does not establish DNS ownership, deployment, Wix publication, or live service health.
