/**
 * 検索よけ。
 *
 * この演習室はログインした人だけが使うもので、検索に載せたいページは1つも無い。
 * 教材データ（市販教材の本文・共有事項 C22）の入口も同じく検索の対象から外す。
 * サイト全体を対象外にしているのは、公開したいページが無いため
 * （個別に外し忘れる余地を残さない）。
 */

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  }
}
