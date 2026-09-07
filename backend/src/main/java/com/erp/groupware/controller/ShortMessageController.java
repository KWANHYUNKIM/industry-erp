package com.erp.groupware.controller;

import com.erp.groupware.dto.ShortMessageDtos.DeleteShortMessagesRequest;
import com.erp.groupware.dto.ShortMessageDtos.SendShortMessageRequest;
import com.erp.groupware.dto.ShortMessageDtos.ShortMessageResponse;
import com.erp.groupware.dto.ShortMessageDtos.UnreadCount;
import com.erp.groupware.service.ShortMessageService;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 쪽지 — 사용자 간 단문 + 시스템 자동알림(전자결재 완료 등). */
@RestController
@RequestMapping("/api/short-messages")
@RequiredArgsConstructor
public class ShortMessageController {

    private final ShortMessageService service;

    /** box: received(기본)·unread·read·archived·sent */
    @GetMapping
    public List<ShortMessageResponse> list(
            @RequestParam(required = false) String box,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long senderId,
            @RequestParam(required = false) Long recipientId,
            @RequestParam(required = false) Long partnerId,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal UserPrincipal principal) {
        return service.search(box, from, to, senderId, recipientId, partnerId, keyword, principal.getUsername());
    }

    @GetMapping("/unread-count")
    public UnreadCount unreadCount(@AuthenticationPrincipal UserPrincipal principal) {
        return new UnreadCount(service.unreadCount(principal.getUsername()));
    }

    @PostMapping
    public ResponseEntity<List<ShortMessageResponse>> send(@Valid @RequestBody SendShortMessageRequest req,
                                                           @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.send(req, principal.getUsername()));
    }

    @PostMapping("/{id}/read")
    public ShortMessageResponse markRead(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.markRead(id, principal.getUsername());
    }

    @PostMapping("/{id}/archive")
    public ShortMessageResponse archive(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.archive(id, true, principal.getUsername());
    }

    @PostMapping("/{id}/unarchive")
    public ShortMessageResponse unarchive(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.archive(id, false, principal.getUsername());
    }

    /** 선택삭제 */
    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@Valid @RequestBody DeleteShortMessagesRequest req,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        service.delete(req.ids(), principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
