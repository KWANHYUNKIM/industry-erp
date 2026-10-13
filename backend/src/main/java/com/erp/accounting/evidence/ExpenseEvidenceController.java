package com.erp.accounting.evidence;

import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.AccountSetting;
import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.AccountSettingRequest;
import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.CompareRow;
import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.StatusResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 지출증빙현황 (세무 > 법인세 > 지출증빙현황, E030402) */
@RestController
@RequestMapping("/api/expense-evidence")
@RequiredArgsConstructor
public class ExpenseEvidenceController {

    private final ExpenseEvidenceService service;

    @GetMapping
    public StatusResponse status(@RequestParam String from, @RequestParam String to) {
        return service.status(from, to);
    }

    @GetMapping("/compare")
    public List<CompareRow> compare(@RequestParam(required = false) Long accountId, @RequestParam(required = false) String kind,
                                    @RequestParam String from, @RequestParam String to) {
        return service.compare(accountId, kind, from, to);
    }

    @GetMapping("/accounts")
    public List<AccountSetting> accounts() {
        return service.accounts();
    }

    @PutMapping("/accounts")
    public List<AccountSetting> saveAccounts(@RequestBody AccountSettingRequest req) {
        return service.saveAccounts(req.shownIds());
    }
}
