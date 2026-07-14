package com.erp.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.domain.BankAccount;
import com.erp.domain.JournalEntry;
import com.erp.domain.Payslip;
import com.erp.domain.PayslipStatus;
import com.erp.domain.PayrollTransfer;
import com.erp.domain.PayrollTransferLine;
import com.erp.dto.PaySettingDtos.TransferRequest;
import com.erp.dto.PaySettingDtos.TransferResponse;
import com.erp.repository.BankAccountRepository;
import com.erp.repository.PayrollTransferRepository;
import com.erp.repository.PayslipRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 관리 > 급여이체.
 * 확정된 급여명세를 묶어 회사 계좌에서 실지급액을 내보내고, 그 자리에서 분개를 만든다.
 * 이미 이체된 명세는 다시 이체하지 않는다((payslip_id) 유니크 + 서비스 검증).
 */
@Service
@RequiredArgsConstructor
public class PayrollTransferService {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");

    private final PayrollTransferRepository transferRepository;
    private final PayslipRepository payslipRepository;
    private final BankAccountRepository bankAccountRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<TransferResponse> findAll() {
        return transferRepository.findAllWithRefs().stream().map(TransferResponse::from).toList();
    }

    /** 아직 이체하지 않은, 확정된 급여명세 (이체 화면의 대상 목록) */
    @Transactional(readOnly = true)
    public List<Long> transferredPayslipIds() {
        return transferRepository.findTransferredPayslipIds();
    }

    @Transactional
    public TransferResponse create(TransferRequest req, String username) {
        if (!MONTH.matcher(req.payMonth()).matches()) {
            throw ApiException.badRequest("귀속월 형식이 올바르지 않습니다(yyyy-MM): " + req.payMonth());
        }
        BankAccount account = bankAccountRepository.findById(req.bankAccountId())
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + req.bankAccountId()));

        Set<Long> alreadyTransferred = new HashSet<>(transferRepository.findTransferredPayslipIds());
        List<Payslip> candidates = payslipRepository.findByPayMonth(req.payMonth()).stream()
                .filter(p -> p.getStatus() == PayslipStatus.CONFIRMED)     // 확정된 명세만 이체한다
                .filter(p -> !alreadyTransferred.contains(p.getId()))
                .filter(p -> req.payslipIds() == null || req.payslipIds().isEmpty()
                        || req.payslipIds().contains(p.getId()))
                .toList();

        if (candidates.isEmpty()) {
            throw ApiException.badRequest(req.payMonth() + " 에 이체할 확정 급여명세가 없습니다"
                    + " (미확정이거나 이미 이체됨).");
        }

        LocalDate date = req.transferDate() != null ? req.transferDate() : LocalDate.now();
        BigDecimal totalPay = BigDecimal.ZERO;
        BigDecimal totalDeduction = BigDecimal.ZERO;
        BigDecimal netPay = BigDecimal.ZERO;

        PayrollTransfer t = PayrollTransfer.builder()
                .transferNo(docNoGenerator.next("PT-", "payroll_transfers", "transfer_no", "transfer_date", date))
                .payMonth(req.payMonth())
                .transferDate(date)
                .bankAccount(account)
                .totalPay(BigDecimal.ZERO)
                .totalDeduction(BigDecimal.ZERO)
                .netPay(BigDecimal.ZERO)
                .createdBy(username)
                .build();

        for (Payslip p : candidates) {
            // 지급총액 = 기본급 + 수당합 (비과세 수당도 실제로는 지급된다)
            BigDecimal gross = p.getBaseSalary().add(p.getAllowanceTotal());
            totalPay = totalPay.add(gross);
            totalDeduction = totalDeduction.add(p.getDeductionTotal());
            netPay = netPay.add(p.getNetPay());
            t.addLine(PayrollTransferLine.builder().payslip(p).netPay(p.getNetPay()).build());
        }
        t.setTotalPay(totalPay);
        t.setTotalDeduction(totalDeduction);
        t.setNetPay(netPay);

        JournalEntry entry = journalService.createFromPayrollTransfer(t);
        t.setJournalEntry(entry);
        transferRepository.save(t);

        // 계좌에서 실지급액이 나간다. 분개는 위에서 이미 만들었으므로 잔액·입출금 내역만 남긴다.
        bankCardService.recordExternal(account.getId(), false, netPay, date,
                "급여이체 " + t.getPayMonth() + " " + t.getTransferNo(), entry, username);

        return TransferResponse.from(t);
    }
}
