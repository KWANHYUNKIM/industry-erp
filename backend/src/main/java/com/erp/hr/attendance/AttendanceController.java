package com.erp.hr.attendance;

import com.erp.hr.attendance.dto.AttendanceDtos.AttendanceResponse;
import com.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.hr.attendance.dto.AttendanceDtos;

@RestController
@RequestMapping("/api/attendances")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;

    @GetMapping
    public List<AttendanceResponse> list() {
        return attendanceService.findAll();
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
