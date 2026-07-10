package com.erp.controller;

import com.erp.dto.NoticeDtos.CreateNoticeRequest;
import com.erp.dto.NoticeDtos.NoticeResponse;
import com.erp.dto.NoticeDtos.UpdateNoticeRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.NoticeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notices")
@RequiredArgsConstructor
public class NoticeController {

    private final NoticeService noticeService;

    @GetMapping
    public List<NoticeResponse> list() {
        return noticeService.findAll();
    }

    @PostMapping
    public ResponseEntity<NoticeResponse> create(
            @Valid @RequestBody CreateNoticeRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(noticeService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public NoticeResponse update(@PathVariable Long id, @Valid @RequestBody UpdateNoticeRequest req) {
        return noticeService.update(id, req);
    }

    @PostMapping("/{id}/view")
    public NoticeResponse view(@PathVariable Long id) {
        return noticeService.increaseView(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        noticeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
