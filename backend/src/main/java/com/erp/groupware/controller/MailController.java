package com.erp.groupware.controller;

import com.erp.groupware.dto.MailDtos.AssignMailRequest;
import com.erp.groupware.dto.MailDtos.HandleMailRequest;
import com.erp.groupware.dto.MailDtos.MailResponse;
import com.erp.groupware.dto.MailDtos.ReceiveSharedMailRequest;
import com.erp.groupware.dto.MailDtos.SaveDraftRequest;
import com.erp.groupware.dto.MailDtos.SendMailRequest;
import com.erp.groupware.dto.MailDtos.SharedMailBox;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.MailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.MailDtos;

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

    // ── 임시보관함(초안) ──
    @GetMapping("/drafts")
    public List<MailResponse> drafts(@AuthenticationPrincipal UserPrincipal principal) {
        return service.drafts(principal.getUsername());
    }

    @PostMapping("/drafts")
    public ResponseEntity<MailResponse> saveDraft(@RequestBody SaveDraftRequest req,
                                                  @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.saveDraft(req, principal.getUsername()));
    }

    @PutMapping("/drafts/{id}")
    public MailResponse updateDraft(@PathVariable Long id, @RequestBody SaveDraftRequest req,
                                    @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateDraft(id, req, principal.getUsername());
    }

    @PostMapping("/drafts/{id}/send")
    public MailResponse sendDraft(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.sendDraft(id, principal.getUsername());
    }

    // ── 지운함(소프트삭제) ──
    @GetMapping("/trash")
    public List<MailResponse> trash(@AuthenticationPrincipal UserPrincipal principal) {
        return service.trash(principal.getUsername());
    }

    /** 지운함으로 이동(소프트삭제) */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> moveToTrash(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        service.moveToTrash(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/restore")
    public MailResponse restore(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.restore(id, principal.getUsername());
    }

    /** 영구삭제 */
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<Void> deletePermanent(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        service.deletePermanent(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    // ── 스팸 메일함 ──
    @GetMapping("/spam")
    public List<MailResponse> spam(@AuthenticationPrincipal UserPrincipal principal) {
        return service.spam(principal.getUsername());
    }

    /** 스팸으로 지정 */
    @PostMapping("/{id}/spam")
    public MailResponse markSpam(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.markSpam(id, true, principal.getUsername());
    }

    /** 스팸 해제 */
    @PostMapping("/{id}/not-spam")
    public MailResponse unmarkSpam(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.markSpam(id, false, principal.getUsername());
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
