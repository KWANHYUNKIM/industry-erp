import { useEffect, useState } from 'react'
import { api } from './../api/client'

/**
 * 원가 화면들이 <b>기본으로 빼고 보여 주는</b> 품목들.
 *
 * <p>원본 원가 화면들의 조건 판 [기타]에는 <b>사용중단품목포함</b> 과
 * <b>수량관리제외품목포함</b> 이 있고 둘 다 <b>기본은 꺼져 있다</b> —
 * 즉 기본 화면에는 그 품목들이 안 나온다. 체크를 켜야 나온다.
 *
 * <p>우리는 그런 개념 자체가 없어서 원가표에 이미 안 쓰는 품목이 계속 섞여 나왔고,
 * 재고를 잡지 않는 품목(용역·운반비)까지 원가표에 앉아 있었다 — 만들지 않는 것에
 * 표준원가를 매기는 것은 뜻이 없다.
 *
 * <p>원가 응답은 itemId 만 주고 사용여부·재고수량관리는 품목 마스터에 있으므로
 * 여기서 한 번 받아 둔다. 실패하면 <b>빈 집합</b>을 돌려준다 — 못 받았다고 해서
 * 멀쩡한 품목을 숨기면 원가표에 구멍이 생기고, 그 편이 훨씬 나쁘다.
 */
export interface ItemFlags {
  /** 사용중단(active=false) 품목의 id */
  inactive: Set<number>
  /** 수량관리제외(stockTracked=false) 품목의 id */
  untracked: Set<number>
  /**
   * 그 품목의 <b>[품목구분]·[품목그룹1]</b> 이름. 원본 재고 화면들이 그 둘로 거른다
   * (2026-09-09 재고현황·재고잔량분석표 실측). 어차피 여기서 품목 마스터를 통째로
   * 받고 있으니 <b>같은 한 번</b>에 담아 둔다 — 화면마다 또 부르면 같은 목록을 두 번 받는다.
   */
  categoryOf: (itemId: number) => string
  groupOf: (itemId: number) => string
  /** 고를 수 있는 후보(마스터에 실제로 붙어 있는 이름만). */
  categories: string[]
  groups: string[]
}

type ItemRow = {
  id: number; active: boolean; stockTracked?: boolean
  categoryName?: string | null; itemGroupName?: string | null
}

const EMPTY: ItemFlags = {
  inactive: new Set(), untracked: new Set(),
  categoryOf: () => '', groupOf: () => '', categories: [], groups: [],
}

export function useItemFlags(): ItemFlags {
  const [flags, setFlags] = useState<ItemFlags>(EMPTY)

  useEffect(() => {
    let alive = true
    api.get<ItemRow[]>('/items')
      .then((r) => {
        if (!alive) return
        const cat = new Map<number, string>()
        const grp = new Map<number, string>()
        for (const i of r.data) {
          if (i.categoryName) cat.set(i.id, i.categoryName)
          if (i.itemGroupName) grp.set(i.id, i.itemGroupName)
        }
        setFlags({
          inactive: new Set(r.data.filter((i) => !i.active).map((i) => i.id)),
          // stockTracked 가 안 오면 관리대상으로 본다 — 모르는 것을 숨기지 않는다.
          untracked: new Set(r.data.filter((i) => i.stockTracked === false).map((i) => i.id)),
          categoryOf: (id) => cat.get(id) ?? '',
          groupOf: (id) => grp.get(id) ?? '',
          categories: [...new Set(cat.values())].sort(),
          groups: [...new Set(grp.values())].sort(),
        })
      })
      .catch(() => { /* 못 받으면 아무것도 숨기지 않는다 */ })
    return () => { alive = false }
  }, [])

  return flags
}

/** 예전 이름. 사용중단 집합만 쓰던 화면들이 그대로 쓸 수 있게 남겨 둔다. */
export function useInactiveItems(): Set<number> {
  return useItemFlags().inactive
}
