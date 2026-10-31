package com.erp.accounting.ledger.bond;

import com.erp.accounting.ledger.bond.dto.BondDtos.BondEntryResponse;
import com.erp.accounting.ledger.bond.dto.BondDtos.CreateBondRequest;
import com.erp.accounting.ledger.bond.dto.BondDtos.DeleteBondsRequest;
import com.erp.accounting.ledger.bond.dto.BondDtos.DepositReportRequest;
import com.erp.accounting.ledger.bond.dto.BondDtos.UpdateBondRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 회계 II &gt; 채권관리 · 채무관리 — 채권(채무)내역 입력 · 조회 · 삭제. */
@RestController
@RequestMapping("/api/bonds")
@RequiredArgsConstructor
public class BondController {

    private final BondService service;

    /** 기준일 끝까지의 장 전부 — 조회 화면은 기간으로 거르고, 거래내역 · 현황은 이월잔액까지 센다. */
    @GetMapping
    public List<BondEntryResponse> list(@RequestParam BondSide side,
                                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findUpTo(side, to);
    }

    @GetMapping("/{id}")
    public BondEntryResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public BondEntryResponse create(@Valid @RequestBody CreateBondRequest req,
                                    @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    /** 채권감소등록 [입금보고서작성] → 입금보고서 · 채무감소등록 [지출결의서작성] → 지출결의서 [저장] — 회계전표 + 연결된 감소 한 장. */
    @PostMapping("/deposit-report")
    public BondEntryResponse depositReport(@RequestParam BondSide side, @Valid @RequestBody DepositReportRequest req,
                                           @AuthenticationPrincipal UserPrincipal principal) {
        return service.createDepositReport(side, req, principal.getUsername());
    }

    @PutMapping("/{id}")
    public BondEntryResponse update(@PathVariable Long id, @Valid @RequestBody UpdateBondRequest req,
                                    @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(id, req, principal.getUsername());
    }

    /** [선택삭제] — 원본 확인 창 '전표를 삭제하겠습니까?' 다음에 고른 장을 함께 지운다. */
    @PostMapping("/delete")
    public void delete(@Valid @RequestBody DeleteBondsRequest req) {
        service.delete(req.ids());
    }
}
