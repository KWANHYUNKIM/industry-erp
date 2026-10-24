/**
 * 회계전표 줄의 [부서] · [프로젝트] 조건(V343 — 원본 영수증으로 [부서] 는 차 · 대 모든 줄로 간다, 2026-10-13 loginaa 실측).
 * 장부 · 재무제표 · 경영자료가 같은 규칙으로 거른다: 비우면 전체, 고르면 그 id 가 붙은 줄만.
 */
export interface DeptProjectLine { departmentId?: number | null; projectId?: number | null }

/** 공용 JournalLine 타입에는 아직 두 칸이 없어 object 로 받는다(서버 응답에는 실려 온다). */
export function lineInDeptProject(line: object, dept: string, project: string): boolean {
  const l = line as DeptProjectLine
  return (!dept || String(l.departmentId ?? '') === dept) && (!project || String(l.projectId ?? '') === project)
}

/**
 * 받은 회계전표를 [부서] · [프로젝트]로 좁힌다. 장부 · 집계는 맞는 <b>줄</b>만 남기고(줄 없는 전표는 뺀다),
 * 전표 한 장이 한 줄인 화면(세금계산서 · 회계거래현황)은 {@code whole} 로 맞는 줄이 하나라도 있는 전표를 통째로 둔다.
 */
export function scopeEntries<E extends { lines: object[] }, T extends E[] | null>(es: T, dept: string, project: string, whole = false): T {
  if (!es || (!dept && !project)) return es
  const list = es as E[]
  const out = whole
    ? list.filter((e) => e.lines.some((l) => lineInDeptProject(l, dept, project)))
    : list.map((e) => ({ ...e, lines: e.lines.filter((l) => lineInDeptProject(l, dept, project)) })).filter((e) => e.lines.length > 0)
  return out as T
}
