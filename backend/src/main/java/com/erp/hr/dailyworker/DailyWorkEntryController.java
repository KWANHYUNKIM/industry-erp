package com.erp.hr.dailyworker;

import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.LineResponse;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SaveSlipRequest;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SlipResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
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

    @GetMapping("/{slipDate}/{slipNo}")
    public SlipResponse slip(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo) {
        return service.findSlip(slipDate, slipNo);
    }

    @PostMapping
    public SlipResponse create(@Valid @RequestBody SaveSlipRequest req) {
        return service.create(req);
    }

    @PutMapping("/{slipDate}/{slipNo}")
    public SlipResponse update(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo,
                               @Valid @RequestBody SaveSlipRequest req) {
        return service.update(slipDate, slipNo, req);
    }

    @DeleteMapping("/{slipDate}/{slipNo}")
    public void delete(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo) {
        service.delete(slipDate, slipNo);
    }
}
