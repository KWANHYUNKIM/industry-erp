package com.erp.hr.attendancekind;

import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleRequest;
import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleResponse;
import com.erp.hr.attendancekind.dto.CommuteRuleDtos.ReflectLine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/hr/commute-rules")
@RequiredArgsConstructor
public class CommuteRuleController {

    private final CommuteRuleService service;
    private final CommuteReflectService reflectService;

    @GetMapping
    public List<CommuteRuleResponse> list() {
        return service.findAll();
    }

    /** 근태입력 [출/퇴근 ▲ › 사원기준] — 기간 · 근태코드 · 사원 · 부서로 출/퇴근기록을 근태 줄로(기간별 · 일별). */
    @GetMapping("/reflect")
    public List<ReflectLine> reflect(@RequestParam LocalDate from, @RequestParam LocalDate to,
                                     @RequestParam(required = false) List<Long> kindIds,
                                     @RequestParam(required = false) List<Long> employeeIds,
                                     @RequestParam(required = false) List<Long> departmentIds,
                                     @RequestParam(defaultValue = "PERIOD") CommuteReflectService.Mode mode) {
        return reflectService.reflect(from, to, kindIds, employeeIds, departmentIds, mode);
    }

    @PostMapping
    public CommuteRuleResponse create(@Valid @RequestBody CommuteRuleRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public CommuteRuleResponse update(@PathVariable Long id, @Valid @RequestBody CommuteRuleRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
