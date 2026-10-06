package com.erp.accounting.simplepayment;

import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.SheetResponse;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.StatementRequest;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.StatementResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 간이지급명세서 (세무 > 원천징수 > 간이지급명세서, E030116) */
@RestController
@RequestMapping("/api/simple-payment-statements")
@RequiredArgsConstructor
public class SimplePaymentController {

    private final SimplePaymentService service;

    @GetMapping
    public List<StatementResponse> list(@RequestParam(defaultValue = "false") boolean daily) {
        return service.list(daily);
    }

    @PostMapping
    public StatementResponse create(@Valid @RequestBody StatementRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public StatementResponse update(@PathVariable Long id, @Valid @RequestBody StatementRequest req) {
        return service.update(id, req);
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/sheet")
    public SheetResponse sheet(@PathVariable Long id) {
        return service.sheet(id);
    }
}
