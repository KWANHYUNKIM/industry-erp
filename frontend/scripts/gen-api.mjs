#!/usr/bin/env node
/**
 * 서버 API 계약(OpenAPI) → 프론트 타입.  `npm run gen:api`
 *
 *   1) 떠 있는 백엔드(dev 프로필)에 로그인해 /v3/api-docs 를 받는다(로그인한 요청만 열린다).
 *   2) openapi-typescript 로 src/types/generated.ts 를 만든다.
 *
 * 기존 src/types/api.ts 는 그대로 둔다 — 한 번에 갈아끼우지 않고, 화면을 고칠 일이 생길 때
 * 그 화면부터 생성 타입으로 옮긴다(docs/백엔드-API-설계.md 4장 2단계 · 5장 4번은 아직 결정 전).
 *
 * 환경변수: ERP_API(기본 http://localhost:8081) · ERP_COMPANY(0001) · ERP_USER(admin) · ERP_PASS(admin1234)
 *          OUT(기본 src/types/generated.ts)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.ERP_API ?? 'http://localhost:8081'
const OUT = process.env.OUT ?? join(ROOT, 'src/types/generated.ts')
/** 버전 고정 — 생성본이 도구 버전에 따라 흔들리지 않게. */
const TOOL = 'openapi-typescript@7.13.0'

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    companyCode: process.env.ERP_COMPANY ?? '0001',
    username: process.env.ERP_USER ?? 'admin',
    password: process.env.ERP_PASS ?? 'admin1234',
  }),
})
if (!login.ok) throw new Error(`로그인 실패 HTTP ${login.status}`)
const { token } = await login.json()

const res = await fetch(`${BASE}/v3/api-docs`, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) {
  throw new Error(`/v3/api-docs HTTP ${res.status} — 백엔드가 dev 프로필로 떠 있는지 보세요(운영 설정은 문서를 닫는다).`)
}
const spec = await res.text()
const dir = mkdtempSync(join(tmpdir(), 'erp-openapi-'))
const specFile = join(dir, 'openapi.json')
writeFileSync(specFile, spec)

execFileSync('npx', ['-y', TOOL, specFile, '-o', OUT], { stdio: 'inherit', cwd: ROOT })
console.log(`→ ${OUT} (스펙 ${(spec.length / 1024).toFixed(0)}KB)`)
