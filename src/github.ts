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
    type: match[3] === "pull" ? "pull_request" : "issue",
    number: parseInt(match[4], 10),
  };
}

export async function fetchGithubDetails(url: string): Promise<{ metadata: GithubMetadata; body: string } | null> {
  const parsed = parseGithubUrl(url);
  if (!parsed) return null;

  const { githubToken } = getPreferenceValues<{ githubToken?: string }>();
  
  // If no token, we can still try to fetch public repos if we don't pass auth, 
  // but Octokit usually works better with auth. 
  // We'll try without auth if token is missing, or with auth if present.
  const octokit = new Octokit({
    auth: githubToken,
  });

  try {
    const { data } = await octokit.issues.get({
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: parsed.number,
    });
    return {
      metadata: {
        url: data.html_url,
        number: data.number,
        repo: parsed.repo,
        owner: parsed.owner,
        state: data.state,
        title: data.title,
        type: data.pull_request ? "pull_request" : "issue",
      },
      body: data.body || "",
    };
  } catch (error) {
    console.error("Failed to fetch GitHub details:", error);
    return null;
  }
}
