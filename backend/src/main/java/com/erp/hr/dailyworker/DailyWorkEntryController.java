package com.erp.hr.dailyworker;

import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.HistoryRow;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.LineResponse;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SaveSlipRequest;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SlipResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/hr/daily-work-entries")
@RequiredArgsConstructor
public class DailyWorkEntryController {

    private final DailyWorkEntryService service;

    @GetMapping
    public List<LineResponse> list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findLines(from, to);
    }

    /** 근무조회 [이력] — 작업일자 구간. */
    @GetMapping("/histories")
    public List<HistoryRow> histories(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findHistories(from, to);
    }

    /** 이력 H 창 — 한 전표의 신규 · 수정 · 삭제. */
    @GetMapping("/histories/{slipDate}/{slipNo}")
    public List<HistoryRow> slipHistory(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo) {
        return service.findSlipHistory(slipDate, slipNo);
    }

    @GetMapping("/{slipDate}/{slipNo}")
    public SlipResponse slip(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo) {
        return service.findSlip(slipDate, slipNo);
    }

    @PostMapping
    public SlipResponse create(@Valid @RequestBody SaveSlipRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, worker(principal));
    }

    @PutMapping("/{slipDate}/{slipNo}")
    public SlipResponse update(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo,
                               @Valid @RequestBody SaveSlipRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(slipDate, slipNo, req, worker(principal));
    }

    @DeleteMapping("/{slipDate}/{slipNo}")
    public void delete(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo,
                       @AuthenticationPrincipal UserPrincipal principal) {
        service.delete(slipDate, slipNo, worker(principal));
    }

    private static String worker(UserPrincipal principal) {
        return principal == null ? "" : principal.getUsername();
    }
}
