# DotSee Assistant - Webhook-to-Slack Relay Spec

## Destination

`docs/dotsee-assistant-spec.md` — a technical spec/design doc for DotSee Assistant, a single-workspace webhook-to-Slack relay, detailed enough to hand off for implementation without further design decisions. No code is built as part of this map.

## Notes

- Domain: DotSee's own Slack workspace only. No OAuth install flow, no Marketplace distribution, no per-workspace token storage.
- Providers in scope: Teamwork Projects and Teamwork Desk (primary), Azure DevOps (secondary). Not a generic arbitrary-provider framework.
- Hosting: on-prem IIS with a public HTTPS endpoint. Dev on local workstations via ngrok. No deployment/CI pipeline in this effort.
- Routing is receiver-centric: each channel/person/team has a config entry listing which source instances (with filters on event type + source-side scoping ID) it subscribes to. Fan-out allowed (one event can match multiple receivers).
- Webhook URL/token scheme: one token per source instance (one per Teamwork project, one per Desk inbox, one per Azure DevOps org/project), matching how each provider's UI issues one webhook URL per source.
- Config store: JSON/appsettings, hot-reloaded via IOptionsMonitor. Not a database.
- Delivery: direct synchronous chat.postMessage with lightweight in-process retry. No durable queue/background worker.
- Idempotency: only where a real delivery ID exists (Teamwork Desk's X-Desk-Delivery). Accept at-least-once duplicate risk for Teamwork Projects and Azure DevOps.
- Message format: plain-text templates for v1. Block Kit deferred.
- Secrets: Windows env vars / IIS app-pool config, ASP.NET Core User Secrets for local dev.
- Logging: Serilog with a rolling file sink.
- Slack: bot-token chat.postMessage (chat:write, chat:write.public), not Incoming Webhooks — required for dynamic multi-channel routing. Read-only destination channels are a Slack admin setting (Posting permissions), not app code.
- Reference research: archive/building-dotsee-assistant-claude.md, archive/building-dotsee-assistant-gemini.md, archive/building-dotsee-assistant-copilot.md, archive/research-teamwork-webhooks.md, archive/slack-developer-docs.md.
- Skills to consult per ticket: grilling, domain-modeling, prototype, research as indicated by ticket type.

## Decisions so far

- [Research event catalog and payload shapes for Teamwork Projects, Teamwork Desk, and Azure DevOps webhooks]<https://dev.azure.com/DotSeeWebServices/UmbracoNext/_workitems/edit/118>: Azure DevOps (eventType field, resourceContainers.project.id scoping) and Teamwork Desk (X-Desk-Event header, inbox.id scoping, with a documented gap on a few "thin" events) have usable event-type/scoping-ID fields for the routing filter; Teamwork Projects' webhook payload schema is not documented anywhere reachable, so its routing keys remain unconfirmed pending a captured live test payload.

## Not yet specified

- Overall structure/outline of the spec document itself.
- Exact Azure DevOps Basic Auth wiring details (credentials storage, IP allowlisting) beyond "HTTPS + Basic Auth + URL token".
- Malformed-payload / oversized-payload handling policy.
- Operational runbook steps: Slack app creation, bot install, read-only channel setup, ngrok usage for local testing — sharp enough to write once the design tickets below resolve.
- Health-check/monitoring endpoint needs, if any, for the on-prem host.

## Out of scope

- Multi-workspace OAuth install flow / Slack Marketplace distribution — this is DotSee's own single workspace, not a distributable product.
- Database-backed routing store (EF Core/SQL) — JSON/appsettings suffices at this scale (a handful of routes).
- Durable queue/background-worker delivery pipeline (Redis, Channels-based worker) — traffic volume from 3 low-volume internal sources doesn't warrant it; direct - synchronous calls chosen instead.
- Block Kit rich message formatting — plain-text templates chosen for v1.
- Synthetic idempotency (hash-based dedup) for Teamwork Projects and Azure DevOps, which lack a delivery ID — accepted duplicate-post risk instead.
- Deployment/CI pipeline work — hosting is on-prem IIS, deployed manually; no pipeline design in this effort.
