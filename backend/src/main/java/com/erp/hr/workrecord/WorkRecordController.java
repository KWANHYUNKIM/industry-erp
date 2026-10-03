package com.erp.hr.workrecord;

import com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmCell;
import com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmRow;
import com.erp.hr.workrecord.dto.WorkRecordDtos.SaveSlipRequest;
import com.erp.hr.workrecord.dto.WorkRecordDtos.SlipResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 원본 관리 &gt; 근무기록 &gt; 근무입력 · 근무조회. 전표는 (일자, 번호) 로 가리킨다. */
@RestController
@RequestMapping("/api/work-records")
@RequiredArgsConstructor
public class WorkRecordController {

    private final WorkRecordService service;

    @GetMapping
    public List<SlipResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findSlips(from, to);
    }

    /** 근무확정현황 — 귀속월 구간의 확정 근무기록. */
    @GetMapping("/confirms")
    public List<ConfirmRow> confirms(@RequestParam String from, @RequestParam String to) {
        return service.findConfirms(from, to);
    }

    /** 근무기록확정 [근무기록] — 근무입력에서 그 달 합계를 불러온다(저장 안 함). */
    @GetMapping("/confirms/{payMonth}/load")
    public List<ConfirmRow> loadConfirms(@PathVariable String payMonth) {
        return service.loadFromRecords(payMonth);
    }

    /** 근무기록확정 [저장] — 그 귀속월 확정값을 통째로. */
    @PutMapping("/confirms/{payMonth}")
    public List<ConfirmRow> saveConfirms(
            @PathVariable String payMonth,
            @Valid @RequestBody List<@Valid ConfirmCell> cells) {
        return service.saveConfirms(payMonth, cells);
    }

    /** 근무기록확정 [삭제]. */
    @DeleteMapping("/confirms/{payMonth}")
    public void deleteConfirms(@PathVariable String payMonth) {
        service.deleteConfirms(payMonth);
    }

    @GetMapping("/{slipDate}/{slipNo}")
    public SlipResponse get(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate,
                            @PathVariable int slipNo) {
        return service.findSlip(slipDate, slipNo);
    }

    @PostMapping
    public SlipResponse create(@Valid @RequestBody SaveSlipRequest req) {
        return service.create(req);
    }

    @PutMapping("/{slipDate}/{slipNo}")
    public SlipResponse update(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate,
                               @PathVariable int slipNo, @Valid @RequestBody SaveSlipRequest req) {
        return service.update(slipDate, slipNo, req);
    }

    @DeleteMapping("/{slipDate}/{slipNo}")
    public void delete(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate,
                       @PathVariable int slipNo) {
        service.delete(slipDate, slipNo);
    }
}
