package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.accounting.domain.BankAccount;
import com.erp.accounting.domain.BankCheck;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.domain.enums.CheckStatus;
import com.erp.accounting.domain.enums.CheckType;
import com.erp.accounting.dto.BankCheckDtos.CheckResponse;
import com.erp.accounting.dto.BankCheckDtos.CreateCheckRequest;
import com.erp.accounting.dto.BankCheckDtos.DepositRequest;
import com.erp.accounting.dto.BankCheckDtos.SettleRequest;
import com.erp.accounting.repository.BankAccountRepository;
import com.erp.accounting.repository.BankCheckRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.BankCheckDtos;

/**
 * 회계 II > 수표관리.
 *   받은수표: 수취(보유) → 계좌 입금 또는 부도
 *   발행수표: 당좌계좌에서 발행(그 순간 예금이 빠진다) → 은행 인출 확인 시 결제완료 표시
 * 계좌가 실제로 움직이는 건 발행·입금 두 순간이고, 그때 계좌 잔액과 입출금 내역도 함께 남긴다.
 */
@Service
@RequiredArgsConstructor
public class BankCheckService {

    private final BankCheckRepository checkRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;

    @Transactional(readOnly = true)
    public List<CheckResponse> findAll() {
        return checkRepository.findAllWithRefs().stream().map(CheckResponse::from).toList();
    }

    @Transactional
    public CheckResponse create(CreateCheckRequest req, String username) {
        if (checkRepository.existsByCheckNo(req.checkNo())) {
            throw ApiException.conflict("이미 등록된 수표번호입니다: " + req.checkNo());
        }
        BankAccount account = null;
        if (req.type() == CheckType.ISSUED) {
            if (req.bankAccountId() == null) {
                throw ApiException.badRequest("발행수표는 끊어 줄 당좌계좌를 선택하세요.");
            }
            account = bankAccount(req.bankAccountId());
        }

        LocalDate date = req.issueDate() != null ? req.issueDate() : LocalDate.now();
        BankCheck c = BankCheck.builder()
                .checkNo(req.checkNo())
                .type(req.type())
                .status(CheckStatus.HELD)
                .issueDate(date)
                .amount(req.amount())
                .bankName(req.bankName())
                .partner(req.partnerId() != null
                        ? partnerRepository.findById(req.partnerId())
                            .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()))
                        : null)
                .bankAccount(account)
                .remark(req.remark())
                .createdBy(username)
                .build();
        checkRepository.save(c);

        JournalEntry entry = journalService.createFromCheckIssue(c);
        // 발행수표는 끊는 순간 당좌예금이 빠진다. 분개는 위에서 만들었으므로 잔액·내역만 남긴다.
        if (req.type() == CheckType.ISSUED) {
            bankCardService.recordExternal(account.getId(), false, c.getAmount(), date,
                    "수표 발행 " + c.getCheckNo(), entry, username);
        }
        return CheckResponse.from(c);
    }

    /** 받은수표를 계좌에 입금 */
    @Transactional
    public CheckResponse deposit(Long id, DepositRequest req, String username) {
        BankCheck c = check(id);
        requireType(c, CheckType.RECEIVED, "받은수표만 입금할 수 있습니다");
        requireHeld(c, "입금");

        BankAccount account = bankAccount(req.bankAccountId());
        LocalDate date = req.depositDate() != null ? req.depositDate() : LocalDate.now();
        c.setBankAccount(account);
        c.setStatus(CheckStatus.DEPOSITED);
        c.setSettledDate(date);

        JournalEntry entry = journalService.createFromCheckDeposit(c, date, username);
        bankCardService.recordExternal(account.getId(), true, c.getAmount(), date,
                "수표 입금 " + c.getCheckNo(), entry, username);
        return CheckResponse.from(c);
    }

    /** 받은수표 부도 — 현금은 움직이지 않고 채권으로 되돌린다 */
    @Transactional
    public CheckResponse dishonor(Long id, SettleRequest req, String username) {
        BankCheck c = check(id);
        requireType(c, CheckType.RECEIVED, "받은수표만 부도 처리할 수 있습니다");
        requireHeld(c, "부도");

        LocalDate date = req.settledDate() != null ? req.settledDate() : LocalDate.now();
        c.setStatus(CheckStatus.DISHONORED);
        c.setSettledDate(date);
        journalService.createFromCheckDishonor(c, date, username);
        return CheckResponse.from(c);
    }

    /**
     * 발행수표가 은행에서 인출됐음을 확인. 회계는 발행 시 이미 반영됐으므로 상태만 바꾼다.
     */
    @Transactional
    public CheckResponse settle(Long id, SettleRequest req) {
        BankCheck c = check(id);
        requireType(c, CheckType.ISSUED, "발행수표만 결제 확인할 수 있습니다");
        requireHeld(c, "결제 확인");

        c.setStatus(CheckStatus.PAID);
        c.setSettledDate(req.settledDate() != null ? req.settledDate() : LocalDate.now());
        return CheckResponse.from(c);
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private void requireType(BankCheck c, CheckType type, String message) {
        if (c.getType() != type) {
            throw ApiException.badRequest(message + ": " + c.getCheckNo() + "은(는) " + c.getType().getDisplayName() + "입니다.");
        }
    }

    private void requireHeld(BankCheck c, String action) {
        if (c.getStatus() != CheckStatus.HELD) {
            throw ApiException.conflict("이미 " + c.getStatus().getDisplayName() + " 처리된 수표입니다: "
                    + c.getCheckNo() + " (" + action + " 불가)");
        }
    }

    private BankCheck check(Long id) {
        return checkRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수표를 찾을 수 없습니다. id=" + id));
    }

    private BankAccount bankAccount(Long id) {
        return bankAccountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + id));
    }
}
