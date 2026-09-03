[Home](https://apidocs.teamwork.com/)

Find something... `Ctrl K`

[Home](https://apidocs.teamwork.com/)

- Guides

- Documentation


- [Guides](https://apidocs.teamwork.com/guides)
- [Documentation](https://apidocs.teamwork.com/docs)
- ## Getting Started








  - [Getting Started with the Teamwork.com API](https://apidocs.teamwork.com/guides/teamwork/getting-started-with-the-teamwork-com-api)
  - [Quick Start Tutorial](https://apidocs.teamwork.com/guides/teamwork/youtube)

- ## Authentication








  - [Authentication](https://apidocs.teamwork.com/guides/teamwork/authentication)
  - [Deprecation: localhost redirect URIs for dynamically registered OAuth apps](https://apidocs.teamwork.com/guides/teamwork/auth-dcr-localhost-deprecation)
  - [Sunset: localhost redirect URIs for dynamically registered OAuth apps are no longer supported](https://apidocs.teamwork.com/guides/teamwork/auth-dcr-localhost-sunset)
  - [Authenticate via App Login Flow](https://apidocs.teamwork.com/guides/teamwork/app-login-flow)
  - [Login Component](https://apidocs.teamwork.com/guides/teamwork/login-component)

- ## API Responses








  - [Error Codes](https://apidocs.teamwork.com/guides/teamwork/error-codes)
  - [Rate Limiting](https://apidocs.teamwork.com/guides/teamwork/rate-limit)
  - [Success Responses](https://apidocs.teamwork.com/guides/teamwork/success-responses)

- ## General Structure and Conventions








  - [Can I suggest new API Calls?](https://apidocs.teamwork.com/guides/teamwork/can-i-suggest-new-api-calls)
  - [Custom Fields](https://apidocs.teamwork.com/guides/teamwork/custom-fields)
  - [Does the Teamwork API support etags?](https://apidocs.teamwork.com/guides/teamwork/does-the-teamwork-api-support-etags)
  - [File uploading via the API (Classic)](https://apidocs.teamwork.com/guides/teamwork/file-uploading-via-the-api-classic)
  - [File uploading via the API (Preferred)](https://apidocs.teamwork.com/guides/teamwork/file-uploading-via-the-api-preferred)
  - [How does paging work?](https://apidocs.teamwork.com/guides/teamwork/how-does-paging-work)
  - [How do I upload a file with the API?](https://apidocs.teamwork.com/guides/teamwork/how-do-i-upload-a-file-with-the-api)
  - [I've done something cool with the API! Can I show you?](https://apidocs.teamwork.com/guides/teamwork/ive-done-something-cool-with-the-api-can-i-show-you)
  - [Sample body for Teamwork.com POST requests](https://apidocs.teamwork.com/guides/teamwork/sample-body-for-teamwork-com-post-requests)
  - [Sparse Fieldsets](https://apidocs.teamwork.com/guides/teamwork/sparse-fieldsets)
  - [What's the difference between the API and Webhooks?](https://apidocs.teamwork.com/guides/teamwork/whats-the-difference-between-the-api-and-webhooks)
  - [How Teamwork.com handles file names with special characters](https://apidocs.teamwork.com/guides/teamwork/how-teamwork-com-handles-file-names-with-special-characters)

- ## Webhooks Explained
















  - [Webhook Overview](https://apidocs.teamwork.com/guides/teamwork/webhook-overview)
  - [Setting up webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks)
  - [Responding to a webhook](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook)
  - [Webhook Events](https://apidocs.teamwork.com/guides/teamwork/webhook-events)
  - [Sample Webhook Payloads](https://apidocs.teamwork.com/guides/teamwork/sample-webhook-payloads)
  - [Sample Delete Payload](https://apidocs.teamwork.com/guides/teamwork/sample-delete-payload)

- ## Frequently asked Questions








  - [Answers to common questions](https://apidocs.teamwork.com/guides/teamwork/answers-to-common-questions)
  - [GitHub repo for POST, PUT and PATCH request code samples](https://apidocs.teamwork.com/guides/teamwork/git-hub-repo-for-post-put-and-patch-request-code-samples)
  - [How do I update the user who completed a task with the API](https://apidocs.teamwork.com/guides/teamwork/how-do-i-update-the-task-completer-with-api)
  - [Known issues with Teamwork.com API](https://apidocs.teamwork.com/guides/teamwork/known-issues)

- ## Tutorials








  - [Example requests - code sample feature](https://apidocs.teamwork.com/guides/teamwork/example-requests-code-sample-feature)
  - [Product Workaround > TW automations HTTP request - Add a budget expense](https://apidocs.teamwork.com/guides/teamwork/product-workaround-tw-automations-http-request-add-a-budget-expense)
  - [How to log unavailable time with the API](https://apidocs.teamwork.com/guides/teamwork/how-to-log-unavailable-time-with-the-api)
  - [How to find Project Change History (Project Audit) with the API](https://apidocs.teamwork.com/guides/teamwork/how-to-find-project-change-history-project-audit-with-the-api)
  - [Workflows API Getting Started Guide](https://apidocs.teamwork.com/guides/teamwork/workflows-api-getting-started-guide)

- ## Developer Portal








  - [Developer Portal](https://apidocs.teamwork.com/guides/teamwork/developer-portal)
  - [Set Up Your Publisher Details](https://apidocs.teamwork.com/guides/teamwork/set-up-your-publisher-details)
  - [Developer Portal Permissions](https://apidocs.teamwork.com/guides/teamwork/developer-portal-permissions)
  - [Create an App](https://apidocs.teamwork.com/guides/teamwork/create-an-app)
  - [App Verification](https://apidocs.teamwork.com/guides/teamwork/app-verification)
  - [App Listing](https://apidocs.teamwork.com/guides/teamwork/app-listing)

# Webhook Events

**Event : Options**

`BUDGET` : `CREATED, DELETED, UPDATED`

`CALENDEREVENT` : `CREATED, DELETED, REMINDER, UPDATED` **\- SITE LEVEL ONLY**

`CARD` : `CREATED, DELETED, UPDATED` **\- NB: To be deprecated soon, date to be confirmed.**

`COLUMN` : `CREATED, DELETED, UPDATED` **\- NB: To be deprecated soon, date to be confirmed.**

`COMMENT` : `CREATED, DELETED, UPDATED`

`COMPANY` : `CREATED, DELETED, UPDATED` **\- SITE LEVEL ONLY**

`EXPENSE` : `CREATED, DELETED, UPDATED`

`FILE` : `CREATED, DELETED, DOWNLOADED, TAGGED, UNTAGGED, UPDATED`

`FORM` : `CREATED, DELETED, PUBLISHED, SUBMITTED`

`GOOGLEDRIVE` : `CONNECTED, INTEGRATED`

`INVOICE` : `COMPLETED, CREATED, DELETED, REOPENED, UPDATED`

`LINK` : `CREATED, DELETED, TAGGED, UNTAGGED, UPDATED`

`MESSAGE` : `CREATED, DELETED, TAGGED, UNTAGGED, UPDATED`

`MESSAGEREPLY` : `CREATED, DELETED, UPDATED`

`MILESTONE` : `COMPLETED, CREATED, DELETED, REMINDER, REOPENED, TAGGED, UNTAGGED, UPDATED`

`NOTEBOOK` : `CREATED, DELETED, TAGGED, UNTAGGED, UPDATED`

`PROJECT` : `ARCHIVED, COMPLETED, COPIED, CREATED, DELETED, REOPENED, TAGGED, UNTAGGED, UPDATED`

`PROJECTRATE` : `UPDATED`

`PROJECTUPDATE` : `CREATED, UPDATED, DELETED`

`PORTFOLIOBOARD` : `CREATED, DELETED, UPDATED` **\- SITE LEVEL ONLY**

`PORTFOLIOCARD` : `CREATED, DELETED, MOVED, REOPENED, UPDATED` **\- SITE LEVEL ONLY**

`PORTFOLIOCOLUMN` : `CREATED, DELETED, UPDATED` **\- SITE LEVEL ONLY**

`RISK` : `CREATED, DELETED, UPDATED`

`ROLE` : `CREATED, DELETED, UPDATED`

`STATUS` : `CREATED, DELETED, UPDATED` **\- SITE LEVEL ONLY**

`TASK` : `COMPLETED, CREATED, DELETED, MOVED, REMINDER, REOPENED, TAGGED, UNTAGGED, UPDATED`

`TASKLIST` : `COMPLETED, CREATED, CREATEDFROMTEMPLATE, DELETED, REOPENED, UPDATED`

`TEAM` : `CREATED, DELETED, UPDATED`

`TIME` : `CREATED, DELETED, TAGGED, UNTAGGED, UPDATED`

`TIMER` : `CREATED`

`USER` : `CREATED, DELETED, UPDATED` **\- SITE LEVEL ONLY**

**New Webhook events - Soon to be released in place of the**`column` **events, date to be confirmed**

`stage` : `CREATED, DELETED, UPDATED`

[Previous](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook) [Responding to a webhook](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook)

[Next](https://apidocs.teamwork.com/guides/teamwork/sample-webhook-payloads) [Sample Webhook Payloads](https://apidocs.teamwork.com/guides/teamwork/sample-webhook-payloads)

© Teamwork.com 2026. All rights reserved.

- [Terms of service](https://www.teamwork.com/legal/terms-of-service/)
- [Privacy policy](https://www.teamwork.com/legal/privacy-policy/)
- [Privacy statement](https://www.teamwork.com/legal/privacy-statement/)
- [Cookie policy](https://www.teamwork.com/legal/cookie-policy/)

Powered by