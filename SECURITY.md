# Security Policy / セキュリティポリシー

## Reporting a vulnerability

Please report security issues privately through GitHub's **Security → Report a vulnerability** feature when available. Do not include confidential PDF files in a public issue.

Useful details include:

- Browser and operating system
- Reproduction steps
- Expected and actual behavior
- Whether the issue occurs in the GitHub Pages demo, a locally generated HTML file, or both
- A minimal, non-sensitive test file when necessary

## セキュリティ問題の報告

GitHubの **Security → Report a vulnerability** が利用できる場合は、セキュリティ問題を非公開で報告してください。公開Issueへ機密PDFを添付しないでください。

以下の情報があると確認しやすくなります。

- ブラウザとOS
- 再現手順
- 期待する動作と実際の動作
- GitHub Pagesデモ、ローカル生成HTML、または両方で発生するか
- 必要な場合は、機密情報を含まない最小限のテストファイル

## Scope / 対象範囲

The generated application embeds pinned PDF.js and pdf-lib packages instead of loading runtime libraries from a CDN. The GitHub Pages demo downloads the initial standalone HTML from GitHub Pages, while PDFs selected by the user are processed locally by the application.

Reports concerning dependency integrity, the offline build process, unsafe PDF handling, unintended network access or data transmission, worker isolation, generated-file corruption, or deployment-workflow security are in scope.

生成されたアプリは、実行時にCDNからライブラリを読み込まず、固定バージョンのPDF.jsとpdf-libをHTMLへ内包します。GitHub Pagesデモでは最初の単一HTMLをGitHub Pagesから取得しますが、ユーザーが選択したPDFはアプリ内でローカル処理されます。

依存関係の完全性、オフラインビルド処理、危険なPDF処理、意図しない通信やデータ送信、Worker分離、生成PDFの破損、デプロイワークフローの安全性に関する問題は報告対象です。

## Supported version / 対応バージョン

Security fixes are applied to the latest version on the `main` branch until the first tagged release policy is defined.

最初の正式なリリース運用方針を定めるまでは、`main` ブランチの最新版をセキュリティ修正対象とします。
