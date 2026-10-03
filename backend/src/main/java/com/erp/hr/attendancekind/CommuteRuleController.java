package com.erp.hr.attendancekind;

import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleRequest;
import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/commute-rules")
@RequiredArgsConstructor
public class CommuteRuleController {

    private final CommuteRuleService service;

    @GetMapping
    public List<CommuteRuleResponse> list() {
        return service.findAll();
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
