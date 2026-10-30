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
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const API = process.env.ERP_API ?? 'http://localhost:8081/api'
export const WEB = process.env.ERP_WEB ?? 'http://localhost:5180'
const CHROME = process.env.CHROME ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:/Program Files/Google/Chrome/Application/chrome.exe')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function login(username = process.env.ERP_USER ?? 'admin', password = process.env.ERP_PASS ?? 'admin1234') {
  const r = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyCode: process.env.ERP_COMPANY ?? '0001', username, password }),
  })).json()
  const token = r.token ?? r.accessToken
  if (!token) throw new Error('로그인 실패: ' + JSON.stringify(r))
  return token
}

/**
 * port 는 기본 0 — Chrome 이 빈 포트를 고르고 프로필의 DevToolsActivePort 에 적는다. 그 프로필에서 읽으므로
 * <b>내가 띄운 Chrome 에만</b> 붙는다. 예전엔 스크립트마다 포트가 고정(9333 · 9335 …)이라, 작업자 둘이 같은 검사를
 * 동시에 돌리면 두 번째 Chrome 은 포트를 못 잡고, 두 번째 스크립트는 같은 포트의 <b>남의 Chrome</b> 에 붙어 그 화면을 몰았다.
 */
/**
 * 지난 실행이 남긴 erp-cdp-* 프로필 중 1시간 넘은 것을 지운다(지금 도는 다른 작업자의 프로필은 건드리지 않게 — 시험 하나가 1시간을 넘지 않는다).
 * 6시간이던 것을 줄였다: 10-30 오후 작업자 셋이 돌자 6시간 안에 49벌이 다시 쌓여 C: 가 2.1GB 까지 찼다.
 * 잡혀 있는 폴더는 건너뛴다.
 */
function sweepStaleProfiles() {
  const cut = Date.now() - 3600_000
  let names = []
  try { names = readdirSync(tmpdir()).filter((n) => n.startsWith('erp-cdp-')) } catch { return }
  for (const n of names) {
    const dir = join(tmpdir(), n)
    try { if (statSync(dir).mtimeMs < cut) rmSync(dir, { recursive: true, force: true }) } catch { /* 잡혀 있다 */ }
  }
}

export async function openBrowser({ port = Number(process.env.CDP_PORT ?? 0), width = 1600, height = 900 } = {}) {
  const token = await login()
  sweepStaleProfiles()
  const profile = mkdtempSync(join(tmpdir(), 'erp-cdp-'))
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  // 스크립트가 어떻게 끝나든(예외 · Ctrl-C · 작업자가 죽음) Chrome 을 같이 끈다 — 안 끄면 부모 없는 Chrome 이 남아
  // 메모리를 쥔다(2026-10-13 남은 것 19벌이 스왑 2.4GB 를 쥐고 있었다).
  const killChrome = () => { try { chrome.kill('SIGKILL') } catch { /* 이미 꺼짐 */ } }
  // 프로필 폴더(≈55MB)도 같이 지운다 — 시험이 실패해 close() 를 못 부르고 끝나면 폴더가 남아, 2026-10-30 87벌(4.8GB)이 C: 를
  // 채워 Docker · DB 가 멈췄다. 'exit' 안에서는 동기만 되니 Chrome 을 죽이고 곧바로 지워 본다(잡혀 있으면 아래 청소가 다음에 지운다).
  process.once('exit', () => { killChrome(); try { rmSync(profile, { recursive: true, force: true }) } catch { /* 다음 실행이 지운다 */ } })
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { killChrome(); process.exit(130) })

  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try {
      if (!port) port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0])
      if (port) target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
    } catch { /* 아직 안 뜸 */ }
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
    // 윈도에서는 Chrome 이 꺼진 뒤에도 잠깐 파일을 잡고 있다 — 몇 번 다시 지워 본다.
    for (let i = 0; i < 10; i++) {
      await sleep(500)
      try { rmSync(profile, { recursive: true, force: true }); break } catch { /* 아직 잡혀 있다 */ }
    }
  }
  const takeErrors = () => { const e = errors; errors = []; return e }
  /** 다른 계정으로 갈아탄다(결재자처럼 두 사람이 필요한 시험). 다음 goto 부터 그 계정이다. */
  const loginAs = async (username, password) => {
    const t = await login(username, password)
    await evaluate(`localStorage.setItem('erp_token', ${JSON.stringify(t)}); true`)
    return t
  }
  return { send, evaluate, waitFor, goto, close, token, takeErrors, loginAs }
}
