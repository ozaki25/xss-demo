'use strict';

/*
 * ============================================================================
 *  XSS 体験デモ チャットアプリ（研修用） — Express アプリ本体
 * ============================================================================
 *  ⚠️ このアプリは「意図的に脆弱」に作られています。
 *     XSS（クロスサイトスクリプティング）を体感するための教材です。
 *     本番環境・公開サーバーでは絶対に使用しないでください。
 *
 *  このファイルは Express アプリを組み立てて export するだけ（listen しない）。
 *    - ローカル / Render など常駐サーバー: server.js が listen する
 *    - Vercel（サーバーレス）           : api/index.js がこの app を handler にする
 * ============================================================================
 */

const express = require('express');
const store = require('./store');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 検索エンジン・クローラーに拾わせない -----------------------------------
//  研修用の一時公開を想定。全レスポンスに noindex を付け、robots.txt でも拒否する。
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  next();
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// --- 簡易 Cookie パーサ ------------------------------------------------------
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// 講師用画面だけはエスケープして安全に表示する
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
//  共通スタイル
// ============================================================================
const STYLE = `
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
      "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif;
      background: #f0f2f5; color: #1c1e21;
    }
    .wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
    .card {
      background: #fff; border-radius: 14px; padding: 28px;
      box-shadow: 0 1px 4px rgba(0,0,0,.1);
    }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #65676b; font-size: 14px; margin: 0 0 20px; }
    label { display: block; font-weight: 600; font-size: 14px; margin: 16px 0 6px; }
    input[type=text] {
      width: 100%; padding: 12px 14px; font-size: 16px;
      border: 1px solid #ccd0d5; border-radius: 8px;
    }
    button {
      margin-top: 22px; width: 100%; padding: 13px;
      background: #1877f2; color: #fff; border: none; border-radius: 8px;
      font-size: 16px; font-weight: 700; cursor: pointer;
    }
    button:hover { background: #166fe5; }
    .warn-note {
      margin-top: 18px; background: #fff4e5; border: 1px solid #ffd8a8;
      color: #8a4b00; border-radius: 8px; padding: 12px 14px; font-size: 13px;
      display: flex; gap: 8px; align-items: flex-start;
    }
    .warn-note .lock { font-size: 18px; line-height: 1.2; }
  </style>
`;

// ============================================================================
//  GET /  参加ページ
// ============================================================================
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>みんなのチャット — 参加する</title>${STYLE}</head>
<body><div class="wrap"><div class="card">
  <h1>💬 みんなのチャット</h1>
  <p class="sub">名前を入れて、みんなで会話しましょう。</p>
  <form method="POST" action="/enter">
    <label for="name">ニックネーム</label>
    <input id="name" name="name" type="text" placeholder="例：たろう" required maxlength="40">

    <label for="secret">あなただけの秘密のメモ</label>
    <input id="secret" name="secret" type="text"
      placeholder="例：ひみつのことば123（※本物の個人情報は入力しないでください）" required maxlength="120">

    <div class="warn-note">
      <span class="lock">⚠️</span>
      <span>これは<strong>研修用のデモアプリ</strong>です。
      <strong>本物の個人情報は入力しないでください</strong>。架空のダミー値を入力してください。</span>
    </div>

    <button type="submit">チャットに参加する</button>
  </form>
</div></div></body></html>`);
});

// ============================================================================
//  POST /enter  Cookie に保存して /chat へ
//  ※ httpOnly を付けていない → JS から document.cookie で読めてしまう（脆弱）
// ============================================================================
app.post('/enter', (req, res) => {
  const name = (req.body.name || '名無し').toString();
  const secret = (req.body.secret || '').toString();
  const laxOpts = 'Path=/; Max-Age=86400; SameSite=Lax';
  // ⚠️ CSRF デモ用の「実装ミス」再現：userName だけ SameSite=None にしている。
  //   None にすると別ドメイン（罠サイト）からのクロスサイト POST でもこの Cookie が
  //   送られてしまい、なりすまし投稿（CSRF）が成立する。本来 Lax であれば
  //   cross-site の POST には付かず防げる。None は Secure（HTTPS）必須。
  const noneOpts = 'Path=/; Max-Age=86400; SameSite=None; Secure';
  res.setHeader('Set-Cookie', [
    `userName=${encodeURIComponent(name)}; ${noneOpts}`,
    `userSecret=${encodeURIComponent(secret)}; ${laxOpts}`,
  ]);
  res.redirect('/chat');
});

// ============================================================================
//  GET /chat  チャット画面
//  ※ メッセージ表示は innerHTML でエスケープなし（格納型 XSS が発火する）
// ============================================================================
app.get('/chat', (req, res) => {
  const cookies = parseCookies(req);
  if (!cookies.userName) return res.redirect('/');
  const myName = cookies.userName;

  res.type('html').send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>みんなのチャット</title>${STYLE}
<style>
  .chat-card { padding: 0; overflow: hidden; }
  .chat-head {
    background: #1877f2; color: #fff; padding: 14px 18px;
    font-weight: 700; display:flex; justify-content:space-between; align-items:center;
  }
  .chat-head .right { display:flex; align-items:center; gap:10px; }
  .chat-head small { font-weight: 400; opacity: .9; }
  .chat-head .clear {
    margin: 0; width: auto; padding: 6px 10px; font-size: 12px; font-weight: 700;
    background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.5);
    border-radius: 8px; color: #fff; cursor: pointer;
  }
  .chat-head .clear:hover { background: rgba(255,255,255,.32); }
  #log { height: 56vh; overflow-y: auto; padding: 16px; background: #fff; }
  .msg { margin-bottom: 14px; }
  .msg .who { font-size: 12px; color: #65676b; margin-bottom: 3px; }
  .msg .bubble {
    display: inline-block; background: #e4e6eb; padding: 9px 13px;
    border-radius: 14px; font-size: 15px; max-width: 100%; word-break: break-word;
  }
  .msg.me .who { text-align: right; }
  .msg.me { text-align: right; }
  .msg.me .bubble { background: #1877f2; color: #fff; }
  .composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e4e6eb; background:#fff; }
  .composer input { flex: 1; padding: 11px 14px; font-size: 15px; border: 1px solid #ccd0d5; border-radius: 20px; }
  .composer button { margin: 0; width: auto; padding: 0 20px; border-radius: 20px; }
</style></head>
<body><div class="wrap"><div class="card chat-card">
  <div class="chat-head">
    <span>💬 みんなのチャット</span>
    <span class="right">
      <small>あなた: ${escapeHtml(myName)}</small>
      <button type="button" id="clearBtn" class="clear">🗑 投稿を全消去</button>
    </span>
  </div>
  <div id="log"></div>
  <form class="composer" id="composer">
    <input id="body" type="text" placeholder="メッセージを入力…" autocomplete="off" required>
    <button type="submit">送信</button>
  </form>
</div></div>
<script>
  const MY_NAME = ${JSON.stringify(myName)};
  const log = document.getElementById('log');
  var renderedCount = 0; // 既に描画済みのメッセージ数

  function bubbleHtml(m) {
    var mine = m.name === MY_NAME ? ' me' : '';
    return '<div class="msg' + mine + '">' +
             '<div class="who">' + m.name + '</div>' +
             '<div class="bubble">' + m.body + '</div>' +
           '</div>';
  }

  function render(messages) {
    // 投稿がリセットされた（件数が減った）場合は一旦まっさらにする
    if (messages.length < renderedCount) {
      log.innerHTML = '';
      renderedCount = 0;
    }
    // 新着分だけを追記する。こうすると毎回 innerHTML を作り直さないので、
    // 既存メッセージの <img onerror> が再描画のたびに再発火しなくなる
    // （= 各メッセージの XSS は閲覧者ごとに1回だけ実行される）。
    for (var i = renderedCount; i < messages.length; i++) {
      // ⚠️ 脆弱ポイント：受け取ったメッセージを innerHTML でそのまま埋め込む
      var div = document.createElement('div');
      div.innerHTML = bubbleHtml(messages[i]);
      log.appendChild(div.firstChild);
    }
    if (messages.length > renderedCount) log.scrollTop = log.scrollHeight;
    renderedCount = messages.length;
  }

  async function poll() {
    try {
      const r = await fetch('/messages');
      render(await r.json());
    } catch (e) {}
  }

  document.getElementById('composer').addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('body');
    const body = input.value;
    if (!body) return;
    input.value = '';
    // 投稿者名はサーバーが Cookie（userName）から決めるので body だけ送る。
    await fetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body })
    });
    poll();
  });

  document.getElementById('clearBtn').addEventListener('click', async function () {
    if (!confirm('チャットの投稿をすべて消去します。よろしいですか？')) return;
    try {
      await fetch('/messages/reset', { method: 'POST' });
    } catch (e) {}
    poll();
  });

  poll();
  setInterval(poll, 2000);
</script>
</body></html>`);
});

// ============================================================================
//  メッセージ API
// ============================================================================
app.get('/messages', async (req, res) => {
  try {
    res.json(await store.getMessages());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/messages', async (req, res) => {
  try {
    // 投稿者名はクライアント指定ではなく Cookie の userName から決める。
    // ⚠️ これにより「Cookie さえ送られれば本人として投稿できる」状態になり、
    //   別ドメインの罠サイトからの自動 POST（CSRF）でなりすまし投稿が成立する。
    //   フォーム送信（application/x-www-form-urlencoded）でも JSON でも body を読める。
    const cookies = parseCookies(req);
    const name = cookies.userName;
    if (!name) return res.status(401).json({ error: 'not logged in' });
    const body = (req.body.body || '').toString();
    await store.addMessage(name, body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// 投稿（チャット）を全消去する。
// 攻撃メッセージを消すことで <img onerror> の再発火（情報窃取）も止まる。
app.post('/messages/reset', async (req, res) => {
  try {
    await store.resetMessages();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ============================================================================
//  GET /steal  「攻撃者のサーバー」役
//  盗んだ Cookie 文字列を保存する
// ============================================================================
app.get('/steal', async (req, res) => {
  try {
    const data = (req.query.data || '').toString();
    await store.addStolen(data);
    res.set('Access-Control-Allow-Origin', '*');
    res.send('ok');
  } catch (e) {
    res.status(500).send('error');
  }
});

// ============================================================================
//  GET /stolen  講師用ダッシュボード（盗まれた情報を一覧表示）
//  ※ ここはサーバー側で escape して安全に表示する
// ============================================================================
app.get('/stolen', async (req, res) => {
  let rows = [];
  try {
    rows = await store.getStolen();
  } catch (e) {
    return res
      .status(500)
      .type('html')
      .send(`<pre>ストレージエラー: ${escapeHtml(String(e.message || e))}</pre>`);
  }

  const tableRows = rows
    .map((r) => {
      const t = new Date(r.created_at).toLocaleTimeString('ja-JP', {
        timeZone: 'Asia/Tokyo',
      });
      // 盗んだ Cookie は encodeURIComponent された状態（%E3%81...）なので、
      // 講師が読めるようにデコードしてから表示する（壊れていれば生のまま）。
      let display = r.data;
      try {
        display = decodeURIComponent(r.data);
      } catch (e) {
        /* 不正なエスケープ列のときは生データのまま表示する */
      }
      return `<tr><td class="time">${escapeHtml(t)}</td><td class="data">${escapeHtml(display)}</td></tr>`;
    })
    .join('');

  res.type('html').send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>🕵️ 盗まれた情報（講師用）</title>
<style>
  body { margin:0; font-family: -apple-system, "Noto Sans JP", sans-serif; background:#1a1a1a; color:#eee; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 22px; }
  .count { font-size: 64px; font-weight: 800; color: #ff5252; line-height: 1; margin: 8px 0 4px; }
  .count small { font-size: 18px; color:#aaa; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; background:#262626; border-radius:10px; overflow:hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #3a3a3a; font-size: 14px; }
  th { background:#333; color:#bbb; }
  td.time { color:#888; white-space: nowrap; width: 1%; }
  td.data { font-family: monospace; word-break: break-all; color:#ffd54f; }
  .empty { color:#888; padding: 24px 0; }
  .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top: 4px; }
  button { background:#ff5252; color:#fff; border:none; padding:10px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
  button.secondary { background:#444; }
  button.primary { background:#1877f2; }
</style></head>
<body><div class="wrap">
  <h1>🕵️ 攻撃者が手に入れた情報</h1>
  <div class="count">${rows.length}<small> 件</small></div>
  <div class="actions">
    <button type="button" class="primary" id="reloadBtn">🔄 再取得</button>
    <form method="POST" action="/reset"><button type="submit">盗まれた情報をリセット</button></form>
    <button type="button" class="secondary" id="clearChat">チャットの投稿を全消去（攻撃を止める）</button>
  </div>
  ${
    rows.length
      ? `<table><thead><tr><th>時刻</th><th>盗まれた Cookie（個人情報を含む）</th></tr></thead><tbody>${tableRows}</tbody></table>`
      : `<p class="empty">まだ何も盗まれていません。攻撃メッセージが投稿されるのを待っています…</p>`
  }
</div>
<script>
  // 自動更新はしない（負荷が高いため）。「🔄 再取得」ボタンで手動更新する。
  document.getElementById('reloadBtn').addEventListener('click', function () {
    location.reload();
  });
  document.getElementById('clearChat').addEventListener('click', async function () {
    if (!confirm('チャットの投稿をすべて消去します。攻撃メッセージも消え、情報窃取が止まります。よろしいですか？')) return;
    try { await fetch('/messages/reset', { method: 'POST' }); } catch (e) {}
    alert('チャットの投稿を消去しました。');
    location.reload();
  });
</script>
</body></html>`);
});

app.post('/reset', async (req, res) => {
  try {
    await store.resetStolen();
  } catch (e) {
    /* 失敗してもリダイレクトして画面側で気づける */
  }
  res.redirect('/stolen');
});

module.exports = app;
