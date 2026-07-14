package com.erp.controller;

import com.erp.dto.WorkspaceDtos.NotificationResponse;
import com.erp.dto.WorkspaceDtos.NoteRequest;
import com.erp.dto.WorkspaceDtos.NoteResponse;
import com.erp.dto.WorkspaceDtos.SearchResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 우측 앱바 위젯 — 통합검색 · 알림 · E Note(개인 메모) */
@RestController
@RequestMapping("/api/workspace")
@RequiredArgsConstructor
public class WorkspaceController {

    private final WorkspaceService service;

    /** 품목·거래처·판매/구매 전표·수주를 한 번에 검색 */
    @GetMapping("/search")
    public SearchResponse search(@RequestParam String q) {
        return service.search(q);
    }

    /** 내가 지금 손봐야 할 일 (결재 대기·안전재고 미달·미출고·계약 만료임박) */
    @GetMapping("/notifications")
    public NotificationResponse notifications(@AuthenticationPrincipal UserPrincipal principal) {
        return service.notifications(principal.getUsername());
    }

    @GetMapping("/notes")
    public List<NoteResponse> notes(@AuthenticationPrincipal UserPrincipal principal) {
        return service.notes(principal.getUsername());
    }

    @PostMapping("/notes")
    public NoteResponse createNote(@Valid @RequestBody NoteRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.createNote(req, principal.getUsername());
    }

    @PutMapping("/notes/{id}")
    public NoteResponse updateNote(@PathVariable Long id, @Valid @RequestBody NoteRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateNote(id, req, principal.getUsername());
    }

    @DeleteMapping("/notes/{id}")
    public ResponseEntity<Void> deleteNote(@PathVariable Long id,
                                           @AuthenticationPrincipal UserPrincipal principal) {
        service.deleteNote(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
