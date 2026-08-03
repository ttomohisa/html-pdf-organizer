# オフライン確認

1. `build-offline.bat` を実行します。
2. Wi-Fiと有線LANを切断します。
3. ブラウザの開発者ツールでNetworkを開きます。
4. `dist/index.html` を開き、PDFの追加、プレビュー、ドラッグ、回転、保存を行います。
5. NetworkにHTTP/HTTPS通信が発生しないことを確認します。

補助確認:

```powershell
Select-String -Path dist\index.html -Pattern '<script[^>]+src=["'']https?://|import\s+.+?from\s+["'']https?://'
```

一致がなければ、外部スクリプト参照はありません。
