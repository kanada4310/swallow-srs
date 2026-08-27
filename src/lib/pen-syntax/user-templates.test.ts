import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearUserTemplates,
  loadUserTemplates,
  saveUserTemplate,
  userTemplatesKey,
} from './user-templates'
import { needsEnrollment, REQUIRED_SYMBOLS, samplesFor } from './onboarding'
import type { UserTemplateStore } from './letters'
import type { PenStroke } from './types'

const stroke: PenStroke = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
]

/** 必須の種類がすべてそろった店構え（登録済みの利用者を作るのに使う） */
function completeStore(): UserTemplateStore {
  const store: UserTemplateStore = {}
  for (const s of REQUIRED_SYMBOLS) {
    store[s] = Array.from({ length: samplesFor(s) }, () => [stroke])
  }
  return store
}

describe('お手本の保存（利用者ごと）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('保存の鍵は利用者ごとに分かれる', () => {
    expect(userTemplatesKey('u1')).not.toBe(userTemplatesKey('u2'))
    expect(userTemplatesKey(null)).toBe(userTemplatesKey(undefined))
  })

  it('別の利用者のお手本は読まない（同じ端末でも混ざらない）', () => {
    saveUserTemplate('u1', 'S', [stroke])
    expect(loadUserTemplates('u1').S).toHaveLength(1)
    expect(loadUserTemplates('u2')).toEqual({})
  })

  it('利用者が変わったら「登録済み」と誤判定しない（初回登録の案内が出る）', () => {
    window.localStorage.setItem(userTemplatesKey('u1'), JSON.stringify(completeStore()))
    expect(needsEnrollment(loadUserTemplates('u1'))).toBe(false)
    // 同じ端末を別の人が使ったとき: 案内が出る（他人の字を引き継がない）
    expect(needsEnrollment(loadUserTemplates('u2'))).toBe(true)
  })

  it('利用者の付いていない古い保存は読み込まない（誰の字か分からないため）', () => {
    window.localStorage.setItem('pen-syntax-user-templates-v1', JSON.stringify(completeStore()))
    expect(loadUserTemplates('u1')).toEqual({})
    expect(needsEnrollment(loadUserTemplates('u1'))).toBe(true)
  })

  it('消すのも利用者ごと（他の人の登録は残る）', () => {
    saveUserTemplate('u1', 'S', [stroke])
    saveUserTemplate('u2', 'S', [stroke])
    clearUserTemplates('u1', 'S')
    expect(loadUserTemplates('u1').S ?? []).toHaveLength(0)
    expect(loadUserTemplates('u2').S).toHaveLength(1)
  })

  it('同じ記号は3本まで残る（古いものから落ちる）', () => {
    for (let i = 0; i < 5; i++) saveUserTemplate('u1', 'V', [stroke])
    expect(loadUserTemplates('u1').V).toHaveLength(3)
  })
})
