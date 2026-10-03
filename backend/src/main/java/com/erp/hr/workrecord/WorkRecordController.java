package com.erp.hr.workrecord;

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
