package com.erp.hr.attendancekind;

import com.erp.hr.attendancekind.dto.AttendanceKindDtos.NextCodeResponse;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.VacationKindRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.VacationKindResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/vacation-kinds")
@RequiredArgsConstructor
public class VacationKindController {

    private final AttendanceKindService service;

    @GetMapping
    public List<VacationKindResponse> list() {
        return service.findVacations();
    }

    @GetMapping("/next-code")
    public NextCodeResponse nextCode() {
        return new NextCodeResponse(service.nextVacationCode());
    }

    @PostMapping
    public VacationKindResponse create(@Valid @RequestBody VacationKindRequest req) {
        return service.createVacation(req);
    }

    @PutMapping("/{id}")
    public VacationKindResponse update(@PathVariable Long id, @Valid @RequestBody VacationKindRequest req) {
        return service.updateVacation(id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.deleteVacation(id);
    }
}
