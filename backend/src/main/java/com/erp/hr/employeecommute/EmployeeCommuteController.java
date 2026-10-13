package com.erp.hr.employeecommute;

import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.ClockRequest;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.CommuteResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/hr/employee-commutes")
@RequiredArgsConstructor
public class EmployeeCommuteController {

    private final EmployeeCommuteService service;

    @GetMapping
    public List<CommuteResponse> list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findInPeriod(from, to);
    }

    /** 출근 / 퇴근 — 그날 기록이 없으면 출근, 있으면 퇴근 */
    @PostMapping("/clock")
    public CommuteResponse clock(@Valid @RequestBody ClockRequest req) {
        return service.clock(req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
