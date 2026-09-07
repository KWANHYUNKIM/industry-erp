import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

/** GET /api/departments 한 줄 중 계층을 세우는 데 필요한 것만. */
interface DeptRow {
  id: number
  name: string
  parentId: number | null
}

/**
 * 원본 근태 현황류의 <b>[부서계층그룹]</b>.
 *
 * <p>[부서]는 <b>그 부서 하나</b>로 좁히지만, [부서계층그룹]은 <b>그 부서와 그 아래 전부</b>를
 * 본다. 생산본부 밑에 1공장·2공장·자재팀이 있으면 [부서]로는 셋을 따로따로 봐야 하고
 * "생산본부 전체의 지각이 몇 건인가" 는 눈으로 더해야 했다.
 *
 * <p>예전에는 검사 예외에 <b>'부서를 계층으로 묶지 않는다 — 평면이다'</b> 라고 적혀 있었다.
 * 사실이 아니다. {@code Department.parent} 는 진작 있고(조직도 화면이 그 트리를 그린다),
 * 응답도 {@code parentId}·{@code parentName} 을 준다. 없던 것은 <b>그걸로 거르는 자리</b>뿐이었다.
 *
 * <p>근태 응답은 부서를 <b>이름 문자열</b>로만 준다(departmentId 가 없다). 그래서 이름으로
 * 부서를 찾아 위로 거슬러 오른다. 같은 이름의 부서가 둘이면 먼저 찾은 것을 쓴다 —
 * 부서명은 마스터에서 사실상 유일하고, 이름이 겹치면 [부서] 조건도 이미 구분하지 못한다.
 */
export function useDeptGroups() {
  const [depts, setDepts] = useState<DeptRow[]>([])

  useEffect(() => {
    api.get<DeptRow[]>('/departments')
      .then((r) => setDepts(r.data))
      /* 부서를 못 불러와도 화면을 막지 않는다 — 그룹 칸만 비어 있게 둔다. */
      .catch(() => setDepts([]))
  }, [])

  const byId = useMemo(() => new Map(depts.map((d) => [d.id, d])), [depts])
  const byName = useMemo(() => {
    const m = new Map<string, DeptRow>()
    for (const d of depts) if (!m.has(d.name)) m.set(d.name, d)
    return m
  }, [depts])

  /**
   * 그룹으로 고를 수 있는 부서 — <b>아래에 부서를 하나라도 둔 것</b>만이다.
   * 잎사귀 부서를 그룹으로 고르면 [부서] 와 똑같아져서 두 칸이 같은 일을 한다.
   */
  const groups = useMemo(() => {
    const hasChild = new Set(depts.map((d) => d.parentId).filter((x): x is number => x != null))
    return depts.filter((d) => hasChild.has(d.id)).map((d) => d.name).sort()
  }, [depts])

  /**
   * 그 부서가 고른 그룹에 속하나. 자기 자신도 속한다(생산본부를 고르면 생산본부 직속도 나온다).
   * 그룹을 안 골랐으면 전부 통과시킨다.
   */
  const inGroup = (deptName: string | null, group: string): boolean => {
    if (!group) return true
    if (!deptName) return false
    let cur = byName.get(deptName)
    /* 부모를 타고 오르다 자기를 다시 만나면 멈춘다 — 마스터가 꼬여도 화면이 굳지 않게. */
    const seen = new Set<number>()
    while (cur && !seen.has(cur.id)) {
      if (cur.name === group) return true
      seen.add(cur.id)
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
    }
    return false
  }

  return { groups, inGroup }
}
