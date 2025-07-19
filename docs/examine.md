# Deno Local CI - 要求事項確認指示書

## 概要

この文書は、Deno Local CIの実装が要求事項、全域性原則、ドメイン設計に適合しているかを体系的に確認するための指示書です。各項目について実際に動作確認を行い、設計原則への準拠を検証してください。

## 🎯 確認対象

### A. 機能要件確認
### B. 実行戦略確認  
### C. 設計原則確認
### D. 非機能要件確認
### E. 技術要件確認

---

## A. 機能要件確認

### A1. CIパイプライン処理順序

#### A1.1 段階実行順序
**確認項目**：
- [ ] Type Check → JSR Check → Test → Lint → Format の順序で実行される
- [ ] 各段階でエラー発生時に次の段階が実行されない（停止ルール）
- [ ] 階層指定時にJSR Checkが自動スキップされる

**確認コマンド**：
```bash
# 正常実行パターン
deno run --allow-read --allow-write --allow-run --allow-env mod.ts

# 階層指定実行（JSRスキップ確認）
deno run --allow-read --allow-write --allow-run --allow-env mod.ts src/

# エラー停止確認（意図的にエラーファイルを配置してテスト）
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --mode single-file
```

#### A1.2 各段階のコマンド実行
**確認項目**：
- [ ] Type Check: `deno check [階層]` が正しく実行される
- [ ] JSR Check: `deno publish --dry-run` が正しく実行される  
- [ ] Test: `deno test [階層]` が正しく実行される
- [ ] Lint: `deno lint [階層]` が正しく実行される
- [ ] Format: `deno fmt --check [階層]` が正しく実行される

**確認方法**：実行ログで各段階のコマンドを確認

### A2. 実行戦略モード

#### A2.1 All モード
**確認項目**：
- [ ] 全ファイルを一度に実行（最高速度）
- [ ] `[ALL] Processing all X files together` ログが表示される
- [ ] 失敗時にBatchモードへフォールバック

**確認コマンド**：
```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --mode all
```

#### A2.2 Batch モード  
**確認項目**：
- [ ] 指定サイズのバッチ単位で実行
- [ ] `[BATCH] Processing X files in batches of Y` ログが表示される
- [ ] 各バッチの実行状況が表示される
- [ ] 失敗時にSingle-fileモードへフォールバック

**確認コマンド**：
```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --mode batch --batch-size 3
```

#### A2.3 Single-file モード
**確認項目**：
- [ ] ファイルを1つずつ順次実行
- [ ] `[SINGLE-FILE] Processing X files individually` ログが表示される
- [ ] 各ファイルの実行状況が表示される
- [ ] stopOnFirstError設定に従った動作

**確認コマンド**：
```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --mode single-file
```

### A3. 階層指定機能

#### A3.1 階層フィルタリング
**確認項目**：
- [ ] 指定ディレクトリ以下のファイルのみが対象となる
- [ ] 相対パス・絶対パス両方をサポート
- [ ] 存在しない階層指定時の適切なエラー表示

**確認コマンド**：
```bash
# 相対パス指定
deno run --allow-read --allow-write --allow-run --allow-env mod.ts src/
deno run --allow-read --allow-write --allow-run --allow-env mod.ts tests/

# 存在しないパス指定
deno run --allow-read --allow-write --allow-run --allow-env mod.ts nonexistent/
```

#### A3.2 階層指定時のJSRスキップ
**確認項目**：
- [ ] 階層指定時にJSR Checkが自動スキップされる
- [ ] スキップ理由が適切に表示される

### A4. フォールバック戦略

#### A4.1 段階内フォールバック
**確認項目**：
- [ ] All → Batch → Single-file の段階的フォールバック
- [ ] 失敗したバッチ範囲のみのSingle-file実行
- [ ] フォールバック理由の表示

**確認方法**：意図的にエラーを発生させてフォールバック動作を確認

### A5. ログ・診断機能

#### A5.1 ログモード
**確認項目**：
- [ ] Normal モード：標準ログ出力
- [ ] Silent モード：エラーのみ表示
- [ ] Debug モード：詳細ログ出力
- [ ] Error-files-only モード：エラーファイル一覧のみ

**確認コマンド**：
```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --log-mode debug
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --log-mode silent
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --log-mode error-files-only
```

---

## B. 実行戦略確認

### B1. デフォルト動作

#### B1.1 デフォルト実行戦略
**確認項目**：
- [ ] デフォルトはAllモードで開始
- [ ] フォールバックが有効
- [ ] 適切なバッチサイズ（25）

**確認コマンド**：
```bash
# 引数なし実行でデフォルト設定確認
deno run --allow-read --allow-write --allow-run --allow-env mod.ts
```

### B2. カスタム設定

#### B2.1 バッチサイズ設定
**確認項目**：
- [ ] 1-100の範囲で設定可能
- [ ] 範囲外の値でエラー表示
- [ ] 設定した値でバッチ実行

**確認コマンド**：
```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --batch-size 5
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --batch-size 101  # エラー確認
```

#### B2.2 フォールバック制御
**確認項目**：
- [ ] `--no-fallback` でフォールバック無効化
- [ ] `--fallback` でフォールバック有効化

**確認コマンド**：
```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --no-fallback
```

---

## C. 設計原則確認

### C1. 全域性原則（totality.ja.md）

#### C1.1 型安全性
**確認項目**：
- [ ] Discriminated Union の適切な使用
- [ ] Result型による例外の排除
- [ ] Smart Constructor による制約検証
- [ ] `switch`文の網羅的分岐（`default`不要）

**確認方法**：
- TypeScriptコンパイルエラーなし
- 型アサーション（`as Type`）の不使用
- オプショナルプロパティによる状態表現の回避

#### C1.2 エラーハンドリング
**確認項目**：
- [ ] 共通ValidationError型の使用
- [ ] createErrorヘルパーの活用
- [ ] 例外による制御フローの回避

### C2. ドメイン設計（domain_driven_design.md）

#### C2.1 境界コンテキスト
**確認項目**：
- [ ] 適切なモジュール分離
- [ ] ドメインサービスの実装
- [ ] 型安全な境界インターフェース

#### C2.2 実行戦略パターン
**確認項目**：
- [ ] ExecutionStrategy パターンの実装
- [ ] ExecutionMode の判別可能ユニオン
- [ ] フォールバック戦略の完全性

---

## D. 非機能要件確認

### D1. 信頼性

#### D1.1 エラー処理
**確認項目**：
- [ ] 予期しない終了の防止
- [ ] 適切なエラーメッセージ表示
- [ ] ロバストなエラーハンドリング

#### D1.2 フォールバック機能
**確認項目**：
- [ ] 失敗時の適切なフォールバック
- [ ] フォールバック理由の明確化
- [ ] 部分失敗時の継続処理

### D2. 使いやすさ

#### D2.1 CLI インターフェース
**確認項目**：
- [ ] 直感的なコマンド構文
- [ ] ヘルプ機能の提供
- [ ] 適切なエラーメッセージ

**確認コマンド**：
```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --help
```

#### D2.2 ログ出力
**確認項目**：
- [ ] 進行状況の明確な表示
- [ ] 実行結果の要約表示
- [ ] パフォーマンス情報の提供

### D3. 保守性

#### D3.1 モジュラー設計
**確認項目**：
- [ ] 明確な責任分離
- [ ] 適切な依存関係
- [ ] テスタビリティ

---

## E. 技術要件確認

### E1. プラットフォーム対応

#### E1.1 Deno ランタイム
**確認項目**：
- [ ] Deno標準APIの適切な使用
- [ ] TypeScript言語機能の活用
- [ ] クロスプラットフォーム対応

### E2. 権限要求

#### E2.1 最小権限原則
**確認項目**：
- [ ] 必要最小限の権限要求
- [ ] 権限別の機能分離
- [ ] セキュアな実行

**確認方法**：
```bash
# 各権限を個別に確認
deno run --allow-read mod.ts  # 読み取りのみで実行可能部分
deno run --allow-read --allow-run mod.ts  # プロセス実行必要部分
```

### E3. 依存関係

#### E3.1 外部依存の最小化
**確認項目**：
- [ ] Deno標準ライブラリの活用
- [ ] 最小限の外部依存
- [ ] セキュアな依存関係

---

## 📋 確認チェックリスト

### 基本機能確認
- [ ] A1. CIパイプライン処理順序 - 全項目完了
- [ ] A2. 実行戦略モード - 全項目完了  
- [ ] A3. 階層指定機能 - 全項目完了
- [ ] A4. フォールバック戦略 - 全項目完了
- [ ] A5. ログ・診断機能 - 全項目完了

### 戦略・設計確認
- [ ] B1. デフォルト動作 - 全項目完了
- [ ] B2. カスタム設定 - 全項目完了
- [ ] C1. 全域性原則 - 全項目完了
- [ ] C2. ドメイン設計 - 全項目完了

### 品質・技術確認
- [ ] D1. 信頼性 - 全項目完了
- [ ] D2. 使いやすさ - 全項目完了
- [ ] D3. 保守性 - 全項目完了
- [ ] E1. プラットフォーム対応 - 全項目完了
- [ ] E2. 権限要求 - 全項目完了
- [ ] E3. 依存関係 - 全項目完了

---

## 🚨 重要な確認ポイント

### 1. 実行戦略の動作確認
各モード（All/Batch/Single-file）が要求通りに動作し、適切なフォールバックが行われることを**実際の実行で確認**すること。

### 2. 階層指定の完全性
階層指定時の各段階（Type Check, Test, Lint, Format）でのファイルフィルタリングと、JSR Checkのスキップが正しく動作することを確認すること。

### 3. エラーハンドリングの堅牢性
意図的にエラーを発生させ、適切なエラー分類・メッセージ表示・フォールバック動作が行われることを確認すること。

### 4. 型安全性の維持
全域性原則に基づく型安全な実装が維持され、コンパイル時に不正状態が検出されることを確認すること。

### 5. パフォーマンス特性
各実行戦略のパフォーマンス特性（All: 最高速、Batch: バランス、Single-file: 詳細診断）が実際の実行時間で確認できること。

---

## 📊 確認レポート作成

各確認項目について以下の形式でレポートを作成すること：

```markdown
## 確認結果

### [項目番号] [項目名]
- ✅ **正常動作**: [確認内容]
- ❌ **問題発見**: [問題内容と解決策]
- ⚠️ **要検討**: [検討が必要な事項]

**実行コマンド**: `[実際に実行したコマンド]`
**実行結果**: [ログ出力の要約]
**判定**: 合格/要修正/要検討
```

全ての確認項目が完了した時点で、要求事項への完全準拠が確認できたものとする。
