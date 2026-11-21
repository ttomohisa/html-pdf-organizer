# GitHub Pages

[日本語版](GITHUB_PAGES.ja.md)

The published app is [PDF Organizer on GitHub Pages](https://ttomohisa.github.io/html-pdf-organizer/).

## Deploy

1. In repository **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
2. Push to `main`, or open **Actions → Deploy GitHub Pages → Run workflow**.
3. The Windows build runs `build-offline.ps1` with the dependencies pinned in `versions.json`, copies `dist/index.html` to the distribution filename, and runs the Node regression tests. The deploy job publishes the contents of `dist` to the `github-pages` environment.
4. Open the site URL in the successful deployment job. A fork uses its own Pages URL.

Pull requests run **Build offline HTML**. A separate workflow can publish a Cloudflare preview for a pull request from the same repository when its credentials are configured. Production Pages updates on a push to `main` or a manual Pages run.

## Troubleshooting

- **Site returns 404.** Check the Pages source, the latest deployment, and the URL shown in the deploy job.
- **Deployment permission error.** Check that Actions and Pages are enabled and that the repository or organization permits the workflow's `pages: write` and `id-token: write` permissions.
- **Dependency download or build failure.** Check the build log. If the dependency versions changed, verify the package names and embedded paths in `versions.json`. Retry a transient download failure.

GitHub Pages serves the initial HTML. Input files are processed in the browser. For offline use, open the downloaded release or the local `dist/index.html`.
