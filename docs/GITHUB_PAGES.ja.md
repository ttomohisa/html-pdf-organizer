# GitHub Pages公開ガイド

このガイドでは、完全内包版のPDF OrganizerをGitHub Actionsで生成し、GitHub Pagesへ自動公開する手順を説明します。

想定する公開URL：

```text
https://ttomohisa.github.io/pdf-organizer/
```

## 1. リポジトリを作成する

GitHubで次のリポジトリを作成します。

- Owner: `ttomohisa`
- Repository name: `pdf-organizer`
- Visibility: Public
- Default branch: `main`

このZIPの中身を、フォルダーごとではなくリポジトリ直下へ配置してください。`README.md`、`src`、`.github` などがリポジトリ直下に見える状態が正しい構成です。

## 2. GitHub Pagesを有効にする

1. GitHubのリポジトリを開きます。
2. **Settings** を開きます。
3. 左メニューから **Pages** を開きます。
4. **Build and deployment** の **Source** で **GitHub Actions** を選択します。

ブランチの `/root` や `/docs` を選択する方式ではありません。生成済みの `dist` をActionsの成果物として公開します。

## 3. 初回デプロイを実行する

次のどちらかで開始できます。

- `main` ブランチへプッシュする
- **Actions → Deploy offline app to GitHub Pages → Run workflow** を選択する

ワークフローでは次の処理が行われます。

1. リポジトリをチェックアウト
2. 固定バージョンのPDF.jsとpdf-libを取得
3. `build-offline.ps1` で `dist/index.html` を生成
4. 外部ランタイム参照や未置換文字列が残っていないことを検証
5. `dist` をGitHub Pages用成果物としてアップロード
6. `github-pages` 環境へデプロイ

## 4. 公開を確認する

Actionsの実行が成功すると、デプロイジョブに公開URLが表示されます。

```text
https://ttomohisa.github.io/pdf-organizer/
```

公開直後は反映に少し時間がかかることがあります。ブラウザのキャッシュが残る場合は、再読み込みまたはプライベートウィンドウで確認してください。

## 更新の流れ

通常は次のファイルを変更して `main` へプッシュするだけです。

- UIや機能：`src/index.template.html`
- PDF.js / pdf-libのバージョン：`versions.json`
- 埋め込み処理：`build-offline.ps1`

`main` へのプッシュごとに、Pages用HTMLが自動で再生成・公開されます。`dist/index.html` を手動でコミットする必要はありません。

Pull Requestでは `.github/workflows/build-offline.yml` がビルド検証を実行します。公開は行いません。

## デモ版のプライバシー

GitHub Pages版は、ページを開くためにGitHubのサーバーからHTMLを取得します。その後、ユーザーが追加したPDFはブラウザ内で処理され、アプリのコードから外部へアップロードされません。

ネットワークを完全に切断して使う場合は、ActionsのBuild artifactまたはローカルビルドで生成した `dist/index.html` を保存し、ローカルファイルとして開いてください。

## トラブルシューティング

### PagesのURLが404になる

- **Settings → Pages → Source** が **GitHub Actions** になっているか確認します。
- Actionsの **Deploy offline app to GitHub Pages** が成功しているか確認します。
- リポジトリ名が `pdf-organizer` 以外の場合、URLも変わります。

### ワークフローにPages権限のエラーが出る

- `.github/workflows/deploy-pages.yml` がリポジトリに含まれているか確認します。
- リポジトリのActionsが無効化されていないか確認します。
- Organization配下の場合は、OrganizationのActions・Pagesポリシーも確認します。

### ビルド時にnpm取得で失敗する

一時的な通信障害の可能性があります。Actions画面から再実行してください。依存バージョンを変更した直後の場合は、`versions.json` のパッケージ名・バージョン・パスがnpmパッケージの構造と一致しているか確認します。

### リポジトリ名を変更した

README内の以下を新しいURLへ変更します。

- デモURL
- GitHub Pagesバッジ
- Actionsワークフローへのリンク

ユーザーサイト形式のリポジトリ名 `ttomohisa.github.io` を使う場合、公開URLは `https://ttomohisa.github.io/` になります。
