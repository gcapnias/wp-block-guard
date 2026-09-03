# DotSee Assistant — Implementation Findings

**Version:** 1.2 — 2026-09-03

Research findings from primary sources (vendor docs, official READMEs, Microsoft Learn) for the open implementation questions in `dotsee-assistant-spec.md`. Each section quotes/paraphrases the primary source and links it.

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| 1.0 | 2026-09-03 | Initial findings doc: Slack, Teamwork Desk, Teamwork Projects (supersedes ticket #118), Azure DevOps, ASP.NET Core config/hosting, Serilog. |
| 1.1 | 2026-09-03 | Added confirmed documentation gap in Teamwork Desk webhooks: most ticket-related events carry no inbox reference in their payload, so `inbox.id` routing only works for `ticket.created` and `ticket.moved`. Cross-referenced a second, more detailed Teamwork Desk webhook doc set (`apidocs.teamwork.com/guides/desk/*`) against the original support KB source, which also surfaced an undocumented event (`ticket.happiness.added`) and event-name mismatches between the two Teamwork doc sources. |
| 1.2 | 2026-09-03 | **Resolves the inbox-scoping gap from ticket #118 / v1.1**: pulled Teamwork Desk's official OpenAPI/Swagger spec and found webhook endpoints are scoped to inboxes at *registration* time (`WebhookEndpoint.inboxes`), independent of payload content — a third option better than either mitigation previously on the table. Also confirmed the event-name-spelling question (ticket #122) is **not** resolvable from the OpenAPI spec either — `code` is an untyped string with no enum, so a captured live header remains the only authoritative source. |

---

## Update to ticket #118: Teamwork Projects webhook payload schema is now documented

Ticket #118's decision recorded that "Teamwork Projects' webhook payload schema is not documented anywhere reachable, so its routing keys remain unconfirmed pending a captured live test payload." That is now out of date — `apidocs.teamwork.com` publishes current docs (sample payloads dated 2025/2026) covering events, payload shape, signing, and retry behavior. Details below under "Teamwork Projects webhooks."

---

## Slack: bot-token `chat.postMessage`

Source: [chat.postMessage method](https://docs.slack.dev/reference/methods/chat.postMessage), [chat:write.public scope](https://docs.slack.dev/reference/scopes/chat.write.public)

- Bot token scope required: `chat:write` (send messages via `chat.postMessage`).
- `chat:write.public` is only needed "if we want to post to channels the bot isn't in" — i.e. to post into channels without inviting the bot first. This is what enables the spec's dynamic multi-channel routing (receiver-centric config can target any channel without a manual `/invite` step per channel).
- Confirms the spec's decision to use bot-token `chat.postMessage` rather than Incoming Webhooks, since Incoming Webhooks are tied to a single fixed channel at creation time and can't do this kind of dynamic fan-out.

No open questions remain here — this is a settled API surface.

---

## Teamwork Desk webhooks — confirmed documentation gap (added in v1.1)

Two independent Teamwork doc sources cover Desk webhooks, and cross-referencing them exposes real gaps rather than just filling them in:

- Source A (support KB): [support.teamwork.com/desk/advanced/webhooks](https://support.teamwork.com/desk/advanced/webhooks)
- Source B (API docs, more detailed, includes full sample payloads): [apidocs.teamwork.com/guides/desk/webhooks](https://apidocs.teamwork.com/guides/desk/webhooks), [Webhook Events - Teamwork Desk](https://apidocs.teamwork.com/guides/desk/webhook-events-teamwork-desk), [Webhook payload samples (Teamwork Desk)](https://apidocs.teamwork.com/guides/desk/teamwork-desk-webhook-payload-samples)

### The gap: most Desk ticket events cannot be routed by `inbox.id` from the payload alone

The spec's routing design scopes Teamwork Desk source instances by `inbox.id`. That only works for the two events whose payload actually carries inbox context:

- `ticket.created` — the only event whose top-level payload includes an `inbox` object (`{ "inbox": { "id": 9760, "name": "Support", "state": "active" }, "ticket": {...} }`), per [Webhook payload samples](https://apidocs.teamwork.com/guides/desk/teamwork-desk-webhook-payload-samples).
- `ticket.moved` — carries `newInboxId` / `oldInboxId` directly, per [Source A's sample](https://support.teamwork.com/desk/advanced/webhooks#ticketmoved): `{ "eventCreatorId": 1, "id": 1, "newInboxId": 2, "oldInboxId": 1 }`.

Every other ticket-lifecycle event — confirmed by reading the actual sample bodies in [Webhook payload samples](https://apidocs.teamwork.com/guides/desk/teamwork-desk-webhook-payload-samples) — carries **no inbox reference anywhere in the payload**, not even nested inside a full `ticket` object:

- `ticket.status`: `{ "id": ..., "eventCreatorId": ..., "status": {...}, "eventCreator": {...} }` — no inbox.
- `ticket.tag.added`: includes a full nested `ticket` object (customer, agent, threads, tags, status, priority, type...) but that `ticket` object itself has **no `inbox` or `inboxId` field**, and there's no top-level `inbox` either.
- `thread.edited` / `note.added`: same pattern — full nested `ticket` object, still no inbox anywhere.
- `ticket.assigned/unassigned`, `ticket.merged`, `ticket.priority`, ID-only deletes (`ticket.deleted`, `thread.deleted`, `customer.deleted`, `tag.deleted`): thin payloads (just `id` + a resource fragment), no inbox.

**Consequence as of v1.1:** inbox-scoped routing for Desk can be applied directly from the payload only for `ticket.created`/`ticket.moved`. For every other ticket event, the relay had two options on the table, neither free: (a) call the Desk API (`GET /tickets/{id}`) to resolve `ticket.id` → `inbox.id` before applying the routing filter, adding a synchronous API round-trip into the 200-response path, or (b) give up on per-inbox scoping for those events and route them at "all inboxes on this webhook" granularity.

### Resolution (v1.2): a third, better option — scope at webhook-registration time, not from the payload

Teamwork Desk publishes a downloadable OpenAPI/Swagger spec for the Desk API v2 — [`GET https://apidocs.teamwork.com/api/oas/download?slug=desk&api_version=v2`](https://apidocs.teamwork.com/api/oas/download?slug=desk&api_version=v2) (linked from the "Download Swagger" button on every `apidocs.teamwork.com/docs/desk/v2/*` endpoint page, e.g. [Get a single ticket by id](https://apidocs.teamwork.com/docs/desk/v2/tickets/get-v2-tickets-id-json)). Neither doc source used in v1.1 links to it directly, which is why this wasn't found earlier. It defines a `WebhookEndpoint` model:

```yaml
models.WebhookEndpoint:
  properties:
    allEvents:
      type: boolean
    allInboxes:
      type: boolean
    events:
      type: array
      items:
        $ref: '#/definitions/models.Relationship'
    inboxes:
      type: array
      items:
        $ref: '#/definitions/models.Relationship'
    token: { type: string }
    url: { type: string }
```

`allInboxes` (boolean) plus `inboxes` (an array of inbox relationships) confirms that **a Desk webhook endpoint is scoped to one or more specific inboxes at creation time**, via `POST /v2/webhookendpoints.json` — the same pattern the spec already uses for Teamwork Projects (one webhook registration = one project) and Azure DevOps (one subscription = one project via `publisherInputs.projectId`). The `GET /v2/webhookendpoints.json` filter/includes list ([spec line 11441](https://apidocs.teamwork.com/api/oas/download?slug=desk&api_version=v2)) explicitly supports filtering and including by `allInboxes` and `inboxes`, and there's a companion `WebhookEndpointsInbox` join model tying a `webhookendpoint` to an `inbox` relationship — this is a real, first-class many-to-many relationship in the API, not an incidental field.

**This resolves the question better than either originally-proposed mitigation:** register each Desk webhook endpoint against the specific inbox(es) DotSee wants that source instance scoped to (`allInboxes: false`, `inboxes: [{id: <inboxId>}]`), rather than scoping "all inboxes" and trying to filter by payload content afterward. With registration-time scoping, the relay needs **no payload inspection and no extra Desk API call** for inbox routing on *any* event — including the "thin" events that carry no inbox reference at all (`ticket.status`, `ticket.tag.added`, etc.), because the webhook itself only ever fires for tickets in its registered inbox(es).

This also confirms mitigation (a) — the `GET /tickets/{id}` lookup — was a real fallback if it had been needed: the OpenAPI spec's `models.Ticket.inbox` field is a `Relationship` (present in the `GET /v2/tickets/{id}.json` response per the same spec), so ticket→inbox resolution via API is possible. But it's now unnecessary given registration-time scoping is available and adds zero runtime cost.

**Updated recommendation for the spec:** each Desk "source instance" in the config should map to one Desk webhook endpoint registered with a specific `inboxes` list (matching how Projects and Azure DevOps sources are already modeled), not to "all inboxes with payload-side filtering." Ticket #118 can be marked resolved on this point.

### A second gap: an undocumented event and inconsistent event names between Teamwork's own two doc sources

[Webhook Events - Teamwork Desk](https://apidocs.teamwork.com/guides/desk/webhook-events-teamwork-desk) (Source B) lists a `HAPPINESS RATING: ADDED` event that **does not appear anywhere in Source A's event table**. Its payload and event code are only documented in [Webhook payload samples](https://apidocs.teamwork.com/guides/desk/teamwork-desk-webhook-payload-samples):

```json
// ticket.happiness.added
{
    "id": 13391506,
    "eventCreatorId": 999999999,
    "happinessrating": {
        "id": 117314,
        "name": "great",
        "comment": "Fantastic support as usual."
    },
    "eventCreator": {
        "id": 999999999,
        "firstName": "Desk",
        "lastName": "",
        "avatarURL": ""
    }
}
```

Note `eventCreatorId`/`eventCreator.id` of `999999999` — a sentinel "system" actor ID, also seen on automated `eventInfo` thread entries (e.g. "applied the trigger 'add a follower'") inside ticket payloads. Worth handling as a known non-human actor ID rather than a real agent record if the message template ever renders `eventCreator`.

There are also outright naming mismatches between the two sources for the same event:

| Concept | Source A (support KB) | Source B (API docs) |
| --- | --- | --- |
| Agent created/updated | `agent.created` / `agent.updated` | `agent.added` / `agent.updated` |
| Note added to ticket | `ticket.note` | `note.added` |
| Happiness rating | *(not listed at all)* | `ticket.happiness.added` |

Since the `X-Desk-Event` header value is what the relay dispatches on, **the event name constants in the relay's Desk handler should be taken from a live captured payload, not assumed from either doc page** — the two sources disagree on at least one name (`agent.created` vs `agent.added`) and neither can be treated as fully authoritative on its own.

**Checked against a third source in v1.2 and still unresolved:** Teamwork Desk's [OpenAPI/Swagger spec](https://apidocs.teamwork.com/api/oas/download?slug=desk&api_version=v2) defines a `WebhookEndpointsEvent` model with a `code` field —

```yaml
models.WebhookEndpointsEvent:
  properties:
    code:
      type: string
```

— but `code` is declared as a bare `string` with **no `enum` constraint**, so the spec doesn't enumerate valid event codes anywhere either. There's also no separate "list available webhook event types" endpoint in the spec (only CRUD on `webhookendpoints`/`webhookendpointevents` themselves, which requires already knowing a valid code to subscribe to). This rules out the OpenAPI spec as a tiebreaker: **ticket #122's plan — capture the `X-Desk-Event` header from a real, live-fired webhook — remains the only way to get an authoritative answer.** No further doc source is worth checking for this specific question; it's a live-test task, not a research task.

### Event catalog (merged from both sources, gaps noted)

| Event Name | X-Desk-Event | Payload | Inbox context in payload? |
| --- | --- | --- | --- |
| Agent Created/Updated/Deleted | `agent.created`/`agent.added` (sources disagree) / `agent.updated` / `agent.deleted` | Agent / Agent / ID Only | No |
| Customer Created/Edited/Deleted | `customer.created` / `customer.edited` / `customer.deleted` | Customer / Customer / ID Only | No |
| Inbox Created/Edited/Deleted | `inbox.created` / `inbox.edited` / `inbox.deleted` | Inbox | Yes — payload *is* the inbox |
| Thread Edited/Deleted | `thread.edited` / `thread.deleted` | Thread (full nested ticket in Source B sample) / ID Only | No |
| Agent Reply / Customer Reply | `ticket.agent.reply` / `ticket.customer.reply` | Thread | No |
| Ticket Created | `ticket.created` | Ticket + top-level `inbox` object | **Yes** |
| Ticket Assigned/Unassigned | `ticket.assigned` / `ticket.unassigned` | Ticket Assigned | No |
| Ticket Note | `ticket.note` (Source A) / `note.added` (Source B) | Thread + full nested ticket | No |
| Ticket Moved | `ticket.moved` | `newInboxId`/`oldInboxId` | **Yes** |
| Ticket Merged | `ticket.merged` | Ticket Merged | No |
| Ticket Status | `ticket.status` | Ticket Status | No |
| Ticket Priority | `ticket.priority` | Ticket Priority | No |
| Ticket Deleted | `ticket.deleted` | ID Only | No |
| Ticket Tagged/Tag Removed | `ticket.tag.added` / `ticket.tag.removed` | Tag + full nested ticket | No |
| Tag Created/Edited/Deleted | `tag.created` / `tag.edited` / `tag.deleted` | Tag / Tag / ID Only | No |
| Happiness Rating Added | `ticket.happiness.added` — **undocumented in Source A** | Happiness Rating | No |

The "Inbox context in payload?" column is now informational rather than a routing constraint as of the v1.2 resolution above — with registration-time `inboxes` scoping on the webhook endpoint, the relay doesn't need any event's payload to carry inbox data at all.

### Headers

- `X-Desk-Signature` — HMAC-SHA256 hex-encoded signature of the raw request body, computed using the webhook's Secret Token. Verify by computing the same HMAC over the received body and comparing.
- `X-Desk-Delivery` — the delivery UUID, "listed in the Recent Deliveries section of your webhook." This is the value the spec uses as the idempotency key for Desk (the only provider in scope with a real delivery ID).
- `X-Desk-Event` — the event name (e.g. `ticket.created`) — this is the dispatch key, confirmed present as a header rather than only inferable from the body.
- `User-Agent` — identifies the webhooks service version.

### Delivery / retry semantics

From [Source A](https://support.teamwork.com/desk/advanced/webhooks):

> "Responses with a status code other than 200 will be considered as a failure. Failures will be reattempted 3 times before permanent failure. After multiple permanent failures we will disable your webhook."

Exact reattempt schedule (this detail was missing from the v1.0 findings):

| Reattempt # | Delay |
| --- | --- |
| 1 | 1 minute |
| 2 | 5 minutes |
| 3 | 10 minutes |

This is looser than Teamwork Projects' hourly retry cadence (see below), and Desk's retry window (≈16 minutes total) is short enough that a brief IIS app-pool recycle or deploy could plausibly cause a permanent failure and webhook auto-disable — worth the same operational-runbook note as the Projects retry behavior.

---

## Teamwork Projects webhooks (supersedes ticket #118's "undocumented" note)

Source: [apidocs.teamwork.com/guides/teamwork](https://apidocs.teamwork.com/guides/teamwork/webhook-overview) — specifically:
[Webhook Overview](https://apidocs.teamwork.com/guides/teamwork/webhook-overview),
[Setting up webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks),
[Responding to a webhook](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook),
[Webhook Events](https://apidocs.teamwork.com/guides/teamwork/webhook-events),
[Sample Webhook Payloads](https://apidocs.teamwork.com/guides/teamwork/sample-webhook-payloads)

**Event catalog:**

Events are registered per `EVENT:ACTION` pair (e.g. you create a webhook subscription for `TASK:CREATED` specifically, not for all `TASK` actions at once). Full list from [Webhook Events](https://apidocs.teamwork.com/guides/teamwork/webhook-events):

```text
BUDGET: CREATED, DELETED, UPDATED
CALENDEREVENT: CREATED, DELETED, REMINDER, UPDATED  — SITE LEVEL ONLY
CARD: CREATED, DELETED, UPDATED  — to be deprecated
COLUMN: CREATED, DELETED, UPDATED  — to be deprecated, replaced by STAGE
COMMENT: CREATED, DELETED, UPDATED
COMPANY: CREATED, DELETED, UPDATED  — SITE LEVEL ONLY
EXPENSE: CREATED, DELETED, UPDATED
FILE: CREATED, DELETED, DOWNLOADED, TAGGED, UNTAGGED, UPDATED
FORM: CREATED, DELETED, PUBLISHED, SUBMITTED
GOOGLEDRIVE: CONNECTED, INTEGRATED
INVOICE: COMPLETED, CREATED, DELETED, REOPENED, UPDATED
LINK: CREATED, DELETED, TAGGED, UNTAGGED, UPDATED
MESSAGE: CREATED, DELETED, TAGGED, UNTAGGED, UPDATED
MESSAGEREPLY: CREATED, DELETED, UPDATED
MILESTONE: COMPLETED, CREATED, DELETED, REMINDER, REOPENED, TAGGED, UNTAGGED, UPDATED
NOTEBOOK: CREATED, DELETED, TAGGED, UNTAGGED, UPDATED
PROJECT: ARCHIVED, COMPLETED, COPIED, CREATED, DELETED, REOPENED, TAGGED, UNTAGGED, UPDATED
PROJECTRATE: UPDATED
PROJECTUPDATE: CREATED, UPDATED, DELETED
PORTFOLIOBOARD: CREATED, DELETED, UPDATED  — SITE LEVEL ONLY
PORTFOLIOCARD: CREATED, DELETED, MOVED, REOPENED, UPDATED  — SITE LEVEL ONLY
PORTFOLIOCOLUMN: CREATED, DELETED, UPDATED  — SITE LEVEL ONLY
RISK: CREATED, DELETED, UPDATED
ROLE: CREATED, DELETED, UPDATED
STATUS: CREATED, DELETED, UPDATED  — SITE LEVEL ONLY
TASK: COMPLETED, CREATED, DELETED, MOVED, REMINDER, REOPENED, TAGGED, UNTAGGED, UPDATED
TASKLIST: COMPLETED, CREATED, CREATEDFROMTEMPLATE, DELETED, REOPENED, UPDATED
TEAM: CREATED, DELETED, UPDATED
TIME: CREATED, DELETED, TAGGED, UNTAGGED, UPDATED
TIMER: CREATED
USER: CREATED, DELETED, UPDATED  — SITE LEVEL ONLY
STAGE: CREATED, DELETED, UPDATED  — new, replacing COLUMN
```

Events marked **SITE LEVEL ONLY** cannot be scoped to a single project — no project ID exists to filter on for those (`USER`, `COMPANY`, `STATUS`, `CALENDEREVENT`, `PORTFOLIOBOARD`, `PORTFOLIOCARD`, `PORTFOLIOCOLUMN`). This matters for the spec's routing model: any receiver config entry that tries to scope one of these events to a specific project instance has nothing to filter on and should either be rejected at config-validation time or documented as "site-wide only."

### Payload shape and routing key — the key finding

From [Sample Webhook Payloads](https://apidocs.teamwork.com/guides/teamwork/sample-webhook-payloads), actual response bodies:

```json
// project.created
{
    "eventCreator": { "id": 238860, "firstName": "Marc", "lastName": "Cashman", "avatar": "..." },
    "project": {
        "id": 787076,
        "name": "My First Project",
        "status": "active",
        "ownerId": 238860,
        "companyId": 195285,
        "categoryId": 35253,
        "dateCreated": "2025-08-18T13:42:30Z"
    }
}

// time.created / time.updated
{
    "eventCreator": { "id": 238860, "firstName": "Marc", ... },
    "time": {
        "id": 23200713,
        "taskId": 41276637,
        "projectId": 732893,
        ...
    }
}

// tasklist.created / tasklist.updated
{
    "eventCreator": { ... },
    "milestone": { "id": 487051, "projectId": 419454, ... },
    "taskList": { "id": 1518546, "milestoneId": 487051, "projectId": 419454, ... }
}
```

**There is no top-level `eventType` field in the body.** The event's identity is established entirely by which URL/event combination the webhook was registered against on Teamwork's side (one webhook registration = one `EVENT:ACTION` pair bound to one endpoint URL, at either site level or project level). The relay therefore cannot dispatch on payload content the way it can for Azure DevOps (`eventType` field) or Teamwork Desk (`X-Desk-Event` header) — it must either:

- register a distinct webhook URL per event type it cares about (URL path encodes the event, e.g. `/webhooks/teamwork-projects/{instanceToken}/{eventType}`), or
- accept the event type as unqualified and rely on whichever project-scoped receivers subscribed to that source instance.

**The routing/scoping key is `projectId`**, present inside the nested resource object for project-scoped events (`project.id`, `time.projectId`, `taskList.projectId`, `milestone.projectId` — the field name varies by resource, it is not a consistent top-level property). This confirms project-level scoping is achievable, but the relay's payload parser needs a per-event-type lookup table for where to find `projectId` inside the body, since it isn't in a fixed location. Site-level events (see the SITE LEVEL ONLY list above) have no such field.

### Signing

From [Setting up webhooks — Tokens and Checksums on Version 2](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks#tokens-and-checksums-on-version-2):

> "The token field in your webhooks setup allows you to implement an additional security feature for your webhook consumer. We use the specified token to calculate a HMAC sha256 checksum of the 'body' of the HTTP POST and send it in the `X-Projects-Signature` header."

Reference Go implementation given in the doc:

```go
func generateSignature(data string, token string) (string, error) {
    sig := hmac.New(sha256.New, []byte(token))
    if _, err := sig.Write([]byte(data)); err != nil {
        return "", err
    }
    return hex.EncodeToString(sig.Sum(nil)), nil
}
```

This is the same HMAC-SHA256-over-raw-body construction as Teamwork Desk's `X-Desk-Signature` — the relay can share one verification helper across both Teamwork providers, keyed by each source instance's own token.

**Delivery / retry semantics:**

From [Responding to a webhook](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook):

> "Your server should return a 200 HTTP status code. You need to respond to the Webhook within 5 seconds. Any response code outside of 200, including 3xx codes, will indicate to Teamwork.com that you did not receive the webhook."
>
> "When a webhook is not received for whatever reason, Teamwork.com will continue trying to send the webhook once every hour for a maximum of 3 attempts after which they will be discarded. Webhooks will automatically be deactivated if three or more events get discarded."

Implications for the spec's "direct synchronous `chat.postMessage` with lightweight in-process retry" design:

- The relay has a 5-second budget to receive, route, call Slack, and return 200 — the in-process retry against Slack needs to fit inside that budget or the relay should ack Teamwork immediately and do the Slack call after responding (the doc's own guidance elsewhere for other providers is "save the parameters ... and respond immediately with a 200").
- Unlike Desk, there's no delivery-ID header on Projects webhooks documented here, so **no idempotency key exists for Teamwork Projects** — this confirms (rather than contradicts) the spec's existing decision to accept at-least-once duplicate risk for Teamwork Projects.
- A misbehaving relay (returning non-200, or hanging past 5s) will cause Teamwork to silently deactivate the webhook subscription after 3 discarded events site-wide-or-per-project — worth a monitoring/alerting note in the "Operational runbook" section, since a deactivated webhook fails silently with no further retries.

### Enabling and registration

From [Setting up webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks):

- Webhooks require a paid Teamwork.com plan.
- Can be registered at **site level** (owner company site administrators only) or **project level** (project administrators and above) — both produce one webhook URL + token per registration, consistent with the spec's "one webhook URL/token per source instance" scheme, except a "source instance" for Projects is really "one registration per event type," not per project, given there's no `eventType` field in the payload (see above).
- API endpoints exist for programmatic setup: enable webhooks ([PUT /webhooks/enable](https://teamwork-docs.vercel.app/docs/teamwork/v1/webhooks/put-webhooks-enable-json)), create site-level webhook ([POST /webhooks](https://teamwork-docs.vercel.app/docs/teamwork/v1/webhooks/post-webhooks-json)), create project-level webhook ([POST /projects/{id}/webhooks](https://teamwork-docs.vercel.app/docs/teamwork/v1/webhooks/post-projects-id-webhooks)).

---

## Azure DevOps service hooks

Source: [Notifications - List (REST API 7.1)](https://learn.microsoft.com/rest/api/azure/devops/hooks/notifications/list?view=azure-devops-rest-7.1), [Service Hook Events](https://github.com/microsoftdocs/azure-devops-docs/blob/main/docs/service-hooks/events.md), [Create a Service Hook Subscription Programmatically](https://github.com/microsoftdocs/azure-devops-docs/blob/main/docs/service-hooks/create-subscription.md), [Integrate with Service Hooks](https://github.com/microsoftdocs/azure-devops-docs/blob/main/docs/service-hooks/overview.md)

### Payload shape

Every event payload has:

- `eventType` (string) — the routing key, e.g. `"ms.vss-pipelinechecks-events.check-updated-event"`, `"build.complete"`.
- `resourceContainers` — a map of `ResourceContainer` objects: `collection`, `account`, `project` (each just `{ "id": "<guid>" }`). `resourceContainers.project.id` is the scoping key for the spec's per-project routing filter.

Example payload (Check updated event) from [Service Hook Events](https://github.com/microsoftdocs/azure-devops-docs/blob/main/docs/service-hooks/events.md):

```json
{
    "id": "a0a0a0a0-bbbb-cccc-dddd-e1e1e1e1e1e1",
    "eventType": "ms.vss-pipelinechecks-events.check-updated-event",
    "publisherId": "pipelines",
    "resource": { "...": "event-specific fields" },
    "resourceContainers": {
        "collection": { "id": "b1b1b1b1-cccc-dddd-eeee-f2f2f2f2f2f2" },
        "account": { "id": "bbbb1b1b-cc2c-dd3d-ee4e-ffffff5f5f5f" },
        "project": { "id": "00aa00aa-bb11-cc22-dd33-44ee44ee44ee" }
    },
    "createdDate": "2025-06-12T18:52:30.863Z"
}
```

This directly matches the spec's routing design: `eventType` for the event-type filter, `resourceContainers.project.id` for the source-side scoping ID.

### Subscription setup

Subscriptions are created via `POST` to the Subscriptions REST API. Sample request from [Create a Service Hook Subscription Programmatically](https://github.com/microsoftdocs/azure-devops-docs/blob/main/docs/service-hooks/create-subscription.md):

```json
{
    "publisherId": "tfs",
    "eventType": "build.complete",
    "resourceVersion": "1.0",
    "consumerId": "webHooks",
    "consumerActionId": "httpRequest",
    "publisherInputs": {
        "buildStatus": "failed",
        "definitionName": "WebSite.CI",
        "projectId": "11bb11bb-cc22-dd33-ee44-55ff55ff55ff"
    },
    "consumerInputs": { "url": "https://myservice/event" }
}
```

`consumerInputs.url` is where the receiver's webhook URL (with its embedded token) goes; `publisherInputs` carries event-specific filters and the project scope at subscription-creation time (redundant with, but independent of, the `resourceContainers.project.id` that shows up in every delivered payload).

The doc explicitly recommends HTTPS for the target URL "for the security of the private data in the JSON object" but doesn't specify Basic Auth wiring on the consumer side beyond what's in `consumerInputs` — **Basic Auth credential storage and any IP allowlisting remain a DotSee-side design decision, not something Azure DevOps' docs define.** This item in "Not yet specified" is not resolvable from vendor docs; it needs a decision recorded directly in the spec.

### Available services / "Webhooks" consumer

[Integrate with Service Hooks](https://github.com/microsoftdocs/azure-devops-docs/blob/main/docs/service-hooks/overview.md) confirms a generic `Webhooks` consumer type ("Post a request through HTTP") is available and managed "In Azure DevOps" (i.e. configured from the Azure DevOps project settings UI, not requiring the API) — so the spec's plan to receive via a generic webhook URL, rather than a custom Azure DevOps extension, is directly supported out of the box.

---

## ASP.NET Core: hot-reloaded JSON config via `IOptionsMonitor`

Source: [Options pattern (dotnet/docs)](https://github.com/dotnet/docs/blob/main/docs/core/extensions/options.md)

> "The `IOptionsMonitor` type supports change notifications... Change notifications are only supported for file-system based configuration providers, such as... Microsoft.Extensions.Configuration.Json... To use the options monitor, options objects are configured in the same way from a configuration section."

```csharp
builder.Services.Configure<TransientFaultHandlingOptions>(
    configurationRoot.GetSection(nameof(TransientFaultHandlingOptions)));
```

> "Some file systems, such as Docker containers and network shares, may not reliably send change notifications. When using `IOptionsMonitor` in these environments, set the `DOTNET_USE_POLLING_FILE_WATCHER` environment variable to `1` or `true` to poll the file system for changes. The interval at which changes are polled is every four seconds and isn't configurable."

Relevant to the on-prem IIS deployment: if the config JSON ever lives on a network share (rather than local disk on the IIS box), `reloadOnChange` file-watch notifications may not fire reliably and `DOTNET_USE_POLLING_FILE_WATCHER=1` should be set as an IIS app-pool environment variable.

---

## ASP.NET Core: User Secrets for local dev

Source: [Storing application secrets safely during development](https://github.com/dotnet/docs/blob/main/docs/architecture/microservices/secure-net-microservices-web-applications/developer-app-secrets-storage.md), [Use Azure Key Vault configuration provider — Secret storage in Development](https://learn.microsoft.com/aspnet/core/security/key-vault-configuration?view=aspnetcore-10.0)

- Requires `Microsoft.Extensions.Configuration.UserSecrets` package and a `<UserSecretsId>` GUID in the `.csproj`:

  ```xml
  <PropertyGroup>
      <UserSecretsId>UniqueIdentifyingString</UserSecretsId>
  </PropertyGroup>
  ```

- Set values via CLI: `dotnet user-secrets set "SecretName" "value"` (hierarchical keys use `:`, e.g. `dotnet user-secrets set "Section:SecretName" "value"`).
- `AddUserSecrets<T>()` is included automatically by `CreateDefaultBuilder`/`WebApplicationBuilder` for the `Development` environment — no explicit wiring needed in `Program.cs` for the common case.
- Secrets are stored in a JSON file under the user profile directory, outside source control, on the local machine only — this is dev-only, matching the spec's stated split (User Secrets locally, Windows env vars/IIS app-pool config in production).

---

## Serilog: rolling file sink

Source: [serilog/serilog-sinks-file README](https://github.com/serilog/serilog-sinks-file), [datalust/dotnet6-serilog-example README](https://github.com/datalust/dotnet6-serilog-example)

- Current package is `Serilog.Sinks.File` (`Serilog.Sinks.RollingFile` is deprecated per its own repo).
- Roll by size: pass `rollOnFileSizeLimit: true` with `fileSizeLimitBytes`; old files are cleaned up per `retainedFileCountLimit` (default 31).
- Roll by date: `rollingInterval: Day` (etc.) via `appsettings.json` when using `Serilog.Settings.Configuration`.
- Full working `Program.cs` + `appsettings.json` wiring pattern, from the `dotnet6-serilog-example` README:

```csharp
// top of Program.cs
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    // ... builder.Host.UseSerilog((ctx, lc) => lc.WriteTo.Console().ReadFrom.Configuration(ctx.Configuration));
    // ... app.UseSerilogRequestLogging();
}
catch (Exception ex) { Log.Fatal(ex, "Unhandled exception"); }
finally { Log.Information("Shut down complete"); Log.CloseAndFlush(); }
```

```json
{
  "Serilog": {
    "MinimumLevel": { "Default": "Information", "Override": { "Microsoft": "Warning" } },
    "WriteTo": [
      { "Name": "File", "Args": { "path": "./logs/log-.txt", "rollingInterval": "Day" } }
    ]
  }
}
```

Directly reusable for the spec's Serilog + rolling file sink requirement; `UseSerilogRequestLogging()` also gives a single structured line per inbound webhook request "for free," useful for auditing delivery attempts without extra logging code.

---

## IIS hosting for ASP.NET Core (in-process)

Source: [In-process hosting with IIS and ASP.NET Core](https://github.com/dotnet/aspnetcore.docs/blob/main/aspnetcore/host-and-deploy/iis/in-process-hosting.md), [Host ASP.NET Core on Windows with IIS](https://github.com/dotnet/aspnetcore.docs/blob/main/aspnetcore/host-and-deploy/iis/index.md), [web.config file](https://github.com/dotnet/aspnetcore.docs/blob/main/aspnetcore/host-and-deploy/iis/web-config.md)

- In-process hosting is the default since ASP.NET Core 3.0 (no explicit config needed unless overriding via `<AspNetCoreHostingModel>InProcess</AspNetCoreHostingModel>` in the `.csproj`).
- **One app pool per app is required** — "Sharing an app pool among apps isn't supported." Relevant if this relay is deployed alongside other apps on the same IIS box.
- App pool bitness (x86/x64) must match the published app's architecture.
- `web.config` must always be present at the site's physical path: **"Never remove the `web.config` file from a production deployment"** — if missing or broken, IIS may serve sensitive files (`{ASSEMBLY}.runtimeconfig.json`, `.deps.json`, XML doc comments) publicly instead of routing to the app.
- Classic ASP.NET config sections (`<system.web>`, `<appSettings>`, `<connectionStrings>`, `<location>`) in `web.config` are **not used** by ASP.NET Core apps — all app configuration goes through the standard `IConfiguration` providers (JSON files, env vars, User Secrets), consistent with the spec's config approach.
- To always keep the app warm (avoid cold-start on the first webhook after idle), set IIS **Start Mode: AlwaysRunning** on the app pool and **Preload Enabled: True** on the site (or the equivalent `<applicationInitialization doAppInitAfterRestart="true" />` in `web.config`) — worth a line in the operational runbook, since webhook senders (Teamwork, Azure DevOps) have short response-time budgets (Teamwork Projects: 5 seconds) that a cold IIS worker process could blow through.

---

## Open items still not resolvable from vendor docs

- **Azure DevOps Basic Auth wiring** (credential storage location, IP allowlisting specifics) — Microsoft's docs describe the subscription/consumer API but not how a receiving service should store/validate Basic Auth credentials; this needs a DotSee-side decision.
- **Malformed/oversized payload handling policy** — no vendor guidance found; this is an internal design decision for the relay.
- **Health-check/monitoring endpoint** — no vendor requirement either way; internal decision. Worth noting operationally: Teamwork auto-deactivates a webhook after 3 discarded deliveries with no further alerting from their side, so the relay itself needs to surface delivery failures (e.g. via Serilog + a log-based alert) rather than relying on the provider to notice.
- ~~**Teamwork Desk inbox-scoping for non-`ticket.created`/`ticket.moved` events**~~ — **resolved in v1.2**: register each Desk webhook endpoint with a specific `inboxes` list via `POST /v2/webhookendpoints.json` (per the Desk OpenAPI spec's `WebhookEndpoint.inboxes`/`allInboxes` fields). No payload-side mitigation needed. See "Resolution (v1.2)" above; ticket #118 can be closed on this point.
- **Which of the two Desk event-name spellings is authoritative** (`agent.created` vs `agent.added`, `ticket.note` vs `note.added`, and whether `ticket.happiness.added` exists) — **confirmed in v1.2 as genuinely unresolvable from any Teamwork documentation**, including the OpenAPI spec (`code` is an untyped string, no enum). Tracked in ticket #122; only resolvable by capturing a real `X-Desk-Event` header from a live-fired webhook (e.g. via the ngrok local-dev setup already planned for the runbook) — no further research will settle this, it needs a live test.
