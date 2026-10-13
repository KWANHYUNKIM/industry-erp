package com.erp.groupware.schedule;

import com.erp.groupware.schedule.dto.ScheduleEventDtos.SaveScheduleLabelRequest;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.ScheduleLabelResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 원본 일정관리등록 [라벨] 🔍 '라벨검색'. */
@RestController
@RequestMapping("/api/schedule-labels")
@RequiredArgsConstructor
public class ScheduleLabelController {

    private final ScheduleLabelService labelService;

    @GetMapping
    public List<ScheduleLabelResponse> list() {
        return labelService.list();
    }

    @PostMapping
    public ScheduleLabelResponse create(@Valid @RequestBody SaveScheduleLabelRequest req) {
        return labelService.create(req);
    }

    @PutMapping("/{id}")
    public ScheduleLabelResponse update(@PathVariable Long id, @Valid @RequestBody SaveScheduleLabelRequest req) {
        return labelService.update(id, req);
    }

    @PatchMapping("/{id}/active")
    public ScheduleLabelResponse setActive(@PathVariable Long id, @RequestParam boolean active) {
        return labelService.setActive(id, active);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        labelService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
