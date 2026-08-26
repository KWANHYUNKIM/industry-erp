/**
 * 금액을 한글로 — 거래명세서·견적서·발주서 하단의 "일금 …원정" 자리.
 *
 * <p>따로 파일로 둔 이유는 <b>테스트하려고</b>다. printDocument.ts 는 api/client 를
 * 확장자 없이 import 해서 Node 내장 러너가 못 읽는다(번들러는 읽는다).
 * 이 계산만은 못 박아야 해서 의존성 없는 파일로 뺐다. printDocument 가 다시 내보내므로
 * 기존 import 는 그대로 쓰면 된다.
 */

const DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
const SMALL_UNITS = ['', '십', '백', '천']
const BIG_UNITS = ['', '만', '억', '조', '경']

/**
 * 금액을 한글로 (예: 1,230,000 → "일백이십삼만"). 거래명세서·견적서 하단의 "일금 …원정" 자리.
 *
 * 일상 표기(십일)와 달리 <b>자릿수의 1 도 적는다</b>(일십일) — 이 칸은 금액 위조를 막으려고 있는
 * 자리라, 앞에 글자를 덧붙여 금액을 키우지 못하게 하는 수표·어음 표기법을 따른다.
 */
export function amountToKorean(amount: number): string {
  // 숫자가 아니면 빈칸이 되어선 안 된다. 이 칸은 금액 위조를 막으려고 있는 자리라,
  // 비어 있으면 뒤에 아무 글자나 채워 넣을 수 있다 — 없느니만 못하다.
  // (전표 금액이 안 들어오면 NaN 이 그대로 여기까지 온다.)
  if (!Number.isFinite(amount)) return '(금액 없음)'

  const n = Math.floor(Math.abs(amount))
  if (n === 0) return '영'

  const groups: string[] = []
  let rest = n
  let big = 0
  while (rest > 0 && big < BIG_UNITS.length) {
    const chunk = rest % 10000
    if (chunk > 0) {
      let s = ''
      for (let i = 0; i < 4; i++) {
        const d = Math.floor(chunk / 10 ** i) % 10
        if (d === 0) continue
        s = DIGITS[d] + SMALL_UNITS[i] + s
      }
      groups.unshift(s + BIG_UNITS[big])
    }
    rest = Math.floor(rest / 10000)
    big++
  }
  // 경(10^16)을 넘는 자리는 BIG_UNITS 에 이름이 없어 표현할 수 없다.
  // 그냥 두면 윗자리가 조용히 잘려서 실제보다 작은 금액이 찍힌다 — 그게 제일 나쁘다.
  // (JS 정수 정밀도도 2^53 에서 끝나므로 이 영역은 어차피 못 믿는다.)
  if (rest > 0) return '(금액 표기 범위 초과)'

  return (amount < 0 ? '마이너스 ' : '') + groups.join('')
}
