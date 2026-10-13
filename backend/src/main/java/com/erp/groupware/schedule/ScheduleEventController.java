package com.erp.groupware.schedule;

import com.erp.groupware.schedule.dto.ScheduleEventDtos.CreateScheduleEventRequest;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.ScheduleEventResponse;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.UpdateScheduleEventRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.schedule.dto.ScheduleEventDtos;

@RestController
@RequestMapping("/api/schedule-events")
@RequiredArgsConstructor
public class ScheduleEventController {

    private final ScheduleEventService scheduleEventService;

    private static ScheduleEventService.Viewer viewer(UserPrincipal p) {
        return p == null ? null : new ScheduleEventService.Viewer(p.getUsername(), p.getName(), p.isAdmin());
    }

    @GetMapping
    public List<ScheduleEventResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return scheduleEventService.findAll(viewer(principal));
    }

    @PostMapping
    public ResponseEntity<ScheduleEventResponse> create(
            @Valid @RequestBody CreateScheduleEventRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(scheduleEventService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public ScheduleEventResponse update(@PathVariable Long id, @Valid @RequestBody UpdateScheduleEventRequest req,
                                        @AuthenticationPrincipal UserPrincipal principal) {
        return scheduleEventService.update(id, req, viewer(principal));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @RequestParam(required = false) String scope,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        scheduleEventService.delete(id, scope, viewer(principal));
        return ResponseEntity.noContent().build();
    }
}
