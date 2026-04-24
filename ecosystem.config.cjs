// PM2設定: next dev をメモリ監視付きで起動する
// - 4GB超えで自動再起動（Next.js 16 Turbopack のメモリリーク対策）
// - next-server (worker node) ごと殺すため kill_timeout を長めに設定
// - 使い方:
//     npm run dev:pm2          起動
//     npm run dev:pm2:logs     ログ追跡
//     npm run dev:pm2:stop     停止
//     npm run dev:pm2:status   状態確認

module.exports = {
  apps: [
    {
      name: 'attendance-dev',
      script: 'node_modules/next/dist/bin/next',
      args: 'dev',
      cwd: __dirname,
      // メモリ閾値 (PM2 が30秒ごとに RSS を監視し、超えたら再起動)
      max_memory_restart: '4G',
      // 再起動時に子プロセスを確実に終わらせる猶予
      kill_timeout: 10000,
      // 無限再起動ループを防ぐガード
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      autorestart: true,
      watch: false,
      // Node.js 自体のヒープ上限も同時に指定
      node_args: '--max-old-space-size=4096',
      env: {
        NODE_ENV: 'development',
      },
      // 独立したログファイル
      out_file: './.pm2/out.log',
      error_file: './.pm2/error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
