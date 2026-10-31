/**
 * 라우트 표 · 메뉴 자료의 소스 — 검사들이 경로로 읽는 곳을 한 군데에 둔다.
 *
 * 라우트 표는 app/router.tsx 가 app/routes/<모듈>.routes.tsx 를 모아 붙인다(2026-10-31 단계 10).
 * router.tsx 만 읽으면 라우트가 거의 다 빠진 채로 검사가 <b>조용히 통과</b>한다 — 그래서 늘 이 함수로 읽는다.
 */
import { readFileSync, readdirSync } from 'node:fs'

const SRC = new URL('../frontend/src/app/', import.meta.url)
const read = (rel) => readFileSync(new URL(rel, SRC), 'utf8')

/** router.tsx 와 routes/*.routes.tsx 를 이어 붙인 글. */
export const routerSource = () => [read('router.tsx'),
  ...readdirSync(new URL('routes/', SRC)).filter((f) => f.endsWith('.routes.tsx')).sort().map((f) => read('routes/' + f))].join('\n')

/**
 * 상단 · 왼쪽 메뉴 자료 — MENU · FLAT_MENU 는 layout/menu.ts 에, 그것을 그리는 틀은 layout/EcountLayout.tsx 에 있다.
 * 메뉴 자료가 앞에 오게 이어 붙인다(쪼개기 전 EcountLayout.tsx 의 차례).
 */
export const menuSource = () => [read('layout/menu.ts'), read('layout/EcountLayout.tsx')].join('\n')

/**
 * 1,000 줄 넘는 화면을 쪼개며 떼어 낸 조각 — 화면 파일(src 기준) → 조각 파일들.
 *
 * ui-check 는 화면 파일을 경로로 읽어 열 · 단추 · 입력칸 · 근거 글을 찾는다. 조각으로 옮긴 글이 안 보이면
 * 그 검사가 실패하거나, 더 나쁘게는 볼 것이 줄어 <b>조용히 통과</b>한다. 그래서 화면을 읽을 때 조각을 뒤에 이어 붙인다.
 */
export const SPLIT_PARTS = {
  'pages/inventory/ItemsPage.tsx': ['features/item/itemForm.ts', 'features/item/components/ItemFormWindow.tsx'],
  'pages/groupware/WorkPage.tsx': ['features/workpost/boardConfig.ts', 'features/workpost/components/NameChips.tsx',
    'features/workpost/components/WorkCondPanel.tsx', 'features/workpost/components/WorkPostFormModal.tsx',
    'features/workpost/components/WorkPostViewModal.tsx', 'features/workpost/components/WorkPostSubModals.tsx'],
  'pages/trade/sales/TradeEntry.tsx': ['features/trade-entry/tradeEntryConfig.ts', 'features/trade-entry/useSlipLoad.tsx',
    'features/trade-entry/useTradeSave.tsx', 'features/trade-entry/components/TradeEntryHead.tsx',
    'features/trade-entry/components/TradeEntryToolbar.tsx', 'features/trade-entry/components/TradeEntryGrid.tsx',
    'features/trade-entry/components/TradeEntryModals.tsx', 'features/trade-entry/components/TradeLoadModals.tsx',
    'features/trade-entry/components/TradeCalcModals.tsx'],
}

const FRONT_SRC = new URL('../frontend/src/', import.meta.url)
/** 읽은 글이 쪼갠 화면이면 조각을 이어 붙여 돌려준다. path 는 어떤 꼴이든(상대 · 절대 · 윈도 구분자) 'src/' 뒤로 맞춘다. */
export const withSplitParts = (path, text) => {
  if (typeof text !== 'string') return text
  const m = String(path).replace(/\\/g, '/').match(/(?:^|\/)frontend\/src\/(.+)$/)
  const parts = m && SPLIT_PARTS[m[1]]
  return parts ? [text, ...parts.map((f) => readFileSync(new URL(f, FRONT_SRC), 'utf8'))].join('\n') : text
}
