#!/usr/bin/env node
/**
 * QA 기록용 화면 캡처 — 헤드리스 Chrome 을 CDP 로 몰아 로그인한 화면을 PNG 로 남긴다.
 * 의존성 없음(Node 22 의 fetch·WebSocket 만 쓴다).
 *
 *   node qa/shot.mjs <시나리오.json>
 *
 * 시나리오: { "shots": [ { "path": "/sales/unshipped", "out": "a.png",
 *                          "steps": ["pick:거래처:QA-SAME-B"], "clip": [x, y, w, h] } ] }
 *   step 종류 —  pick:<라벨>:<코드>  조건 칸의 코드도움 팝업을 열어 그 코드 행을 고른다
 *               js:<식>             페이지에서 그대로 평가한다
 *               wait:<ms>
 *
 * 브라우저 확장으로 찍는 캡처가 창 상태(최소화·뒤로 감)에 따라 멈춰서 따로 만들었다.
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

const API = process.env.ERP_API ?? 'http://localhost:8081/api'
const WEB = process.env.ERP_WEB ?? 'http://localhost:5180'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333

const scenarioPath = process.argv[2]
if (!scenarioPath) { console.error('사용법: node qa/shot.mjs <시나리오.json>'); process.exit(2) }
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))
const baseDir = dirname(resolve(scenarioPath))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const login = await (await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: process.env.ERP_USER ?? 'admin', password: process.env.ERP_PASS ?? 'admin1234' }),
})).json()
const token = login.token ?? login.accessToken
if (!token) throw new Error('로그인 실패: ' + JSON.stringify(login))

const profile = mkdtempSync(join(tmpdir(), 'erp-shot-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1600,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })

let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page') } catch { /* 아직 안 뜸 */ }
}
if (!target) throw new Error('Chrome 디버깅 포트에 붙지 못했다')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)))
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const waitFor = async (expr, ms = 10000) => {
  for (let t = 0; t < ms; t += 200) { if (await evaluate(expr)) return; await sleep(200) }
  throw new Error('기다렸지만 안 됐다: ' + expr)
}

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
// 같은 origin 에서 토큰을 심는다
await send('Page.navigate', { url: `${WEB}/login` })
await waitFor('document.readyState === "complete"')
await evaluate(`localStorage.setItem('erp_token', ${JSON.stringify(token)}); true`)

try {
  for (const shot of scenario.shots) {
    await send('Page.navigate', { url: WEB + shot.path })
    await waitFor('document.readyState === "complete" && !document.body.innerText.includes("불러오는 중")', 20000)
    await sleep(800)
    for (const step of shot.steps ?? []) {
      const [kind, ...rest] = step.split(':')
      if (kind === 'wait') await sleep(Number(rest[0]))
      else if (kind === 'js') await evaluate(rest.join(':'))
      else if (kind === 'pick') {
        const [label, code] = rest
        await evaluate(`document.querySelector('button[title="${label} 선택"]').click(); true`)
        await waitFor(`[...document.querySelectorAll('tr')].some(tr => tr.innerText.includes(${JSON.stringify(code)}))`)
        await evaluate(`[...document.querySelectorAll('tr')].find(tr => [...tr.cells].some(td => td.innerText.trim() === ${JSON.stringify(code)})).click(); true`)
        await sleep(600)
      } else throw new Error('모르는 step: ' + step)
    }
    const [x, y, w, h] = shot.clip ?? [0, 0, 1600, 900]
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } })
    const out = resolve(baseDir, shot.out)
    writeFileSync(out, Buffer.from(data, 'base64'))
    console.log('찍음', out)
  }
} finally {
  ws.close()
  chrome.kill()
  await sleep(500)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome 이 아직 잡고 있으면 남겨 둔다 */ }
}
