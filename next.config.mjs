import withPWA from '@ducanh2912/next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {}

const config = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // 読解の教材データ（public/reading-data）は先読みの対象から外す。
  // 理由は2つ:
  //  1. ログインが切れた状態で先読みすると、教材の代わりにログイン画面が
  //     キャッシュに焼き付いてしまう（見張りが未ログインをログイン画面へ回すため）
  //  2. 工房で教材を作り直したとき、古い内容が端末に残るのを避ける
  publicExcludes: ['!noprecache/**/*', '!reading-data/**/*'],
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
