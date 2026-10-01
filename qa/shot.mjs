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
 *
 * 브라우저 확장으로 찍는 캡처가 창 상태(최소화·뒤로 감)에 따라 멈춰서 따로 만들었다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openBrowser, sleep } from './browser.mjs'

const scenarioPath = process.argv[2]
if (!scenarioPath) { console.error('사용법: node qa/shot.mjs <시나리오.json>'); process.exit(2) }
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))
const baseDir = dirname(resolve(scenarioPath))

const b = await openBrowser()
try {
  for (const shot of scenario.shots) {
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
      } else throw new Error('모르는 step: ' + step)
    }
    const [x, y, w, h] = shot.clip ?? [0, 0, 1600, 900]
    const { data } = await b.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } })
    const out = resolve(baseDir, shot.out)
    writeFileSync(out, Buffer.from(data, 'base64'))
    console.log('찍음', out)
  }
} finally {
  await b.close()
}
