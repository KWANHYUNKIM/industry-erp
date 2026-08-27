/**
 * 업무일지 조건 [기타]의 <b>사용중단부서포함</b> — 원본 실측(사본 '업무일지').
 * 기본은 꺼져 있다 — 즉 사용중단한 부서의 업무일지는 기본 화면에 안 나온다.
 *
 * <p>우리는 그 개념이 없어서 없어진 부서의 일지가 계속 섞여 나왔다.
 *
 * <p>규칙을 따로 뺀 이유: <b>모르는 부서를 숨기면 안 된다.</b> 업무일지의 부서는
 * 자유입력이라 부서 마스터에 없는 이름이 흔하다. '마스터에 없으면 뺀다' 로 만들면
 * 옛 부서명으로 적힌 일지가 통째로 사라진다 — 사라진 줄은 눈에 안 띈다.
 * 뺄 대상은 <b>마스터에 있고 사용중단인 부서</b>뿐이다.
 */

export interface DeptRow {
  name: string
  active: boolean
  /** 코드도움에 같이 보여 줄 부서코드. 없을 수 있다. */
  code?: string | null
}

/** 사용중단인 부서 이름들. 마스터를 못 받았으면 빈 집합 — 아무것도 숨기지 않는다. */
export function inactiveDeptNames(rows: DeptRow[]): Set<string> {
  return new Set(rows.filter((d) => !d.active).map((d) => d.name))
}

/**
 * 그 일지를 보여 줄 것인가.
 *
 * @param department 일지에 적힌 부서명 (자유입력. 비어 있을 수 있다)
 * @param inactive   사용중단 부서 이름들
 * @param include    [사용중단부서포함] 이 켜져 있는가
 */
export function showsJournal(
  department: string | null | undefined,
  inactive: Set<string>,
  include: boolean,
): boolean {
  if (include) return true
  const name = (department ?? '').trim()
  // 부서를 안 적은 일지는 어느 부서 것도 아니다 — 숨길 근거가 없다.
  if (name === '') return true
  return !inactive.has(name)
}
