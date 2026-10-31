package com.erp.accounting.contractbill;

import com.erp.accounting.contractbill.dto.ContractBillDtos;
import com.erp.accounting.contractbill.dto.ContractBillDtos.BillResponse;
import com.erp.accounting.contractbill.dto.ContractBillDtos.CreateBillRequest;
import com.erp.accounting.contractbill.dto.ContractBillDtos.UpdateBillRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 회계 II › 계약관리 › 청구예정자료생성(E060905) */
@RestController
@RequestMapping("/api/contract-bills")
@RequiredArgsConstructor
public class ContractBillController {

    private final ContractBillService service;

    @GetMapping
    public List<BillResponse> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findAll(from, to);
    }

    /** 청구예정자료미생성현황(E060909) — 청구예정월(일자로 받아 달로 본다) 안의 아직 안 만든 청구. */
    @GetMapping("/unbilled")
    public List<ContractBillDtos.UnbilledLine> unbilled(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                        @RequestParam(defaultValue = "false") boolean includeZero) {
        return service.unbilled(java.time.YearMonth.from(from), java.time.YearMonth.from(to), includeZero);
    }

    /** 회계/판매일괄반영(E060906) · 회계미반영현황(계약)(E060908) — 청구자료 줄. reflected=false 면 미반영만. */
    @GetMapping("/lines")
    public List<ContractBillDtos.BillLineView> lines(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                     @RequestParam(required = false) Boolean reflected) {
        return service.lines(from, to, reflected);
    }

    /** 회계/판매일괄반영 [매출전표 I] 창 [저장(F8)] — 만든 회계전표 id. */
    @PostMapping("/reflect")
    public java.util.Map<String, Long> reflect(@Valid @RequestBody ContractBillDtos.ReflectRequest req,
                                               @AuthenticationPrincipal UserPrincipal principal) {
        return java.util.Map.of("journalEntryId", service.reflect(req, principal.getUsername()));
    }

    /** 매출(세금)계산서현황(계약)(E060910) — 기준일자(전표일자) 기간. */
    @GetMapping("/invoices")
    public List<ContractBillDtos.InvoiceRow> invoices(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.invoices(from, to);
    }

    /** 청구자료수정 [회계전표삭제] → '회계전표번호보기' 창의 연결회계전표내역 */
    @GetMapping("/{id}/journals")
    public List<ContractBillDtos.JournalLink> journals(@PathVariable Long id) {
        return service.journalLinks(id);
    }

    /** '회계전표번호보기' [삭제] — 연결 매출전표를 지우고 묶인 청구자료를 미반영으로 */
    /** 회계/판매일괄반영 [판매반영 › 판매전표 발행] 판매입력 [저장(F8)]. */
    @PostMapping("/reflect-sales")
    public java.util.Map<String, Long> reflectSales(@Valid @RequestBody ContractBillDtos.SalesReflectRequest req,
                                                    @AuthenticationPrincipal UserPrincipal principal) {
        return java.util.Map.of("salesId", service.reflectSales(req, principal.getUsername()));
    }

    @PostMapping("/{id}/unreflect")
    public void unreflect(@PathVariable Long id) {
        service.unreflect(id);
    }

    @GetMapping("/{id}")
    public BillResponse one(@PathVariable Long id) {
        return service.findOne(id);
    }

    /** [일괄생성] · [거래처별생성] */
    @PostMapping
    public List<BillResponse> create(@Valid @RequestBody CreateBillRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    /** 청구자료수정 [저장] */
    @PutMapping("/{id}")
    public BillResponse update(@PathVariable Long id, @Valid @RequestBody UpdateBillRequest req) {
        return service.update(id, req.lines());
    }

    /** 청구자료수정 [삭제] · 목록 [선택삭제] */
    @PostMapping("/delete")
    public void delete(@Valid @RequestBody ContractBillDtos.DeleteRequest req) {
        service.delete(req.ids());
    }
}
