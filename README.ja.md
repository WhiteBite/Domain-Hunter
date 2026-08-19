# Domain Hunter — 一括ドメイン登録可否チェッカー＆名前ジェネレーター

[English](README.md) | [Русский](README.ru.md) | [中文](README.zh.md) | **日本語** | [Français](README.fr.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/WhiteBite/Domain-Hunter?style=social)](https://github.com/WhiteBite/Domain-Hunter/stargazers)
[![Deploy](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml/badge.svg)](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml)

ブラウザーだけで完結する、無料・オープンソースの一括ドメイン登録可否チェッカー — サーバー不要、API キー不要、トラッキングなし。

**[▶ ライブデモ](https://whitebite.github.io/Domain-Hunter/)** — インストール不要ですぐ動きます。

![Domain Hunter checking five brand names across 15 TLDs — streaming results with status badges, first-year and renewal prices, CSV export](docs/screenshot-en-check.png)

Domain Hunter はレジストリの **RDAP** エンドポイント（Verisign、Google Registry、Identity Digital、CentralNic、Radix…）に対して直接ドメイン登録可否をチェックし、5 つの内蔵ジェネレーターでブランド可能な名前案を生成し、**ライブのレジストラ価格**と 3 年間の TCO を表示し、すべてを CSV に書き出します。WHOIS 検索サービスや WhoisXML・DomainTools などの有料ドメイン API に代わるプライバシー重視の選択肢であり、アプリ全体が 1 つの自己完結型 HTML ファイルです。

## 特徴

- **一括登録可否チェック** — 最大 3,000 件の名前を貼り付け。選択した TLD への展開で 1 回あたり最大 30,000 件のチェックを生成し、ソート可能なテーブルにライブで流し込みます。中断した実行は再開可能。
- **140 以上の厳選 TLD ゾーン** — `com net io ai dev app xyz me co uk de nl fr ch so ly tech site online store cloud` と 120 以上の追加ゾーン、17 のレジストリ基盤にまたがります。追加ゾーンはライブの IANA RDAP ブートストラップ経由で自動検出されます。
- **正直な 3 状態の結果** — `available` / `probably_available` / `unknown`。信頼性の低い ccTLD では 404 を DNS-over-HTTPS（Cloudflare + Google DNS）で裏付けしてから「登録可能」と判定します。Domain Hunter は決して推測しません。
- **5 つの名前ジェネレーター** — ルート × 接辞のコンビネーター、発音可能性スコア付きの音節ミキサー（CMUdict 由来）、厳選テーマ単語セット、TLD ハック（`family` → `fami.ly`）、単語変異（`midas` → `mydas`、`midaz`、`midaso`）。候補はタブ切り替えを生き残る永続トレイに集まり、実行前に予想チェック数も表示します。
- **ライブ価格と TCO** — Porkbun と Cloudflare からの初年度・更新料金をライブ取得、さらに最大 5 つのレジストラ（Dynadot、Spaceship、ValueDomain のスナップショット）を比較する週次ハーベスト。クーポン、プロモーショントラップ検出（更新料が初年度の 5 倍以上）、3 年間 TCO ソート、13 のレジストラへのカバレッジ連動購入リンク。価格は USD、RUB、EUR に対応。
- **ドメインごとの「購入先」** — 登録可能なドメインを 1 クリックすると、レジストリプレミアム警告（プレミアム価格付き）と現在最安値のレジストラを直接購入リンクとともに表示（公開 DigMyName API、キー不要）。
- **レジストリへの礼儀** — 基盤ごとの AIMD レート制限（例: Google Registry の厳格な ~1 rps を遵守）、HTTP 429 での `Retry-After` 自動バックオフ、`localStorage` での結果キャッシュ。
- **お気に入りと履歴** — 任意のドメイン（結果、ジェネレーター候補、削除リスト）にスターを付けて専用フィルター付きの永続ショートリストへ。最近の実行は記憶され 1 クリックで復元。結果は検索・複数選択・選択コピーに対応。
- **共有と書き出し** — ワンクリックの共有リンク（`#s=` がクエリ + ゾーンを符号化、実行を自動開始）、Excel 互換の CSV 書き出し（BOM + クォート）、行ごとのコピー・再チェック。
- **プライバシー・バイ・デザイン** — アナリティクス、テレメトリー、アカウントなし。すべての状態はブラウザーの `localStorage` に保存。多言語 UI（英語、ロシア語、スペイン語、ドイツ語、ポルトガル語）、ライト・ダークテーマ、モバイル対応。

![Domain Hunter name generators in dark theme: combinator, syllable mixer, thematic word sets, TLD-hacks and mutations](docs/screenshot-en-generators.png)

## クイックスタート

ビルドは単一の自己完結型 HTML ファイル — 開けばすぐ動きます。

- **ホスト版を使う:** <https://whitebite.github.io/Domain-Hunter/>
- **ローカルで実行:** [`dist/index.html`](dist/index.html) をディスクから直接開く（`file://` も完全サポート）。
- **ソースからビルド:**

```bash
npm install
npm run build     # dist/index.html を生成 — 1 ファイルにすべてインライン化
npm run dev       # 開発用 Vite 開発サーバー
```

バックエンドも環境変数も API キーも一切不要です。

## 自分のコピーをデプロイ

**GitHub Pages**（最も簡単）:

1. このリポジトリをフォーク。
2. Settings → Pages → Source: **GitHub Actions**（同梱の `deploy.yml` ワークフローが `main` へのプッシュごとに自動ビルド・公開）。
3. `https://<あなた>.github.io/Domain-Hunter/` で公開完了。

**Cloudflare Pages:** リポジトリをインポート、ビルドコマンド `npm run build`、出力ディレクトリ `dist`。

**任意の静的ホストまたはディスク:** `dist/index.html` を公開または開く。すべてのパスは相対（`base: './'`）なので、任意のサブパスで動作します。

## 仕組み

1. ブラウザーが **レジストリの RDAP エンドポイントに直接通信** — Domain Hunter が使うすべてのエンドポイントは CORS を開放しているため、サーバーやプロキシは不要です。
2. **HTTP 200 → 登録済み**、**404 → レジストリに存在しない**（続いて信頼ルールが適用されます: 高信頼の gTLD は `available` を報告、低信頼の ccTLD は DNS-over-HTTPS で再確認し `probably_available` として報告）。
3. **429 / 5xx → バックオフ付き再試行**; 持続的なネットワークや CORS の失敗時には、ユーザー提供の任意の Cloudflare Worker プロキシが引き継ぎ可能（アプリ設定の `worker.js` セットアップを参照）。
4. 結果は設定可能な TTL でローカルにキャッシュ。再チェックは 1 クリック、「キャッシュを無視」トグルで強制的に最新取得。

## 対応ゾーン

147 の厳選ゾーンをレジストリ基盤別にグループ化: Verisign（`com net cc tv`）、Google Registry（`dev app page new day how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel`）、Identity Digital（`io ai me sh ac pro info live world email studio agency` と 70 以上）、CentralNic（`xyz lol icu cyou bond sbs cfd art` と 30 以上）、Radix（`tech site online fun space store website press host`）、Uniregistry（`cloud link top win bid loan men`）、さらにステルス ccTLD エンドポイント（`de co us uk nl fr ch ru so ly`）。ライブの IANA ブートストラップが新しく委任された gTLD を自動追加します。

ゾーンが足りない？ データ駆動なので `src/config/tlds.json` にエントリーを追加するだけでコード変更は不要です。

## Domain Hunter と代替手段の比較

| | Domain Hunter | レジストラの検索ボックス | `whois` CLI | 有料 API（WhoisXML、DomainTools） |
|---|---|---|---|---|
| 価格 | 無料・MIT | 無料（1 レジストラに固定） | 無料 | ~$19/月から |
| 一括チェック | 3,000 件 × 140 以上の TLD | 1 件ずつ | スクリプトが必要 | あり・従量課金 |
| サーバー / API キー | **なし — ブラウザーで動作** | 該当せず | ローカルインストール | API キー + 課金 |
| 名前ジェネレーター | 5 つ内蔵 | 基本的な提案のみ | なし | なし |
| ライブ価格 + 3 年 TCO | 12 レジストラを比較 | 自社価格のみ | なし | 別料金 |
| プライバシー | トラッキングなし・ローカルのみ | 検索履歴が記録される | プライベート | クエリログあり |

保証された SLA、プレミアムドメインの価格フィード、1 日数百万件のチェックが必要なら有料 API を選んでください。今すぐ数百の候補を素早く・無料・プライベートにブレインストームして検証したいなら Domain Hunter を選んでください。

## FAQ

### サーバーや API キーなしでどうやってドメインをチェックできるのですか？

レジストリは RDAP（Registration Data Access Protocol、WHOIS の現代版後継）を HTTPS で公開しており、Domain Hunter が使うエンドポイントは寛容な CORS ヘッダーを送信します。ブラウザーが他の公開 API を呼ぶのと全く同じように、直接呼び出します。

### 「登録可能」ステータスは正確ですか？

ICANN 契約の gTLD 基盤（Verisign、Google、Identity Digital、…）では RDAP 404 が権威的です。RDAP の信頼性が低い ccTLD では、Domain Hunter は DNS NS ルックアップで裏付けを取り、過剰な約束を避けて `probably_available` と報告します。それでも数秒後に別の誰かが登録する可能性はあります — チェックはスナップショットなので、早めに購入してください。

### これは合法で、レジストリに礼儀正しいですか？

はい。RDAP はレジストリ自身の公開・機械可読なインターフェースです（スクレイプされる WHOIS を置き換えるために存在します）。Domain Hunter は基盤ごとにリクエストを間引き、`Retry-After` を遵守し、スロットル時には指数関数的に減速します — 例: Google Registry には最大でも ~1 リクエスト/秒しか送りません。

### 一度にいくつドメインをチェックできますか？

入力名は最大 3,000 件。TLD 展開を含めて 1 回あたり最大 30,000 件の個別チェックに制限されます。ローカルキャッシュにより再実行はほぼ瞬時に終わります。

### IDN や .ru・.de のような ccTLD に対応していますか？

国際化ドメイン名は自動的に punycode に変換されます。`de co us uk nl fr ch ru so ly` は専用エンドポイント経由で対応（`ru` は RDAP の地理制限のため実験的マーク — 任意のプロキシフォールバックがこのようなケースをカバーします）。

### データはどこに保存されますか？

ブラウザー以外のどこにも。設定、キャッシュ、カスタム単語セットは `dh:v1:*` キーで `localStorage` に保存されます。アカウントもサーバー側の状態も、いかなるアナリティクスもありません。

## 技術スタック

Svelte 5 + TypeScript（strict）、Vite 7、`vite-plugin-singlefile` — アプリ全体（JS、CSS、フォント、Web Worker チェックエンジン）が `file://` からも動作する **1 つの HTML ファイル** にコンパイルされます。テストは純粋なロジックに Vitest、UI には Playwright E2E（ネットワークをモック）を使用。CI は GitHub Actions 経由で GitHub Pages にデプロイします。

## コントリビュート

Issue と PR を歓迎します。最初のコントリビュートにおすすめ: 新しい厳選ゾーン（`src/config/tlds.json` を編集）、新しいテーマ単語セット（`src/config/dictionaries/`）、翻訳（`src/i18n/`）。ビルド・テストコマンドとプロジェクトの規約は [AGENTS.md](AGENTS.md) を参照してください。

## ライセンス

[MIT](LICENSE) — 好きに使ってください。帰属表示は歓迎します。

---

[![Star History Chart](https://api.star-history.com/svg?repos=WhiteBite/Domain-Hunter&type=Date)](https://star-history.com/#WhiteBite/Domain-Hunter&Date)

Domain Hunter が時間を節約できたなら、⭐ を付けると他の人にも見つけやすくなります。
