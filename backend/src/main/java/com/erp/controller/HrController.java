package com.erp.controller;

import com.erp.dto.HrDtos.AttendanceInputRequest;
import com.erp.dto.HrDtos.AttendanceRow;
import com.erp.dto.HrDtos.AttendanceSummaryRow;
import com.erp.dto.HrDtos.CreateVacationRequest;
import com.erp.dto.HrDtos.EmployeeResponse;
import com.erp.dto.HrDtos.UpdateVacationStatusRequest;
import com.erp.dto.HrDtos.VacationRow;
import com.erp.dto.HrDtos.VacationSummaryRow;
import com.erp.service.HrService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 인사(HR) 근태·휴가 API. 조회는 인증된 사용자 누구나,
 * 생성/수정은 관리자·매니저만 가능하다.
 */
@RestController
@RequestMapping("/api/hr")
@RequiredArgsConstructor
public class HrController {

    private final HrService hrService;

    // ---------------------------------------------------------------- 사원

    @GetMapping("/employees")
    public List<EmployeeResponse> employees() {
        return hrService.employees();
    }

    // -------------------------------------------------------------- 근태

    @GetMapping("/attendance")
    public List<AttendanceRow> attendance(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return hrService.attendance(from, to);
    }

    @GetMapping("/attendance/summary")
    public List<AttendanceSummaryRow> attendanceSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return hrService.attendanceSummary(from, to);
    }

    @PostMapping("/attendance")
    public ResponseEntity<AttendanceRow> inputAttendance(@Valid @RequestBody AttendanceInputRequest req) {
        return ResponseEntity.ok(hrService.upsertAttendance(req));
    }

    // -------------------------------------------------------------- 휴가

    @GetMapping("/vacations")
    public List<VacationRow> vacations(@RequestParam(required = false) Integer year) {
        return hrService.vacations(year);
    }

    @PostMapping("/vacations")
    public ResponseEntity<VacationRow> createVacation(@Valid @RequestBody CreateVacationRequest req) {
        return ResponseEntity.ok(hrService.createVacation(req));
    }

    @PutMapping("/vacations/{id}/status")
    public VacationRow updateVacationStatus(@PathVariable Long id,
                                            @Valid @RequestBody UpdateVacationStatusRequest req) {
        return hrService.updateVacationStatus(id, req.status());
    }

    @GetMapping("/vacations/summary")
    public List<VacationSummaryRow> vacationSummary(@RequestParam(required = false) Integer year) {
        return hrService.vacationSummary(year);
    }
}
