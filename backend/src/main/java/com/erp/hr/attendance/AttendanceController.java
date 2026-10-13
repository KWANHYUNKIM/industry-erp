package com.erp.hr.attendance;

import com.erp.hr.attendance.dto.AttendanceDtos.AttendanceResponse;
import com.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.hr.attendance.dto.AttendanceDtos.RecordRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import com.erp.hr.attendance.dto.AttendanceDtos;

@RestController
@RequestMapping("/api/attendances")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;

    @GetMapping
    public List<AttendanceResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from != null && to != null) return attendanceService.findBetween(from, to);
        return attendanceService.findAll();
    }

    /** 출/퇴근기록부(ID) 창의 [출근] · [퇴근] — 누른 날 · 고른 시각으로. */
    @PostMapping("/record")
    public AttendanceResponse record(@AuthenticationPrincipal UserPrincipal principal,
                                     @Valid @RequestBody RecordRequest req) {
        return attendanceService.record(principal.getUsername(), req);
    }

    @GetMapping("/today")
    public AttendanceResponse today(@AuthenticationPrincipal UserPrincipal principal) {
        return attendanceService.today(principal.getUsername());
    }

    @PostMapping("/clock-in")
    public AttendanceResponse clockIn(@AuthenticationPrincipal UserPrincipal principal) {
        return attendanceService.clockIn(principal.getUsername());
    }

    @PostMapping("/clock-out")
    public AttendanceResponse clockOut(@AuthenticationPrincipal UserPrincipal principal) {
        return attendanceService.clockOut(principal.getUsername());
    }
}
