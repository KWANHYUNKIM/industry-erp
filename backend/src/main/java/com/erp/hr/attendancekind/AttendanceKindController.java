package com.erp.hr.attendancekind;

import com.erp.hr.attendancekind.dto.AttendanceKindDtos.AttendanceKindRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.AttendanceKindResponse;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.NextCodeResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/attendance-kinds")
@RequiredArgsConstructor
public class AttendanceKindController {

    private final AttendanceKindService service;

    @GetMapping
    public List<AttendanceKindResponse> list() {
        return service.findAll();
    }

    @GetMapping("/next-code")
    public NextCodeResponse nextCode() {
        return new NextCodeResponse(service.nextCode());
    }

    @PostMapping
    public AttendanceKindResponse create(@Valid @RequestBody AttendanceKindRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public AttendanceKindResponse update(@PathVariable Long id, @Valid @RequestBody AttendanceKindRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
