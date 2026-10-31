package com.erp.accounting.ledger.journal;

import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.ledger.account.AccountService;
import com.erp.accounting.ledger.journal.dto.JournalDtos.CodeChangeRequest;
import com.erp.common.ApiException;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 회계 I › 기초등록 › 각종코드변경(E010111) — 이미 입력된 전표 줄의 계정 · 거래처 · 부서 · 프로젝트를 한꺼번에 바꾼다. */
@Service
@RequiredArgsConstructor
public class JournalCodeChangeService {

    private final JournalLineRepository lineRepository;
    private final AccountService accountService;
    private final PartnerService partnerService;

    /** @return 바꾼 줄 수 */
    @Transactional
    public int change(CodeChangeRequest req) {
        if (req.from() == null || req.to() == null || req.from().isAfter(req.to())) {
            throw ApiException.badRequest("기준일자를 확인하세요.");
        }
        long before = req.beforeId() == null ? 0 : req.beforeId();
        long after = req.afterId() == null ? 0 : req.afterId();
        if (before == 0) throw ApiException.badRequest("변경 전 코드를 입력하세요.");
        if (after == 0) throw ApiException.badRequest("변경 후 코드를 입력하세요.");
        if (before == after) throw ApiException.badRequest("변경 전 코드와 변경 후 코드가 같습니다.");

        long acct = 0, partner = 0, dept = 0, proj = 0;
        switch (req.kind()) {
            case ACCOUNT -> acct = before;
            case PARTNER -> partner = before;
            case DEPARTMENT -> dept = before;
            case PROJECT -> proj = before;
        }
        // 위쪽 조건 칸(프로젝트 · 거래처 · 부서)은 바꾸는 대상이 아닌 다른 종류로만 건다
        if (req.kind() != CodeChangeRequest.Kind.PROJECT && req.projectId() != null) proj = req.projectId();
        if (req.kind() != CodeChangeRequest.Kind.PARTNER && req.partnerId() != null) partner = req.partnerId();
        if (req.kind() != CodeChangeRequest.Kind.DEPARTMENT && req.departmentId() != null) dept = req.departmentId();

        List<JournalLine> lines = lineRepository.findForCodeChange(req.from(), req.to(), acct, partner, dept, proj);
        Account newAccount = req.kind() == CodeChangeRequest.Kind.ACCOUNT ? accountService.getUsable(after) : null;
        var newPartner = req.kind() == CodeChangeRequest.Kind.PARTNER ? partnerService.get(after) : null;
        for (JournalLine l : lines) {
            switch (req.kind()) {
                case ACCOUNT -> l.setAccount(newAccount);
                case PARTNER -> l.setPartner(newPartner);
                case DEPARTMENT -> l.setDepartmentId(after);
                case PROJECT -> l.setProjectId(after);
            }
        }
        return lines.size();
    }
}
