package com.erp.groupware.workpost;

import com.erp.groupware.board.PostBoard;
import com.erp.groupware.workpost.dto.WorkPostDtos.LabelResponse;
import com.erp.groupware.workpost.dto.WorkPostDtos.SaveLabelRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 원본 공지사항 · WORK [라벨] › + '라벨조회'. */
@RestController
@RequestMapping("/api/work-post-labels")
@RequiredArgsConstructor
public class WorkPostLabelController {

    private final WorkPostLabelService labelService;

    @GetMapping
    public List<LabelResponse> list(@RequestParam(required = false, defaultValue = "WORK") PostBoard board) {
        return labelService.list(board);
    }

    @PostMapping
    public LabelResponse create(@Valid @RequestBody SaveLabelRequest req) {
        return labelService.create(req);
    }

    @PutMapping("/{id}")
    public LabelResponse update(@PathVariable Long id, @Valid @RequestBody SaveLabelRequest req) {
        return labelService.update(id, req);
    }

    /** [사용중단/재사용 ▲] 사용중단 · 재사용. */
    @PatchMapping("/{id}/active")
    public LabelResponse setActive(@PathVariable Long id, @RequestParam boolean active) {
        return labelService.setActive(id, active);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        labelService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
