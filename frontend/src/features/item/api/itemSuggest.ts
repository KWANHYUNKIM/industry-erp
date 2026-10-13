import { api, tokenStore } from '../../../api/client'

export type ItemSuggestField = 'name' | 'spec'

/*
 * 같은 글자를 지웠다 다시 치면 같은 요청이 또 나간다 — 잠깐 기억해 둔다.
 * 열쇠에 <b>토큰</b>을 넣는다: 회사마다 품목이 다른데(회사별 스키마), 같은 브라우저에서
 * 다른 회사로 다시 로그인하면 앞 회사의 후보가 뜨면 안 된다.
 */
const TTL_MS = 30_000
const cache = new Map<string, { at: number; list: string[] }>()

export async function fetchItemSuggest(field: ItemSuggestField, q: string): Promise<string[]> {
  const key = `${tokenStore.get() ?? ''}|${field}|${q.trim().toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.list
  const { data } = await api.get<string[]>('/items/suggest', { params: { field, q: q.trim(), limit: 10 } })
  cache.set(key, { at: Date.now(), list: data })
  return data
}

/** 품목을 등록·수정·삭제한 뒤에는 옛 후보를 버린다. */
export function clearItemSuggestCache() {
  cache.clear()
}
