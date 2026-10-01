#!/usr/bin/env node
/**
 * QA 기록용 화면 캡처 — 헤드리스 Chrome 을 CDP 로 몰아 로그인한 화면을 PNG 로 남긴다.
 *
 *   node qa/shot.mjs <시나리오.json>
 *
 * 시나리오: { "shots": [ { "path": "/sales/unshipped", "out": "a.png",
 *                          "steps": ["pick:거래처:QA-SAME-B"], "clip": [x, y, w, h] } ] }
 *   step 종류 —  pick:<라벨>:<코드>  조건 칸의 코드도움 팝업을 열어 그 코드 행을 고른다
 *               js:<식>             페이지에서 그대로 평가한다
 *               wait:<ms>
 *               click:<글자>        글자(또는 title)가 그것으로 시작하는 첫 버튼을 누른다
 *               pickrow:<코드|@키>  열린 코드도움 팝업에서 칸 하나가 그 코드인 행을 고른다
 *               set:<선택자>[#n]|<값>  입력칸에 값을 넣는다(React 가 알아채도록 input 이벤트까지). #n 은 n 번째(0부터)
 *               choose:<선택자>[#n]|<보이는 글자>  드롭다운에서 그 글자의 항목을 고른다(id 는 환경마다 달라서)
 *               expect:<식>         참이 아니면 실패로 끝낸다 — 화면을 사람처럼 써 보는 시험에 쓴다
 *               apidel:<목록주소>|<번호정규식>|<번호필드>  화면에 뜬 전표번호를 목록에서 찾아 API 로 지운다
 *                                   — 화면 시험이 전표를 쌓지 않게 끝에 둔다(예: apidel:/sales|SO-[0-9]{8}-[0-9]{4}|docNo)
 *                                   번호정규식 자리에 @키 를 주면 sessionStorage[키] 의 번호를 쓴다(화면을 옮겨 다니는 시험)
 *
 * out 을 빼면 캡처 없이 단계만 돈다(qa/flows/*.json — 화면 회귀 시험).
 *
 * 실행 중 난 JS 예외·실패한 API 응답(4xx/5xx)은 찍어 주고, 있으면 실패로 끝낸다.
 *
 * 브라우저 확장으로 찍는 캡처가 창 상태(최소화·뒤로 감)에 따라 멈춰서 따로 만들었다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { API, openBrowser, sleep } from './browser.mjs'

const scenarioPath = process.argv[2]
if (!scenarioPath) { console.error('사용법: node qa/shot.mjs <시나리오.json>'); process.exit(2) }
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))
const baseDir = dirname(resolve(scenarioPath))

const b = await openBrowser({ port: Number(process.env.CDP_PORT ?? 9335) })
let failed = false
try {
  for (const shot of scenario.shots) {
    if (shot.name) console.log('■', shot.name)
    await b.goto(shot.path)
    for (const step of shot.steps ?? []) {
      const [kind, ...rest] = step.split(':')
      if (kind === 'wait') await sleep(Number(rest[0]))
      else if (kind === 'js') await b.evaluate(rest.join(':'))
      else if (kind === 'pick') {
        const [label, code] = rest
        await b.evaluate(`document.querySelector('button[title="${label} 선택"]').click(); true`)
        await b.waitFor(`[...document.querySelectorAll('tr')].some(tr => tr.innerText.includes(${JSON.stringify(code)}))`)
        await b.evaluate(`[...document.querySelectorAll('tr')].find(tr => [...tr.cells].some(td => td.innerText.trim() === ${JSON.stringify(code)})).click(); true`)
        await sleep(600)
      } else if (kind === 'click') {
        const label = rest.join(':')
        const ok = await b.evaluate(`(() => { const t = ${JSON.stringify(label)};
          const el = [...document.querySelectorAll('button')].find((x) => !x.disabled && ((x.textContent || '').trim().startsWith(t) || (x.title || '').startsWith(t)));
          if (el) el.click(); return !!el })()`)
        if (!ok) throw new Error('누를 버튼이 없다: ' + label)
        await sleep(500)
      } else if (kind === 'pickrow') {
        // @키 면 sessionStorage 에 담아 둔 코드(앞 화면에서 만든 전표번호 등)
        const raw = rest.join(':')
        const code = raw.startsWith('@') ? await b.evaluate(`sessionStorage.getItem(${JSON.stringify(raw.slice(1))})`) : raw
        await b.waitFor(`[...document.querySelectorAll('tr')].some(tr => [...tr.cells].some(td => td.innerText.trim() === ${JSON.stringify(code)}))`)
        await b.evaluate(`[...document.querySelectorAll('tr')].find(tr => [...tr.cells].some(td => td.innerText.trim() === ${JSON.stringify(code)})).click(); true`)
        await sleep(500)
      } else if (kind === 'set') {
        const [selN, ...v] = rest.join(':').split('|')
        const [sel, nth] = selN.split('#')
        const ok = await b.evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${Number(nth ?? 0)}]; if (!el) return false;
          const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v.join('|'))});
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
        if (!ok) throw new Error('입력칸이 없다: ' + sel)
        await sleep(200)
      } else if (kind === 'choose') {
        const [selN, ...v] = rest.join(':').split('|')
        const [sel, nth] = selN.split('#')
        const ok = await b.evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${Number(nth ?? 0)}]; if (!el) return false;
          const o = [...el.options].find((x) => x.text.trim() === ${JSON.stringify(v.join('|'))}); if (!o) return false;
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, o.value);
          el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
        if (!ok) throw new Error('고를 항목이 없다: ' + step)
        await sleep(200)
      } else if (kind === 'expect') {
        const expr = rest.join(':')
        let okv = false
        for (let t = 0; t < 5000 && !okv; t += 250) { okv = await b.evaluate(`!!(${expr})`); if (!okv) await sleep(250) }
        if (!okv) { failed = true; console.log('  ❌ 기대와 다름:', expr) } else console.log('  ✅', expr)
      } else if (kind === 'apidel') {
        const [list, re, field] = rest.join(':').split('|')
        const no = re.startsWith('@')
          ? await b.evaluate(`sessionStorage.getItem(${JSON.stringify(re.slice(1))})`)
          : (await b.evaluate('document.body.innerText')).match(new RegExp(re))?.[0]
        if (!no) { failed = true; console.log('  ❌ 지울 번호를 화면에서 못 찾음:', re); continue }
        const H = { Authorization: `Bearer ${b.token}` }
        const doc = (await (await fetch(API + list, { headers: H })).json()).find((d) => d[field] === no)
        const r = doc ? await fetch(`${API}${list}/${doc.id}`, { method: 'DELETE', headers: H }) : null
        console.log(r?.ok ? `  🧹 ${no} 지움` : `  ⚠ ${no} 못 지움`)
      } else throw new Error('모르는 step: ' + step)
    }
    if (shot.out) {
      const [x, y, w, h] = shot.clip ?? [0, 0, 1600, 900]
      const { data } = await b.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } })
      const out = resolve(baseDir, shot.out)
      writeFileSync(out, Buffer.from(data, 'base64'))
      console.log('찍음', out)
    }
    for (const e of b.takeErrors()) { failed = true; console.log('  ❌', e) }
  }
} finally {
  await b.close()
}
if (failed) process.exit(1)
