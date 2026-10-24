package com.erp.hr.attendancekind;

import com.erp.hr.attendancekind.dto.AttendanceKindDtos.NextCodeResponse;
import com.erp.hr.attendancekind.dto.AttendanceKindGroupDtos.GroupRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindGroupDtos.GroupResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/attendance-kind-groups")
@RequiredArgsConstructor
public class AttendanceKindGroupController {

    private final AttendanceKindGroupService service;

    @GetMapping
    public List<GroupResponse> list() {
        return service.findAll();
    }

    @GetMapping("/next-code")
    public NextCodeResponse nextCode() {
        return new NextCodeResponse(service.nextCode());
    }

    @PostMapping
    public GroupResponse create(@Valid @RequestBody GroupRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public GroupResponse update(@PathVariable Long id, @Valid @RequestBody GroupRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
