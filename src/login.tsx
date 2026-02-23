import { Action, ActionPanel, Detail, Icon, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { authorizeClerk, getStoredTokens, isClerkAuthorized, logoutClerk } from "./auth";

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenScope, setTokenScope] = useState<string | undefined>(undefined);
  const [updatedAt, setUpdatedAt] = useState<Date | undefined>(undefined);

  async function loadAuthState() {
    setIsLoading(true);

    try {
      const [loggedIn, tokenSet] = await Promise.all([isClerkAuthorized(), getStoredTokens()]);
      setIsAuthenticated(loggedIn);
      setTokenScope(tokenSet?.scope);
      setUpdatedAt(tokenSet?.updatedAt);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAuthState();
  }, []);

  async function handleLogin() {
    try {
      setIsLoading(true);
      await authorizeClerk();
      await showToast({
        style: Toast.Style.Success,
        title: "Signed in with Clerk",
      });
      await loadAuthState();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "OAuth login failed",
        message: String(error),
      });
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    try {
      setIsLoading(true);
      await logoutClerk();
      await showToast({
        style: Toast.Style.Success,
        title: "Signed out",
      });
      await loadAuthState();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Sign out failed",
        message: String(error),
      });
      setIsLoading(false);
    }
  }

  const markdown = useMemo(() => {
    if (isAuthenticated) {
      return [
        "# Clerk Account",
        "",
        "✅ You are signed in.",
        "",
        tokenScope ? `- Scopes: ${tokenScope}` : "- Scopes: not returned by provider",
        updatedAt ? `- Updated: ${updatedAt.toLocaleString()}` : "- Updated: unavailable",
        "",
        "Use this login to connect backend API calls in follow-up changes.",
      ].join("\n");
    }

    return [
      "# Clerk Account",
      "",
      "You are currently signed out.",
      "",
      "Run **Sign In with Clerk** to start OAuth.",
    ].join("\n");
  }, [isAuthenticated, tokenScope, updatedAt]);

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      actions={
        <ActionPanel>
          {!isAuthenticated ? (
            <Action title="Sign in with Clerk" icon={Icon.Person} onAction={handleLogin} />
          ) : (
            <Action title="Sign out" icon={Icon.Logout} onAction={handleLogout} />
          )}
          <Action title="Refresh Status" icon={Icon.ArrowClockwise} onAction={loadAuthState} />
        </ActionPanel>
      }
    />
  );
}
