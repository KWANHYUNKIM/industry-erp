// 기획자용 — 이 세션(과 하위 에이전트)이 쓴 토큰과 지금 메모리를 한 번에 본다. 의존성 없음.
//   node qa/usage-report.mjs            가장 최근 세션
//   node qa/usage-report.mjs <세션id>   그 세션
// 토큰은 ~/.claude/projects/<프로젝트>/<세션>.jsonl 과 <세션>/subagents/*.jsonl 의 message.usage 를 더한다.
// 같은 메시지 id 가 여러 줄(스트리밍 조각)로 남으므로 id 마다 마지막 usage 하나만 센다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

const dir = path.join(os.homedir(), '.claude', 'projects', process.cwd().replace(/[:\\/]/g, '-'))
if (!fs.existsSync(dir)) { console.error('세션 폴더 없음: ' + dir); process.exit(1) }

const sessions = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
  .map((f) => ({ id: f.slice(0, -6), t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)
const sid = process.argv[2] ?? sessions[0]?.id
if (!sid) { console.error('세션 없음'); process.exit(1) }

function sum(file) {
  const byId = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue
    let j
    try { j = JSON.parse(line) } catch { continue }
    const m = j.message
    if (!m?.usage) continue
    byId.set(m.id ?? j.uuid, { model: m.model ?? '?', u: m.usage })
  }
  const t = { model: '', calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
  for (const { model, u } of byId.values()) {
    t.model = model; t.calls++
    t.input += u.input_tokens ?? 0
    t.cacheWrite += u.cache_creation_input_tokens ?? 0
    t.cacheRead += u.cache_read_input_tokens ?? 0
    t.output += u.output_tokens ?? 0
  }
  return t
}

const rows = [['진행자', sum(path.join(dir, sid + '.jsonl'))]]
const sub = path.join(dir, sid, 'subagents')
if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub).filter((x) => x.endsWith('.jsonl'))) rows.push([f.slice(0, -6), sum(path.join(sub, f))])

const k = (n) => (n / 1000).toFixed(1) + 'k'
console.log(`세션 ${sid}`)
console.log('누구'.padEnd(26) + '모델'.padEnd(20) + '호출'.padStart(6) + '입력'.padStart(9) + '캐시쓰기'.padStart(10) + '캐시읽기'.padStart(10) + '출력'.padStart(9))
const tot = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
for (const [who, t] of rows) {
  for (const key of Object.keys(tot)) tot[key] += t[key]
  console.log(who.padEnd(26) + t.model.padEnd(20) + String(t.calls).padStart(6) + k(t.input).padStart(9) + k(t.cacheWrite).padStart(10) + k(t.cacheRead).padStart(10) + k(t.output).padStart(9))
}
console.log('합계'.padEnd(46) + String(tot.calls).padStart(6) + k(tot.input).padStart(9) + k(tot.cacheWrite).padStart(10) + k(tot.cacheRead).padStart(10) + k(tot.output).padStart(9))

try {
  const out = execSync('powershell -NoProfile -Command "$o=Get-CimInstance Win32_OperatingSystem; \'{0} {1}\' -f $o.TotalVisibleMemorySize,$o.FreePhysicalMemory"').toString().trim().split(/\s+/).map(Number)
  console.log(`메모리 ${Math.round(100 - (out[1] * 100) / out[0])}% (남은 ${(out[1] / 1048576).toFixed(1)}GB / ${(out[0] / 1048576).toFixed(1)}GB)`)
} catch { console.log(`메모리 ${Math.round(100 - (os.freemem() * 100) / os.totalmem())}%`) }
