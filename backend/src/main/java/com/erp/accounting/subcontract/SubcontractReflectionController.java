package com.erp.accounting.subcontract;

import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.ReflectRequest;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.ReflectResult;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.SubcontractRow;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.UnreflectRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 원본 외주비일괄회계반영. 주소를 회계반영 아래에 두어 권한(ACCOUNTING)이 판매·구매 회계반영과 같게 걸린다.
 */
@RestController
@RequestMapping("/api/accounting-reflection/subcontract")
@RequiredArgsConstructor
public class SubcontractReflectionController {

    private final SubcontractReflectionService service;

    /** 외주비가 붙은 생산입고 줄(기간 = 생산일). 반영 여부와 회계전표 번호를 같이 준다. */
    @GetMapping
    public List<SubcontractRow> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.list(from, to);
    }

    /** 원본 [매입전표 I] — 고른 줄을 외주처(또는 전표)별로 묶어 매입전표를 만든다. */
    @PostMapping("/reflect")
    public ResponseEntity<ReflectResult> reflect(@Valid @RequestBody ReflectRequest req,
                                                 @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.reflect(req, principal.getUsername()));
    }

    /** 반영취소 — 회계전표를 지우고 줄을 풀어 준다. */
    @PostMapping("/unreflect")
    public ResponseEntity<ReflectResult> unreflect(@Valid @RequestBody UnreflectRequest req) {
        return ResponseEntity.ok(service.unreflect(req));
    }
}
