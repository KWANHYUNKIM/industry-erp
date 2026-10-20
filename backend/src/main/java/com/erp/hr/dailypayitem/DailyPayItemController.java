package com.erp.hr.dailypayitem;

import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemRequest;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemResponse;
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
}
