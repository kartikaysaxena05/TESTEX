/**
 * @file packages/core/src/git-repositories/git-provider-client.ts
 * Provider abstraction and GitHub API client for repository discovery, branch retrieval, and source acquisition.
 */

import type {
  GitProviderType,
  GitProviderAccountDto,
  GitProviderRepositoryDto,
  GitBranchDto,
} from '@ai-quality/contracts';
import {
  GitProviderAuthError,
  RepositoryConnectionNotFoundError,
  RepositoryAccessDeniedError,
  RepositoryImportError,
  RepositoryImportTimeoutError,
  RepositoryImportCancelledError,
} from './git-repository-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

export interface DownloadedFileEntry {
  readonly relativePath: string;
  readonly content: Buffer;
}

export interface FetchRepositoryFilesOptions {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string; // branch or commit SHA
  readonly token?: string | null;
  readonly signal?: AbortSignal;
}

export interface IGitProviderClient {
  readonly provider: GitProviderType;
  verifyAuth(token: string, signal?: AbortSignal): Promise<GitProviderAccountDto>;
  listRepositories(
    token?: string | null,
    search?: string,
    signal?: AbortSignal,
  ): Promise<readonly GitProviderRepositoryDto[]>;
  getRepository(
    owner: string,
    repo: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<GitProviderRepositoryDto>;
  listBranches(
    owner: string,
    repo: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<readonly GitBranchDto[]>;
  getBranch(
    owner: string,
    repo: string,
    branch: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<GitBranchDto>;
  getCommit(
    owner: string,
    repo: string,
    sha: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<{ sha: string; message: string; date: string }>;
  fetchRepositoryFiles(
    options: FetchRepositoryFilesOptions,
  ): Promise<readonly DownloadedFileEntry[]>;
}

export class GitHubProviderClient implements IGitProviderClient {
  readonly provider: GitProviderType = 'GITHUB';
  private readonly baseUrl: string;

  constructor(baseUrl = 'https://api.github.com') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private getHeaders(token?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'AI-Quality-Platform/1.0',
    };
    if (token && token.trim().length > 0) {
      SecretRedactor.registerSecret(token.trim());
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(token),
        signal,
      });

      if (response.status === 401) {
        throw new GitProviderAuthError('GitHub authentication failed: Bad or expired credentials.');
      }
      if (response.status === 403) {
        const errorMsg = await response.text().catch(() => '');
        if (errorMsg.includes('rate limit')) {
          throw new RepositoryAccessDeniedError('GitHub API rate limit exceeded.');
        }
        throw new RepositoryAccessDeniedError(
          'GitHub access denied. Insufficient permissions for repository or account.',
        );
      }
      if (response.status === 404) {
        throw new RepositoryConnectionNotFoundError('GitHub resource not found.');
      }
      if (!response.ok) {
        throw new RepositoryImportError(
          `GitHub API request failed with HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new RepositoryImportCancelledError('GitHub request was aborted.');
      }
      if (
        err instanceof GitProviderAuthError ||
        err instanceof RepositoryAccessDeniedError ||
        err instanceof RepositoryConnectionNotFoundError ||
        err instanceof RepositoryImportError ||
        err instanceof RepositoryImportCancelledError
      ) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new RepositoryImportCancelledError('GitHub request was cancelled.');
      }
      if (err instanceof Error && (err.name === 'TimeoutError' || err.message.includes('timeout'))) {
        throw new RepositoryImportTimeoutError('GitHub API request timed out.');
      }
      throw new RepositoryImportError(
        `GitHub API error: ${err instanceof Error ? err.message : 'Network request failed'}`,
      );
    }
  }

  async verifyAuth(token: string, signal?: AbortSignal): Promise<GitProviderAccountDto> {
    if (!token || token.trim().length === 0) {
      throw new GitProviderAuthError('GitHub token is required.');
    }

    interface GitHubUserResponse {
      login: string;
      name?: string | null;
      avatar_url?: string | null;
    }

    const userData = await this.request<GitHubUserResponse>('/user', token, signal);

    return {
      provider: 'GITHUB',
      username: userData.login,
      displayName: userData.name ?? null,
      avatarUrl: userData.avatar_url ?? null,
      scopes: ['repo', 'read:user'],
    };
  }

  async listRepositories(
    token?: string | null,
    search?: string,
    signal?: AbortSignal,
  ): Promise<readonly GitProviderRepositoryDto[]> {
    interface GitHubRepoItem {
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
      html_url: string;
      private: boolean;
      default_branch: string;
      fork: boolean;
    }

    const endpoint = token ? '/user/repos?per_page=100&sort=updated' : '/repositories?per_page=100';
    const repos = await this.request<GitHubRepoItem[]>(endpoint, token, signal);

    let filtered = repos;
    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      filtered = repos.filter(
        (r) => r.full_name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      );
    }

    return filtered.map((r) => ({
      provider: 'GITHUB',
      repositoryIdentifier: r.full_name,
      name: r.name,
      owner: r.owner.login,
      url: r.html_url,
      visibility: r.private ? 'PRIVATE' : 'PUBLIC',
      defaultBranch: r.default_branch || 'main',
      isFork: r.fork,
    }));
  }

  async getRepository(
    owner: string,
    repo: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<GitProviderRepositoryDto> {
    interface GitHubRepoDetail {
      name: string;
      full_name: string;
      owner: { login: string };
      html_url: string;
      private: boolean;
      default_branch: string;
      fork: boolean;
    }

    const data = await this.request<GitHubRepoDetail>(`/repos/${owner}/${repo}`, token, signal);

    return {
      provider: 'GITHUB',
      repositoryIdentifier: data.full_name,
      name: data.name,
      owner: data.owner.login,
      url: data.html_url,
      visibility: data.private ? 'PRIVATE' : 'PUBLIC',
      defaultBranch: data.default_branch || 'main',
      isFork: data.fork,
    };
  }

  async listBranches(
    owner: string,
    repo: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<readonly GitBranchDto[]> {
    interface GitHubBranchItem {
      name: string;
      commit: { sha: string };
    }

    const data = await this.request<GitHubBranchItem[]>(
      `/repos/${owner}/${repo}/branches?per_page=100`,
      token,
      signal,
    );

    return data.map((b) => ({
      name: b.name,
      commitSha: b.commit.sha,
      isDefault: b.name === 'main' || b.name === 'master',
    }));
  }

  async getBranch(
    owner: string,
    repo: string,
    branch: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<GitBranchDto> {
    interface GitHubBranchDetail {
      name: string;
      commit: { sha: string };
    }

    const data = await this.request<GitHubBranchDetail>(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      token,
      signal,
    );

    return {
      name: data.name,
      commitSha: data.commit.sha,
      isDefault: data.name === 'main' || data.name === 'master',
    };
  }

  async getCommit(
    owner: string,
    repo: string,
    sha: string,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<{ sha: string; message: string; date: string }> {
    interface GitHubCommitDetail {
      sha: string;
      commit: {
        message: string;
        committer?: { date: string };
        author?: { date: string };
      };
    }

    const data = await this.request<GitHubCommitDetail>(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`,
      token,
      signal,
    );

    return {
      sha: data.sha,
      message: data.commit.message,
      date: data.commit.committer?.date || data.commit.author?.date || new Date().toISOString(),
    };
  }

  async fetchRepositoryFiles(
    options: FetchRepositoryFilesOptions,
  ): Promise<readonly DownloadedFileEntry[]> {
    // Uses Git tree API to fetch repository contents deterministically
    interface GitHubGitTreeItem {
      path: string;
      mode: string;
      type: string; // 'blob' or 'tree'
      sha: string;
      size?: number;
      url?: string;
    }

    interface GitHubGitTreeResponse {
      sha: string;
      tree: GitHubGitTreeItem[];
      truncated: boolean;
    }

    const treeData = await this.request<GitHubGitTreeResponse>(
      `/repos/${options.owner}/${options.repo}/git/trees/${encodeURIComponent(options.ref)}?recursive=1`,
      options.token,
      options.signal,
    );

    const blobEntries = treeData.tree.filter((item) => item.type === 'blob');
    const downloaded: DownloadedFileEntry[] = [];

    for (const item of blobEntries) {
      if (options.signal?.aborted) {
        throw new RepositoryImportCancelledError('Import was cancelled.');
      }

      interface GitHubBlobResponse {
        content: string;
        encoding: string;
        size: number;
      }

      const blob = await this.request<GitHubBlobResponse>(
        `/repos/${options.owner}/${options.repo}/git/blobs/${item.sha}`,
        options.token,
        options.signal,
      );

      const contentBuffer =
        blob.encoding === 'base64'
          ? Buffer.from(blob.content, 'base64')
          : Buffer.from(blob.content, 'utf8');

      downloaded.push({
        relativePath: item.path,
        content: contentBuffer,
      });
    }

    return downloaded;
  }
}
