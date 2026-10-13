package com.erp.production.materialissue;

import com.erp.production.materialissue.dto.MaterialIssueDtos.CreateMaterialIssueBatchRequest;
import com.erp.production.materialissue.dto.MaterialIssueDtos.CreateMaterialIssueRequest;
import com.erp.production.materialissue.dto.MaterialIssueDtos.MaterialIssueResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.materialissue.dto.MaterialIssueDtos;

@RestController
@RequestMapping("/api/material-issues")
@RequiredArgsConstructor
public class MaterialIssueController {

    private final MaterialIssueService materialIssueService;

    /**
     * 목록. <b>from·to 는 불출일</b>, <b>woFrom·woTo 는 지시일</b>이다 —
     * 작업지시별로 묶어 세는 화면이 뒤를 쓴다. 함께 주면 거절한다(MaterialIssueService 참고).
     */
    @GetMapping
    public List<MaterialIssueResponse> list(
            @RequestParam(required = false) Long itemId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate woFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate woTo) {
        return materialIssueService.findAll(itemId, from, to, woFrom, woTo);
    }

    @PostMapping
    public ResponseEntity<MaterialIssueResponse> create(@Valid @RequestBody CreateMaterialIssueRequest req,
                                                        java.security.Principal principal) {
        return ResponseEntity.ok(materialIssueService.create(req, principal.getName()));
    }

    /** 원본 생산불출입력의 격자 — 한 전표에 자재 여러 줄. 한 줄이라도 막히면 전부 되돌린다. */
    @PostMapping("/batch")
    public ResponseEntity<List<MaterialIssueResponse>> createBatch(
            @Valid @RequestBody CreateMaterialIssueBatchRequest req, java.security.Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(materialIssueService.createBatch(req, principal.getName()));
    }

    /** 작업지시서의 소요자재·기불출·잔량. 원본 생산불출입력 [작업지시서] → [잔량으로BOM풀기]·[BOM풀기]. */
    @GetMapping("/wo-requirements")
    public List<MaterialIssueDtos.WorkOrderRequirement> requirements(@RequestParam List<Long> workOrderIds,
                                                                     @RequestParam(defaultValue = "ONE") String level) {
        // 원본 BOM풀기 갈래 — ONE(1단계, 기본) · ALL(전체: 반제품을 끝까지 푼다).
        return materialIssueService.requirements(workOrderIds, "ALL".equalsIgnoreCase(level));
    }

    /** 원본 [진행상태변경] — 고른 불출 전표들을 미확인 ↔ 확인. */
    @PostMapping("/slips/status")
    public java.util.Map<String, Integer> changeStatus(@Valid @RequestBody MaterialIssueDtos.ChangeStatusRequest req) {
        return java.util.Map.of("changed", materialIssueService.changeStatus(req.issueNos(), req.status()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        materialIssueService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
