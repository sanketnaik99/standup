import { getPreferenceValues } from "@raycast/api";
import { graphql } from "@octokit/graphql";
import { GithubMetadata, LinkedPR } from "./types";

const GITHUB_URL_REGEX = /github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/;

export function parseGithubUrl(url: string) {
  const match = url.match(GITHUB_URL_REGEX);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    type: (match[3] === "pull" ? "pull_request" : "issue") as "pull_request" | "issue",
    number: parseInt(match[4], 10),
  };
}

// GraphQL query for fetching issue details with linked PRs
const GET_ISSUE_QUERY = `
  query GetIssue($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
        number
        title
        body
        state
        url
        timelineItems(first: 100) {
          nodes {
            __typename
            ... on ConnectedEvent {
              id
              subject {
                ... on PullRequest {
                  number
                  title
                  url
                  state
                  merged
                }
              }
            }
            ... on CrossReferencedEvent {
              id
              source {
                ... on PullRequest {
                  number
                  title
                  url
                  state
                  merged
                }
              }
            }
          }
        }
      }
    }
  }
`;

// GraphQL query for fetching PR details
const GET_PR_QUERY = `
  query GetPullRequest($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        number
        title
        body
        state
        merged
        url
        reviews(last: 50) {
          nodes {
            state
          }
        }
      }
    }
  }
`;

interface IssueResponse {
  repository: {
    issue: {
      id: string;
      number: number;
      title: string;
      body: string | null;
      state: "OPEN" | "CLOSED";
      url: string;
      timelineItems: {
        nodes: Array<{
          __typename: string;
          id?: string;
          subject?: {
            number: number;
            title: string;
            url: string;
            state: "OPEN" | "CLOSED" | "MERGED";
            merged: boolean;
          };
          source?: {
            number?: number;
            title?: string;
            url?: string;
            state?: "OPEN" | "CLOSED" | "MERGED";
            merged?: boolean;
          };
        }>;
      };
    };
  };
}

interface PRResponse {
  repository: {
    pullRequest: {
      id: string;
      number: number;
      title: string;
      body: string | null;
      state: "OPEN" | "CLOSED" | "MERGED";
      merged: boolean;
      url: string;
      reviews: {
        nodes: Array<{
          state: string;
        }>;
      };
    };
  };
}

function extractLinkedPRs(timelineNodes: IssueResponse["repository"]["issue"]["timelineItems"]["nodes"]): LinkedPR[] {
  const linkedPRs: LinkedPR[] = [];
  const seenPRNumbers = new Set<number>();

  for (const node of timelineNodes) {
    let prData: { number: number; title: string; url: string; state: string; merged?: boolean } | null = null;

    if (node.__typename === "ConnectedEvent" && node.subject) {
      prData = node.subject;
    } else if (node.__typename === "CrossReferencedEvent" && node.source?.number && node.source.merged !== undefined) {
      // CrossReferencedEvent source could be Issue or PR, we only want PRs
      // PRs have the merged field, issues don't
      prData = {
        number: node.source.number,
        title: node.source.title || "",
        url: node.source.url || "",
        state: node.source.state || "OPEN",
        merged: node.source.merged,
      };
    }

    if (prData && !seenPRNumbers.has(prData.number)) {
      seenPRNumbers.add(prData.number);
      
      // Determine the state - GraphQL returns OPEN/CLOSED but we need to check merged flag
      let state: LinkedPR["state"] = prData.state === "OPEN" ? "OPEN" : "CLOSED";
      if (prData.merged) {
        state = "MERGED";
      }

      linkedPRs.push({
        number: prData.number,
        title: prData.title,
        url: prData.url,
        state,
      });
    }
  }

  return linkedPRs;
}

export async function fetchGithubDetails(url: string): Promise<{ metadata: GithubMetadata; body: string } | null> {
  const parsed = parseGithubUrl(url);
  if (!parsed) return null;

  const { githubToken } = getPreferenceValues<{ githubToken?: string }>();

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: githubToken ? `token ${githubToken}` : "",
    },
  });

  try {
    let title = "";
    let body = "";
    let state = "";
    let htmlUrl = url;
    let linkedPRs: LinkedPR[] = [];

    if (parsed.type === "pull_request") {
      const response = await graphqlWithAuth<PRResponse>(GET_PR_QUERY, {
        owner: parsed.owner,
        repo: parsed.repo,
        number: parsed.number,
      });

      const pr = response.repository.pullRequest;
      title = pr.title;
      body = pr.body || "";
      htmlUrl = pr.url;

      // Determine state
      if (pr.merged) {
        state = "merged";
      } else if (pr.state === "OPEN") {
        // Check for changes requested
        const hasChangesRequested = pr.reviews.nodes.some((r) => r.state === "CHANGES_REQUESTED");
        state = hasChangesRequested ? "changes_requested" : "open";
      } else {
        state = "closed";
      }
    } else {
      const response = await graphqlWithAuth<IssueResponse>(GET_ISSUE_QUERY, {
        owner: parsed.owner,
        repo: parsed.repo,
        number: parsed.number,
      });

      const issue = response.repository.issue;
      title = issue.title;
      body = issue.body || "";
      htmlUrl = issue.url;
      state = issue.state.toLowerCase(); // OPEN/CLOSED -> open/closed

      // Extract linked PRs from timeline
      linkedPRs = extractLinkedPRs(issue.timelineItems.nodes);

      console.log('Linked PRs:',linkedPRs, linkedPRs.length);
    }

    return {
      metadata: {
        url: htmlUrl,
        number: parsed.number,
        repo: parsed.repo,
        owner: parsed.owner,
        state: state,
        title: title,
        type: parsed.type,
        linkedPRs: linkedPRs.length > 0 ? linkedPRs : undefined,
      },
      body: body,
    };
  } catch (error) {
    console.error("Failed to fetch GitHub details:", error);
    return null;
  }
}
