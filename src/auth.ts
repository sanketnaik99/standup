import { OAuth } from "@raycast/api";

const clerkOAuthClient = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "Clerk",
  providerId: "clerk",
  description: "Sign in with Clerk to connect your StandUp account.",
});

const clientId = "zT9SKb4rRf3zPt9o";
const authorizeEndpoint = "https://organic-ladybird-78.clerk.accounts.dev/oauth/authorize";
const tokenEndpoint = "https://organic-ladybird-78.clerk.accounts.dev/oauth/token";
const scope = "email offline_access profile";
const redirectURI = "https://raycast.com/redirect/extension";

function buildAuthorizationURL(authRequest: OAuth.AuthorizationRequest): string {
  const url = new URL(authorizeEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectURI);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", authRequest.state);
  url.searchParams.set("code_challenge", authRequest.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

async function exchangeAuthorizationCode(
  authorizationCode: string,
  codeVerifier: string,
  redirectURI: string,
): Promise<OAuth.TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: authorizationCode,
    client_id: clientId,
    code_verifier: codeVerifier,
    redirect_uri: redirectURI,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token exchange failed (${response.status}) for redirect_uri ${redirectURI}: ${errorBody}`);
  }

  return (await response.json()) as OAuth.TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<OAuth.TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${errorBody}`);
  }

  const refreshed = (await response.json()) as OAuth.TokenResponse;

  if (!refreshed.refresh_token) {
    refreshed.refresh_token = refreshToken;
  }

  return refreshed;
}

export async function authorizeClerk(): Promise<void> {
  const authRequest = await clerkOAuthClient.authorizationRequest({
    endpoint: authorizeEndpoint,
    clientId,
    scope,
  });

  const authorizationURL = buildAuthorizationURL(authRequest);

  const { authorizationCode } = await clerkOAuthClient.authorize({ url: authorizationURL });

  const tokenResponse = await exchangeAuthorizationCode(authorizationCode, authRequest.codeVerifier, redirectURI);

  await clerkOAuthClient.setTokens(tokenResponse);
}

export async function getStoredTokens(): Promise<OAuth.TokenSet | undefined> {
  return clerkOAuthClient.getTokens();
}

export async function getClerkAccessToken(): Promise<string | undefined> {
  const tokenSet = await clerkOAuthClient.getTokens();

  if (!tokenSet) {
    return undefined;
  }

  if (tokenSet.isExpired() && tokenSet.refreshToken) {
    const refreshed = await refreshAccessToken(tokenSet.refreshToken);
    await clerkOAuthClient.setTokens(refreshed);
    const latestTokenSet = await clerkOAuthClient.getTokens();
    return latestTokenSet?.accessToken;
  }

  return tokenSet.accessToken;
}

export async function isClerkAuthorized(): Promise<boolean> {
  const token = await getClerkAccessToken();
  return Boolean(token);
}

export async function logoutClerk(): Promise<void> {
  await clerkOAuthClient.removeTokens();
}
