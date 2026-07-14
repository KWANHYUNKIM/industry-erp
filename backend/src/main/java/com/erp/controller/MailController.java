package com.erp.controller;

import com.erp.dto.MailDtos.AssignMailRequest;
import com.erp.dto.MailDtos.HandleMailRequest;
import com.erp.dto.MailDtos.MailResponse;
import com.erp.dto.MailDtos.ReceiveSharedMailRequest;
import com.erp.dto.MailDtos.SendMailRequest;
import com.erp.dto.MailDtos.SharedMailBox;
import com.erp.security.UserPrincipal;
import com.erp.service.MailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 그룹웨어 공용메일 — 사내메일(수신함·발신함)과 공용 메일함(담당자 배정·처리). */
@RestController
@RequestMapping("/api/mails")
@RequiredArgsConstructor
public class MailController {

    private final MailService service;

    @GetMapping("/inbox")
    public List<MailResponse> inbox(@AuthenticationPrincipal UserPrincipal principal) {
        return service.inbox(principal.getUsername());
    }

    @GetMapping("/sent")
    public List<MailResponse> sent(@AuthenticationPrincipal UserPrincipal principal) {
        return service.sent(principal.getUsername());
    }

    @GetMapping("/shared")
    public SharedMailBox shared() {
        return service.shared();
    }

    /** 사내메일 발송 */
    @PostMapping
    public ResponseEntity<MailResponse> send(
            @Valid @RequestBody SendMailRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.send(req, principal.getUsername()));
    }

    /** 공용메일 수신 등록 (외부 메일 서버 연동 자리) */
    @PostMapping("/shared")
    public ResponseEntity<MailResponse> receiveShared(@Valid @RequestBody ReceiveSharedMailRequest req) {
        return ResponseEntity.ok(service.receiveShared(req));
    }

    @PostMapping("/{id}/read")
    public MailResponse markRead(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.markRead(id, principal.getUsername());
    }

    /** 공용메일 담당자 배정 */
    @PostMapping("/{id}/assign")
    public MailResponse assign(@PathVariable Long id, @Valid @RequestBody AssignMailRequest req) {
        return service.assign(id, req);
    }

    /** 공용메일 처리 완료 */
    @PostMapping("/{id}/handle")
    public MailResponse handle(@PathVariable Long id,
                               @RequestBody(required = false) HandleMailRequest req,
                               @AuthenticationPrincipal UserPrincipal principal) {
        return service.handle(id, req, principal.getUsername());
    }
}
