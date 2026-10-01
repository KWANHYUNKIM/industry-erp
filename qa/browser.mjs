/**
 * 헤드리스 Chrome 을 CDP 로 모는 공용 부분 — qa/shot.mjs(캡처)·qa/screen-check.mjs(화면 점검)가 같이 쓴다.
 * 의존성 없음(Node 22 의 fetch·WebSocket 만 쓴다).
 *
 *   const b = await openBrowser()      // 로그인 토큰까지 심어 둔다
 *   await b.goto('/sales/unshipped')   // 화면이 다 뜰 때까지 기다린다
 *   await b.evaluate('document.title')
 *   await b.close()
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const API = process.env.ERP_API ?? 'http://localhost:8081/api'
export const WEB = process.env.ERP_WEB ?? 'http://localhost:5180'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function login() {
  const r = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ERP_USER ?? 'admin', password: process.env.ERP_PASS ?? 'admin1234' }),
  })).json()
  const token = r.token ?? r.accessToken
  if (!token) throw new Error('로그인 실패: ' + JSON.stringify(r))
  return token
}

export async function openBrowser({ port = 9333, width = 1600, height = 900 } = {}) {
  const token = await login()
  const profile = mkdtempSync(join(tmpdir(), 'erp-cdp-'))
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })

  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch { /* 아직 안 뜸 */ }
  }
  if (!target) { chrome.kill(); throw new Error('Chrome 디버깅 포트에 붙지 못했다') }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0
  const pending = new Map()
  /** 화면에서 난 JS 예외와 실패한 API 응답. takeErrors() 로 꺼내 비운다. */
  let errors = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      errors.push('JS 예외: ' + (d.exception?.description ?? d.text ?? '').split('\n')[0].slice(0, 160))
    } else if (m.method === 'Network.responseReceived') {
      const r = m.params.response
      if (r.status >= 400 && r.url.includes('/api/')) errors.push(`API ${r.status}: ${r.url.replace(/^https?:\/\/[^/]+/, '')}`)
    }
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
  const goto = async (path, settleMs = 800) => {
    await send('Page.navigate', { url: WEB + path })
    await waitFor('document.readyState === "complete" && !document.body.innerText.includes("불러오는 중")', 20000)
    await sleep(settleMs)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  // 같은 origin 에서 토큰을 심는다
  await send('Page.navigate', { url: `${WEB}/login` })
  await waitFor('document.readyState === "complete"')
  await evaluate(`localStorage.setItem('erp_token', ${JSON.stringify(token)}); true`)

  const close = async () => {
    ws.close()
    chrome.kill()
    await sleep(500)
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome 이 아직 잡고 있으면 남겨 둔다 */ }
  }
  const takeErrors = () => { const e = errors; errors = []; return e }
  return { send, evaluate, waitFor, goto, close, token, takeErrors }
}
