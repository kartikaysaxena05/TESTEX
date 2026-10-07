/**
 * @file packages/core/src/jira/jira-client.ts
 * Authoritative Jira API adapter for authenticated communication, bounded retries, rate limiting, and error normalization.
 */

import {
  type IJiraClient,
  type JiraValidationResult,
  type JiraDeploymentType,
  type JiraAuthenticationType,
  type JiraConnectionStatus,
  type JiraRequestOptions,
  type JiraDiscoveredSiteDto,
  type JiraDiscoveredProjectDto,
  type JiraDiscoveredIssueTypeDto,
  type JiraDiscoveredPriorityDto,
  type JiraDiscoveredFieldDto,
  type JiraDiscoveredComponentDto,
  type JiraDiscoveredAssigneeDto,
  type JiraHealthCheckResultDto,
  type JiraAttachmentResponseDto,
  type JiraTransitionDto,
  JIRA_BOUNDS,
} from './jira-types.js';
import { JiraUrlValidator } from './jira-url-validator.js';
import { JiraApiRoutes } from './jira-api-routes.js';
import {
  JiraAuthenticationFailedError,
  JiraPermissionDeniedError,
  JiraConnectionFailedError,
  JiraRequestTimeoutError,
  JiraRateLimitedError,
  JiraInvalidResponseError,
  JiraSecurityError,
  JiraProjectNotFoundError,
  JiraProjectAccessDeniedError,
  JiraIssueTypeNotFoundError,
} from './jira-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

export interface JiraClientFetchOptions {
  readonly customFetch?: typeof fetch;
}

export class JiraClient implements IJiraClient {
  private readonly customFetch: typeof fetch;

  constructor(options?: JiraClientFetchOptions) {
    this.customFetch = options?.customFetch ?? globalThis.fetch;
  }

  /**
   * Validates connectivity, authentication, and permissions against Jira using read-only endpoints.
   */
  public async validateConnection(options: {
    readonly baseUrl: string;
    readonly deploymentType: JiraDeploymentType;
    readonly authenticationType: JiraAuthenticationType;
    readonly accountIdentifier: string;
    readonly apiToken: string;
    readonly timeoutMs?: number;
    readonly allowLocalhostForTesting?: boolean;
  }): Promise<JiraValidationResult> {
    const tStart = performance.now();
    const validatedAt = new Date();

    // Register sensitive credentials with SecretRedactor
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }

    try {
      // 1. Validate Base URL and SSRF bounds
      const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
        allowLocalhostForTesting: options.allowLocalhostForTesting,
      });

      const timeoutMs = options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS;

      // 2. Fetch authenticated user profile (/rest/api/3/myself or 2/myself)
      const myselfPath = JiraApiRoutes.myself(options.deploymentType);
      const myselfUrl = `${normalizedBaseUrl}${myselfPath}`;

      const myselfResponse = await this.executeRequestWithRetry({
        url: myselfUrl,
        headers: this.buildAuthHeaders(options),
        timeoutMs,
        allowLocalhostForTesting: options.allowLocalhostForTesting,
      });

      let accountIdentity: JiraValidationResult['accountIdentity'];
      if (myselfResponse.body && typeof myselfResponse.body === 'object') {
        const b = myselfResponse.body as Record<string, unknown>;
        accountIdentity = {
          accountId: typeof b.accountId === 'string' ? b.accountId : undefined,
          displayName: typeof b.displayName === 'string' ? b.displayName : undefined,
          emailAddress: typeof b.emailAddress === 'string' ? b.emailAddress : undefined,
          active: typeof b.active === 'boolean' ? b.active : undefined,
        };
      }

      // 3. Fetch server info (/rest/api/3/serverInfo or 2/serverInfo)
      let serverInfo: JiraValidationResult['serverInfo'];
      try {
        const serverInfoPath = JiraApiRoutes.serverInfo(options.deploymentType);
        const serverInfoUrl = `${normalizedBaseUrl}${serverInfoPath}`;
        const serverInfoResponse = await this.executeRequestWithRetry({
          url: serverInfoUrl,
          headers: this.buildAuthHeaders(options),
          timeoutMs: Math.min(timeoutMs, 5000),
          allowLocalhostForTesting: options.allowLocalhostForTesting,
        });

        if (serverInfoResponse.body && typeof serverInfoResponse.body === 'object') {
          const s = serverInfoResponse.body as Record<string, unknown>;
          serverInfo = {
            baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : undefined,
            version: typeof s.version === 'string' ? s.version : undefined,
            deploymentType: typeof s.deploymentType === 'string' ? s.deploymentType : undefined,
            serverTitle: typeof s.serverTitle === 'string' ? s.serverTitle : undefined,
          };
        }
      } catch {
        // Non-fatal: serverInfo is supplemental
      }

      const durationMs = Math.round(performance.now() - tStart);

      return {
        status: 'CONNECTED',
        validatedAt,
        durationMs,
        accountIdentity,
        serverInfo,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      return this.mapErrorToValidationResult(err, validatedAt, durationMs);
    }
  }

  /**
   * Discovers accessible Jira sites / resources.
   */
  public async discoverSites(
    options: JiraRequestOptions,
  ): Promise<readonly JiraDiscoveredSiteDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    if (options.authenticationType === 'OAUTH2') {
      try {
        const res = await this.executeRequestWithRetry({
          url: 'https://api.atlassian.com/oauth/token/accessible-resources',
          headers: this.buildAuthHeaders(options),
          timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
          allowLocalhostForTesting: options.allowLocalhostForTesting,
        });
        if (Array.isArray(res.body)) {
          return res.body.map((item: any) => ({
            id: String(item.id),
            name: String(item.name),
            url: String(item.url),
            scopes: Array.isArray(item.scopes) ? item.scopes.map(String) : undefined,
            avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : undefined,
          }));
        }
      } catch (err) {
        if (
          err instanceof JiraAuthenticationFailedError ||
          err instanceof JiraPermissionDeniedError
        ) {
          throw err;
        }
      }
    }

    const parsed = new URL(normalizedBaseUrl);
    return [
      {
        id: parsed.hostname,
        name: parsed.hostname,
        url: normalizedBaseUrl,
      },
    ];
  }

  /**
   * Discovers projects accessible to the authenticated Jira identity.
   */
  public async discoverProjects(
    options: JiraRequestOptions,
  ): Promise<readonly JiraDiscoveredProjectDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });
    const url = `${normalizedBaseUrl}${JiraApiRoutes.projects(options.deploymentType)}`;
    const res = await this.executeRequestWithRetry({
      url,
      headers: this.buildAuthHeaders(options),
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const rawList = Array.isArray(res.body)
      ? res.body
      : res.body && typeof res.body === 'object' && Array.isArray((res.body as any).values)
        ? (res.body as any).values
        : [];

    return rawList.map((p: any) => ({
      id: String(p.id),
      key: String(p.key),
      name: String(p.name),
      projectTypeKey: typeof p.projectTypeKey === 'string' ? p.projectTypeKey : undefined,
      simplified: typeof p.simplified === 'boolean' ? p.simplified : undefined,
      avatarUrls:
        p.avatarUrls && typeof p.avatarUrls === 'object'
          ? (p.avatarUrls as Record<string, string>)
          : undefined,
      lead:
        p.lead && typeof p.lead === 'object'
          ? {
              accountId: typeof p.lead.accountId === 'string' ? p.lead.accountId : undefined,
              displayName: typeof p.lead.displayName === 'string' ? p.lead.displayName : undefined,
            }
          : undefined,
    }));
  }

  /**
   * Discovers issue types for a specified project.
   */
  public async discoverIssueTypes(
    options: JiraRequestOptions & { readonly projectIdOrKey: string },
  ): Promise<readonly JiraDiscoveredIssueTypeDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    let rawList: any[] = [];
    try {
      const url = `${normalizedBaseUrl}${JiraApiRoutes.issueTypes(
        options.projectIdOrKey,
        options.deploymentType,
      )}`;
      const res = await this.executeRequestWithRetry({
        url,
        headers: this.buildAuthHeaders(options),
        timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
        allowLocalhostForTesting: options.allowLocalhostForTesting,
      });
      if (Array.isArray(res.body)) {
        rawList = res.body;
      } else if (
        res.body &&
        typeof res.body === 'object' &&
        Array.isArray((res.body as any).values)
      ) {
        rawList = (res.body as any).values;
      }
    } catch (err) {
      if (err instanceof JiraAuthenticationFailedError) {
        throw err;
      }
      if (err instanceof JiraPermissionDeniedError) {
        throw new JiraProjectAccessDeniedError(options.projectIdOrKey);
      }
      try {
        const projUrl = `${normalizedBaseUrl}${JiraApiRoutes.project(
          options.projectIdOrKey,
          options.deploymentType,
        )}`;
        const projRes = await this.executeRequestWithRetry({
          url: projUrl,
          headers: this.buildAuthHeaders(options),
          timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
          allowLocalhostForTesting: options.allowLocalhostForTesting,
        });
        if (
          projRes.body &&
          typeof projRes.body === 'object' &&
          Array.isArray((projRes.body as any).issueTypes)
        ) {
          rawList = (projRes.body as any).issueTypes;
        }
      } catch (projErr) {
        if (
          projErr instanceof JiraConnectionFailedError &&
          (projErr.httpStatus === 404 || projErr.message.includes('404'))
        ) {
          throw new JiraProjectNotFoundError(options.projectIdOrKey);
        }
        if (projErr instanceof JiraPermissionDeniedError) {
          throw new JiraProjectAccessDeniedError(options.projectIdOrKey);
        }
        throw projErr;
      }
    }

    return rawList.map((it: any) => ({
      id: String(it.id),
      name: String(it.name),
      description: typeof it.description === 'string' ? it.description : undefined,
      subtask: Boolean(it.subtask),
      hierarchyLevel: typeof it.hierarchyLevel === 'number' ? it.hierarchyLevel : undefined,
      iconUrl: typeof it.iconUrl === 'string' ? it.iconUrl : undefined,
    }));
  }

  /**
   * Discovers priorities configured on the Jira instance.
   */
  public async discoverPriorities(
    options: JiraRequestOptions,
  ): Promise<readonly JiraDiscoveredPriorityDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });
    const url = `${normalizedBaseUrl}${JiraApiRoutes.priorities(options.deploymentType)}`;
    const res = await this.executeRequestWithRetry({
      url,
      headers: this.buildAuthHeaders(options),
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const rawList = Array.isArray(res.body)
      ? res.body
      : res.body && typeof res.body === 'object' && Array.isArray((res.body as any).values)
        ? (res.body as any).values
        : [];

    return rawList.map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
      description: typeof p.description === 'string' ? p.description : undefined,
      statusColor: typeof p.statusColor === 'string' ? p.statusColor : undefined,
      iconUrl: typeof p.iconUrl === 'string' ? p.iconUrl : undefined,
      isDefault: typeof p.isDefault === 'boolean' ? p.isDefault : undefined,
    }));
  }

  /**
   * Discovers field metadata (including custom fields and required createmeta schemas).
   */
  public async discoverFields(
    options: JiraRequestOptions & {
      readonly projectIdOrKey?: string;
      readonly issueTypeId?: string;
    },
  ): Promise<readonly JiraDiscoveredFieldDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    let rawList: any[] = [];
    if (options.projectIdOrKey && options.issueTypeId) {
      try {
        const url = `${normalizedBaseUrl}${JiraApiRoutes.createmetaFields(
          options.projectIdOrKey,
          options.issueTypeId,
          options.deploymentType,
        )}`;
        const res = await this.executeRequestWithRetry({
          url,
          headers: this.buildAuthHeaders(options),
          timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
          allowLocalhostForTesting: options.allowLocalhostForTesting,
        });
        if (Array.isArray(res.body)) {
          rawList = res.body;
        } else if (
          res.body &&
          typeof res.body === 'object' &&
          Array.isArray((res.body as any).values)
        ) {
          rawList = (res.body as any).values;
        } else if (
          res.body &&
          typeof res.body === 'object' &&
          Array.isArray((res.body as any).fields)
        ) {
          rawList = (res.body as any).fields;
        }
      } catch (err) {
        if (
          err instanceof JiraConnectionFailedError &&
          (err.httpStatus === 404 || err.message.includes('404'))
        ) {
          throw new JiraIssueTypeNotFoundError(options.issueTypeId, options.projectIdOrKey);
        }
        throw err;
      }
    } else {
      const url = `${normalizedBaseUrl}${JiraApiRoutes.fields(options.deploymentType)}`;
      const res = await this.executeRequestWithRetry({
        url,
        headers: this.buildAuthHeaders(options),
        timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
        allowLocalhostForTesting: options.allowLocalhostForTesting,
      });
      if (Array.isArray(res.body)) {
        rawList = res.body;
      } else if (
        res.body &&
        typeof res.body === 'object' &&
        Array.isArray((res.body as any).values)
      ) {
        rawList = (res.body as any).values;
      }
    }

    return rawList.map((f: any) => {
      const id = String(f.id ?? f.fieldId ?? f.key);
      const key = String(f.key ?? f.fieldId ?? f.id);
      return {
        id,
        key,
        name: String(f.name ?? key),
        custom:
          typeof f.custom === 'boolean'
            ? f.custom
            : id.startsWith('customfield_') || key.startsWith('customfield_'),
        orderable: typeof f.orderable === 'boolean' ? f.orderable : undefined,
        navigable: typeof f.navigable === 'boolean' ? f.navigable : undefined,
        searchable: typeof f.searchable === 'boolean' ? f.searchable : undefined,
        required: typeof f.required === 'boolean' ? f.required : undefined,
        schema:
          f.schema && typeof f.schema === 'object'
            ? {
                type: typeof f.schema.type === 'string' ? f.schema.type : undefined,
                system: typeof f.schema.system === 'string' ? f.schema.system : undefined,
                custom: typeof f.schema.custom === 'string' ? f.schema.custom : undefined,
                customId: typeof f.schema.customId === 'number' ? f.schema.customId : undefined,
                items: typeof f.schema.items === 'string' ? f.schema.items : undefined,
              }
            : undefined,
        allowedValues: Array.isArray(f.allowedValues) ? f.allowedValues : undefined,
      };
    });
  }

  /**
   * Discovers components defined for a project.
   */
  public async discoverComponents(
    options: JiraRequestOptions & { readonly projectIdOrKey: string },
  ): Promise<readonly JiraDiscoveredComponentDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });
    const url = `${normalizedBaseUrl}${JiraApiRoutes.components(
      options.projectIdOrKey,
      options.deploymentType,
    )}`;
    try {
      const res = await this.executeRequestWithRetry({
        url,
        headers: this.buildAuthHeaders(options),
        timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
        allowLocalhostForTesting: options.allowLocalhostForTesting,
      });
      const rawList = Array.isArray(res.body)
        ? res.body
        : res.body && typeof res.body === 'object' && Array.isArray((res.body as any).values)
          ? (res.body as any).values
          : [];

      return rawList.map((c: any) => ({
        id: String(c.id),
        name: String(c.name),
        description: typeof c.description === 'string' ? c.description : undefined,
        lead:
          c.lead && typeof c.lead === 'object'
            ? {
                accountId: typeof c.lead.accountId === 'string' ? c.lead.accountId : undefined,
                displayName:
                  typeof c.lead.displayName === 'string' ? c.lead.displayName : undefined,
              }
            : undefined,
        assigneeType: typeof c.assigneeType === 'string' ? c.assigneeType : undefined,
      }));
    } catch (err) {
      if (
        err instanceof JiraConnectionFailedError &&
        (err.httpStatus === 404 || err.message.includes('404'))
      ) {
        throw new JiraProjectNotFoundError(options.projectIdOrKey);
      }
      if (err instanceof JiraPermissionDeniedError) {
        throw new JiraProjectAccessDeniedError(options.projectIdOrKey);
      }
      throw err;
    }
  }

  /**
   * Discovers assignable users for a project.
   */
  public async discoverAssignees(
    options: JiraRequestOptions & { readonly projectKey: string; readonly query?: string },
  ): Promise<readonly JiraDiscoveredAssigneeDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });
    const url = `${normalizedBaseUrl}${JiraApiRoutes.assignableUsers(
      options.projectKey,
      options.query,
      options.deploymentType,
    )}`;
    try {
      const res = await this.executeRequestWithRetry({
        url,
        headers: this.buildAuthHeaders(options),
        timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
        allowLocalhostForTesting: options.allowLocalhostForTesting,
      });
      const rawList = Array.isArray(res.body)
        ? res.body
        : res.body && typeof res.body === 'object' && Array.isArray((res.body as any).values)
          ? (res.body as any).values
          : [];

      return rawList.map((u: any) => ({
        accountId: String(u.accountId ?? u.name ?? u.key),
        displayName: String(u.displayName ?? u.name ?? 'Unknown'),
        emailAddress: typeof u.emailAddress === 'string' ? u.emailAddress : undefined,
        active: typeof u.active === 'boolean' ? u.active : undefined,
        avatarUrls:
          u.avatarUrls && typeof u.avatarUrls === 'object'
            ? (u.avatarUrls as Record<string, string>)
            : undefined,
      }));
    } catch (err) {
      if (
        err instanceof JiraConnectionFailedError &&
        (err.httpStatus === 404 || err.message.includes('404'))
      ) {
        throw new JiraProjectNotFoundError(options.projectKey);
      }
      if (err instanceof JiraPermissionDeniedError) {
        throw new JiraProjectAccessDeniedError(options.projectKey);
      }
      throw err;
    }
  }

  /**
   * Performs a comprehensive multi-step connection health check.
   */
  public async testConnectionHealth(
    options: JiraRequestOptions & {
      readonly projectIdOrKey?: string;
      readonly issueTypeId?: string;
    },
  ): Promise<JiraHealthCheckResultDto> {
    const tStart = performance.now();
    const checkedAt = new Date().toISOString();

    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }

    const checks: JiraHealthCheckResultDto['checks'] = {
      authentication: { passed: false, message: 'Not evaluated' },
      reachability: { passed: false, message: 'Not evaluated' },
      projectAccess: { passed: false, message: 'Not evaluated' },
      issueMetadataAccess: { passed: false, message: 'Not evaluated' },
    };

    let status: JiraConnectionStatus = 'UNVALIDATED';
    let accountIdentity: JiraHealthCheckResultDto['accountIdentity'];
    let serverInfo: JiraHealthCheckResultDto['serverInfo'];

    try {
      const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
        allowLocalhostForTesting: options.allowLocalhostForTesting,
      });
      const timeoutMs = options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS;

      // 1. Check Authentication (/myself)
      try {
        const myselfUrl = `${normalizedBaseUrl}${JiraApiRoutes.myself(options.deploymentType)}`;
        const myselfRes = await this.executeRequestWithRetry({
          url: myselfUrl,
          headers: this.buildAuthHeaders(options),
          timeoutMs,
          allowLocalhostForTesting: options.allowLocalhostForTesting,
        });
        if (myselfRes.body && typeof myselfRes.body === 'object') {
          const b = myselfRes.body as Record<string, unknown>;
          accountIdentity = {
            accountId: typeof b.accountId === 'string' ? b.accountId : undefined,
            displayName: typeof b.displayName === 'string' ? b.displayName : undefined,
            emailAddress: typeof b.emailAddress === 'string' ? b.emailAddress : undefined,
            active: typeof b.active === 'boolean' ? b.active : undefined,
          };
        }
        checks.authentication = {
          passed: true,
          message: `Authenticated as ${accountIdentity?.displayName ?? accountIdentity?.emailAddress ?? 'identity'}`,
        };
      } catch (authErr: any) {
        checks.authentication = {
          passed: false,
          message: authErr.message ?? 'Authentication failed',
        };
        throw authErr;
      }

      // 2. Check Reachability & Server Info (/serverInfo)
      const tServerStart = performance.now();
      try {
        const serverInfoUrl = `${normalizedBaseUrl}${JiraApiRoutes.serverInfo(options.deploymentType)}`;
        const sRes = await this.executeRequestWithRetry({
          url: serverInfoUrl,
          headers: this.buildAuthHeaders(options),
          timeoutMs: Math.min(timeoutMs, 5000),
          allowLocalhostForTesting: options.allowLocalhostForTesting,
        });
        const respTime = Math.round(performance.now() - tServerStart);
        if (sRes.body && typeof sRes.body === 'object') {
          const s = sRes.body as Record<string, unknown>;
          serverInfo = {
            baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : undefined,
            version: typeof s.version === 'string' ? s.version : undefined,
            deploymentType: typeof s.deploymentType === 'string' ? s.deploymentType : undefined,
            serverTitle: typeof s.serverTitle === 'string' ? s.serverTitle : undefined,
          };
        }
        checks.reachability = {
          passed: true,
          message: `Host reachable (${respTime}ms)`,
          responseTimeMs: respTime,
        };
      } catch (reachErr: any) {
        checks.reachability = {
          passed: false,
          message: reachErr.message ?? 'Host reachability check failed',
        };
      }

      // 3. Check Project Access
      try {
        if (options.projectIdOrKey) {
          const projUrl = `${normalizedBaseUrl}${JiraApiRoutes.project(
            options.projectIdOrKey,
            options.deploymentType,
          )}`;
          await this.executeRequestWithRetry({
            url: projUrl,
            headers: this.buildAuthHeaders(options),
            timeoutMs,
            allowLocalhostForTesting: options.allowLocalhostForTesting,
          });
          checks.projectAccess = {
            passed: true,
            message: `Verified access to project '${options.projectIdOrKey}'`,
            accessibleCount: 1,
          };
        } else {
          const projectsUrl = `${normalizedBaseUrl}${JiraApiRoutes.projects(options.deploymentType)}`;
          const projRes = await this.executeRequestWithRetry({
            url: projectsUrl,
            headers: this.buildAuthHeaders(options),
            timeoutMs,
            allowLocalhostForTesting: options.allowLocalhostForTesting,
          });
          const count = Array.isArray(projRes.body)
            ? projRes.body.length
            : projRes.body &&
                typeof projRes.body === 'object' &&
                Array.isArray((projRes.body as any).values)
              ? (projRes.body as any).values.length
              : 0;
          checks.projectAccess = {
            passed: true,
            message: `Accessible projects found: ${count}`,
            accessibleCount: count,
          };
        }
      } catch (projErr: any) {
        checks.projectAccess = {
          passed: false,
          message: projErr.message ?? 'Project access check failed',
        };
      }

      // 4. Check Issue Metadata Access
      try {
        if (options.projectIdOrKey && options.issueTypeId) {
          const metaUrl = `${normalizedBaseUrl}${JiraApiRoutes.createmetaFields(
            options.projectIdOrKey,
            options.issueTypeId,
            options.deploymentType,
          )}`;
          await this.executeRequestWithRetry({
            url: metaUrl,
            headers: this.buildAuthHeaders(options),
            timeoutMs,
            allowLocalhostForTesting: options.allowLocalhostForTesting,
          });
          checks.issueMetadataAccess = {
            passed: true,
            message: `Verified createmeta fields for issue type '${options.issueTypeId}'`,
          };
        } else {
          const issueTypesUrl = `${normalizedBaseUrl}${JiraApiRoutes.issueTypes(
            undefined,
            options.deploymentType,
          )}`;
          await this.executeRequestWithRetry({
            url: issueTypesUrl,
            headers: this.buildAuthHeaders(options),
            timeoutMs,
            allowLocalhostForTesting: options.allowLocalhostForTesting,
          });
          checks.issueMetadataAccess = {
            passed: true,
            message: 'Verified issue types access',
          };
        }
      } catch (metaErr: any) {
        checks.issueMetadataAccess = {
          passed: false,
          message: metaErr.message ?? 'Issue metadata access check failed',
        };
      }

      const allPassed =
        checks.authentication.passed &&
        checks.reachability.passed &&
        checks.projectAccess.passed &&
        checks.issueMetadataAccess.passed;

      status = allPassed ? 'CONNECTED' : 'INVALID_CONFIGURATION';

      return {
        status,
        healthy: allPassed,
        checkedAt,
        durationMs: Math.round(performance.now() - tStart),
        checks,
        accountIdentity,
        serverInfo,
      };
    } catch (err: any) {
      const mapped = this.mapErrorToValidationResult(
        err,
        new Date(checkedAt),
        Math.round(performance.now() - tStart),
      );
      return {
        status: mapped.status,
        healthy: false,
        checkedAt,
        durationMs: mapped.durationMs,
        checks,
        accountIdentity,
        serverInfo,
        errorMessage: mapped.errorMessage,
        errorCode: mapped.errorCode,
      };
    }
  }

  /**
   * Creates a new Jira issue using POST /rest/api/3/issue or /rest/api/2/issue.
   */
  public async createIssue(
    options: JiraRequestOptions & { readonly payload: unknown },
  ): Promise<{ readonly id: string; readonly key: string; readonly self?: string }> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.issues(options.deploymentType)}`;
    const res = await this.executeRequestWithRetry({
      url,
      method: 'POST',
      headers: this.buildAuthHeaders(options),
      body: options.payload,
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    if (!res.body || typeof res.body !== 'object') {
      throw new JiraInvalidResponseError('Jira create issue returned non-object response.');
    }

    const b = res.body as Record<string, unknown>;
    if (!b.id || !b.key || typeof b.id !== 'string' || typeof b.key !== 'string') {
      throw new JiraInvalidResponseError(
        'Jira create issue response missing required id or key fields.',
      );
    }

    return {
      id: b.id,
      key: b.key,
      self: typeof b.self === 'string' ? b.self : undefined,
    };
  }

  /**
   * Retrieves an issue by ID or Key using GET /rest/api/3/issue/:idOrKey.
   */
  public async getIssue(options: JiraRequestOptions & { readonly issueIdOrKey: string }): Promise<{
    readonly id: string;
    readonly key: string;
    readonly self?: string;
    readonly fields?: Record<string, unknown>;
  }> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.issue(options.issueIdOrKey, options.deploymentType)}`;
    const res = await this.executeRequestWithRetry({
      url,
      method: 'GET',
      headers: this.buildAuthHeaders(options),
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    if (!res.body || typeof res.body !== 'object') {
      throw new JiraInvalidResponseError('Jira get issue returned non-object response.');
    }

    const b = res.body as Record<string, unknown>;
    if (!b.id || !b.key || typeof b.id !== 'string' || typeof b.key !== 'string') {
      throw new JiraInvalidResponseError(
        'Jira get issue response missing required id or key fields.',
      );
    }

    return {
      id: b.id,
      key: b.key,
      self: typeof b.self === 'string' ? b.self : undefined,
      fields:
        b.fields && typeof b.fields === 'object'
          ? (b.fields as Record<string, unknown>)
          : undefined,
    };
  }

  /**
   * Attaches a single binary evidence file to an authoritative Jira issue.
   * Uses POST /rest/api/3/issue/:issueIdOrKey/attachments with multipart/form-data
   * and X-Atlassian-Token: no-check.
   */
  public async attachEvidence(
    options: JiraRequestOptions & {
      readonly issueIdOrKey: string;
      readonly filename: string;
      readonly content: Buffer;
      readonly mimeType?: string;
    },
  ): Promise<readonly JiraAttachmentResponseDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.attachments(options.issueIdOrKey, options.deploymentType)}`;

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(options.content)], {
      type: options.mimeType || 'application/octet-stream',
    });
    formData.append('file', blob, options.filename);

    const authHeaders = this.buildAuthHeaders(options);
    const headers: Record<string, string> = {
      ...authHeaders,
      'X-Atlassian-Token': 'no-check',
    };
    // Note: Do NOT set Content-Type header so fetch generates multipart/form-data boundary

    const res = await this.executeRequestWithRetry({
      url,
      method: 'POST',
      headers,
      body: formData,
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    if (!res.body || !Array.isArray(res.body)) {
      throw new JiraInvalidResponseError('Jira attach evidence returned non-array response.');
    }

    return (res.body as Array<Record<string, unknown>>).map(item => ({
      id: String(item.id),
      self: String(item.self),
      filename: String(item.filename),
      size: Number(item.size),
      mimeType: String(item.mimeType),
      created: typeof item.created === 'string' ? item.created : undefined,
    }));
  }

  /**
   * Searches for existing Jira issues via JQL.
   * Uses POST /rest/api/3/search (or /rest/api/2/search) with JQL query.
   */
  public async searchIssues(
    options: JiraRequestOptions & {
      readonly jql: string;
      readonly maxResults?: number;
      readonly fields?: readonly string[];
    },
  ): Promise<{
    readonly issues: readonly {
      readonly id: string;
      readonly key: string;
      readonly fields?: Record<string, unknown>;
    }[];
    readonly total: number;
  }> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.search(options.deploymentType)}`;
    const authHeaders = this.buildAuthHeaders(options);
    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
    };

    const payload = {
      jql: options.jql,
      maxResults: options.maxResults ?? 50,
      fields: options.fields ?? ['summary', 'status', 'labels', 'issuetype', 'priority'],
    };

    const res = await this.executeRequestWithRetry({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    if (!res.body || typeof res.body !== 'object') {
      throw new JiraInvalidResponseError('Jira search returned non-object response.');
    }

    const b = res.body as Record<string, unknown>;
    const rawIssues = Array.isArray(b.issues) ? b.issues : [];
    const total = typeof b.total === 'number' ? b.total : rawIssues.length;

    const issues = rawIssues
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map(item => ({
        id: String(item.id ?? ''),
        key: String(item.key ?? ''),
        fields:
          item.fields && typeof item.fields === 'object'
            ? (item.fields as Record<string, unknown>)
            : undefined,
      }))
      .filter(item => item.id.length > 0 && item.key.length > 0);

    return { issues, total };
  }

  /**
   * Assigns or unassigns an issue via PUT /rest/api/3/issue/{issueIdOrKey}/assignee.
   * For Cloud, payload is { accountId: string | null }.
   * For Server/DC, payload is { name: string | null }.
   * A successful response is HTTP 204 No Content.
   */
  public async assignIssue(
    options: JiraRequestOptions & {
      readonly issueIdOrKey: string;
      readonly accountId?: string | null;
      readonly username?: string | null;
    },
  ): Promise<void> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.issueAssignee(options.issueIdOrKey, options.deploymentType)}`;
    const authHeaders = this.buildAuthHeaders(options);
    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
    };

    let payload: Record<string, unknown>;
    if (options.deploymentType === 'JIRA_CLOUD') {
      payload = {
        accountId: options.accountId !== undefined ? options.accountId : null,
      };
    } else {
      payload = {
        name: options.username !== undefined ? options.username : (options.accountId ?? null),
      };
    }

    await this.executeRequestWithRetry({
      url,
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });
  }

  /**
   * Fetches available workflow transitions for an issue.
   * Calls GET /rest/api/3/issue/{issueIdOrKey}/transitions (or api/2).
   */
  public async getTransitions(
    options: JiraRequestOptions & { readonly issueIdOrKey: string },
  ): Promise<readonly JiraTransitionDto[]> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.issueTransitions(options.issueIdOrKey, options.deploymentType)}`;
    const authHeaders = this.buildAuthHeaders(options);

    const response = await this.executeRequestWithRetry({
      url,
      method: 'GET',
      headers: authHeaders,
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const rawBody = response.body;
    let data: Record<string, unknown> | null = null;
    if (typeof rawBody === 'string') {
      try {
        data = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        data = null;
      }
    } else if (rawBody && typeof rawBody === 'object') {
      data = rawBody as Record<string, unknown>;
    }

    if (!data || !Array.isArray(data.transitions)) {
      return [];
    }

    const transitions = data.transitions as Array<Record<string, unknown>>;
    return transitions.map(t => {
      const toObj = (t.to && typeof t.to === 'object' ? t.to : {}) as Record<string, unknown>;
      const catObj = (
        toObj.statusCategory && typeof toObj.statusCategory === 'object'
          ? toObj.statusCategory
          : undefined
      ) as Record<string, unknown> | undefined;

      return {
        id: String(t.id ?? ''),
        name: String(t.name ?? ''),
        to: {
          id: String(toObj.id ?? ''),
          name: String(toObj.name ?? ''),
          statusCategory: catObj
            ? {
                id: typeof catObj.id === 'number' ? catObj.id : undefined,
                key: typeof catObj.key === 'string' ? catObj.key : undefined,
                name: typeof catObj.name === 'string' ? catObj.name : undefined,
              }
            : undefined,
        },
        hasScreen: Boolean(t.hasScreen),
        isGlobal: Boolean(t.isGlobal),
        isInitial: Boolean(t.isInitial),
        isConditional: Boolean(t.isConditional),
      };
    });
  }

  /**
   * Executes a workflow transition for an issue.
   * Calls POST /rest/api/3/issue/{issueIdOrKey}/transitions (or api/2) with { transition: { id } }.
   * A successful transition returns HTTP 204 No Content.
   */
  public async transitionIssue(
    options: JiraRequestOptions & {
      readonly issueIdOrKey: string;
      readonly transitionId: string;
    },
  ): Promise<void> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.issueTransitions(options.issueIdOrKey, options.deploymentType)}`;
    const authHeaders = this.buildAuthHeaders(options);
    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
    };

    const payload = {
      transition: {
        id: options.transitionId,
      },
    };

    await this.executeRequestWithRetry({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });
  }

  /**
   * Adds a comment to a Jira issue.
   * Calls POST /rest/api/3/issue/{issueIdOrKey}/comment (or api/2).
   * For Jira Cloud (v3), wraps body in ADF; for Server (v2), sends string body.
   */
  public async addComment(
    options: JiraRequestOptions & {
      readonly issueIdOrKey: string;
      readonly body: string;
    },
  ): Promise<{ readonly id: string; readonly created?: string }> {
    SecretRedactor.registerSecret(options.apiToken);
    if (options.accountIdentifier) {
      SecretRedactor.registerSecret(options.accountIdentifier);
    }
    const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(options.baseUrl, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const url = `${normalizedBaseUrl}${JiraApiRoutes.issueComments(options.issueIdOrKey, options.deploymentType)}`;
    const authHeaders = this.buildAuthHeaders(options);
    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
    };

    const isCloud = options.deploymentType === 'JIRA_CLOUD';
    const payload = isCloud
      ? {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: options.body,
                  },
                ],
              },
            ],
          },
        }
      : {
          body: options.body,
        };

    const res = await this.executeRequestWithRetry({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeoutMs: options.timeoutMs ?? JIRA_BOUNDS.DEFAULT_TIMEOUT_MS,
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const data = res.body as Record<string, unknown>;
    return {
      id: String(data?.id ?? 'comment-created'),
      created: data?.created ? String(data.created) : new Date().toISOString(),
    };
  }

  /**
   * Constructs the appropriate HTTP Authorization headers.
   */
  private buildAuthHeaders(options: {
    readonly authenticationType: JiraAuthenticationType;
    readonly accountIdentifier: string;
    readonly apiToken: string;
  }): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'AI-Quality-Platform-Jira-Adapter/1.0',
    };

    if (options.authenticationType === 'API_TOKEN' || options.authenticationType === 'BASIC_AUTH') {
      const credentials = `${options.accountIdentifier}:${options.apiToken}`;
      const base64 = Buffer.from(credentials, 'utf8').toString('base64');
      headers.Authorization = `Basic ${base64}`;
    } else if (
      options.authenticationType === 'PERSONAL_ACCESS_TOKEN' ||
      options.authenticationType === 'OAUTH2'
    ) {
      headers.Authorization = `Bearer ${options.apiToken}`;
    }

    return headers;
  }

  /**
   * Dispatches an HTTP request with bounded timeout, SSRF validation, and conservative retry policy.
   */
  private async executeRequestWithRetry(options: {
    readonly url: string;
    readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    readonly headers: Record<string, string>;
    readonly body?: unknown;
    readonly timeoutMs: number;
    readonly allowLocalhostForTesting?: boolean;
  }): Promise<{ readonly status: number; readonly body: unknown }> {
    let lastError: unknown;
    let retriesLeft = JIRA_BOUNDS.MAX_RETRIES;
    let delayMs: number = JIRA_BOUNDS.RETRY_BASE_DELAY_MS;

    while (retriesLeft >= 0) {
      try {
        return await this.dispatchSingleRequest(options);
      } catch (err: unknown) {
        lastError = err;

        // Never retry fatal authentication, permission, or client errors
        if (
          err instanceof JiraAuthenticationFailedError ||
          err instanceof JiraPermissionDeniedError ||
          err instanceof JiraSecurityError
        ) {
          throw err;
        }

        // Retry only on rate limits or server errors if attempts remain
        if (retriesLeft > 0 && this.isRetryableError(err)) {
          retriesLeft--;
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs = Math.min(delayMs * 2, JIRA_BOUNDS.MAX_RETRY_DELAY_MS);
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }

  /**
   * Performs a single fetch request with AbortSignal timeout and SSRF defense.
   */
  private async dispatchSingleRequest(options: {
    readonly url: string;
    readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    readonly headers: Record<string, string>;
    readonly body?: unknown;
    readonly timeoutMs: number;
    readonly allowLocalhostForTesting?: boolean;
  }): Promise<{ readonly status: number; readonly body: unknown }> {
    // Validate target URL against SSRF
    const parsed = new URL(options.url);
    JiraUrlValidator.assertSsrfSafeHostname(parsed.hostname, {
      allowLocalhostForTesting: options.allowLocalhostForTesting,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);

    const method = options.method ?? 'GET';
    const reqHeaders: Record<string, string> = { ...options.headers };
    let reqBody: any;

    if (options.body !== undefined && options.body !== null) {
      if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        reqBody = options.body;
      } else {
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
        reqBody = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
    }

    try {
      const response = await this.customFetch(options.url, {
        method,
        headers: reqHeaders,
        body: reqBody,
        signal: controller.signal,
        redirect: 'error', // Disallow automatic unvalidated redirect chains
      });

      clearTimeout(timeoutId);

      const status = response.status;

      // Handle 401 Unauthorized
      if (status === 401) {
        throw new JiraAuthenticationFailedError();
      }

      // Handle 403 Forbidden
      if (status === 403) {
        throw new JiraPermissionDeniedError();
      }

      // Handle 429 Too Many Requests
      if (status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSeconds = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10)
          : undefined;
        throw new JiraRateLimitedError(
          `Jira API rate limit exceeded. Retry after ${retryAfterSeconds ?? 'unknown'} seconds.`,
          Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds,
        );
      }

      // Handle 5xx Server Errors
      if (status >= 500) {
        throw new JiraConnectionFailedError(`Jira server responded with HTTP ${status}.`);
      }

      // Handle other 4xx Client Errors
      if (status >= 400) {
        const rawErrorText = await response.text();
        let parsedMessage = `Jira API request failed with HTTP ${status}.`;
        try {
          const parsed = JSON.parse(rawErrorText);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.errorMessages) && parsed.errorMessages.length > 0) {
              parsedMessage = `Jira error (HTTP ${status}): ${parsed.errorMessages.join('; ')}`;
            } else if (parsed.errors && typeof parsed.errors === 'object') {
              const details = Object.entries(parsed.errors)
                .map(([field, err]) => `${field}: ${err}`)
                .join(', ');
              parsedMessage = `Jira field error (HTTP ${status}): ${details}`;
            }
          }
        } catch {
          // Fall back to default status message
        }
        throw new JiraConnectionFailedError(parsedMessage, status);
      }

      // Parse JSON response
      const text = await response.text();
      let body: unknown;
      if (text && text.trim().length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new JiraInvalidResponseError('Failed to parse Jira response as JSON.');
        }
      }

      return { status, body };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (controller.signal.aborted) {
        throw new JiraRequestTimeoutError(options.timeoutMs, 'connection validation');
      }

      if (
        err instanceof JiraAuthenticationFailedError ||
        err instanceof JiraPermissionDeniedError ||
        err instanceof JiraRateLimitedError ||
        err instanceof JiraSecurityError ||
        err instanceof JiraInvalidResponseError ||
        err instanceof JiraConnectionFailedError
      ) {
        throw err;
      }

      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitized = SecretRedactor.redactText(rawMsg);

      if (sanitized.includes('ECONNREFUSED') || sanitized.includes('ENOTFOUND')) {
        throw new JiraConnectionFailedError(`Target Jira host is unreachable: ${sanitized}`);
      }

      throw new JiraConnectionFailedError(`Jira communication error: ${sanitized}`);
    }
  }

  /**
   * Evaluates whether an error qualifies for retry.
   */
  private isRetryableError(err: unknown): boolean {
    if (err instanceof JiraRateLimitedError) return true;
    if (err instanceof JiraConnectionFailedError) {
      const msg = err.message;
      return (
        msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')
      );
    }
    return false;
  }

  /**
   * Maps caught domain/network errors into safe JiraValidationResult DTO.
   */
  private mapErrorToValidationResult(
    err: unknown,
    validatedAt: Date,
    durationMs: number,
  ): JiraValidationResult {
    let status: JiraValidationResult['status'] = 'UNKNOWN_ERROR';
    let errorCode: string | undefined;
    let errorMessage: string;
    let rateLimitInfo: JiraValidationResult['rateLimitInfo'];

    if (err instanceof JiraAuthenticationFailedError) {
      status = 'AUTHENTICATION_FAILED';
      errorCode = err.code;
      errorMessage = err.message;
    } else if (err instanceof JiraPermissionDeniedError) {
      status = 'PERMISSION_DENIED';
      errorCode = err.code;
      errorMessage = err.message;
    } else if (err instanceof JiraRateLimitedError) {
      status = 'RATE_LIMITED';
      errorCode = err.code;
      errorMessage = err.message;
      rateLimitInfo = { retryAfterSeconds: err.retryAfterSeconds };
    } else if (err instanceof JiraRequestTimeoutError) {
      status = 'TIMEOUT';
      errorCode = err.code;
      errorMessage = err.message;
    } else if (err instanceof JiraSecurityError || err instanceof JiraInvalidResponseError) {
      status = 'INVALID_CONFIGURATION';
      errorCode = err.code;
      errorMessage = err.message;
    } else if (err instanceof JiraConnectionFailedError) {
      status = 'UNREACHABLE';
      errorCode = err.code;
      errorMessage = err.message;
    } else {
      const raw = err instanceof Error ? err.message : String(err);
      errorMessage = SecretRedactor.redactText(raw);
    }

    return {
      status,
      validatedAt,
      durationMs,
      errorCode,
      errorMessage: SecretRedactor.redactText(errorMessage),
      rateLimitInfo,
    };
  }
}
