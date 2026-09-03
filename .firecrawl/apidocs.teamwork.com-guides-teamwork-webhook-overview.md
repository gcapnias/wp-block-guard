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
    - [You could use webhooks to:](https://apidocs.teamwork.com/guides/teamwork/webhook-overview#you-could-use-webhooks-to)
    - [What if I don't want the webhook to fire sometimes?](https://apidocs.teamwork.com/guides/teamwork/webhook-overview#what-if-i-dont-want-the-webhook-to-fire-sometimes)
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

# Webhook Overview

Webhooks lets you easily develop push notifications. This push notification is simply a HTTP POST, that is triggered by some action in your Teamwork.com account.

This is a feature aimed for developers who want to get data from actions (like when a new task is added or a milestone is edited) that occur on their Teamwork.com account.

## [You could use webhooks to:](https://apidocs.teamwork.com/guides/teamwork/webhook-overview\#you-could-use-webhooks-to)

- Perform an action in a 3rd party app based on some item being completed in Teamwork.com (e.g: When a task is completed, update a SVN client)

- Extend Teamwork.com using your own app where a feature is required but not part of Teamwork.com (e.g: Send an email notification to a certain person when a task is added to your Teamwork.com account)

- Record who downloaded a particular file and when

- Add Job Numbers to the start of a Project or Task when they are created. e.g: \[JN10001\] My new project

- When time is logged in Teamwork.com update an internal Dashboard of information

- Cut down on the amount of polling of the API you need to do to see if something has changed

- Use the FILE.CREATED event to trigger a script to download a Teamwork.com file right in to your Dropbox/Box folder.


## [What if I don't want the webhook to fire sometimes?](https://apidocs.teamwork.com/guides/teamwork/webhook-overview\#what-if-i-dont-want-the-webhook-to-fire-sometimes)

This is a good question! If you have a webhook set up and you are testing something, you don't want to send off hundreds of requests. You can turn the webhook off using a parameter at the end of each endpoint.

For example, I might have a webhook set up for Task.Created. A small program I have built uses the data in that webhook to put into an internal reporting system. While testing something else, I don't want my webhooks firing false data into the reporting system, so instead, I can add **fireWebhook=false** at the end of my endpoint URL. This will stop the webhook firing.

## Feedback

If you have any feedback or suggestions, feel free to contact us at [api@teamwork.com](mailto:api@teamwork.com).

[Previous](https://apidocs.teamwork.com/guides/teamwork/how-teamwork-com-handles-file-names-with-special-characters) [How Teamwork.com handles file names with special characters](https://apidocs.teamwork.com/guides/teamwork/how-teamwork-com-handles-file-names-with-special-characters)

[Next](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks) [Setting up webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks)

© Teamwork.com 2026. All rights reserved.

- [Terms of service](https://www.teamwork.com/legal/terms-of-service/)
- [Privacy policy](https://www.teamwork.com/legal/privacy-policy/)
- [Privacy statement](https://www.teamwork.com/legal/privacy-statement/)
- [Cookie policy](https://www.teamwork.com/legal/cookie-policy/)

Powered by