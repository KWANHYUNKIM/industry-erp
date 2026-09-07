import { useEffect, useState } from 'react'
import { api } from './../api/client'
import { partnerCodeItems, type PartnerLike, type PartnerCodeItem } from './codeItems'

/**
 * 조회조건에 쓰는 <b>코드도움 후보</b>를 한 번에 받아 둔다.
 *
 * <p>원본은 조건 판의 창고·거래처·품목·프로젝트·담당자·관리항목을 <b>모두 코드도움</b>으로
 * 둔다(사본 실측 — [선택] 버튼이 붙어 있다). 우리 화면은 상당수가 "거래처명 일부" 를
 * 손으로 치는 칸이었다. 거래처가 300곳이 넘으면 <b>이름을 외우고 있는 사람만</b> 쓸 수 있고,
 * 한 글자 틀리면 아무것도 안 나오는데 화면은 "그런 자료가 없다" 처럼 보인다.
 *
 * <p>화면마다 목록을 따로 받게 두면 <b>어떤 화면은 코드도움, 어떤 화면은 자유입력</b>인
 * 상태가 이어진다(실제로 41개 화면 101개 조건이 그랬다). 한 자리에서 받아 나눠 준다.
 *
 * <p>못 받으면 <b>빈 목록</b>을 돌려준다 — 조건을 걸 수 없게 되지만, 없는 후보를
 * 지어내는 것보다 낫다. 화면은 그대로 뜨고 다른 조건은 걸린다.
 */
export interface CondPickerItem {
  value: string
  /**
   * 원래 자료의 id. 전표가 <b>이름이 아니라 id 로</b> 사람을 가리킬 때 쓴다
   * (작업지시의 담당자는 employeeId 다 — production 은 hr 을 참조할 수 없어서다).
   * 이름만 있으면 그 전표가 누구 것인지 화면에서 이을 수가 없다.
   */
  id?: number
  code?: string | null
  name: string
  sub?: string | null
  alias?: string | null
  extra?: string | null
}

export interface CondPickers {
  /** 거래처. 값은 <b>거래처명</b>이다 — 조건이 이름 부분일치로 걸리기 때문이다. */
  partners: PartnerCodeItem[]
  /** 창고. 값은 창고명. */
  warehouses: CondPickerItem[]
  /** 품목. 값은 품목명. */
  items: CondPickerItem[]
  /** 프로젝트. 값은 프로젝트명. */
  projects: CondPickerItem[]
  /** 사원(담당자·거래처관리담당자). 값은 사원명. */
  employees: CondPickerItem[]
}

const EMPTY: CondPickers = { partners: [], warehouses: [], items: [], projects: [], employees: [] }

/**
 * @param want 받을 것만 고른다. 품목이 수천 건인 회사에서 모든 화면이 품목을 받으면
 *             조건을 안 쓰는 화면까지 느려진다.
 */
export function useCondPickers(want: (keyof CondPickers)[]): CondPickers {
  const [state, setState] = useState<CondPickers>(EMPTY)
  const key = [...want].sort().join(',')

  useEffect(() => {
    let alive = true
    const need = new Set(key.split(',').filter(Boolean) as (keyof CondPickers)[])
    const jobs: Promise<Partial<CondPickers>>[] = []

    if (need.has('partners')) {
      jobs.push(api.get<PartnerLike[]>('/partners')
        /*
         * 값은 <b>거래처명</b>이다 — 창고·품목·프로젝트와 같다. 조회조건은 이름
         * 부분일치로 거르기 때문이다.
         *
         * <p>예전에는 여기만 partnerCodeItems 를 그대로 써서 값이 <b>id</b> 였다.
         * 그러면 거래처를 고르는 순간 partnerName.includes('12') 가 되어
         * <b>목록이 통째로 비었다</b> — 고른 사람은 '그 거래처는 거래가 없구나' 로 읽는다.
         * 대장·이익현황·회계반영·수금현황 등 일곱 화면이 그 상태였다.
         */
        .then((r) => ({
          partners: partnerCodeItems(r.data).map((x) => ({ ...x, value: x.name })),
        }))
        .catch(() => ({})))
    }
    if (need.has('warehouses')) {
      jobs.push(api.get<{ id: number; code: string; name: string; active?: boolean }[]>('/warehouses')
        .then((r) => ({
          // 사용중단한 창고는 새로 거를 일이 없다 — 목록이 길어지기만 한다.
          warehouses: r.data.filter((w) => w.active !== false)
            .map((w) => ({ value: w.name, code: w.code, name: w.name })),
        }))
        .catch(() => ({})))
    }
    if (need.has('items')) {
      jobs.push(api.get<{ id: number; code: string; name: string; spec?: string | null; searchKeyword?: string | null; active?: boolean }[]>('/items')
        .then((r) => ({
          items: r.data.filter((x) => x.active !== false)
            .map((x) => ({ value: x.name, code: x.code, name: x.name, sub: x.spec, alias: x.searchKeyword })),
        }))
        .catch(() => ({})))
    }
    if (need.has('projects')) {
      jobs.push(api.get<{ id: number; code: string; name: string }[]>('/projects')
        .then((r) => ({ projects: r.data.map((p) => ({ value: p.name, code: p.code, name: p.name })) }))
        .catch(() => ({})))
    }

    if (need.has('employees')) {
      jobs.push(api.get<{ id: number; code: string; name: string; department?: string | null; active?: boolean }[]>('/employees')
        .then((r) => ({
          employees: r.data.filter((e) => e.active !== false)
            .map((e) => ({ id: e.id, value: e.name, code: e.code, name: e.name, sub: e.department })),
        }))
        .catch(() => ({})))
    }

    Promise.all(jobs).then((parts) => {
      if (!alive) return
      setState(parts.reduce<CondPickers>((a, p) => ({ ...a, ...p }), EMPTY))
    })
    return () => { alive = false }
  }, [key])

  return state
}
