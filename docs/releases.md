# Release operations

The GitHub integration must be able to dispatch Actions. If dispatch fails with
403, reconnect GitHub in Arena with Actions write access or ask a repository
maintainer to run the workflows manually. Branch protection also requires the
appropriate GitHub administration permission and is not installed by a workflow.
When enabling it, require `verify`, `size`, `audit` and the six MCP coordination
matrix checks. Existing price, drop, history and health workflows push snapshots
directly to `main`: configure a narrow GitHub Actions bypass or migrate those
workflows to PRs before enforcing PR-only updates, otherwise data refresh breaks.
The live provider smoke is path-filtered and must not be required on every PR.

After publishing a GitHub Release from a reviewed commit on `main`:

1. In **Actions → Attach release HTML**, select the `main` workflow and enter the
   published tag, such as `v3.0.0`. It verifies the release, tag ancestry and
   package version, builds that exact tag and uploads HTML plus SHA-256. It does
   not overwrite existing release assets. If a partial upload occurred, inspect
   assets and remove only the incomplete ones before rerunning.
2. Configure npm trusted publishing for `WhiteBite/Domain-Hunter` and workflow
   `publish.yml`. Then in **Actions → Publish npm package**, select `main` and
   enter the same tag. The job verifies release status, ancestry and version,
   runs tests, and publishes with npm provenance via OIDC. It does not need a
   repository npm token. A duplicate version will be rejected by npm.
3. Confirm the run, `npm view domain-hunter version`, release assets/checksum,
   and the GitHub Pages deployment. A GitHub release is not an npm publication.

The dispatch workflow must itself be on `main`; the build and npm package are
checked out from the exact requested tag, not from the current branch tip.
