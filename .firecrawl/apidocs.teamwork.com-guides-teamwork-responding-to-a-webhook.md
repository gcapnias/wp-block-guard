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
    - [Responding to the webhook you recieve](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook#responding-to-the-webhook-you-recieve)
    - [What happens when a webhook is not received?](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook#what-happens-when-a-webhook-is-not-received)
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

# Responding to a webhook

## [Responding to the webhook you recieve](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook\#responding-to-the-webhook-you-recieve)

To acknowledge that you received the webhook without any problem, **your server should return a 200 HTTP status code**. You need to respond to the Webhook **within 5 seconds**.

Any other information you return in the request headers or request body will be ignored. **Any response code outside of 200**, including 3xx codes, will indicate to Teamwork.com that you did not receive the webhook.

## [What happens when a webhook is not received?](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook\#what-happens-when-a-webhook-is-not-received)

When a webhook is not received for whatever reason, Teamwork.com will continue trying to **send the webhook once every hour for a maximum of 3 attempts after which they will be discarded**. Webhooks will automatically be deactivated if three or more events get discarded, ie: A status code other than 200 was returned after 3 tries.

### **Notes**

- Make sure you always respond with a Status 200 and with in a reasonable time frame. If we don't receive a 200 or the request times out, the Webhook will be considered failed and will be tried again at a later time. This could lead to duplicate actions on your side.

- The best thing to do is save the parameters we send in a local queue and respond immediately with a 200. You can do extra processing or perform other actions that may take a long time after that.


## **Feedback**

If you have any feedback or suggestions, feel free to contact us at [api@teamwork.com](https://apidocs.teamwork.com/docs/teamwork/6934b48695830-responding-to-a-webhook#undefined).

[Previous](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks) [Setting up webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks)

[Next](https://apidocs.teamwork.com/guides/teamwork/webhook-events) [Webhook Events](https://apidocs.teamwork.com/guides/teamwork/webhook-events)

© Teamwork.com 2026. All rights reserved.

- [Terms of service](https://www.teamwork.com/legal/terms-of-service/)
- [Privacy policy](https://www.teamwork.com/legal/privacy-policy/)
- [Privacy statement](https://www.teamwork.com/legal/privacy-statement/)
- [Cookie policy](https://www.teamwork.com/legal/cookie-policy/)

Powered by