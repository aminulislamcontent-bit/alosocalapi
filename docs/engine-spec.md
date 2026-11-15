# UNIVERSAL AI LEAD DISCOVERY, CUSTOMER ACQUISITION & ORGANIC GROWTH ENGINE

Industry-Agnostic | Country-Agnostic | Multi-Tenant | Free-First | AI-Powered

> This document is the spec of record (user-provided, 16 sections + 12 acceptance criteria).
> Implementation status per section: see `docs/engine-compliance.md`.

### 1. Core Objective

Build a universal, configurable AI-powered customer acquisition platform that can discover potential customers, identify market demand, analyze public business information, understand buyer intent, qualify leads, and grow websites and social media audiences.

The engine must support every legitimate business industry and country without being hardcoded for one company, industry, or geographic market.

It must support both:

- **Universal Discovery Mode:** Discover opportunities across multiple industries and countries.
- **Targeted Campaign Mode:** Let authorized administrators select precise industries, countries, locations, customer segments, and audience profiles.

### 2. Universal Industry and Country Configuration

Create a dynamic industry taxonomy. Do not hardcode a limited industry list.

Include categories such as:
- Education and study abroad
- Healthcare and wellness
- Real estate and construction
- Software and technology
- E-commerce and retail
- Finance and professional services
- Travel and hospitality
- Manufacturing and wholesale
- Logistics and transportation
- Legal and consulting
- Agriculture and food
- Automotive
- Beauty and lifestyle
- Non-profit and community organizations
- Other / Custom Industry

Allow administrators to add custom industries, sub-industries, products, and services.

Country and geographic targeting must support:
- All countries
- Selected countries
- Regions and states
- Cities and districts
- Postal-code areas where lawful and available
- Local, national, and international markets

Use maintained country and region reference data. Do not assume one country's privacy, marketing, or data-protection laws apply everywhere.

### 3. Two Operating Modes

**Mode A — Universal Discovery**

Allow the system to identify market opportunities across configured countries and industries.

Capabilities:
- Discover emerging market demand.
- Identify business categories and customer segments.
- Find public business opportunities.
- Identify relevant public discussions and market trends.
- Detect new product and service demand.
- Recommend promising industries and geographic markets.
- Generate market opportunity reports.

Universal discovery must respect configured scope, source permissions, and data limits.

**Mode B — Admin-Controlled Targeting**

Provide a campaign configuration interface with:

- Industry and sub-industry
- Country, region, city, and service area
- Business or customer type
- Target audience profile
- Product or service
- Buyer-intent signals
- Relevant keywords and topics
- Competitor or market references
- Campaign objective
- Source selection
- Budget preference: Free Only / Free First / Paid With Approval
- Lead qualification criteria
- Exclusion criteria

Allow multiple targeting profiles and campaigns to operate simultaneously.

### 4. Free-First Data Discovery Engine

Create a provider registry containing public, first-party, official API, open-data, and approved freemium sources.

Potential sources include:

**Google and Website Intelligence**
- Google Trends
- Google Search Console
- Google Analytics 4
- Google Keyword Planner
- Google Business Profile
- PageSpeed Insights

**Public Market Intelligence**
- Public company websites
- Public business directories with permitted reuse
- Government open-data portals
- Trade associations
- Public procurement and tender portals
- OpenStreetMap under its applicable licence
- Product Hunt
- Public Reddit discussions
- Publicly accessible industry publications

**Social and Community Intelligence**
- Official Meta APIs and authorized integrations
- Public LinkedIn information through permitted access
- Public Facebook content through permitted access
- Reddit API and permitted public content
- TikTok and YouTube official APIs where available

For each provider, record:
- Official source URL
- API or access method
- Available data fields
- Authentication requirements
- Free-tier limits
- Paid-tier requirements
- Rate limits
- Licensing and reuse restrictions
- Geographic coverage
- Last verification date
- Integration status
- Source reliability

Never claim that a provider is free, available, or integrated until verified.

### 5. Google Intelligence Module

Connect authorized Google properties and services.

Capabilities:
- Analyze website search queries and impressions through Search Console.
- Analyze website traffic, referral sources, events, and conversions through GA4.
- Identify trending topics and search demand through Google Trends.
- Generate keyword opportunities using permitted Keyword Planner access.
- Analyze authorized Google Business Profile performance.
- Analyze website performance through PageSpeed Insights.

Important distinction: Search Console and Analytics provide reports about the user's own properties. They do not reveal the identities or personal contact details of everyone searching Google.

### 6. Public Lead Discovery Engine

Discover potential business customers using permitted public business information.

Capture only fields that are permitted by the relevant source and applicable law, such as:
- Business name
- Official website
- Public business category
- Business location
- Public business contact channel, where permitted
- Publicly stated products and services
- Public business profile
- Source URL
- Discovery timestamp
- Evidence supporting relevance

Do not collect private personal information, protected data, or personal contact details without a lawful basis.

Every lead must include:
- Source provenance
- Collection timestamp
- Applicable usage restrictions
- Confidence level
- Data freshness
- Review status

### 7. AI Buyer Intent and Lead Qualification

Build an AI engine that identifies business relevance and buying signals.

Possible signals:
- Public request for a product or service
- Public request for a quotation
- Published procurement opportunity
- Business expansion or new location
- Publicly announced project
- Relevant service requirement
- Repeated interest in a topic
- Website enquiry or submitted lead form

Generate a configurable lead score based on:
- Industry relevance
- Geographic match
- Product/service match
- Evidence of buying intent
- Business suitability
- Data freshness
- Source reliability

Show the score explanation and supporting evidence. AI must not invent buying intent or claim that a person is ready to buy without evidence.

### 8. Central CRM and Lead Management

Create a universal lead pipeline:

Discovered → Data Validation → Qualification Review → Qualified → Assigned → Contact Permitted → Contacted → Follow-up → Opportunity → Customer → Closed

Additional statuses:
- Rejected
- Duplicate
- Unverified
- Do Not Contact
- Opted Out
- Data Expired

Features:
- Automatic deduplication
- Lead ownership and assignment
- Team and branch permissions
- Lead notes and activity history
- Follow-up scheduling
- Source attribution
- Consent and lawful-basis tracking
- Import/export controls
- Retention and deletion workflows
- Immutable audit history

Never automatically contact a discovered lead unless the channel, purpose, legal basis, and consent requirements have been satisfied.

### 9. Website Growth Engine

Analyze connected websites and recommend improvements.

Capabilities:
- Technical SEO audit
- Keyword opportunity analysis
- Search-performance analysis
- Content gap identification
- Landing-page recommendations
- Conversion optimization
- Page-speed recommendations
- Structured-data recommendations
- Internal linking suggestions
- Lead-form optimization
- Conversion tracking recommendations

AI may draft website content and SEO changes. Publishing material changes requires authorized approval.

Prioritize original, useful, accurate content rather than mass-generated low-value pages.

### 10. Social Media Audience Growth Engine

Support authorized social accounts through official APIs and approved integrations.

Capabilities:
- Audience and engagement analytics
- Content calendar
- Content idea generation
- Platform-specific post drafting
- Hashtag and topic research
- Community trend analysis
- Engagement reporting
- Campaign performance analysis
- Website traffic attribution
- Lead-form and conversion analysis

Do not buy fake followers, create fake accounts, automate artificial engagement, or send unsolicited bulk messages.

All outbound messaging and publishing must follow the relevant platform rules and configured approval policies.

### 11. Global Super Admin and Client Isolation

Provide two levels of administration.

**Global Super Admin Integration Center**
- Provider registry
- Global integration templates
- API capability registry
- OAuth application configuration
- Integration health monitoring
- Free-tier and paid-tier monitoring
- Provider policy and licence records
- Global audit logs
- Integration version management
- Emergency revocation

**Client-Level Workspace**
- Separate client credentials and OAuth grants
- Tenant-isolated data
- Client-specific targeting profiles
- Client-specific campaigns
- Client-specific lead records
- Client-specific permissions
- Client-specific consent and retention settings
- Client-specific analytics

Global administrators must not be able to casually expose client secrets. Privileged access must be restricted, justified, audited, and protected by appropriate authorization controls.

### 12. AI Automation and Approval Controls

Use AI agents for:
- Market research
- Source discovery
- Keyword research
- Lead discovery
- Data validation
- Lead qualification
- Duplicate detection
- Content generation
- SEO recommendations
- Performance reporting

Require human approval for:
- Paid subscriptions
- Advertising expenditure
- Public publishing where configured
- Bulk exports
- Outbound marketing campaigns
- Contacting leads
- Sensitive credential changes
- High-impact account or integration changes

Provide configurable autonomy levels: Suggest Only, Approval Required, and Approved Automation.

### 13. Cost Intelligence

Default to Free Only or Free First.

Before using any service:
- Check its current pricing and free-tier terms.
- Check rate limits and quotas.
- Estimate usage.
- Track consumption.
- Warn before quota exhaustion.
- Require approval before paid usage.
- Never start a subscription or incur charges silently.

Provide a cost dashboard per tenant and globally. Display monetary values in USD.

### 14. Security, Privacy and Compliance

Implement:
- OAuth 2.0 and provider-approved authorization
- Encrypted secret storage
- Tenant isolation
- Role-based access control
- Least-privilege scopes
- Secret masking
- Secure token refresh and revocation
- CSRF protection
- Rate limiting
- Immutable audit events
- Consent and opt-out management
- Data retention and deletion
- Source-specific licensing controls

Never:
- Extract passwords, session cookies, or private browser tokens.
- Bypass CAPTCHA, OTP, 2FA, app review, or platform security.
- Scrape Google Search or Google Maps in violation of their terms.
- Circumvent provider rate limits or access restrictions.
- Harvest personal contact details for unsolicited marketing.
- Expose API keys or tokens to frontend code or AI prompts.

When human verification is required, pause and request the authorized account owner to complete it.

### 15. Dashboard and Reporting

Build dashboards for:
- Universal Market Opportunities
- Country and Industry Intelligence
- Targeted Campaigns
- Data Source Health
- Google Intelligence
- Public Lead Discovery
- Buyer Intent
- Lead Qualification
- CRM Pipeline
- Website Growth
- Social Audience Growth
- SEO Performance
- Integration Center
- Credential Vault
- Cost Intelligence
- Privacy and Compliance
- Audit Logs

All metrics must come from actual connected data. Clearly distinguish verified data, estimates, AI recommendations, and unavailable information.

### 16. Implementation Requirements

Before implementation:
1. Audit the existing application and architecture.
2. Identify reusable modules, connectors, databases, and workflows.
3. Preserve existing routes, data, services, and integrations.
4. Identify missing functionality and verified defects.
5. Prepare a migration-safe implementation plan.

During implementation:
- Extend existing architecture rather than rebuilding it.
- Use modular provider adapters.
- Use reusable integration templates.
- Support tenant isolation from the database layer onward.
- Add migrations and rollback instructions.
- Use server-side secrets only.
- Add automated tests for permissions, isolation, data provenance, deduplication, and approval workflows.

Before release:
- Test every provider integration independently.
- Verify actual source permissions and capabilities.
- Test free-tier limits and paid-service approval gates.
- Test tenant isolation and credential protection.
- Test opt-out, retention, and deletion.
- Verify dashboards against source data.
- Document known limitations.
- Submit changes through a reviewable pull request.

### Final Acceptance Criteria

The engine is complete only when:

1. Both Universal Discovery and Admin-Controlled Targeting work.
2. New industries and countries can be added without code rewrites.
3. Multiple client workspaces remain isolated.
4. Public lead discovery records source provenance.
5. Google first-party analytics are correctly distinguished from public lead discovery.
6. Lead scoring is explainable and evidence-based.
7. CRM synchronization works with permissions and audit history.
8. Website and social growth workflows use authorized integrations.
9. Free-first cost controls prevent unapproved spending.
10. Privacy, platform terms, and outbound-contact restrictions are enforced.
11. No fake leads, fabricated metrics, or unverified integrations appear.
12. Existing production functionality remains intact.

**Build a genuinely reusable universal customer acquisition platform—not a collection of hardcoded demos or simulated dashboards.**
