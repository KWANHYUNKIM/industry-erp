/**
 * 인쇄용 HTML 에 값을 끼워 넣을 때 쓰는 이스케이프.
 *
 * <p>인쇄 창은 우리가 문자열로 조립한 HTML 을 그대로 띄운다. 거래처명·적요·품목명은
 * 사용자가 넣은 값이라 `<`, `&`, 따옴표가 들어올 수 있고, 그대로 두면 서식이 깨지거나
 * 태그로 읽힌다. 특히 <b>따옴표</b>는 `class="..."` 같은 속성 안에서 값을 밖으로 빠져나가게 한다.
 *
 * <p>print.ts 와 printDocument.ts 에 <b>같은 함수가 복사돼</b> 있었다. 지금은 똑같지만
 * 한쪽만 고치면 조용히 갈라진다(statusAggregate 를 한 곳에 모은 것과 같은 이유).
 */
const REPLACEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** null·undefined 는 빈 문자열로. 숫자 등은 문자열로 바꿔서 이스케이프한다. */
export const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => REPLACEMENTS[c])
