package com.erp.accounting.withholding;

import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReceipt;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingStatement;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReturnRequest;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReturnResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.withholding.dto.WithholdingDtos;

@RestController
@RequestMapping("/api/withholding")
@RequiredArgsConstructor
public class WithholdingController {

    private final WithholdingService service;
    private final WithholdingReturnService returnService;

    /** 원천징수이행상황신고서 목록 (E030101) */
    @GetMapping("/returns")
    public List<WithholdingReturnResponse> returns() {
        return returnService.list();
    }

    @PostMapping("/returns")
    public WithholdingReturnResponse createReturn(@Valid @RequestBody WithholdingReturnRequest req) {
        return returnService.create(req);
    }

    @PutMapping("/returns/{id}")
    public WithholdingReturnResponse updateReturn(@PathVariable Long id, @Valid @RequestBody WithholdingReturnRequest req) {
        return returnService.update(id, req);
    }

    /** 선택삭제 */
    @PostMapping("/returns/delete")
    public void deleteReturns(@RequestBody List<Long> ids) {
        returnService.delete(ids);
    }


    /** 원천징수이행상황신고서 (귀속월) */
    @GetMapping("/statement")
    public WithholdingStatement statement(@RequestParam String month) {
        return service.statement(month);
    }

    /** 근로소득 원천징수영수증 (연간, 사원별) */
    @GetMapping("/receipts")
    public List<WithholdingReceipt> receipts(@RequestParam int year) {
        return service.receipts(year);
    }
}
