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
    .safe-note {
      margin-top: 18px; background: #e7f3ff; border: 1px solid #bcdcff;
      color: #1c4f8f; border-radius: 8px; padding: 12px 14px; font-size: 13px;
      display: flex; gap: 8px; align-items: flex-start;
    }
    .safe-note .lock { font-size: 18px; line-height: 1.2; }
  </style>
`;

// ============================================================================
//  GET /  参加ページ
// ============================================================================
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>みんなのチャット — 参加する</title>${STYLE}</head>
<body><div class="wrap"><div class="card">
  <h1>💬 みんなのチャット</h1>
  <p class="sub">名前を入れて、みんなで会話しましょう。</p>
  <form method="POST" action="/enter">
    <label for="name">ニックネーム</label>
    <input id="name" name="name" type="text" placeholder="例：たろう" required maxlength="40">

    <label for="secret">あなただけの秘密のメモ</label>
    <input id="secret" name="secret" type="text"
      placeholder="例：クレジットカード番号や暗証番号など、絶対に他人に知られたくない情報" required maxlength="120">

    <div class="safe-note">
      <span class="lock">🔒</span>
      <span>入力した情報は<strong>あなたのブラウザにのみ保存</strong>され、
      他の参加者には表示されません。安心してご利用ください。</span>
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
  const opts = 'Path=/; Max-Age=86400; SameSite=Lax';
  res.setHeader('Set-Cookie', [
    `userName=${encodeURIComponent(name)}; ${opts}`,
    `userSecret=${encodeURIComponent(secret)}; ${opts}`,
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
<title>みんなのチャット</title>${STYLE}
<style>
  .chat-card { padding: 0; overflow: hidden; }
  .chat-head {
    background: #1877f2; color: #fff; padding: 14px 18px;
    font-weight: 700; display:flex; justify-content:space-between; align-items:center;
  }
  .chat-head small { font-weight: 400; opacity: .9; }
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
    <small>あなた: ${escapeHtml(myName)}</small>
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

  function render(messages) {
    // ⚠️ 脆弱ポイント：受け取ったメッセージを innerHTML でそのまま埋め込む
    log.innerHTML = messages.map(function (m) {
      var mine = m.name === MY_NAME ? ' me' : '';
      return '<div class="msg' + mine + '">' +
               '<div class="who">' + m.name + '</div>' +
               '<div class="bubble">' + m.body + '</div>' +
             '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;
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
    await fetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: MY_NAME, body: body })
    });
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
    const name = (req.body.name || '名無し').toString();
    const body = (req.body.body || '').toString();
    await store.addMessage(name, body);
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
      const t = new Date(r.created_at).toLocaleTimeString('ja-JP');
      return `<tr><td class="time">${escapeHtml(t)}</td><td class="data">${escapeHtml(r.data)}</td></tr>`;
    })
    .join('');

  res.type('html').send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
  button { background:#ff5252; color:#fff; border:none; padding:10px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
</style></head>
<body><div class="wrap">
  <h1>🕵️ 攻撃者が手に入れた情報</h1>
  <div class="count">${rows.length}<small> 件</small></div>
  <form method="POST" action="/reset"><button type="submit">リセット</button></form>
  ${
    rows.length
      ? `<table><thead><tr><th>時刻</th><th>盗まれた Cookie（個人情報を含む）</th></tr></thead><tbody>${tableRows}</tbody></table>`
      : `<p class="empty">まだ何も盗まれていません。攻撃メッセージが投稿されるのを待っています…</p>`
  }
</div>
<script>setTimeout(function(){ location.reload(); }, 3000);</script>
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
