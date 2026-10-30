package com.erp.common;

import org.springframework.http.HttpStatus;

/**
 * 업무권한이 없어 막힌 요청(403). 응답 본문에 {@code permission} 으로 업무 · 권한종류 · 행위를 실어
 * 화면이 자물쇠 화면 · 행위 거부 알림을 만들 수 있게 한다.
 *
 * <p>메시지는 원본 문구 그대로:
 * <ul>
 *   <li>조회(진입) — {@code (판매) 업무 권한이 없습니다.}</li>
 *   <li>행위 — {@code 권한이 없습니다.\n마스터에게 문의 바랍니다.\n- 판매 업무권한 (삭제)}</li>
 * </ul>
 */
public class PermissionDeniedException extends ApiException {

    public record Detail(String work, String workName, String kind, String action, String menu) {}

    private final Detail detail;

    public PermissionDeniedException(String work, String workName, String action, String menu) {
        super(HttpStatus.FORBIDDEN, messageOf(workName, action));
        this.detail = new Detail(work, workName, "업무권한", action, menu);
    }

    public Detail getDetail() {
        return detail;
    }

    static String messageOf(String workName, String action) {
        if ("조회".equals(action)) return "(" + workName + ") 업무 권한이 없습니다.";
        return "권한이 없습니다.\n마스터에게 문의 바랍니다.\n- " + workName + " 업무권한 (" + action + ")";
    }
}
