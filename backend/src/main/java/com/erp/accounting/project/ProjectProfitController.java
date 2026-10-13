package com.erp.accounting.project;

import com.erp.accounting.project.dto.ProjectProfitDtos.ProjectProfitSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 프로젝트별 손익 (매출=판매전표 공급가액, 원가=구매전표, 비용=비용전표).
 *
 * <p>주소는 /api/projects/profit 그대로지만 accounting 모듈에 둔다. 예전엔 inventory 의
 * ProjectController 에 있어서 <b>기반층 inventory 가 accounting 을 참조</b>했다(CLAUDE.md 4.1 위반 —
 * accounting → inventory 와 맞물려 순환). 집계가 판매·구매·비용 전표를 읽으니 accounting 소관이다.
 */
@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectProfitController {

    private final ProjectProfitService projectProfitService;

    @GetMapping("/profit")
    public ProjectProfitSummary profit(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return projectProfitService.profit(from, to);
    }
}
