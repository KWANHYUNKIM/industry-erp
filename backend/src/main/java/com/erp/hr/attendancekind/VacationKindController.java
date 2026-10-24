package com.erp.hr.attendancekind;

import com.erp.hr.attendancekind.dto.AttendanceKindDtos.NextCodeResponse;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.VacationKindRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.VacationKindResponse;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.GrantCell;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.GrantRow;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.GrantSummary;
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

    /** 사원별휴가일수조회 목록 */
    @GetMapping("/grant-summaries")
    public List<GrantSummary> grantSummaries() {
        return service.grantSummaries();
    }

    @GetMapping("/{id}/grants")
    public List<GrantRow> grants(@PathVariable Long id) {
        return service.grants(id);
    }

    @PutMapping("/{id}/grants")
    public List<GrantRow> saveGrants(@PathVariable Long id, @RequestBody List<@Valid GrantCell> cells) {
        return service.saveGrants(id, cells);
    }

    @DeleteMapping("/{id}/grants")
    public void deleteGrants(@PathVariable Long id) {
        service.deleteGrants(id);
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
