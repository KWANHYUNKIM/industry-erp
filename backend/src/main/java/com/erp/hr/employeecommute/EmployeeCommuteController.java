package com.erp.hr.employeecommute;

import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.ClockRequest;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.CommuteResponse;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.EventUpdateRequest;
import jakarta.validation.Valid;
import com.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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

    /** 출근 / 퇴근 — out: false 출근 · true 퇴근 · 비우면 그날 처음이면 출근, 출근 중이면 퇴근 */
    @PostMapping("/clock")
    public CommuteResponse clock(@Valid @RequestBody ClockRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.clock(req, worker(principal));
    }

    /** 창 오른쪽 이력 한 줄 [저장] */
    @PutMapping("/events/{eventId}")
    public CommuteResponse updateEvent(@PathVariable Long eventId, @Valid @RequestBody EventUpdateRequest req,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateEvent(eventId, req, worker(principal));
    }

    /** 창 오른쪽 퇴근 이력 [삭제] */
    @DeleteMapping("/events/{eventId}")
    public CommuteResponse deleteEvent(@PathVariable Long eventId) {
        return service.deleteEvent(eventId);
    }

    private static String worker(UserPrincipal principal) {
        return principal == null ? null : principal.getUsername();
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
