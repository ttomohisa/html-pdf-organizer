# Contributing / コントリビューション

Thank you for your interest in PDF Organizer. / PDF Organizerへのご協力ありがとうございます。

## English

### Before opening an issue

- Check existing issues for duplicates.
- Include the browser, operating system, and device type.
- Describe the PDF characteristics without attaching confidential documents.
- When possible, provide a small, non-sensitive reproduction PDF.

### Pull requests

1. Keep the application usable as a single `index.html` file.
2. Preserve Japanese and English support for all visible UI text.
3. Avoid adding server-side processing or PDF uploads without a clearly discussed project change.
4. Pin third-party dependency versions.
5. Update `README.md`, `README.ja.md`, `CHANGELOG.md`, and `THIRD_PARTY_NOTICES.md` when relevant.
6. Test desktop and mobile layouts.
7. Confirm that `build-offline.ps1` succeeds and that the Pages workflow remains valid when changing build or deployment files.

### Minimum manual test checklist

- Add one PDF and multiple PDFs.
- Select pages with cards, check buttons, modifier keys, and range selection.
- Drag one page.
- Drag multiple selected pages as a group.
- Rotate and delete selected pages.
- Undo and redo.
- Open and navigate the preview.
- Export all pages and selected pages.
- Switch languages before and after loading a PDF.

## 日本語

### Issueを作成する前に

- 同じ内容のIssueがないか確認してください。
- ブラウザ、OS、端末種別を記載してください。
- 機密PDFは添付せず、PDFの特徴や再現手順を記載してください。
- 可能な場合は、機密情報を含まない小さな再現用PDFを用意してください。

### Pull Request

1. アプリが単一の `index.html` として利用できる状態を維持してください。
2. 画面に表示する文言は日本語・英語の両方を用意してください。
3. 方針変更の合意なしに、サーバー処理やPDFアップロードを追加しないでください。
4. 外部ライブラリのバージョンは固定してください。
5. 必要に応じて `README.md`、`README.ja.md`、`CHANGELOG.md`、`THIRD_PARTY_NOTICES.md` を更新してください。
6. PC・スマートフォンの両方で確認してください。
7. ビルドまたは公開関連ファイルを変更した場合は、`build-offline.ps1` の成功とPagesワークフローの整合性を確認してください。

### 最低限の手動確認

- 1つのPDFと複数PDFを追加する。
- カード、チェック、修飾キー、範囲選択でページを選択する。
- 1ページをドラッグする。
- 複数選択ページをまとめてドラッグする。
- 選択ページを回転・削除する。
- Undo・Redoを行う。
- プレビューを開き、前後ページへ移動する。
- 全ページと選択ページを保存する。
- PDF読み込み前後に日本語・英語を切り替える。
