package com.erp.groupware.controller;

import com.erp.groupware.dto.ScheduleEventDtos.CreateScheduleEventRequest;
import com.erp.groupware.dto.ScheduleEventDtos.ScheduleEventResponse;
import com.erp.groupware.dto.ScheduleEventDtos.UpdateScheduleEventRequest;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.ScheduleEventService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.ScheduleEventDtos;

@RestController
@RequestMapping("/api/schedule-events")
@RequiredArgsConstructor
public class ScheduleEventController {

    private final ScheduleEventService scheduleEventService;

    @GetMapping
    public List<ScheduleEventResponse> list() {
        return scheduleEventService.findAll();
    }

    @PostMapping
    public ResponseEntity<ScheduleEventResponse> create(
            @Valid @RequestBody CreateScheduleEventRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(scheduleEventService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public ScheduleEventResponse update(@PathVariable Long id, @Valid @RequestBody UpdateScheduleEventRequest req) {
        return scheduleEventService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        scheduleEventService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
