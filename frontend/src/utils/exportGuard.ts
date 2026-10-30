/**
 * 외부전송(인쇄 · Excel) 권한 문지기 — 업무권한 예외(행위)의 '외부전송' 을 화면 밖으로 나가는 길목에서 막는다.
 *
 * Excel · 인쇄는 서버를 거치지 않고 화면의 표를 긁어 만든다(utils/excel · utils/print). 그래서 서버 인터셉터가
 * 못 막는다 — 2026-10-30 대조 전에는 외부전송 '권한없음' 을 저장해도 아무 데서도 보지 않았다.
 * 원본: 권한 없는 행위는 알림 '권한이 없습니다. / 마스터에게 문의 바랍니다. / - {업무} 업무권한 ({행위})'
 * (영상 0131 '회계전표를 인쇄를 누르면 권한이 없다고 나와요').
 *
 * utils 가 features 를 모르게, 판정 함수는 AuthContext 가 끼워 넣는다. 끼우기 전(로그인 전)에는 막지 않는다.
 */
let guard: () => boolean = () => true

export function setExportGuard(fn: () => boolean) {
  guard = fn
}

/** 지금 화면에서 외부전송을 해도 되나. 안 되면 판정 함수가 알림을 띄우고 false. */
export function exportAllowed(): boolean {
  return guard()
}
