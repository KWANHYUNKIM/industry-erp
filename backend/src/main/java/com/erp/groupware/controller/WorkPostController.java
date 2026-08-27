package com.erp.groupware.controller;

import com.erp.groupware.domain.enums.PostBoard;
import com.erp.groupware.dto.WorkPostDtos.CreateWorkPostRequest;
import com.erp.groupware.dto.WorkPostDtos.UpdateWorkPostStatusRequest;
import com.erp.groupware.dto.WorkPostDtos.WorkPostResponse;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.WorkPostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.WorkPostDtos;

@RestController
@RequestMapping("/api/work-posts")
@RequiredArgsConstructor
public class WorkPostController {

    private final WorkPostService workPostService;

    /** board 를 안 주면 WORK 게시판. 공지사항은 board=NOTICE. */
    @GetMapping
    public List<WorkPostResponse> list(@RequestParam(required = false) PostBoard board) {
        return workPostService.findAll(board);
    }

    @PostMapping
    public ResponseEntity<WorkPostResponse> create(
            @Valid @RequestBody CreateWorkPostRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        // work_posts.writer 는 users(username) 을 참조하는 FK 다(V96).
        // 여기서 표시 이름(principal.getName())을 넘기고 있어서 **글을 쓸 때마다 FK 위반으로 500** 이 났다.
        return ResponseEntity.ok(workPostService.create(req, principal.getUsername()));
    }

    /** 게시글 고치기 — 원본 펼친 글의 [수정]. */
    @PutMapping("/{id}")
    public WorkPostDtos.WorkPostResponse update(
            @PathVariable Long id,
            @Valid @RequestBody WorkPostDtos.UpdateWorkPostRequest req) {
        return workPostService.update(id, req);
    }

    @PatchMapping("/{id}/status")
    public WorkPostResponse updateStatus(@PathVariable Long id, @RequestBody(required = false) UpdateWorkPostStatusRequest req) {
        return workPostService.updateStatus(id, req != null ? req : new UpdateWorkPostStatusRequest(null));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        workPostService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
