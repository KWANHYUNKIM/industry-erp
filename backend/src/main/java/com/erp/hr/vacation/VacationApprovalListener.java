package com.erp.hr.vacation;

import com.erp.common.ApprovalCompletedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 전자결재의 휴가신청서가 최종 결재되면 근태(휴가)로 남긴다(35회차).
 * groupware 를 참조하지 않으려고 common 의 이벤트만 듣는다 — 모듈 간선을 늘리지 않는다.
 */
@Component
@RequiredArgsConstructor
public class VacationApprovalListener {

    private final HrService hrService;

    @EventListener
    public void on(ApprovalCompletedEvent e) {
        // '국내출장신청서_타인기안' 같은 변형과 섞이지 않게 이름이 휴가신청서로 시작하는 양식만.
        if (e.formName() == null || !e.formName().startsWith("휴가신청서") || e.formData() == null) return;
        hrService.registerApprovedVacation(e.docNo(), e.drafterUserId(),
                e.formData().get("periodFrom"), e.formData().get("periodTo"), e.formData().get("reason"));
    }
}
