package com.erp.groupware.schedule;

import com.erp.groupware.schedule.dto.ScheduleEventDtos.SaveScheduleCategoryRequest;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.ScheduleCategoryResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 원본 일정관리등록 [일정구분] 🔍 '일정구분검색'. */
@RestController
@RequestMapping("/api/schedule-categories")
@RequiredArgsConstructor
public class ScheduleCategoryController {

    private final ScheduleCategoryService categoryService;

    @GetMapping
    public List<ScheduleCategoryResponse> list() {
        return categoryService.list();
    }

    @GetMapping("/next-code")
    public Map<String, String> nextCode() {
        return Map.of("code", categoryService.nextCode());
    }

    @PostMapping
    public ScheduleCategoryResponse create(@Valid @RequestBody SaveScheduleCategoryRequest req) {
        return categoryService.create(req);
    }

    @PutMapping("/{id}")
    public ScheduleCategoryResponse update(@PathVariable Long id, @Valid @RequestBody SaveScheduleCategoryRequest req) {
        return categoryService.update(id, req);
    }

    @PatchMapping("/{id}/active")
    public ScheduleCategoryResponse setActive(@PathVariable Long id, @RequestParam boolean active) {
        return categoryService.setActive(id, active);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        categoryService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
