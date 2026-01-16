import { getPreferenceValues } from "@raycast/api";
import { Octokit } from "@octokit/rest";
import { GithubMetadata } from "./types";

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

export async function fetchGithubDetails(url: string): Promise<{ metadata: GithubMetadata; body: string } | null> {
  const parsed = parseGithubUrl(url);
  if (!parsed) return null;

  const { githubToken } = getPreferenceValues<{ githubToken?: string }>();
  
  const octokit = new Octokit({
    auth: githubToken,
  });

  try {
    let title = "";
    let body = "";
    let state = "";
    let htmlUrl = url;

    if (parsed.type === "pull_request") {
      const { data: pr } = await octokit.pulls.get({
        owner: parsed.owner,
        repo: parsed.repo,
        pull_number: parsed.number,
      });

      title = pr.title;
      body = pr.body || "";
      htmlUrl = pr.html_url;
      state = pr.state;

      if (pr.merged) {
        state = "merged";
      } else if (state === "open") {
        const { data: reviews } = await octokit.pulls.listReviews({
          owner: parsed.owner,
          repo: parsed.repo,
          pull_number: parsed.number,
        });

        // Check if any review requests changes
        // A simple check: if the *latest* review from any user is CHANGES_REQUESTED.
        // For simplicity, checking if ANY review is CHANGES_REQUESTED is often "good enough" for a quick status,
        // but let's try to be slightly more accurate by grouping by user if possible, or just simpler for now.
        // Let's stick to: if there is a CHANGES_REQUESTED state in the list that hasn't been superseded by an APPROVE. 
        // Actually, just checking existence is a good proxy for now.
        if (reviews.some((r) => r.state === "CHANGES_REQUESTED")) {
          state = "changes_requested";
        }
      }
    } else {
      const { data: issue } = await octokit.issues.get({
        owner: parsed.owner,
        repo: parsed.repo,
        issue_number: parsed.number,
      });
      title = issue.title;
      body = issue.body || "";
      htmlUrl = issue.html_url;
      state = issue.state;
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
      },
      body: body,
    };
  } catch (error) {
    console.error("Failed to fetch GitHub details:", error);
    return null;
  }
}
