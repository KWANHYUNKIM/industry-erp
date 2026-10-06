package com.erp.common;

import java.time.LocalDate;
import java.util.Map;

/**
 * 전자결재 문서가 <b>최종 결재까지 끝났다</b>는 알림.
 *
 * <p>휴가신청서를 결재해도 근태(휴가)에 아무것도 남지 않아, 잔여일수가 그대로였다(35회차).
 * groupware 가 hr 을 직접 부르면 모듈 간선이 하나 늘어난다(CLAUDE.md 4.1 — arch-check 가 막는다).
 * 그래서 groupware 는 이 이벤트만 내고, 받을 쪽(hr …)이 듣는다. 둘 다 common 만 안다.
 *
 * <p>Spring 의 동기 이벤트라 결재와 같은 트랜잭션에서 돈다 — 듣는 쪽이 실패하면 결재도 되돌아간다.
 *
 * @param docNo         결재 문서번호(AP-…)
 * @param formName      양식 이름(예: 휴가신청서)
 * @param drafterUserId 기안자 사용자 id
 * @param draftDate     기안일
 * @param formData      양식 입력값(periodFrom · periodTo · reason …)
 */
public record ApprovalCompletedEvent(
        String docNo,
        String formName,
        Long drafterUserId,
        LocalDate draftDate,
        Map<String, Object> formData
) {}
