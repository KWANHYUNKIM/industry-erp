package com.erp.hr.dailyworker;

import com.erp.hr.dailyworker.dto.DailyPayDtos.CalculateResponse;
import com.erp.hr.dailyworker.dto.DailyPayDtos.ConfirmCell;
import com.erp.hr.dailyworker.dto.DailyPayDtos.ConfirmRow;
import com.erp.hr.dailyworker.dto.DailyPayDtos.CreateLedgerRequest;
import com.erp.hr.dailyworker.dto.DailyPayDtos.LedgerResponse;
import com.erp.hr.dailyworker.dto.DailyPayDtos.LineResponse;
import com.erp.hr.dailyworker.dto.DailyPayDtos.ConfirmReportLine;
import com.erp.hr.dailyworker.dto.DailyPayDtos.ReportLine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/daily-pay-ledgers")
@RequiredArgsConstructor
public class DailyPayController {

    private final DailyPayService service;

    @GetMapping
    public List<LedgerResponse> list() {
        return service.findLedgers();
    }

    /** 사원별급여조회 · 급여현황 · 급여이체현황 — 귀속연월 YYYY-MM 구간 */
    @GetMapping("/lines")
    public List<ReportLine> reportLines(@RequestParam String from, @RequestParam String to) {
        return service.reportLines(from, to);
    }

    @DeleteMapping("/lines/{lineId}")
    public void deleteLine(@PathVariable Long lineId) {
        service.deleteLine(lineId);
    }

    /** 근무확정현황 — 귀속연월 YYYY-MM 구간 */
    @GetMapping("/work-confirms")
    public List<ConfirmReportLine> confirmReport(@RequestParam String from, @RequestParam String to) {
        return service.confirmReport(from, to);
    }

    @PostMapping
    public LedgerResponse create(@Valid @RequestBody CreateLedgerRequest req) {
        return service.create(req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/confirm")
    public LedgerResponse confirm(@PathVariable Long id) {
        return service.toggleConfirm(id);
    }

    @GetMapping("/{id}/work-confirms")
    public List<ConfirmRow> confirms(@PathVariable Long id) {
        return service.confirms(id);
    }

    @GetMapping("/{id}/work-confirms/load")
    public List<ConfirmRow> load(@PathVariable Long id) {
        return service.loadFromEntries(id);
    }

    @PutMapping("/{id}/work-confirms")
    public List<ConfirmRow> saveConfirms(@PathVariable Long id, @RequestBody List<@Valid ConfirmCell> cells) {
        return service.saveConfirms(id, cells);
    }

    @DeleteMapping("/{id}/work-confirms")
    public void deleteConfirms(@PathVariable Long id) {
        service.deleteConfirms(id);
    }

    @PostMapping("/{id}/calculate")
    public CalculateResponse calculate(@PathVariable Long id) {
        return service.calculate(id);
    }

    @GetMapping("/{id}/lines")
    public List<LineResponse> lines(@PathVariable Long id) {
        return service.lines(id);
    }
}
