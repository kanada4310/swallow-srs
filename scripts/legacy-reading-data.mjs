/**
 * 古い置き場（public/reading-data）に教材データが現れていないかを見る。
 *
 * 教材データ（共有事項 C22）は 2026-08-27 に public の外（private/reading-data）へ移した。
 * public は誰でも取りに行ける場所なので、市販教材の本文をそこへ戻してはいけない。
 *
 * ただし教材を書き出す側（quiz_generator の deliver_reading_data.py）は、
 * 別の作業で直すまで**まだ古い置き場へ書く**。塾長が書き出しを走らせると
 * 古い置き場にファイルが現れてしまうので、黙って見過ごさずに気づけるようにする。
 *
 * 使う側は3か所:
 *   - next.config.mjs（開発サーバーの起動時・本番用ビルドの開始時に警告を出す）
 *   - data/sync-syntax-problems.mjs（取り込みを走らせたときに警告を出す）
 *   - src/lib/reading/material-access.test.ts（自動テストで赤くする）
 */

import fs from 'node:fs'
import path from 'node:path'

/** 古い置き場（リポジトリの根からの相対）。ここに何かあってはいけない */
export const LEGACY_DIR = path.join('public', 'reading-data')

/** 新しい置き場（リポジトリの根からの相対） */
export const MATERIAL_DIR = path.join('private', 'reading-data')

/**
 * 古い置き場に残っているファイル名の一覧を返す（無ければ空の配列）。
 * @param {string} [root] リポジトリの根。省略時は実行中の作業フォルダ
 */
export function findLegacyReadingData(root = process.cwd()) {
  const dir = path.join(root, LEGACY_DIR)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => !name.startsWith('.')).sort()
}

/** 警告の文言（画面にそのまま出す） */
export function legacyReadingDataWarning(files) {
  return [
    '',
    '========================================================================',
    '【警告】古い置き場に教材データがあります（ログイン無しで取得できる状態です）',
    `  場所: ${LEGACY_DIR}`,
    `  ファイル: ${files.join(', ')}`,
    '',
    '  教材の本文は市販教材のものです。public は誰でも取りに行ける場所なので、',
    `  ${MATERIAL_DIR} へ移してください（ファイル名はそのままで構いません）。`,
    '  教材を書き出す側（quiz_generator）はまだ古い置き場へ書きます。',
    '========================================================================',
    '',
  ].join('\n')
}

/**
 * 古い置き場にファイルがあれば警告を出す。あったファイル名の一覧を返す。
 * @param {string} [root]
 */
export function warnIfLegacyReadingData(root = process.cwd()) {
  const files = findLegacyReadingData(root)
  if (files.length > 0) console.warn(legacyReadingDataWarning(files))
  return files
}
