import withPWA from '@ducanh2912/next-pwa'
import { warnIfLegacyReadingData } from './scripts/legacy-reading-data.mjs'

// 開発サーバーの起動時・本番用ビルドの開始時に、古い置き場（public/reading-data）へ
// 教材データが戻っていないかを見る。教材を書き出す側（quiz_generator）は別の作業で
// 直すまで古い置き場へ書くため、黙って見過ごさずここで警告を出す。
warnIfLegacyReadingData()

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 教材データ（private/reading-data・共有事項 C22）はサーバー側で読む。
    // 名前を組み立てて読むので自動では見つけてもらえない。本番へ載せる荷物に
    // 必ず含めるよう、使うところを名指しで指定する。
    outputFileTracingIncludes: {
      '/api/reading/material/[file]': ['./private/reading-data/**'],
      // 講師用の正解表（private/syntax-problems・共有事項 C24）も同じ扱い
      '/api/reading/syntax-problems': ['./private/syntax-problems/**'],
      '/api/reading/syntax-ai/judge': ['./private/reading-data/**'],
      '/api/reading/syntax-ai/dialogue': ['./private/reading-data/**'],
      '/api/reading/syntax-card': ['./private/reading-data/**'],
    },
  },
}

const config = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // 読解の教材データは public から出した（private/reading-data・2026-08-27）ので、
  // 先読みの対象から外す指定はもう要らない。取りに行く先は
  // ログインした人だけが読める入口（/api/reading/material/...）で、
  // 下の runtimeCaching のどの決まりにも当てはまらない＝端末に残さない。
  publicExcludes: ['!noprecache/**/*'],
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    runtimeCaching: [
      // NOTE: Page navigation caching for /decks, /study was removed.
      // SW's NetworkFirst handler intercepted RSC (React Server Components) payload
      // requests and returned /offline HTML as fallback, which Next.js couldn't parse.
      // Instead, RSC fetch failures are caught by error.tsx boundaries, which render
      // client components that load data from IndexedDB (offline-first).
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60, // 1 hour
          },
          networkTimeoutSeconds: 10,
        },
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /\/_next\/image\?url=.+/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-image',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-images',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
        },
      },
      {
        urlPattern: /\.(?:js|css)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24, // 1 day
          },
        },
      },
    ],
  },
})(nextConfig)

export default config
