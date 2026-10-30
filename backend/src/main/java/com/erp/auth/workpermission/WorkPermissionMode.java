package com.erp.auth.workpermission;

/**
 * 업무 하나에 대한 권한(원본 개별권한설정 창의 네 갈래).
 * <ul>
 *   <li>{@link #ALLOW} 권한있음 — 진입 · 조회 · 입력 · 수정 · 삭제 · 외부전송 모두</li>
 *   <li>{@link #DENY} 권한없음 — 진입부터 막힌다(자물쇠 화면)</li>
 *   <li>{@link #EXC_ACTION} 예외(행위) — 조회는 되고 입력/수정/삭제/외부전송을 칸별로</li>
 *   <li>{@link #EXC_MENU} 예외(메뉴) — 업무 안의 하위 메뉴마다 진입 여부</li>
 * </ul>
 * 예외(행위)와 예외(메뉴)는 같이 걸 수 있다 — 행위 칸 하나라도 꺼져 있으면 EXC_ACTION 으로 적고 메뉴 규칙도 그대로 둔다.
 */
public enum WorkPermissionMode {
    ALLOW, DENY, EXC_ACTION, EXC_MENU
}
