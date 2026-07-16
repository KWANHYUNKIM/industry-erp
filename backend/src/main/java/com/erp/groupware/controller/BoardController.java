package com.erp.groupware.controller;

import com.erp.groupware.dto.BoardDtos.CreatePostRequest;
import com.erp.groupware.dto.BoardDtos.PostDetail;
import com.erp.groupware.dto.BoardDtos.PostSummary;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.BoardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.BoardDtos;

@RestController
@RequestMapping("/api/board")
@RequiredArgsConstructor
public class BoardController {

    private final BoardService boardService;

    @GetMapping
    public List<PostSummary> list() {
        return boardService.findAll();
    }

    @GetMapping("/{id}")
    public PostDetail read(@PathVariable Long id) {
        return boardService.read(id);
    }

    /** 글 작성 — 인증 사용자면 누구나 가능. */
    @PostMapping
    public ResponseEntity<PostDetail> create(
            @Valid @RequestBody CreatePostRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(boardService.create(req, principal.getUsername()));
    }

    /** 삭제 — 작성자 본인 또는 ADMIN/MANAGER. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        boolean isManager = principal.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(a -> a.equals("ROLE_ADMIN") || a.equals("ROLE_MANAGER"));
        boardService.delete(id, principal.getUsername(), isManager);
        return ResponseEntity.noContent().build();
    }
}
