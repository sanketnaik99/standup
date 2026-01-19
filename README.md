![GitHub Banner](assets/github-banner.png)

# StandUp

A task tracker built into Raycast that syncs with external data stores.

## Installation

1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the extension in development mode:
   ```bash
   npm run dev
   ```
   This will automatically open the extension in Raycast.
   You can then stop the dev server.

## Configuration

### GitHub Integration

To enable GitHub integration (fetching issue details, status tracking):

1. Go to [GitHub Developer Settings > Personal Access Tokens (Classic)](https://github.com/settings/tokens).
2. Generate a new token (Classic).
3. Select the following scopes:
   - `repo` (Full control of private repositories) - Required if you want to link private issues.
   - `public_repo` (Access public repositories) - Sufficient for public issues only.
   - `read:project` - Required to fetch linked PRs from issue timeline.
4. Open Raycast and type `StandUp`.
5. Press `Cmd+,` to open **Preferences**.
6. Paste your token into the **GitHub Personal Access Token** field.