package com.erp.hr.dailypayitem;

import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemRequest;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemResponse;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.FormulaRequest;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.FormulaResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/daily-pay-items")
@RequiredArgsConstructor
public class DailyPayItemController {

    private final DailyPayItemService service;

    @GetMapping
    public List<DailyPayItemResponse> list(@RequestParam DailyPayItemKind kind,
                                           @RequestParam(defaultValue = "false") boolean includeInactive) {
        return service.findAll(kind, includeInactive);
    }

    @PostMapping
    public DailyPayItemResponse create(@Valid @RequestBody DailyPayItemRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public DailyPayItemResponse update(@PathVariable Long id, @Valid @RequestBody DailyPayItemRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    /** 계산식리스트(원본 [설정] 창). */
    @GetMapping("/{id}/formulas")
    public List<FormulaResponse> formulas(@PathVariable Long id) {
        return service.formulas(id);
    }

    @PostMapping("/{id}/formulas")
    public FormulaResponse createFormula(@PathVariable Long id, @Valid @RequestBody FormulaRequest req) {
        return service.createFormula(id, req);
    }

    @PutMapping("/{id}/formulas/{formulaId}")
    public FormulaResponse updateFormula(@PathVariable Long id, @PathVariable Long formulaId, @Valid @RequestBody FormulaRequest req) {
        return service.updateFormula(id, formulaId, req);
    }

    @DeleteMapping("/{id}/formulas/{formulaId}")
    public void deleteFormula(@PathVariable Long id, @PathVariable Long formulaId) {
        service.deleteFormula(id, formulaId);
    }
}
