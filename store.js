'use strict';

/*
 * ============================================================================
 *  ストレージ抽象化レイヤ
 * ============================================================================
 *  - 環境変数 SUPABASE_URL と SUPABASE_SERVICE_KEY が両方あれば Supabase を使う
 *    （Vercel などのサーバーレス環境で、全インスタンスが状態を共有するため）
 *  - なければインメモリ（プロセス内の配列）にフォールバックする
 *    （ローカル開発・Render/Railway などの常駐サーバーでは無設定で動く）
 *
 *  どちらの実装も同じ Promise ベースの API を公開する:
 *    getMessages()        -> [{ name, body }, ...]   （古い順）
 *    addMessage(name, body)
 *    getStolen()          -> [{ data, created_at }]  （新しい順）
 *    addStolen(data)
 *    resetStolen()
 *    mode                 -> 'supabase' | 'memory'
 * ============================================================================
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function createMemoryStore() {
  const messages = []; // { name, body }
  const stolen = []; // { data, created_at }
  return {
    mode: 'memory',
    async getMessages() {
      return messages.map((m) => ({
        name: m.name,
        body: m.body,
        created_at: m.created_at,
      }));
    },
    async addMessage(name, body) {
      messages.push({ name, body, created_at: new Date().toISOString() });
    },
    async resetMessages() {
      messages.length = 0;
    },
    async getStolen() {
      // 新しい順
      return stolen
        .slice()
        .reverse()
        .map((s) => ({ data: s.data, created_at: s.created_at }));
    },
    async addStolen(data) {
      // 同じ内容は1件だけ（<img onerror> が再描画のたびに再発火して
      // 同一 Cookie が無限に溜まるのを防ぐ）
      if (stolen.some((s) => s.data === data)) return;
      stolen.push({ data, created_at: new Date().toISOString() });
    },
    async resetStolen() {
      stolen.length = 0;
    },
  };
}

function createSupabaseStore() {
  // 遅延 require：Supabase を使わない環境では依存を読み込まない
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  return {
    mode: 'supabase',
    async getMessages() {
      const { data, error } = await db
        .from('messages')
        .select('name, body, created_at')
        .order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async addMessage(name, body) {
      const { error } = await db.from('messages').insert({ name, body });
      if (error) throw error;
    },
    async resetMessages() {
      const { error } = await db.from('messages').delete().gt('id', 0);
      if (error) throw error;
    },
    async getStolen() {
      const { data, error } = await db
        .from('stolen')
        .select('data, created_at')
        .order('id', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async addStolen(data) {
      // 同じ内容は1件だけ（<img onerror> が再描画のたびに再発火して
      // 同一 Cookie が無限に溜まるのを防ぐ）。まず存在確認してから挿入する。
      const { data: existing, error: selErr } = await db
        .from('stolen')
        .select('id')
        .eq('data', data)
        .limit(1);
      if (selErr) throw selErr;
      if (existing && existing.length) return;
      const { error } = await db.from('stolen').insert({ data });
      if (error) throw error;
    },
    async resetStolen() {
      // 全行削除（id > 0 で全件マッチ）
      const { error } = await db.from('stolen').delete().gt('id', 0);
      if (error) throw error;
    },
  };
}

const store =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createSupabaseStore()
    : createMemoryStore();

module.exports = store;
