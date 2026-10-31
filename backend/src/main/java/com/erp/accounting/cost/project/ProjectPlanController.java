package com.erp.accounting.cost.project;

import com.erp.accounting.cost.project.dto.ProjectPlanDtos.ComparisonRow;
import com.erp.accounting.cost.project.dto.ProjectPlanDtos.CreateProjectPlanRequest;
import com.erp.accounting.cost.project.dto.ProjectPlanDtos.ProjectPlanLineRequest;
import com.erp.accounting.cost.project.dto.ProjectPlanDtos.ProjectPlanLineResponse;
import com.erp.accounting.cost.project.dto.ProjectPlanDtos.ProjectPlanResponse;
import com.erp.accounting.cost.project.dto.ProjectPlanDtos.StatusCell;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;

@RestController
@RequestMapping("/api/project-plans")
@RequiredArgsConstructor
public class ProjectPlanController {

    private final ProjectPlanService service;

    @GetMapping
    public List<ProjectPlanResponse> list(@RequestParam(required = false) Integer year) {
        return service.findAll(year);
    }

    /** 연도를 안 주면 모든 해의 계획 — 원본 프로젝트계획조회(E040636)는 연도 조건 없이 계획을 다 보여 준다. */
    @GetMapping("/comparison")
    public List<ComparisonRow> comparison(@RequestParam(required = false) Integer year) {
        return service.comparison(year);
    }

    /** 프로젝트계획/실적현황(E040637). 달은 YYYY-MM. */
    @GetMapping("/status")
    public List<StatusCell> status(@RequestParam List<Long> projectIds, @RequestParam String from, @RequestParam String to) {
        return service.status(projectIds, YearMonth.parse(from), YearMonth.parse(to));
    }

    @GetMapping("/{id}")
    public ProjectPlanResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<ProjectPlanResponse> create(
            @Valid @RequestBody CreateProjectPlanRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 원본 [프로젝트 계획항목 수정] 창의 저장(F8) — 2026-10-14 E040636 실측. */
    @PutMapping("/{id}")
    public ProjectPlanResponse update(@PathVariable Long id, @Valid @RequestBody CreateProjectPlanRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 항목 계획 리스트 창 — item 은 항목코드 01 ~ 04(안 주면 다). */
    @GetMapping("/{id}/lines")
    public List<ProjectPlanLineResponse> lines(@PathVariable Long id, @RequestParam(required = false) String item) {
        return service.lines(id, item);
    }

    /** 계획 입력 창 저장(F8). */
    @PostMapping("/{id}/lines")
    public ProjectPlanLineResponse addLine(@PathVariable Long id, @Valid @RequestBody ProjectPlanLineRequest req) {
        return service.addLine(id, req);
    }

    @PutMapping("/lines/{lineId}")
    public ProjectPlanLineResponse updateLine(@PathVariable Long lineId, @Valid @RequestBody ProjectPlanLineRequest req) {
        return service.updateLine(lineId, req);
    }

    @DeleteMapping("/lines/{lineId}")
    public ResponseEntity<Void> deleteLine(@PathVariable Long lineId) {
        service.deleteLine(lineId);
        return ResponseEntity.noContent().build();
    }
}
