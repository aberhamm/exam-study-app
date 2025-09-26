# Competency 1: XM Cloud Architecture and Developer Workflow

### Question 1 (Multiple Choice)
What is the primary difference between XM Cloud and traditional Sitecore architecture regarding content delivery?

**Options:**
- A. XM Cloud uses Azure CDN instead of Akamai
- B. XM Cloud publishes content to Experience Edge instead of a Content Delivery server
- C. XM Cloud stores content in NoSQL databases instead of SQL Server
- D. XM Cloud uses HTTP/3 protocol for faster delivery

**Answer:** B

---

### Question 2 (Multiple Choice)
When setting up a local XM Cloud development environment, which Docker port conflict is commonly encountered?

**Options:**
- A. Port 443 (HTTPS) conflict with existing web servers
- B. Port 8984 (Solr) conflict with existing search services
- C. Port 80 (HTTP) conflict with Traefik proxy
- D. Port 1433 (SQL Server) conflict with existing databases

**Answer:** C

---

### Question 3 (Multiple Choice)
In the xmcloud-foundation-head template structure, where should project-specific serialization modules be placed?

**Options:**
- A. `/docker/data/serialization/`
- B. `/src/Project/[SiteCollection]/serialization/`
- C. `/headapps/[AppName]/serialization/`
- D. `/platform/serialization/modules/`

**Answer:** B

---

### Question 4 (Multiple Choice)
Which CLI command is used to deploy changes to a specific XM Cloud environment?

**Options:**
- A. `dotnet sitecore cloud deploy --environment-id <id>`
- B. `dotnet sitecore cloud deployment create --environment-id <id> --upload`
- C. `dotnet sitecore cloud push --target <environment>`
- D. `dotnet sitecore cloud sync --environment <name>`

**Answer:** B

---

### Question 5 (Multiple Choice)
What is the maximum repository size limit for XM Cloud deployments?

**Options:**
- A. 250MB
- B. 500MB
- C. 1GB
- D. 2GB

**Answer:** B

---

### Question 6 (Multiple Choice)
In XM Cloud development, what does the Context ID represent?

**Options:**
- A. The unique identifier for a developer's local machine
- B. The environment-specific identifier for GraphQL endpoint configuration
- C. The session token for authenticated API requests
- D. The container ID for Docker development setup

**Answer:** B

---

### Question 7 (Multiple Choice)
Which rendering strategy is recommended for optimal performance in XM Cloud headless applications?

**Options:**
- A. Client-Side Rendering (CSR) for real-time content
- B. Server-Side Rendering (SSR) for dynamic personalization
- C. Static Site Generation (SSG) for content that changes infrequently
- D. Edge-Side Includes (ESI) for component-level caching

**Answer:** C

---

### Question 8 (Multiple Choice)
What is the primary purpose of the `buildTargets` property in xmcloud.build.json?

**Options:**
- A. To specify which Next.js applications to build
- B. To define which solution files should be compiled during deployment
- C. To configure target deployment environments
- D. To set build optimization flags for performance

**Answer:** B

---

### Question 9 (Multiple Choice)
In XM Cloud JSS integration, what must the Component Name field match?

**Options:**
- A. The GraphQL query name for the component
- B. The JSS app component registration name (e.g., "Foo" maps to Foo.js)
- C. The Sitecore item path for the rendering
- D. The data source template name

**Answer:** B

---

### Question 10 (Multiple Choice)
Which environment variable is required for XM Cloud Pages to connect to a local development instance?

**Options:**
- A. `SITECORE_LOCAL_HOST`
- B. `SITECORE_EDGE_CONTEXT_ID`
- C. `XM_CLOUD_DEPLOY_SECRET`
- D. `SITECORE_DEVELOPMENT_MODE`

**Answer:** B

---

### Question 11 (Multiple Choice)
What is the recommended approach for handling container health check failures in local XM Cloud development?

**Options:**
- A. Restart Docker Desktop and clear all volumes
- B. Check for port conflicts and verify environment variable configuration
- C. Reinstall the xmcloud-foundation-head template
- D. Switch to GitHub Codespaces for development

**Answer:** B

---

### Question 12 (Multiple Choice)
Which command is used to validate serialization items before pushing to XM Cloud?

**Options:**
- A. `dotnet sitecore ser validate --fix`
- B. `dotnet sitecore ser push --what-if`
- C. `dotnet sitecore ser diff --preview`
- D. `dotnet sitecore ser check --validate`

**Answer:** B

---

# Competency 2: Deployment of XM Cloud Projects

### Question 13 (Multiple Choice)
What is the typical deployment time for XM Cloud using the built-in CI/CD pipeline?

**Options:**
- A. 5-8 minutes
- B. 15 minutes
- C. 25-30 minutes
- D. 45 minutes

**Answer:** B

---

### Question 14 (Multiple Choice)
Which source control provider offers native CI/CD integration with XM Cloud Deploy App?

**Options:**
- A. Azure DevOps
- B. GitLab
- C. GitHub
- D. Bitbucket

**Answer:** C

---

### Question 15 (Multiple Choice)
What happens when environment variables are changed in an XM Cloud environment?

**Options:**
- A. Changes take effect immediately without restart
- B. Only the rendering host needs to be restarted
- C. A full build and redeploy is required
- D. Only the CM instance needs to be recycled

**Answer:** C

---

### Question 16 (Multiple Choice)
In xmcloud.build.json, what does the `renderingHosts` configuration control?

**Options:**
- A. The Next.js application build targets
- B. The editing and rendering host endpoints for XM Cloud Pages
- C. The CDN endpoints for content delivery
- D. The GraphQL endpoint configurations

**Answer:** B

---

### Question 17 (Multiple Choice)
Which environment variable target should be used for Sitecore-specific configurations like PowerShell elevation?

**Options:**
- A. All
- B. CM
- C. Rendering Host
- D. Edge

**Answer:** B

---

### Question 18 (Multiple Choice)
What is the primary cause of "MSBuild version" related deployment failures in XM Cloud?

**Options:**
- A. Incorrect .NET Core version specified
- B. Missing Sitecore assemblies in the build process
- C. Outdated Visual Studio version on developer machine
- D. Incorrect NuGet package sources configuration

**Answer:** B

---

### Question 19 (Multiple Choice)
How should sensitive data like API keys be managed in XM Cloud deployments?

**Options:**
- A. Store in appsettings.json files
- B. Hard-code in source code with encryption
- C. Use XM Cloud environment variables
- D. Store in Azure Key Vault with manual retrieval

**Answer:** C

---

### Question 20 (Multiple Choice)
Which CLI command creates a new deployment without uploading the repository?

**Options:**
- A. `dotnet sitecore cloud deployment create --environment-id <id>`
- B. `dotnet sitecore cloud deployment create --environment-id <id> --no-upload`
- C. `dotnet sitecore cloud deploy --environment-id <id> --existing`
- D. `dotnet sitecore cloud deployment start --environment-id <id>`

**Answer:** A

---

### Question 21 (Multiple Choice)
What is the maximum number of concurrent deployments allowed per organization?

**Options:**
- A. 3
- B. 5
- C. 10
- D. Unlimited with queue management

**Answer:** B

---

### Question 22 (Multiple Choice)
Which deployment strategy provides zero-downtime updates?

**Options:**
- A. Rolling deployment with health checks
- B. Blue-green deployment using separate environments
- C. Canary deployment with gradual traffic shifting
- D. In-place deployment with maintenance windows

**Answer:** B

---

### Question 23 (Multiple Choice)
What should be done if Solr indexing fails during deployment?

**Options:**
- A. Restart the deployment process
- B. Check custom code deployment for indexing conflicts
- C. Manually rebuild indexes post-deployment
- D. Disable Solr temporarily during deployment

**Answer:** B

---

### Question 24 (Multiple Choice)
In GitHub Actions workflow for XM Cloud, what is the purpose of the `upload-deployment-artifacts` step?

**Options:**
- A. To store build logs for troubleshooting
- B. To upload the repository contents for deployment
- C. To cache dependencies for faster builds
- D. To create backup snapshots before deployment

**Answer:** B

---

### Question 25 (Multiple Choice)
Which timeout value should be configured for XM Cloud CDP and Edge requests?

**Options:**
- A. 5 seconds
- B. 10 seconds
- C. 30 seconds
- D. 60 seconds

**Answer:** C

---

### Question 26 (Multiple Choice)
What is the recommended approach for handling deployment rollbacks in XM Cloud?

**Options:**
- A. Use Git revert and redeploy
- B. Restore from automatic backup snapshots
- C. Deploy previous successful build artifacts
- D. Use XM Cloud's built-in rollback feature

**Answer:** C

---

### Question 27 (Multiple Choice)
Which log location contains information about XM Cloud publishing operations?

**Options:**
- A. CM instance application logs
- B. Experience Edge delivery logs
- C. Deploy App audit logs
- D. Rendering host error logs

**Answer:** A

---

### Question 28 (Multiple Choice)
What is the primary limitation when deploying large repositories to XM Cloud?

**Options:**
- A. Build timeout after 30 minutes
- B. Repository size limit of 500MB
- C. Maximum 1000 files per deployment
- D. Network transfer speed restrictions

**Answer:** B

---

# Competency 3: Renderings and Layout

### Question 29 (Multiple Choice)
Which rendering template type is used exclusively in XM Cloud headless architecture?

**Options:**
- A. View rendering
- B. XSLT rendering
- C. Controller rendering
- D. JSON rendering

**Answer:** D

---

### Question 30 (Multiple Choice)
In XM Cloud, what replaces the traditional Content Delivery (CD) server for rendering?

**Options:**
- A. Azure Static Web Apps
- B. Experience Edge with GraphQL APIs
- C. Vercel hosting platform
- D. Next.js rendering host

**Answer:** B

---

### Question 31 (Multiple Choice)
Which JSS SDK version introduced the XM Cloud add-on with Context ID-based configuration?

**Options:**
- A. JSS 20.3
- B. JSS 21.6
- C. JSS 22.1
- D. JSS 23.0

**Answer:** B

---

### Question 32 (Multiple Choice)
What is the correct format for dynamic placeholders in XM Cloud?

**Options:**
- A. `{placeholder-name}-{number}`
- B. `<placeholder-name>-<UID>-<number>`
- C. `/root-placeholder/content-12345-1`
- D. `${placeholder-name}-${randomId}`

**Answer:** C

---

### Question 33 (Multiple Choice)
Which component export pattern is required for rendering variants support in JSS?

**Options:**
- A. `export default MyComponent;`
- B. `export const MyComponent = () => { };`
- C. `export const Default = () => { };`
- D. `module.exports = { Default: MyComponent };`

**Answer:** C

---

### Question 34 (Multiple Choice)
In XM Cloud personalization, what is the maximum number of page variants allowed?

**Options:**
- A. 5 variants
- B. 8 variants
- C. 10 variants
- D. Unlimited variants

**Answer:** B

---

### Question 35 (Multiple Choice)
Which field in a JSON rendering item is used to define custom GraphQL queries?

**Options:**
- A. Component GraphQL Query
- B. Datasource Query
- C. Layout Service Query
- D. Integrated Query Field

**Answer:** A

---

### Question 36 (Multiple Choice)
What is the primary purpose of the Layout Service Placeholders field in rendering items?

**Options:**
- A. To define the component's data source location
- B. To specify child placeholder rendering configuration
- C. To set up component parameter templates
- D. To configure rendering variant options

**Answer:** B

---

### Question 37 (Multiple Choice)
Which HTTP header should be checked to identify Experience Editor context in headless applications?

**Options:**
- A. `X-Sitecore-Editor`
- B. `Sitecore-Experience-Editor`
- C. `X-Experience-Editor-Mode`
- D. `Sitecore-Editor-Context`

**Answer:** A

---

### Question 38 (Multiple Choice)
In JSS component development, what is the purpose of the `props.params.RenderingIdentifier`?

**Options:**
- A. To uniquely identify the component instance
- B. To specify the component's GraphQL query ID
- C. To link the component to its data source
- D. To enable component-level personalization

**Answer:** A

---

### Question 39 (Multiple Choice)
Which configuration enables detailed rendering parameter resolution in Layout Service?

**Options:**
- A. `LayoutService.EnableRenderingParams=true`
- B. `LayoutService.DetailedRenderingParams=true`
- C. `JSS.RenderingParams.Detailed=true`
- D. `Sitecore.JSS.RenderingParameters=true`

**Answer:** B

---

### Question 40 (Multiple Choice)
What is the recommended approach for optimizing GraphQL queries in XM Cloud components?

**Options:**
- A. Use wildcard queries to fetch all available data
- B. Implement query caching at the application level
- C. Request only required fields using selective querying
- D. Use REST API endpoints instead of GraphQL

**Answer:** C

---

### Question 41 (Multiple Choice)
Which middleware component handles personalization variant selection in Next.js applications?

**Options:**
- A. AuthenticationMiddleware
- B. PersonalizeMiddleware
- C. VariantMiddleware
- D. ExperienceMiddleware

**Answer:** B

---

### Question 42 (Multiple Choice)
In XM Cloud Pages, which accordion section contains rendering variant selection options?

**Options:**
- A. Settings
- B. Styling
- C. Content
- D. Layout

**Answer:** B

---

# Competency 4: Sitecore Content Serialization

### Question 43 (Multiple Choice)
What file format does Sitecore Content Serialization (SCS) use to store serialized items?

**Options:**
- A. JSON
- B. XML
- C. YAML
- D. Binary

**Answer:** C

---

### Question 44 (Multiple Choice)
Which CLI command performs a dry run to preview serialization changes without applying them?

**Options:**
- A. `dotnet sitecore ser pull --preview`
- B. `dotnet sitecore ser push --what-if`
- C. `dotnet sitecore ser validate --test`
- D. `dotnet sitecore ser diff --dry-run`

**Answer:** B

---

### Question 45 (Multiple Choice)
What is the default maximum relative item path length in SCS configuration?

**Options:**
- A. 50 characters
- B. 100 characters
- C. 150 characters
- D. 260 characters

**Answer:** B

---

### Question 46 (Multiple Choice)
Which scope option serializes only the specified item without its children?

**Options:**
- A. ItemOnly
- B. SingleItem
- C. ItemExclusive
- D. TargetItem

**Answer:** B

---

### Question 47 (Multiple Choice)
In SCS module configuration, what does the `allowedPushOperations` property control?

**Options:**
- A. Which users can push changes to the environment
- B. What types of operations can be performed during push (create, update, delete)
- C. Which environments the module can be pushed to
- D. The maximum number of concurrent push operations

**Answer:** B

---

### Question 48 (Multiple Choice)
Which command automatically fixes common serialization validation issues?

**Options:**
- A. `dotnet sitecore ser repair`
- B. `dotnet sitecore ser validate --fix`
- C. `dotnet sitecore ser correct --auto`
- D. `dotnet sitecore ser fix --validation`

**Answer:** B

---

### Question 49 (Multiple Choice)
What is the purpose of module tags in SCS?

**Options:**
- A. To categorize modules by functionality for selective deployment
- B. To define module dependencies and load order
- C. To specify the module's target Sitecore version
- D. To enable module-level security permissions

**Answer:** A

---

### Question 50 (Multiple Choice)
Which SCS scope includes all descendant items but excludes the specified item itself?

**Options:**
- A. DescendantsOnly
- B. ItemAndDescendants
- C. ChildrenOnly
- D. SubtreeOnly

**Answer:** A

---

### Question 51 (Multiple Choice)
In team collaboration scenarios, what is the best practice for handling SCS conflicts?

**Options:**
- A. Always use `--force` flag to override conflicts
- B. Use module dependencies to ensure correct deployment order
- C. Manually merge YAML files using Git tools
- D. Disable validation during team deployments

**Answer:** B

---

### Question 52 (Multiple Choice)
Which CLI command provides detailed information about item path inclusion rules?

**Options:**
- A. `dotnet sitecore ser info`
- B. `dotnet sitecore ser explain <path>`
- C. `dotnet sitecore ser describe --path <path>`
- D. `dotnet sitecore ser analyze <path>`

**Answer:** B

---

### Question 53 (Multiple Choice)
What is the recommended approach for serializing media items in XM Cloud?

**Options:**
- A. Serialize all media items with their content
- B. Never serialize individual media items due to performance impact
- C. Only serialize media folders, not individual items
- D. Use separate modules specifically for media items

**Answer:** B

---

### Question 54 (Multiple Choice)
Which deployment method is recommended for developer-owned items in XM Cloud?

**Options:**
- A. Post Deploy Actions via xmcloud.build.json
- B. Items as Resources (IAR) deployment
- C. Manual serialization after deployment
- D. PowerShell scripts in deployment pipeline

**Answer:** B

---

### Question 55 (Multiple Choice)
In SCS package management, which command creates a package for deployment?

**Options:**
- A. `dotnet sitecore ser pkg build -o packagename`
- B. `dotnet sitecore ser package create packagename`
- C. `dotnet sitecore ser pkg create -o packagename`
- D. `dotnet sitecore ser create-package packagename`

**Answer:** C

---

### Question 56 (Multiple Choice)
What happens when the `continueOnItemFailure` setting is set to false in SCS configuration?

**Options:**
- A. Serialization stops on the first validation error
- B. Only critical errors stop the serialization process
- C. Failed items are skipped and logged for review
- D. Serialization continues but marks failures for later review

**Answer:** A

---

# Competency 5: Sitecore APIs & Webhooks

### Question 57 (Multiple Choice)
What is the rate limit for uncached requests to the Experience Edge GraphQL API?

**Options:**
- A. 60 requests per minute
- B. 80 requests per second
- C. 100 requests per second
- D. 1000 requests per hour

**Answer:** B

---

### Question 58 (Multiple Choice)
Which authentication method is required for XM Cloud Delivery API access?

**Options:**
- A. JWT Bearer tokens
- B. OAuth 2.0 client credentials
- C. API key (`sc_apikey` header)
- D. Basic authentication

**Answer:** C

---

### Question 59 (Multiple Choice)
What is the default timeout value for XM Cloud webhooks before they are considered failed?

**Options:**
- A. 5 seconds
- B. 10 seconds
- C. 30 seconds
- D. 60 seconds

**Answer:** C

---

### Question 60 (Multiple Choice)
Which GraphQL variables are automatically injected into Component GraphQL Query fields?

**Options:**
- A. `$siteId`, `$language`, `$version`
- B. `$datasource`, `$contextItem`, `$language`
- C. `$userId`, `$sessionId`, `$timestamp`
- D. `$itemId`, `$templateId`, `$parentId`

**Answer:** B

---

### Question 61 (Multiple Choice)
How many consecutive webhook failures will cause XM Cloud to automatically disable the webhook?

**Options:**
- A. 5 failures
- B. 10 failures
- C. 15 failures
- D. 20 failures

**Answer:** B

---

### Question 62 (Multiple Choice)
Which endpoint is used for accessing unpublished content during development and preview scenarios?

**Options:**
- A. Experience Edge Delivery API
- B. Experience Edge Preview API
- C. XM Cloud Management API
- D. Layout Service API

**Answer:** B

---

### Question 63 (Multiple Choice)
What is the recommended retry strategy for handling Experience Edge rate limiting (HTTP 429)?

**Options:**
- A. Immediate retry with same request
- B. Linear backoff starting at 1 second
- C. Exponential backoff with jitter
- D. Fixed 5-second delay between retries

**Answer:** C

---

### Question 64 (Multiple Choice)
Which authentication flow is used for XM Cloud Deploy API access in CI/CD pipelines?

**Options:**
- A. Authorization code flow
- B. Implicit flow
- C. Client credentials flow
- D. Resource owner password flow

**Answer:** C

---

### Question 65 (Multiple Choice)
In webhook configuration, which execution mode provides real-time content updates with detailed change snapshots?

**Options:**
- A. OnStart
- B. OnEnd
- C. OnUpdate
- D. OnPublish

**Answer:** C

---

### Question 66 (Multiple Choice)
What is the maximum payload size supported by Experience Edge GraphQL queries?

**Options:**
- A. 1MB
- B. 2MB
- C. 5MB
- D. 10MB

**Answer:** B

---

# Competency 6: XM Cloud Pages

### Question 67 (Multiple Choice)
Which component categories are available in the XM Cloud Pages component library?

**Options:**
- A. Basic, Advanced, Custom, Commerce
- B. Content, Layout, Forms, Analytics
- C. Media, Navigation, Page Content, Page Structure, Commerce
- D. Text, Image, Video, Interactive, Social

**Answer:** C

---

### Question 68 (Multiple Choice)
What is the primary purpose of partial designs in XM Cloud Pages?

**Options:**
- A. To create mobile-responsive layouts
- B. To define reusable design fragments for common sections like headers and footers
- C. To enable A/B testing of page layouts
- D. To optimize page loading performance

**Answer:** B

---

### Question 69 (Multiple Choice)
Which interface provides real-time analytics with minute-by-minute updates in XM Cloud Pages?

**Options:**
- A. Pages Dashboard
- B. Pages Analyze
- C. Content Editor Analytics
- D. Experience Analytics

**Answer:** B

---

### Question 70 (Multiple Choice)
In XM Cloud Pages template management, what happens when you archive a template?

**Options:**
- A. All items created from the template are deleted
- B. The template is hidden from content authors but existing items remain
- C. The template is moved to the recycle bin
- D. A backup copy is created before removal

**Answer:** B

---

### Question 71 (Multiple Choice)
Which authentication method is NOT supported for XM Cloud Pages webhook integration?

**Options:**
- A. None (no authentication)
- B. Basic authentication
- C. API key authentication
- D. Certificate-based authentication

**Answer:** D

---

### Question 72 (Multiple Choice)
What is the maximum number of page variants supported for personalization in XM Cloud Pages?

**Options:**
- A. 5 variants per page
- B. 8 variants per page
- C. 10 variants per page
- D. Unlimited variants per page

**Answer:** B

---

### Question 73 (Multiple Choice)
Which component type allows you to bring external React components into XM Cloud Pages with JSON Schema configuration?

**Options:**
- A. Web Components
- B. BYOC (Bring Your Own Component)
- C. Custom JSS Components
- D. HTML Components

**Answer:** B

---

### Question 74 (Multiple Choice)
In XM Cloud Pages, what is the purpose of the renderingHosts configuration in xmcloud.build.json?

**Options:**
- A. To define multiple deployment targets
- B. To configure editing and rendering host endpoints for visual editing
- C. To enable multi-language support
- D. To optimize rendering performance

**Answer:** B

---

### Question 75 (Multiple Choice)
Which XM Cloud Pages feature enables authors to create components visually without coding?

**Options:**
- A. Component Factory
- B. Visual Component Builder
- C. Component Builder
- D. Pages Designer

**Answer:** C

---

### Question 76 (Multiple Choice)
What is the recommended approach for handling large JSON payloads that exceed the 2MB limit in XM Cloud Pages?

**Options:**
- A. Compress the payload using gzip
- B. Split the content into multiple smaller components
- C. Use server-side rendering instead of client-side
- D. Implement pagination for large data sets

**Answer:** D

---

# Competency 7: Security for Developers

### Question 77 (Multiple Choice)
Which security model does XM Cloud follow for infrastructure and platform security?

**Options:**
- A. Customer-managed security
- B. Hybrid security model
- C. Shared responsibility model
- D. Zero-trust security model

**Answer:** C

---

### Question 78 (Multiple Choice)
What is the typical expiration time for JWT tokens in XM Cloud authentication?

**Options:**
- A. 1 hour
- B. 8 hours
- C. 24 hours
- D. 7 days

**Answer:** C

---

### Question 79 (Multiple Choice)
Which OpenID Connect response type is recommended for secure authentication in XM Cloud applications?

**Options:**
- A. `response_type=token`
- B. `response_type=code`
- C. `response_type=id_token`
- D. `response_type=implicit`

**Answer:** B

---

### Question 80 (Multiple Choice)
Where should API keys for Experience Edge never be placed in headless applications?

**Options:**
- A. Server-side environment variables
- B. Client-side JavaScript code
- C. Secure configuration files
- D. Azure Key Vault

**Answer:** B

---

### Question 81 (Multiple Choice)
Which XM Cloud security domain is used for internal users with client access?

**Options:**
- A. Default domain
- B. Extranet domain
- C. Sitecore domain
- D. Admin domain

**Answer:** C

---

### Question 82 (Multiple Choice)
What is the recommended practice for handling sensitive data like PII in XM Cloud content?

**Options:**
- A. Encrypt the data before storing in Sitecore
- B. Store in external systems and reference by ID
- C. Use field-level security to restrict access
- D. Store in secure Sitecore databases only

**Answer:** B

---

### Question 83 (Multiple Choice)
Which environment variable should only be enabled in non-production environments for security reasons?

**Options:**
- A. `LOG_LEVEL_VALUE=DEBUG`
- B. `Sitecore_GraphQL_ExposePlayground=true`
- C. `SITECORE_SPE_ELEVATION=true`
- D. `PUBLISHING_LOG_LEVEL_VALUE=INFO`

**Answer:** B

---

### Question 84 (Multiple Choice)
What is the primary security benefit of XM Cloud's headless architecture?

**Options:**
- A. Reduced server attack surface
- B. Built-in DDoS protection
- C. Automatic security updates
- D. Frontend controls all content security implementation

**Answer:** D

---

### Question 85 (Multiple Choice)
Which access right is required for a user to publish content in XM Cloud?

**Options:**
- A. Read and Write
- B. Write and Publish
- C. Admin and Publish
- D. Create and Publish

**Answer:** B

---

### Question 86 (Multiple Choice)
How should Cross-Origin Resource Sharing (CORS) be configured for XM Cloud Pages integration?

**Options:**
- A. Allow all origins with wildcard (*)
- B. Configure environment-specific allowed origins
- C. Disable CORS for internal applications
- D. Use proxy servers to bypass CORS restrictions

**Answer:** B

---

# Competency 8: Data Modeling

### Question 87 (Multiple Choice)
Which field type should be used for storing decimal numbers with up to 5 decimal places precision?

**Options:**
- A. Integer
- B. Number
- C. Decimal
- D. Float

**Answer:** B

---

### Question 88 (Multiple Choice)
What is the maximum value that can be stored in Sitecore Number and Integer fields?

**Options:**
- A. ±2,147,483,647
- B. ±9,007,199,254,740,991
- C. ±999,999,999,999
- D. ±1,000,000,000,000

**Answer:** B

---

### Question 89 (Multiple Choice)
In template inheritance, what happens when multiple base templates define fields with the same name?

**Options:**
- A. The first template in the inheritance chain takes precedence
- B. The last template in the inheritance chain takes precedence
- C. An error is thrown preventing template creation
- D. Both fields are merged into a single field

**Answer:** A

---

### Question 90 (Multiple Choice)
Which naming convention is recommended for abstract templates that are not meant for direct item creation?

**Options:**
- A. Prefix with "Abstract"
- B. Prefix with underscore (_)
- C. Suffix with "Base"
- D. Use ALL_CAPS naming

**Answer:** B

---

### Question 91 (Multiple Choice)
What value does a Checkbox field store when it is selected?

**Options:**
- A. "true"
- B. "1"
- C. "checked"
- D. "yes"

**Answer:** B

---

### Question 92 (Multiple Choice)
Which template validation scope checks global values and multi-field conditions?

**Options:**
- A. Field validation
- B. Item validation
- C. Template validation
- D. System validation

**Answer:** B

---

### Question 93 (Multiple Choice)
In multi-language scenarios, what is the purpose of language fallback at the template level?

**Options:**
- A. To provide default values when fields are empty in specific languages
- B. To automatically translate content to other languages
- C. To synchronize field values across all language versions
- D. To validate content in multiple languages simultaneously

**Answer:** A

---

### Question 94 (Multiple Choice)
Which GraphQL query pattern is used to fetch paginated results for items with many children?

**Options:**
- A. `pageInfo` with `hasNext` and `hasPrevious`
- B. `pagination` with `offset` and `limit`
- C. `cursor` with `before` and `after`
- D. `results` with `skip` and `take`

**Answer:** A

---

### Question 95 (Multiple Choice)
What is the recommended location for organizing project-specific data templates?

**Options:**
- A. `/sitecore/templates/Common/`
- B. `/sitecore/templates/User Defined/`
- C. `/sitecore/templates/Project/[SiteName]/`
- D. `/sitecore/templates/Custom/`

**Answer:** C

---

### Question 96 (Multiple Choice)
Which field property controls the display label shown to content authors in Content Editor?

**Options:**
- A. Name
- B. Title
- C. Display Name
- D. Label

**Answer:** B

---

### Question 97 (Multiple Choice)
In template standard values, which token can be used to dynamically set the creation date?

**Options:**
- A. `$now`
- B. `$date`
- C. `$created`
- D. `$timestamp`

**Answer:** B

---

### Question 98 (Multiple Choice)
Which field type provides a rich text editor with formatting toolbar for content authors?

**Options:**
- A. Multi-line Text
- B. Rich Text
- C. HTML Text
- D. Formatted Text

**Answer:** B

---

### Question 99 (Multiple Choice)
What is the primary advantage of using base templates for common field groupings?

**Options:**
- A. Improved rendering performance
- B. Reduced template file sizes
- C. Enhanced security controls
- D. Consistent field organization and reusability

**Answer:** D

---

### Question 100 (Multiple Choice)
Which validation behavior occurs when the "Reset Blank" option is enabled on a field definition?

**Options:**
- A. Empty fields are validated more strictly
- B. Blank values are replaced with standard values during item creation
- C. Field validation rules are reset to default
- D. The field becomes required for all content items

**Answer:** B

---
