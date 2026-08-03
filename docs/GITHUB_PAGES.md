# GitHub Pages deployment guide

This guide explains how to build the fully embedded PDF Organizer with GitHub Actions and deploy it automatically to GitHub Pages.

Expected demo URL:

```text
https://ttomohisa.github.io/html-pdf-organizer/
```

## 1. Create the repository

Create a GitHub repository with these settings:

- Owner: `ttomohisa`
- Repository name: `html-pdf-organizer`
- Visibility: Public
- Default branch: `main`

Place the contents of this project at the repository root. `README.md`, `src`, and `.github` should be visible directly at the top level rather than inside another wrapper folder.

## 2. Enable GitHub Pages

1. Open the repository on GitHub.
2. Open **Settings**.
3. Select **Pages** from the left sidebar.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.

Do not select a branch `/root` or `/docs` publishing source. The workflow publishes the generated `dist` directory as a Pages artifact.

## 3. Run the first deployment

Use either method:

- Push to the `main` branch.
- Open **Actions → Deploy offline app to GitHub Pages → Run workflow**.

The workflow performs these steps:

1. Checks out the repository.
2. Downloads the pinned PDF.js and pdf-lib packages.
3. Generates `dist/index.html` with `build-offline.ps1`.
4. Verifies that no external runtime references or unresolved placeholders remain.
5. Uploads `dist` as a GitHub Pages artifact.
6. Deploys it to the `github-pages` environment.

## 4. Verify the site

After the workflow succeeds, the deployment job displays the published URL:

```text
https://ttomohisa.github.io/html-pdf-organizer/
```

A new deployment may take a short time to appear. Try a hard refresh or a private browsing window if an older version is cached.

## Updating the demo

In normal development, change one of these files and push to `main`:

- UI and behavior: `src/index.template.html`
- PDF.js or pdf-lib versions: `versions.json`
- Embedding logic: `build-offline.ps1`

Each push to `main` rebuilds and republishes the Pages artifact. You do not need to commit `dist/index.html` manually.

Pull requests run `.github/workflows/build-offline.yml` for validation without publishing the site.

## Demo privacy model

The GitHub Pages version downloads the initial HTML from GitHub's servers. After loading, PDFs selected by the user are processed in the browser and are not uploaded by the application code.

For operation with the network fully disconnected, save `dist/index.html` from a local build or a build artifact and open it as a local file.

## Troubleshooting

### The Pages URL returns 404

- Confirm that **Settings → Pages → Source** is set to **GitHub Actions**.
- Confirm that **Deploy offline app to GitHub Pages** completed successfully.
- A repository name other than `html-pdf-organizer` produces a different URL.

### The workflow reports a Pages permission error

- Confirm that `.github/workflows/deploy-pages.yml` is present.
- Confirm that GitHub Actions is enabled for the repository.
- For organization repositories, check the organization's Actions and Pages policies.

### The npm package download fails

A temporary network problem may have occurred. Re-run the workflow. After changing dependency versions, verify that the package name, version, and paths in `versions.json` match the downloaded npm package layout.

### The repository was renamed

Update these README values:

- Demo URL
- GitHub Pages badge
- Workflow link

When using the user-site repository name `ttomohisa.github.io`, the published URL becomes `https://ttomohisa.github.io/`.
