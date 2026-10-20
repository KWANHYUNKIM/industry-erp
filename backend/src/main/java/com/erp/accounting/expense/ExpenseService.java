package com.erp.accounting.expense;

import com.erp.accounting.account.AccountService;
import com.erp.accounting.journal.JournalService;
import com.erp.accounting.journal.JournalSourceType;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.account.Account;
import com.erp.trade.partner.BusinessPartner;
import com.erp.accounting.expense.dto.ExpenseDtos.CreateExpenseRequest;
import com.erp.accounting.expense.dto.ExpenseDtos.ExpenseResponse;
import com.erp.accounting.account.AccountRepository;
import com.erp.trade.partner.BusinessPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.expense.dto.ExpenseDtos;
import com.erp.inventory.project.ProjectService;
import com.erp.accounting.PaymentMethod;
import com.erp.accounting.fastvoucher.FastVoucherType;
import com.erp.accounting.fastvoucher.dto.FastVoucherDtos;

@Service
@RequiredArgsConstructor
public class ExpenseService {

    private final ProjectService projectService;

    private final ExpenseRepository expenseRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final AccountRepository accountRepository;
    private final AccountService accountService;
    private final BusinessPartnerRepository partnerRepository;
    /**
     * 지출은 저장과 함께 회계전표를 만든다. 예전엔 분개를 만드는 메서드(createFromExpense)가 있는데
     * 아무도 부르지 않아 지출 34건이 장부에 한 장도 없었다 — 판관비가 손익·재무제표에서 통째로 빠졌다(39회차).
     */
    private final JournalService journalService;
    private final com.erp.accounting.expenseitem.ExpenseItemService expenseItemService;
    private final com.erp.accounting.expensegroup.ExpenseGroupService expenseGroupService;
    private final com.erp.accounting.fastvoucher.FastVoucherService fastVoucherService;

    @Transactional(readOnly = true)
    public List<ExpenseResponse> findAll() {
        return expenseRepository.findAllWithAccount().stream()
                .map(ExpenseResponse::from)
                .toList();
    }

    @Transactional
    public ExpenseResponse create(CreateExpenseRequest req, String username) {
        LocalDate date = req.expenseDate() != null ? req.expenseDate() : LocalDate.now();
        Expense e = Expense.builder()
                .expenseDate(date)
                // 채번은 DocumentNoGenerator 로만 한다(count()+1 은 삭제·동시성에서 겹친다).
                .docNo(docNoGenerator.next("EX-", "expenses", "doc_no", "expense_date", date))
                .createdBy(username)
                .build();
        apply(e, req, date);
        Expense saved = expenseRepository.save(e);
        // 원본 비용내역입력(E060812, 2026-10-20 실측): 비용코드로 넣은 전표는 저장해도 회계전표가 없다 —
        // 개인비용만 전표별회계반영(E060814)에서 가지급금정산서로 분개한다. 계정만 주는 옛 요청은 그대로 즉시 분개.
        if (saved.getExpenseItem() == null) journalService.createFromExpense(saved);
        return ExpenseResponse.from(saved);
    }

    /**
     * 비용내역수정(E060813 [전표번호] → 창). 원본: 30,000 → 40,000 · 회사비용 → 개인비용 저장 가능.
     * 옛 지출(계정만)은 분개를 지우고 다시 만든다. 가지급금정산서로 회계반영된 전표는 정산서를 그대로 둔다(원본 못 잼 — 9장).
     */
    @Transactional
    public ExpenseResponse update(Long id, CreateExpenseRequest req) {
        Expense e = find(id);
        LocalDate date = req.expenseDate() != null ? req.expenseDate() : e.getExpenseDate();
        apply(e, req, date);
        if (e.getExpenseItem() == null) {
            journalService.deleteBySource(JournalSourceType.EXPENSE, id);
            expenseRepository.flush();
            journalService.createFromExpense(e);
        }
        return ExpenseResponse.from(e);
    }

    private void apply(Expense e, CreateExpenseRequest req, LocalDate date) {
        com.erp.accounting.expenseitem.ExpenseItem item =
                req.expenseItemId() != null ? expenseItemService.get(req.expenseItemId()) : null;
        Account account;
        if (item != null) {
            // 원본 사원 빈칸 저장 → 사원 칸 빨간 테두리(글 없음). 화면이 먼저 막고, 서버는 같은 뜻의 글로.
            if (req.employeeId() == null) throw ApiException.badRequest("사원: 자료를 입력 바랍니다.");
            if (item.getAccount() == null) throw ApiException.badRequest("비용 [" + item.getName() + "] 에 계정이 없습니다. 비용등록에서 계정을 입력 바랍니다.");
            account = item.getAccount();
        } else {
            if (req.accountId() == null) throw ApiException.badRequest("계정과목을 선택하세요.");
            account = accountService.getUsable(req.accountId());
        }
        e.setExpenseDate(date);
        e.setAccount(account);
        e.setExpenseItem(item);
        e.setEmployeeId(req.employeeId());
        e.setExpenseGroup(req.expenseGroupId() != null ? expenseGroupService.get(req.expenseGroupId()) : null);
        e.setContent(req.content());
        e.setPartnerName(req.partnerName());
        e.setPartner(matchPartner(req.partnerName()));
        e.setAmount(req.amount());
        e.setVatAmount(req.vatAmount() != null ? req.vatAmount() : java.math.BigDecimal.ZERO);
        e.setPaymentMethod(req.paymentMethod());
        e.setDepartment(req.department());
        e.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        e.setUseDate(req.useDate());
        e.setRemarks(req.remarks());
        // 원본 결제구분 기본은 회사비용 — 비용코드로 넣은 전표가 결제구분 없이 남지 않게.
        e.setPayType(req.payType() != null ? req.payType() : item != null ? ExpensePayType.COMPANY : null);
    }

    /**
     * 전표별회계반영(비용) E060814 → 가지급금정산서(회계 I 간편전표 E010505 와 같은 전표).
     * 원본(2026-10-20 loginaa): 개인비용 40,000 → 26/10/20-24 가지급금정산서 차 여비교통비(판) 40,000 / 대 가지급금(고준희) 40,000,
     * 적요는 비용내역 줄의 적요. 회사비용 줄이 섞이면 '결제구분이 개인비용인 전표를 선택 바랍니다.'
     */
    @Transactional
    public FastVoucherDtos.VoucherResponse settle(ExpenseDtos.SettleRequest req, String username) {
        List<FastVoucherDtos.LineInput> lines = new java.util.ArrayList<>();
        List<Expense> targets = new java.util.ArrayList<>();
        LocalDate date = req.voucherDate() != null ? req.voucherDate() : LocalDate.now();
        for (ExpenseDtos.SettleLine l : req.lines()) {
            Expense e = find(l.expenseId());
            if (e.getPayType() != ExpensePayType.PERSONAL) throw ApiException.badRequest("결제구분이 개인비용인 전표를 선택 바랍니다.");
            if (e.getExpenseItem() == null) throw ApiException.badRequest("비용코드로 입력한 비용내역만 회계반영할 수 있습니다. " + e.getDocNo());
            if (e.getSettledJournalId() != null) throw ApiException.badRequest("이미 회계반영된 전표입니다. " + e.getDocNo());
            lines.add(new FastVoucherDtos.LineInput(
                    e.getAccount().getId(), e.getAmount(), e.getContent(), null, null, null, e.getEmployeeId(), l.employeeName()));
            targets.add(e);
        }
        FastVoucherDtos.VoucherResponse v = fastVoucherService.create(new FastVoucherDtos.CreateVoucherRequest(
                FastVoucherType.ADVANCE_SETTLEMENT, date, PaymentMethod.CASH,
                null, null, null, lines, req.description(), null, null, null, null, null, null, null, null, null), username);
        targets.forEach(e -> e.setSettledJournalId(v.journalEntryId()));
        return v;
    }

    @Transactional
    public void delete(Long id, String username) {
        Expense e = find(id);
        // 원본: 회계반영된 비용내역을 지우면 그 가지급금정산서(회계전표)도 같이 사라진다(2026-10-20 실측).
        // 정산서 한 장이 여러 비용내역을 묶었으면 남은 비용내역은 회계반영 전으로 돌아간다(FK ON DELETE SET NULL).
        if (e.getSettledJournalId() != null) {
            Long journalId = e.getSettledJournalId();
            e.setSettledJournalId(null);
            expenseRepository.flush();
            fastVoucherService.delete(fastVoucherService.findByJournal(journalId).id(), username);
        }
        journalService.deleteBySource(JournalSourceType.EXPENSE, id);   // 지출을 지우면 그 분개도
        expenseRepository.delete(e);
    }

    @Transactional(readOnly = true)
    public ExpenseResponse get(Long id) {
        return ExpenseResponse.from(find(id));
    }

    private Expense find(Long id) {
        return expenseRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("지출 내역을 찾을 수 없습니다. id=" + id));
    }

    /**
     * 자유입력된 거래처명이 마스터와 정확히 일치할 때만 연결한다.
     * 일치하지 않으면 null 이다 — 마스터에 없는 상대에게도 돈은 나가고, 그 이름은 그대로 보존한다.
     * 부분일치로 엮으면 '한울'이 '한울ICT'에 붙는 식으로 엉뚱한 거래처가 달린다.
     */
    private BusinessPartner matchPartner(String name) {
        if (name == null || name.isBlank()) return null;
        return partnerRepository.findByName(name.trim()).orElse(null);
    }
}
