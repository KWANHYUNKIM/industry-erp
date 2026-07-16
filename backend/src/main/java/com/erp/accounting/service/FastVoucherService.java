package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.domain.Account;
import com.erp.accounting.domain.BankAccount;
import com.erp.accounting.domain.FastVoucher;
import com.erp.accounting.domain.FastVoucherLine;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.domain.enums.FastVoucherType;
import com.erp.accounting.domain.enums.PaymentMethod;
import com.erp.accounting.dto.FastVoucherDtos.CreateVoucherRequest;
import com.erp.accounting.dto.FastVoucherDtos.LineInput;
import com.erp.accounting.dto.FastVoucherDtos.VoucherResponse;
import com.erp.accounting.repository.AccountRepository;
import com.erp.accounting.repository.BankAccountRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.accounting.repository.FastVoucherRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.FastVoucherDtos;

/**
 * 회계 I > FastEntry — 지출결의서 · 입금보고서 · 가지급금정산서.
 * 라인과 결제수단만 받아 복식부기 분개(JournalService)를 만들고,
 * 계좌로 결제·입금하면 계좌 잔액과 입출금 내역까지 함께 움직인다(BankCardService).
 */
@Service
@RequiredArgsConstructor
public class FastVoucherService {

    private static final String CASH = "101";              // 현금
    private static final String PAYABLE = "253";           // 미지급금
    private static final String RECEIVABLE = "108";        // 외상매출금
    private static final String ADVANCE = "134";           // 가지급금

    private final FastVoucherRepository voucherRepository;
    private final AccountRepository accountRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<VoucherResponse> findAll(FastVoucherType type) {
        return voucherRepository.findAllWithRefs(type).stream().map(VoucherResponse::from).toList();
    }

    @Transactional
    public VoucherResponse create(CreateVoucherRequest req, String username) {
        LocalDate date = req.voucherDate() != null ? req.voucherDate() : LocalDate.now();
        BigDecimal total = req.lines().stream()
                .map(LineInput::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BankAccount bank = null;
        if (req.method() == PaymentMethod.BANK) {
            if (req.bankAccountId() == null) {
                throw ApiException.badRequest("계좌를 선택하세요.");
            }
            bank = bankAccountRepository.findById(req.bankAccountId())
                    .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + req.bankAccountId()));
        }

        BigDecimal advance = null;
        if (req.type() == FastVoucherType.ADVANCE_SETTLEMENT) {
            if (req.advanceAmount() == null || req.advanceAmount().signum() <= 0) {
                throw ApiException.badRequest("가지급금정산서는 먼저 지급했던 가지급금 금액이 필요합니다.");
            }
            if (req.method() == PaymentMethod.CREDIT) {
                throw ApiException.badRequest("가지급금 정산은 현금 또는 계좌로만 처리할 수 있습니다.");
            }
            advance = req.advanceAmount();
        }

        FastVoucher v = FastVoucher.builder()
                .voucherNo(docNoGenerator.next("FV-", "fast_vouchers", "voucher_no", "voucher_date", date))
                .type(req.type())
                .voucherDate(date)
                .method(req.method())
                .bankAccount(bank)
                .partner(req.partnerId() != null
                        ? partnerRepository.findById(req.partnerId())
                            .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()))
                        : null)
                .advanceAmount(advance)
                .totalAmount(total)
                .description(req.description())
                .createdBy(username)
                .build();

        for (LineInput in : req.lines()) {
            v.addLine(FastVoucherLine.builder()
                    .account(account(in.accountId()))
                    .amount(in.amount())
                    .description(in.description())
                    .build());
        }

        JournalEntry entry = journalService.createFromVoucher(v, settlementAccount(req.type(), req.method(), bank));
        v.setJournalEntry(entry);
        voucherRepository.save(v);

        // 계좌로 냈거나 받았으면 잔액과 입출금 내역도 움직인다(분개는 위에서 이미 만들었으므로 재생성하지 않는다).
        BigDecimal cashFlow = bankFlow(v);
        if (bank != null && cashFlow.signum() != 0) {
            bankCardService.recordExternal(bank.getId(), cashFlow.signum() > 0, cashFlow.abs(), date,
                    v.getType().getDisplayName() + " " + v.getVoucherNo(), entry, username);
        }
        return VoucherResponse.from(v);
    }

    /** 결제수단이 실제로 서는 계정 */
    private Account settlementAccount(FastVoucherType type, PaymentMethod method, BankAccount bank) {
        return switch (method) {
            case CASH -> account(CASH);
            case BANK -> bank.getGlAccount();
            case CREDIT -> type == FastVoucherType.DEPOSIT_REPORT ? account(RECEIVABLE) : account(PAYABLE);
        };
    }

    /** 계좌 잔액 변동량 (입금 +, 출금 -) */
    private BigDecimal bankFlow(FastVoucher v) {
        return switch (v.getType()) {
            case EXPENSE_REPORT -> v.getTotalAmount().negate();
            case DEPOSIT_REPORT -> v.getTotalAmount();
            // 정산: 덜 썼으면 잔액이 계좌로 돌아오고, 더 썼으면 계좌에서 더 나간다
            case ADVANCE_SETTLEMENT -> v.getAdvanceAmount().subtract(v.getTotalAmount());
        };
    }

    private Account account(Long id) {
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
    }

    private Account account(String code) {
        return accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code));
    }
}
