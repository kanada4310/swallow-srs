/**
 * 複数の context ワークフロー .output（または context_result_*.json）から
 * ctx を key 単位で union し context_result_prod.json に蓄積する。
 * 非空の ctxs を優先（後勝ち・空は上書きしない）。
 * prod_deck.json と突き合わせ、未取得の collocation key 一覧も出力する。
 *
 * Usage: node merge_ctx_outputs.mjs <out|in1> <in2> ...
 *   先頭引数 = 出力 context_result_prod.json（既存があれば取り込む）
 *   以降 = 追加入力（.output か result json）
 */
import fs from 'fs'
const [outPath, ...inputs] = process.argv.slice(2)

function loadItems(p) {
  if (!fs.existsSync(p)) return []
  const o = JSON.parse(fs.readFileSync(p, 'utf-8'))
  const r = o.result || o
  return r.items || (Array.isArray(o) ? o : [])
}

const byKey = new Map()
// 既存 out を先に取り込む
for (const it of loadItems(outPath)) {
  if (it.ctxs && it.ctxs.some(c => c && c.trim())) byKey.set(it.key, it.ctxs)
}
let added = 0
for (const p of inputs) {
  for (const it of loadItems(p)) {
    const ok = it.ctxs && it.ctxs.some(c => c && c.trim())
    if (ok && !byKey.has(it.key)) { byKey.set(it.key, it.ctxs); added++ }
  }
}

const items = Array.from(byKey, ([key, ctxs]) => ({ key, ctxs }))
fs.writeFileSync(outPath, JSON.stringify({ count: items.length, items }), 'utf-8')

// 未取得キー算出
const deck = JSON.parse(fs.readFileSync('prod_deck.json', 'utf-8'))
const allKeys = []
for (const w of deck) for (const c of w.collocations || []) {
  if ((c.exemplars || []).length) allKeys.push(`${w.id}|${c.core}`)
}
const missing = allKeys.filter(k => !byKey.has(k))
fs.writeFileSync('ctx_missing_keys.json', JSON.stringify(missing), 'utf-8')
console.log(`ctx取得済み ${byKey.size} (今回+${added}) / 全keys ${allKeys.length} / 未取得 ${missing.length}`)
