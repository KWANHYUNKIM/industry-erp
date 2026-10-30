package com.erp.groupware.chat;

import com.erp.auth.permissionrequest.PermissionRequestEvents;
import com.erp.auth.user.User;
import com.erp.auth.user.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 권한요청 · 승인 결과를 메신저로 — 원본: 마스터는 메신저에서 [보기] 로 요청 내역을 열고(영상 1998 · 2000),
 * 승인하면 요청자와 승인자 모두 메신저로 결과를 받는다(영상 1514).
 * auth 가 groupware 를 모르므로 auth 가 낸 이벤트를 여기서 듣는다(같은 트랜잭션).
 */
@Component
@RequiredArgsConstructor
public class PermissionRequestMessenger {

    /** [보기] 가 여는 화면 — 권한승인대기현황(마스터) / 막혔던 화면(요청자). */
    public static final String REQUESTS_PAGE = "/users/permission-requests";

    private final ChatService chatService;
    private final UserService userService;

    @EventListener
    public void onRequested(PermissionRequestEvents.Requested e) {
        User requester = userService.get(e.requesterId());
        String text = "[권한요청] " + requester.getName() + "(" + requester.getUsername() + ") 님이 ("
                + e.workName() + ") 업무 권한을 요청했습니다."
                + (e.menuName() != null ? "\n메뉴 : " + e.menuName() : "")
                + (e.reason() != null ? "\n사유 : " + e.reason() : "");
        for (Long masterId : e.masterIds()) {
            chatService.notify(requester, userService.get(masterId), text, REQUESTS_PAGE);
        }
    }

    @EventListener
    public void onProcessed(PermissionRequestEvents.Processed e) {
        User approver = userService.get(e.approverId());
        User requester = userService.get(e.requesterId());
        String text = "[권한요청 " + (e.approved() ? "승인" : "반려") + "] (" + e.workName() + ") 업무 권한 요청이 "
                + (e.approved() ? "승인되었습니다. 화면을 새로고침하면 쓸 수 있습니다." : "반려되었습니다.")
                + "\n처리자 : " + approver.getName();
        // 요청자와 승인자의 1:1 방에 남긴다 — 둘 다 같은 글을 본다.
        chatService.notify(approver, requester, text, null);
    }
}
