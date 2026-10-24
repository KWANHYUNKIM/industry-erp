/** 경영요약보고서(E010821) [종류] — 2026-10-22 loginaa 종류검색 창 실측(트리 4 모듈 · 13종). */
export const KIND_TREE: { module: string; groups: { name: string; kinds: string[] }[] }[] = [
  { module: '그룹웨어', groups: [{ name: '업무관리', kinds: ['출/퇴근현황(ID)'] }] },
  { module: '관리', groups: [{ name: '인사관리', kinds: ['인원현황'] }, { name: '근태관리', kinds: ['출/퇴근현황(사원)'] }] },
  { module: '재고 I', groups: [
    { name: '영업관리', kinds: ['판매'] }, { name: '구매관리', kinds: ['구매'] }, { name: '생산/외주', kinds: ['생산입고'] },
    { name: '출력물', kinds: ['재고변동표', '현황누계표'] },
  ] },
  { module: '회계 I', groups: [
    { name: '자금', kinds: ['통장잔액비교표', '자금증감내역'] }, { name: '출력물', kinds: ['매출장', '매입장', '계정별원장 (집계)'] },
  ] },
]

/** 검색하면 표를 그리는 차례(원본: 통장잔액비교표 · 매출/매입장 · 자금증감내역 · 판매 · 구매 · 생산입고 · 재고변동표 · 현황누계표 · 출/퇴근 · 인원). */
export const KIND_ORDER = [
  '통장잔액비교표', '매출장', '매입장', '자금증감내역', '계정별원장 (집계)',
  '판매', '구매', '생산입고', '재고변동표', '현황누계표', '출/퇴근현황(ID)', '인원현황', '출/퇴근현황(사원)',
] as const
export const ALL_KINDS: string[] = KIND_TREE.flatMap((m) => m.groups.flatMap((g) => g.kinds))
