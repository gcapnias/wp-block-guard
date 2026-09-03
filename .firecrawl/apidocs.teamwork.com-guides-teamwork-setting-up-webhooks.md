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
    - [Enabling Webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks#enabling-webhooks)
    - [Creating Webhooks at Site level](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks#creating-webhooks-at-site-level)
    - [Creating Webhooks at Project level](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks#creating-webhooks-at-project-level)
    - [Tokens and Checksums on Version 2](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks#tokens-and-checksums-on-version-2)
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

# Setting up webhooks

**Note: Webhooks are available on paid** [**Teamwork.com subscription plans**](https://www.teamwork.com/pricing/) **.**

Within Teamwork.com, you can use webhooks to get data from actions that occur on your site such as tasks being created or milestones being edited.

Webhooks can be leveraged to achieve a variety of actions - some examples include:

- Perform a specific action in a third-party app when a task is completed in Teamwork.com.

- Extend the functionality of your Teamwork.com site (for example, send an email to a certain user when a task is created on your site).

- Add a custom prefix to tasks when they are created in Teamwork.com.


Webhooks can be enabled and configured via the Webhooks section of your Teamwork.com site settings as well as via an individual project's settings.

## [Enabling Webhooks](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks\#enabling-webhooks)

**Note: The site settings area is only accessible to owner company site administrators.**

In the settings area, go to the **Webhooks subsection** where you will see an option to enable webhooks. Click the toggle to activate webhooks for your Teamwork.com site.

![](https://assets.contento.io/assets/s_01hHCKV8wW0z3wF9dTn8qCEKhq/wehhooks-setup-site-level.gif?fit=max&w=800&dpr=2)Enabling Webhooks

To enable Webhooks via our API, check out our Webhook endpoint [here](https://teamwork-docs.vercel.app/docs/teamwork/v1/webhooks/put-webhooks-enable-json)

## [Creating Webhooks at Site level](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks\#creating-webhooks-at-site-level)

**Note: If a webhook you are attempting to create at site level already matches an existing project webhook event and URL, you will be prompted to promote the existing webhook to site-level.**

Once webhooks have been enabled for your site, you can go to the Registered Events subsection of the site settings and click Add Webhook to create a new one:

![](https://assets.contento.io/assets/s_01hHCKV8wW0z3wF9dTn8qCEKhq/AddWebhookModel.png?fit=max&w=800&dpr=2)

To create a Site level Webhook via our API, check out our Webhook endpoint [here](https://teamwork-docs.vercel.app/docs/teamwork/v1/webhooks/post-webhooks-json).

## [Creating Webhooks at Project level](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks\#creating-webhooks-at-project-level)

**Note: The project settings area is accessible to project administrators and above.**

Once webhooks have been enabled for your site, you will see an additional Webhooks section in each project's settings area.

Click the Add Project Webhook button in the Registered Events subsection to create a new webhook for the project:

![](https://assets.contento.io/assets/s_01hHCKV8wW0z3wF9dTn8qCEKhq/projectsWebHooks.png?fit=max&w=800&dpr=2)

To create a Project level Webhook via our API, check out our Webhook endpoint [here](https://teamwork-docs.vercel.app/docs/teamwork/v1/webhooks/post-projects-id-webhooks).

## [Tokens and Checksums on Version 2](https://apidocs.teamwork.com/guides/teamwork/setting-up-webhooks\#tokens-and-checksums-on-version-2)

The token field in your webhooks setup allows you to implement an additional security feature for your webhook consumer. We use the specified token to calculate a HMAC sha256 checksum of the 'body' of the HTTP POST and send it in the X-Projects-Signature header. You can use the same token to generate a checksum of the data on your end and compare the two checksums. You can find many examples online how to calculate this checksum, but here's our implementation in Go:

### Function to calculate checksum

```
func generateSignature(data string, token string) (string, error) {
    sig := hmac.New(sha256.New, []byte(token))
    if _, err := sig.Write([]byte(data)); err != nil {
        return "", err
    }
    return hex.EncodeToString(sig.Sum(nil)), nil
}
```

CopyCopied!

## **Feedback**

If you have any feedback or suggestions, feel free to contact us at [api@teamwork.com](https://apidocs.teamwork.com/docs/teamwork/6934b48695830-responding-to-a-webhook#undefined).

[Previous](https://apidocs.teamwork.com/guides/teamwork/webhook-overview) [Webhook Overview](https://apidocs.teamwork.com/guides/teamwork/webhook-overview)

[Next](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook) [Responding to a webhook](https://apidocs.teamwork.com/guides/teamwork/responding-to-a-webhook)

© Teamwork.com 2026. All rights reserved.

- [Terms of service](https://www.teamwork.com/legal/terms-of-service/)
- [Privacy policy](https://www.teamwork.com/legal/privacy-policy/)
- [Privacy statement](https://www.teamwork.com/legal/privacy-statement/)
- [Cookie policy](https://www.teamwork.com/legal/cookie-policy/)

Powered by