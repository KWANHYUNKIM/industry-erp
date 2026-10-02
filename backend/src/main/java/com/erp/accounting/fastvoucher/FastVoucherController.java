package com.erp.accounting.fastvoucher;

import com.erp.accounting.fastvoucher.dto.FastVoucherDtos.CreateVoucherRequest;
import com.erp.accounting.fastvoucher.dto.FastVoucherDtos.VoucherResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.fastvoucher.dto.FastVoucherDtos;

/** 회계 I > FastEntry — 지출결의서 · 입금보고서 · 가지급금정산서 */
@RestController
@RequestMapping("/api/vouchers")
@RequiredArgsConstructor
public class FastVoucherController {

    private final FastVoucherService service;

    @GetMapping
    public FastVoucherDtos.VoucherList list(@RequestParam(required = false) FastVoucherType type,
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to,
            /* [오천건이상조회] — 잘려 왔을 때 화면이 이걸 붙여 다시 부른다. */
            @RequestParam(defaultValue = "false") boolean all) {
        return service.list(type, from, to, all);
    }

    @PostMapping
    public VoucherResponse create(@Valid @RequestBody CreateVoucherRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }
}
