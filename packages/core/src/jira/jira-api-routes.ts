/**
 * @file packages/core/src/jira/jira-api-routes.ts
 * Centralized Jira API route and version abstraction.
 */

import type { JiraDeploymentType } from './jira-types.js';

export class JiraApiRoutes {
  /**
   * Returns the API path for the current authenticated user's profile.
   */
  public static myself(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/myself`;
  }

  /**
   * Returns the API path for server information and instance properties.
   */
  public static serverInfo(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/serverInfo`;
  }

  /**
   * Returns the API path for project discovery / count.
   */
  public static projectSearch(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    if (deploymentType === 'JIRA_CLOUD') {
      return '/rest/api/3/project/search?maxResults=0';
    }
    return '/rest/api/2/project';
  }

  /**
   * Returns the API path to list projects.
   */
  public static projects(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/project`;
  }

  /**
   * Returns the API path for a specific project.
   */
  public static project(
    projectIdOrKey: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/project/${encodeURIComponent(projectIdOrKey)}`;
  }

  /**
   * Returns the API path for project issue types.
   */
  public static issueTypes(
    projectIdOrKey?: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    if (projectIdOrKey) {
      return `/rest/api/${apiVersion}/issue/createmeta/${encodeURIComponent(projectIdOrKey)}/issuetypes`;
    }
    return `/rest/api/${apiVersion}/issuetype`;
  }

  /**
   * Returns the API path for all priorities.
   */
  public static priorities(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/priority`;
  }

  /**
   * Returns the API path for fields list or createmeta fields for an issue type.
   */
  public static fields(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/field`;
  }

  /**
   * Returns the API path for create metadata fields for a specific project and issue type.
   */
  public static createmetaFields(
    projectIdOrKey: string,
    issueTypeId: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/issue/createmeta/${encodeURIComponent(projectIdOrKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`;
  }

  /**
   * Returns the API path for project components.
   */
  public static components(
    projectIdOrKey: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/project/${encodeURIComponent(projectIdOrKey)}/components`;
  }

  /**
   * Returns the API path for assignable users for a project.
   */
  public static assignableUsers(
    projectKey: string,
    query?: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    const queryParam = deploymentType === 'JIRA_CLOUD' ? 'query' : 'username';
    const qs = new URLSearchParams({ project: projectKey });
    if (query && query.trim().length > 0) {
      qs.set(queryParam, query.trim());
    }
    return `/rest/api/${apiVersion}/user/assignable/search?${qs.toString()}`;
  }

  /**
   * Returns the API path for accessible OAuth resources/sites.
   */
  public static accessibleResources(): string {
    return '/oauth/token/accessible-resources';
  }

  /**
   * Returns the API path for issue creation.
   */
  public static issues(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/issue`;
  }

  /**
   * Returns the API path for a specific issue.
   */
  public static issue(
    issueIdOrKey: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/issue/${encodeURIComponent(issueIdOrKey)}`;
  }

  /**
   * Returns the API path for issue attachments.
   */
  public static attachments(
    issueIdOrKey: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/issue/${encodeURIComponent(issueIdOrKey)}/attachments`;
  }

  /**
   * Returns the API path for issue assignment.
   */
  public static issueAssignee(
    issueIdOrKey: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/issue/${encodeURIComponent(issueIdOrKey)}/assignee`;
  }

  /**
   * Returns the API path for issue search via JQL.
   */
  public static search(deploymentType: JiraDeploymentType = 'JIRA_CLOUD'): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/search`;
  }

  /**
   * Returns the API path for issue workflow transitions.
   */
  public static issueTransitions(
    issueIdOrKey: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/issue/${encodeURIComponent(issueIdOrKey)}/transitions`;
  }

  /**
   * Returns the API path for issue comments.
   */
  public static issueComments(
    issueIdOrKey: string,
    deploymentType: JiraDeploymentType = 'JIRA_CLOUD',
  ): string {
    const apiVersion = deploymentType === 'JIRA_CLOUD' ? '3' : '2';
    return `/rest/api/${apiVersion}/issue/${encodeURIComponent(issueIdOrKey)}/comment`;
  }
}
