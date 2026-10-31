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
