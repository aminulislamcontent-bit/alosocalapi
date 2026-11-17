# ALOAPI Universal Capability, 17-Dimension Completion & Credential Portability Matrix

**Generated From Live Source Catalog:** `2026-11-17`  
**Machine-Readable Matrix:** `docs/PROVIDER_CAPABILITY_PORTABILITY_MATRIX.json`  
**External Adapters:** 131 across 11 canonical categories (`src/lib/intelligence/providers/cat1..cat11`)  
**First-Party Autonomous Platforms:** 20 native AI modules (`src/lib/factory/modules/`)

## 1. Execution & Portability Summary Across All 131 External Providers

### Execution Modes
- `SUPERVISED_PORTAL_HANDOFF`: **68** providers
- `CONFIGURATION_ONLY`: **56** providers
- `OWNER_ACTION_REQUIRED`: **7** providers

### Client Handover & Portability Modes
- `AUTHORIZED_DELEGATION`: **37** providers
- `CLIENT_ACCOUNT_REISSUANCE`: **75** providers
- `DIRECT_TRANSFER`: **18** providers
- `CONFIGURATION_ONLY`: **1** providers

## 2. All 131 External Integration Adapters (17-Dimension Readiness & Portability)

| # | Provider Key | Display Name | Category | Execution Mode | Handover Mode | OAuth | Webhooks | Credential Activation |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| 1 | `meta_facebook_pages` | Meta / Facebook Pages Graph API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 2 | `instagram_graph_api` | Instagram Graph API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 3 | `threads_api` | Threads API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 4 | `tiktok_content_api` | TikTok Display & Content Posting API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 5 | `linkedin_platform` | LinkedIn Community Management & Share API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 6 | `youtube_data_api` | YouTube Data API v3 | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 7 | `x_api` | X (Twitter) API v2 | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 8 | `pinterest_api` | Pinterest API v5 | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `UNSUPPORTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 9 | `reddit_data_api` | Reddit Data API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 10 | `snapchat_public_profile` | Snapchat Public Profile API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 11 | `bluesky_atproto` | Bluesky (AT Protocol) API | Social Media and Publishing | `CONFIGURATION_ONLY` | `AUTHORIZED_DELEGATION` | `UNSUPPORTED` | `TESTED` | `CLIENT_ACTIVATION_REQUIRED` |
| 12 | `mastodon_api` | Mastodon REST & OAuth API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 13 | `tumblr_api` | Tumblr API v2 | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 14 | `vimeo_api` | Vimeo REST API | Social Media and Publishing | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 15 | `whatsapp_cloud_api` | WhatsApp Business Cloud API | Messaging and Customer Communication | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 16 | `instagram_messaging` | Instagram Messaging API | Messaging and Customer Communication | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 17 | `messenger_platform` | Meta Messenger Platform API | Messaging and Customer Communication | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 18 | `telegram_bot_api` | Telegram Bot API | Messaging and Customer Communication | `CONFIGURATION_ONLY` | `AUTHORIZED_DELEGATION` | `UNSUPPORTED` | `TESTED` | `CLIENT_ACTIVATION_REQUIRED` |
| 19 | `discord_api` | Discord Bot & Webhook API | Messaging and Customer Communication | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 20 | `slack_api` | Slack Web & Events API | Messaging and Customer Communication | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 21 | `twilio_messaging` | Twilio Programmable Messaging API | Messaging and Customer Communication | `CONFIGURATION_ONLY` | `AUTHORIZED_DELEGATION` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 22 | `microsoft_teams_graph` | Microsoft Teams (Graph API) | Messaging and Customer Communication | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 23 | `line_messaging_api` | LINE Messaging API | Messaging and Customer Communication | `CONFIGURATION_ONLY` | `AUTHORIZED_DELEGATION` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 24 | `viber_bot_api` | Viber Bot API | Messaging and Customer Communication | `OWNER_ACTION_REQUIRED` | `AUTHORIZED_DELEGATION` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 25 | `intercom_api` | Intercom REST API | Messaging and Customer Communication | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 26 | `crisp_api` | Crisp Chat REST API | Messaging and Customer Communication | `CONFIGURATION_ONLY` | `AUTHORIZED_DELEGATION` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 27 | `meta_marketing_api` | Meta Marketing API (Ads & Lead Ads) | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 28 | `google_ads_api` | Google Ads API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 29 | `tiktok_business_api` | TikTok Marketing API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 30 | `linkedin_marketing_api` | LinkedIn Marketing & Lead Gen API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 31 | `snapchat_marketing_api` | Snapchat Marketing API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 32 | `microsoft_advertising_api` | Microsoft Advertising API (Bing Ads) | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 33 | `x_ads_api` | X (Twitter) Ads API | Paid Advertising | `CONFIGURATION_ONLY` | `AUTHORIZED_DELEGATION` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 34 | `pinterest_ads_api` | Pinterest Ads & Conversions API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 35 | `reddit_ads_api` | Reddit Ads API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 36 | `amazon_ads_api` | Amazon Ads API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 37 | `apple_search_ads_api` | Apple Search Ads Campaign Management API | Paid Advertising | `SUPERVISED_PORTAL_HANDOFF` | `AUTHORIZED_DELEGATION` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 38 | `mailchimp_api` | Mailchimp Marketing API | Email Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 39 | `brevo_api` | Brevo (Sendinblue) Marketing & Transactional API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 40 | `klaviyo_api` | Klaviyo Marketing Automation API | Email Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 41 | `hubspot_email_api` | HubSpot Marketing Email & Transactional API | Email Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 42 | `activecampaign_api` | ActiveCampaign Marketing & CRM API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 43 | `kit_convertkit_api` | Kit (ConvertKit) API v4 | Email Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 44 | `sendgrid_api` | Twilio SendGrid Email & Marketing API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 45 | `mailgun_api` | Mailgun Email API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 46 | `amazon_ses_api` | Amazon SES (Simple Email Service) v2 | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 47 | `postmark_api` | Postmark Email API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 48 | `resend_api` | Resend Email API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 49 | `campaign_monitor_api` | Campaign Monitor API | Email Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 50 | `customerio_api` | Customer.io Track & App API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 51 | `mautic` | Mautic Open-Source Marketing Automation | Email Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 52 | `listmonk` | Listmonk Self-Hosted Newsletter & Mailing API | Email Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 53 | `hubspot_crm_api` | HubSpot CRM & Deals API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 54 | `salesforce_rest_api` | Salesforce CRM REST & Bulk API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 55 | `zoho_crm_api` | Zoho CRM REST API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 56 | `pipedrive_api` | Pipedrive CRM API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 57 | `gohighlevel_api` | GoHighLevel (LeadConnector) API v2 | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 58 | `freshsales_api` | Freshworks CRM (Freshsales) API | CRM and Sales | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 59 | `close_crm_api` | Close CRM REST API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 60 | `monday_crm_api` | monday CRM GraphQL API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 61 | `copper_crm_api` | Copper CRM API | CRM and Sales | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 62 | `attio_api` | Attio CRM REST API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 63 | `airtable_api` | Airtable Web & Webhooks API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 64 | `notion_api` | Notion REST API | CRM and Sales | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 65 | `google_search_console` | Google Search Console API | SEO and Website Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 66 | `google_business_profile` | Google Business Profile APIs | SEO and Website Marketing | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 67 | `google_pagespeed_insights` | Google PageSpeed Insights API | SEO and Website Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 68 | `bing_webmaster_api` | Bing Webmaster Tools JSON API | SEO and Website Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 69 | `semrush_api` | Semrush Analytics & Projects API | SEO and Website Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 70 | `ahrefs_api` | Ahrefs API v3 | SEO and Website Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 71 | `moz_links_api` | Moz Links & SEO API v2 | SEO and Website Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 72 | `cloudflare_analytics_api` | Cloudflare DNS, Security & Web Analytics API | SEO and Website Marketing | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 73 | `wordpress_rest_api` | WordPress REST API | SEO and Website Marketing | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 74 | `webflow_data_api` | Webflow Data API v2 | SEO and Website Marketing | `SUPERVISED_PORTAL_HANDOFF` | `DIRECT_TRANSFER` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 75 | `google_analytics4` | Google Analytics 4 (Data & Admin APIs) | Analytics and Customer Data | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 76 | `youtube_analytics_api` | YouTube Analytics & Reporting API | Analytics and Customer Data | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 77 | `mixpanel_api` | Mixpanel Ingestion & Query API | Analytics and Customer Data | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 78 | `amplitude_api` | Amplitude Analytics API | Analytics and Customer Data | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 79 | `posthog_api` | PostHog Product & Marketing Analytics API | Analytics and Customer Data | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 80 | `segment_api` | Twilio Segment CDP Tracking & Public API | Analytics and Customer Data | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 81 | `hotjar_api` | Hotjar Surveys & Behavior API | Analytics and Customer Data | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 82 | `matomo_api` | Matomo Analytics HTTP Reporting & Tracking API | Analytics and Customer Data | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 83 | `plausible_api` | Plausible Analytics Stats & Sites API | Analytics and Customer Data | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 84 | `google_tag_manager_api` | Google Tag Manager (GTM) API v2 | Analytics and Customer Data | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 85 | `shopify_admin_api` | Shopify Admin GraphQL & Storefront API | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `DIRECT_TRANSFER` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 86 | `woocommerce_rest_api` | WooCommerce REST API v3 | Ecommerce and Marketplace | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 87 | `stripe_api` | Stripe Payments & Billing REST API | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 88 | `meta_commerce_api` | Meta Commerce & Product Catalog API | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 89 | `google_merchant_api` | Google Merchant API (Shopping & Feeds) | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 90 | `square_api` | Square Commerce & Customers API | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 91 | `bigcommerce_api` | BigCommerce Store & V3 REST API | Ecommerce and Marketplace | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 92 | `magento_commerce_api` | Adobe Commerce / Magento 2 REST API | Ecommerce and Marketplace | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 93 | `amazon_sp_api` | Amazon Selling Partner API (SP-API) | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 94 | `etsy_open_api` | Etsy Open API v3 | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 95 | `paypal_rest_api` | PayPal Commerce & Invoicing REST API | Ecommerce and Marketplace | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 96 | `n8n` | n8n Workflow Automation | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 97 | `activepieces` | Activepieces Open-Source Automation | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 98 | `zapier_platform_api` | Zapier Webhooks & Workflow API | Workflow Automation | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 99 | `make_api` | Make (Integromat) REST API & Webhooks | Workflow Automation | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 100 | `node_red` | Node-RED Flow Runtime | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 101 | `windmill` | Windmill Developer Workflow Engine | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 102 | `temporal` | Temporal Durable Execution Platform | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 103 | `apache_airflow` | Apache Airflow Stable REST API | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 104 | `huginn` | Huginn Event Agents Platform | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 105 | `agency_orchestrator` | Local Multi-Agent Marketing Orchestrator | Workflow Automation | `OWNER_ACTION_REQUIRED` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 106 | `agency_agents_en` | msitarzewski/agency-agents (Prompt Library) | Workflow Automation | `OWNER_ACTION_REQUIRED` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `UNSUPPORTED` | `CLIENT_ACTIVATION_REQUIRED` |
| 107 | `agency_agents_zh` | jnMetaCode/agency-agents-zh (Localized Prompt Library) | Workflow Automation | `OWNER_ACTION_REQUIRED` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `UNSUPPORTED` | `CLIENT_ACTIVATION_REQUIRED` |
| 108 | `ai_agency_agents` | OpenClaude AI Agency Agents (Template Reference) | Workflow Automation | `OWNER_ACTION_REQUIRED` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `UNSUPPORTED` | `CLIENT_ACTIVATION_REQUIRED` |
| 109 | `ybt_army_135m` | YBT Army 135M (Catalog Research Reference) | Workflow Automation | `OWNER_ACTION_REQUIRED` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `UNSUPPORTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 110 | `obs_studio` | OBS Studio WebSocket v5 | Workflow Automation | `CONFIGURATION_ONLY` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 111 | `nginx` | NGINX Reverse Proxy & TLS Gateway | Workflow Automation | `OWNER_ACTION_REQUIRED` | `DIRECT_TRANSFER` | `UNSUPPORTED` | `TESTED` | `CLIENT_ACTIVATION_REQUIRED` |
| 112 | `typeform_api` | Typeform Create, Responses & Webhooks API | Forms, Landing Pages and Scheduling | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 113 | `tally_api` | Tally Forms API & Webhooks | Forms, Landing Pages and Scheduling | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 114 | `jotform_api` | Jotform REST API | Forms, Landing Pages and Scheduling | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 115 | `google_forms_api` | Google Forms API | Forms, Landing Pages and Scheduling | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 116 | `calendly_api` | Calendly Scheduling & Routing API v2 | Forms, Landing Pages and Scheduling | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 117 | `calcom_api` | Cal.com Scheduling API v2 | Forms, Landing Pages and Scheduling | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 118 | `acuity_scheduling_api` | Acuity Scheduling API v1 | Forms, Landing Pages and Scheduling | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 119 | `unbounce_api` | Unbounce Landing Pages & Leads API | Forms, Landing Pages and Scheduling | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 120 | `leadpages_api` | Leadpages Forms & Webhooks Integration | Forms, Landing Pages and Scheduling | `CONFIGURATION_ONLY` | `CONFIGURATION_ONLY` | `UNSUPPORTED` | `TESTED` | `CLIENT_ACTIVATION_REQUIRED` |
| 121 | `fillout_api` | Fillout Forms REST API & Webhooks | Forms, Landing Pages and Scheduling | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 122 | `twilio_voice_sip` | Twilio Programmable Voice & Elastic SIP Trunking | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 123 | `telnyx_voice_sip` | Telnyx Call Control & Elastic SIP Trunking | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 124 | `vonage_voice_api` | Vonage Voice API & SIP Connect | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 125 | `plivo_voice_api` | Plivo Voice API & Zentrunk SIP | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 126 | `ringcentral_voice_api` | RingCentral Voice, Call Control & Call Log API | Telephony and Voice Infrastructure | `SUPERVISED_PORTAL_HANDOFF` | `CLIENT_ACCOUNT_REISSUANCE` | `TESTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 127 | `exotel_voice_api` | Exotel Cloud Telephony & Voice API | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 128 | `asterisk_ari_sip` | Asterisk ARI & Self-Hosted SIP Trunk Gateway | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 129 | `freeswitch_esl_sip` | FreeSWITCH mod_verto / Event Socket & SIP Core | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 130 | `deepgram_stt_api` | Deepgram Speech-to-Text & Nova Voice API | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |
| 131 | `elevenlabs_tts_api` | ElevenLabs Multilingual Voice & Conversational TTS API | Telephony and Voice Infrastructure | `CONFIGURATION_ONLY` | `CLIENT_ACCOUNT_REISSUANCE` | `UNSUPPORTED` | `TESTED` | `PROVIDER_APPROVAL_REQUIRED` |

## 3. All 20 First-Party Native AI Marketing Platforms (Distinct From External Adapters)

| # | Module Key | Module Name | Group | Tier | Compatible External Providers |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `email_marketing` | AI Email Marketing | Messaging & Outreach | `priority_production` | `mailchimp_api`, `brevo_api`, `mailgun_api`, `sendgrid_api`, `aws_ses`, `postmark_api`, `resend_api` |
| 2 | `voice_call_center` | AI Voice Call Center | Voice & Support | `priority_production` | `twilio_voice_sip`, `telnyx_voice_sip`, `vonage_voice_api`, `plivo_voice_api`, `exotel_voice_api`, `asterisk_ari_sip`, `freeswitch_esl_sip`, `deepgram_stt_api`, `elevenlabs_tts_api` |
| 3 | `social_media_manager` | AI Social Media Manager | Growth, SEO & Ads | `core_module` | `meta_facebook_pages`, `instagram_graph_api`, `linkedin_platform`, `x_api`, `tiktok_content_api`, `youtube_data_api` |
| 4 | `ai_crm` | AI CRM & Sales Automation | CRM & Automation | `priority_production` | `hubspot_crm_api`, `salesforce_api`, `pipedrive_api`, `zoho_crm_api` |
| 5 | `marketing_automation` | AI Marketing Automation Builder | CRM & Automation | `priority_production` | `n8n`, `zapier_webhooks`, `make_api` |
| 6 | `chatbot_support` | AI Chatbot & Customer Support | Voice & Support | `core_module` | `intercom_api`, `crisp_api`, `zendesk_api`, `whatsapp_cloud_api` |
| 7 | `ads_management` | AI Ads Management | Growth, SEO & Ads | `core_module` | `meta_marketing_api`, `google_ads_api`, `tiktok_business_api`, `linkedin_marketing_api` |
| 8 | `seo_content` | AI SEO & Content Platform | Growth, SEO & Ads | `core_module` | `google_search_console`, `semrush_api`, `ahrefs_api`, `wordpress_rest_api` |
| 9 | `lead_generation` | AI Lead Generation | Growth, SEO & Ads | `core_module` | `meta_marketing_api`, `linkedin_marketing_api`, `apollo_api` |
| 10 | `creative_studio` | AI Creative Studio | Growth, SEO & Ads | `core_module` | `canva_connect_api`, `figma_api`, `cloudinary_api` |
| 11 | `sms_marketing` | AI SMS Marketing | Messaging & Outreach | `core_module` | `twilio_messaging`, `vonage_voice_api`, `plivo_voice_api` |
| 12 | `whatsapp_marketing` | AI WhatsApp Marketing | Messaging & Outreach | `core_module` | `whatsapp_cloud_api` |
| 13 | `landing_pages` | AI Landing Page Builder | Conversion & Journeys | `core_module` | `unbounce_api`, `leadpages_api`, `webflow_api` |
| 14 | `forms_surveys` | AI Form & Survey Builder | Conversion & Journeys | `core_module` | `typeform_api`, `tally_api`, `jotform_api`, `fillout_api` |
| 15 | `customer_journey` | AI Customer Journey | Conversion & Journeys | `core_module` | `customer_io_api`, `klaviyo_api`, `segment_api` |
| 16 | `analytics_attribution` | AI Analytics & Attribution | Analytics & Intelligence | `core_module` | `google_analytics4`, `mixpanel_api`, `amplitude_api` |
| 17 | `appointment_booking` | AI Appointment & Booking | Conversion & Journeys | `core_module` | `calendly_api`, `calcom_api`, `acuity_scheduling_api` |
| 18 | `reputation_manager` | AI Reputation Manager | Voice & Support | `core_module` | `google_business_profile`, `trustpilot_api` |
| 19 | `affiliate_marketing` | AI Affiliate Marketing | Growth, SEO & Ads | `core_module` | `stripe_api`, `partnerstack_api` |
| 20 | `marketing_intelligence` | AI Marketing Intelligence | Analytics & Intelligence | `core_module` | `google_analytics4`, `google_trends`, `meta_marketing_api` |
