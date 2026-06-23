'use strict';

/*
 * Vercel サーバーレス関数のエントリポイント。
 * Express アプリをそのまま (req, res) ハンドラとして export する。
 * vercel.json のルーティングで全リクエストがここに集約される。
 */

module.exports = require('../app');
