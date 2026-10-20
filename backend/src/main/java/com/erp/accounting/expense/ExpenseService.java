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

    // ── 비용내역입력 전표 한 장(머리 + 줄 여럿) ─────────────────────────────────────────────

    /**
     * 비용내역입력(E060812) [저장(F8)]. 원본(2026-10-20 loginaa): 개인비용 두 줄 20,000 + 15,000 → 전표 '2026/10/20 -2' 하나,
     * 조회 한 줄 '교통비(국내-자차) 외 1건 · 고준희 외 1건 · 35,000'. 저장해도 회계전표는 없다.
     * 줄마다 행 하나(expenses)를 두고 slip_doc_no 로 묶는다 — 첫 줄은 전표 번호 그대로, 둘째 줄부터 '번호-2' …
     */
    @Transactional
    public List<ExpenseResponse> createSlip(ExpenseDtos.SlipRequest req, String username) {
        LocalDate date = req.expenseDate() != null ? req.expenseDate() : LocalDate.now();
        String slip = docNoGenerator.next("EX-", "expenses", "doc_no", "expense_date", date);
        enforceControl(req, date, slip);
        List<Expense> rows = new java.util.ArrayList<>();
        for (int i = 0; i < req.lines().size(); i++) {
            Expense e = Expense.builder().expenseDate(date).createdBy(username)
                    .docNo(i == 0 ? slip : slip + "-" + (i + 1)).slipDocNo(slip).lineNo(i + 1).build();
            applySlip(e, req, req.lines().get(i), date);
            rows.add(expenseRepository.save(e));
        }
        return rows.stream().map(ExpenseResponse::from).toList();
    }

    /** 비용내역수정 창 [저장(F8)] — 그 전표의 줄을 통째로 바꾼다(줄 수가 늘거나 줄어도). 회계반영 뒤에도 원본은 고칠 수 있다(정산서는 그대로). */
    @Transactional
    public List<ExpenseResponse> updateSlip(Long id, ExpenseDtos.SlipRequest req) {
        Expense head = find(id);
        String slip = head.getSlipDocNo() != null ? head.getSlipDocNo() : head.getDocNo();
        List<Expense> old = expenseRepository.findSlip(slip);
        if (old.stream().anyMatch(x -> x.getExpenseItem() == null)) {
            throw ApiException.badRequest("비용코드로 입력한 비용내역만 이 창에서 고칠 수 있습니다.");
        }
        LocalDate date = req.expenseDate() != null ? req.expenseDate() : head.getExpenseDate();
        enforceControl(req, date, slip);
        Long settled = old.stream().map(Expense::getSettledJournalId).filter(java.util.Objects::nonNull).findFirst().orElse(null);
        // 줄 수가 줄면 뒤 줄을 지우고, 늘면 새 행을 더한다. 번호는 '전표-줄차례'.
        for (int i = req.lines().size(); i < old.size(); i++) expenseRepository.delete(old.get(i));
        expenseRepository.flush();
        List<Expense> rows = new java.util.ArrayList<>();
        for (int i = 0; i < req.lines().size(); i++) {
            Expense e = i < old.size() ? old.get(i) : Expense.builder().createdBy(head.getCreatedBy())
                    .docNo(slip + "-" + (i + 1)).slipDocNo(slip).lineNo(i + 1).settledJournalId(settled).build();
            e.setSlipDocNo(slip);
            e.setLineNo(i + 1);
            applySlip(e, req, req.lines().get(i), date);
            rows.add(expenseRepository.save(e));
        }
        return rows.stream().map(ExpenseResponse::from).toList();
    }

    private void applySlip(Expense e, ExpenseDtos.SlipRequest req, ExpenseDtos.SlipLine l, LocalDate date) {
        com.erp.accounting.expenseitem.ExpenseItem item = expenseItemService.get(l.expenseItemId());
        if (item.getAccount() == null) {
            throw ApiException.badRequest("비용 [" + item.getName() + "] 에 계정이 없습니다. 비용등록에서 계정을 입력 바랍니다.");
        }
        e.setExpenseDate(date);
        e.setAccount(item.getAccount());
        e.setExpenseItem(item);
        e.setEmployeeId(l.employeeId());
        e.setExpenseGroup(req.expenseGroupId() != null ? expenseGroupService.get(req.expenseGroupId()) : null);
        e.setPayType(req.payType() != null ? req.payType() : ExpensePayType.COMPANY);
        e.setRemarks(req.remarks());
        e.setBankAccountId(req.bankAccountId());
        e.setUseDate(l.useDate() != null ? l.useDate() : date);
        e.setPartnerName(l.partnerName());
        e.setPartner(matchPartner(l.partnerName()));
        e.setAmount(l.amount());
        e.setVatAmount(java.math.BigDecimal.ZERO);
        e.setContent(l.content());
        e.setDepartment(l.department());
        e.setProject(l.projectId() != null ? projectService.get(l.projectId()) : null);
        e.setAllocAmount(l.allocAmount());
        e.setAmount1(l.amount1());
        e.setAmount2(l.amount2());
        e.setMemo1(l.memo1());
        e.setMemo2(l.memo2());
        e.setMemo3(l.memo3());
    }

    /**
     * 비용통제(통제유형 E060808 · 비용 E060809). 원본 알림: '한도금액이 초과되었습니다. 전표를 저장하겠습니까?' [확인][취소] →
     * [취소] 면 창 '비용통제' 표 [비용코드 · 비용명 · 사용인원 · 사용자]. 인원통제 '사용' 인데 사용인원에 그 사원이 없으면 한도 안이어도 걸린다(실측).
     * 통제알림방식 '저장불가' 면 저장을 막는다(원본 문구 못 잼 — 같은 첫 줄로).
     */
    @Transactional(readOnly = true)
    public List<ExpenseDtos.ControlViolation> checkControl(ExpenseDtos.SlipRequest req, Long editingId) {
        LocalDate date = req.expenseDate() != null ? req.expenseDate() : LocalDate.now();
        String exclude = "";
        if (editingId != null) {
            Expense head = find(editingId);
            exclude = head.getSlipDocNo() != null ? head.getSlipDocNo() : head.getDocNo();
        }
        return controlViolations(req, date, exclude);
    }

    private void enforceControl(ExpenseDtos.SlipRequest req, LocalDate date, String slip) {
        List<ExpenseDtos.ControlViolation> v = controlViolations(req, date, slip);
        if (v.isEmpty()) return;
        if (v.stream().anyMatch(ExpenseDtos.ControlViolation::block)) throw ApiException.badRequest("한도금액이 초과되었습니다.");
        if (!Boolean.TRUE.equals(req.confirmOverLimit())) throw ApiException.badRequest("한도금액이 초과되었습니다. 전표를 저장하겠습니까?");
    }

    private List<ExpenseDtos.ControlViolation> controlViolations(ExpenseDtos.SlipRequest req, LocalDate date, String exclude) {
        List<ExpenseDtos.ControlViolation> out = new java.util.ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (ExpenseDtos.SlipLine l : req.lines()) {
            if (l.expenseItemId() == null) continue;
            var item = expenseItemService.get(l.expenseItemId());
            var ct = item.getControlType();
            if (ct == null || !ct.isActive() || ct.getNoticeType() == com.erp.accounting.expensecontrol.ExpenseNoticeType.NONE) continue;
            boolean block = ct.getNoticeType() == com.erp.accounting.expensecontrol.ExpenseNoticeType.BLOCK;
            if (ct.isPersonControl() && l.employeeId() != null && !item.getEmployeeIds().contains(l.employeeId())
                    && seen.add("P" + item.getId() + ":" + l.employeeId())) {
                out.add(new ExpenseDtos.ControlViolation("사용인원 체크", item.getCode(), item.getName(),
                        List.copyOf(item.getEmployeeIds()), l.employeeId(), item.getLimitAmount(), null, block));
            }
            java.math.BigDecimal limit = item.getLimitAmount();
            if (limit == null || limit.signum() <= 0) continue;
            boolean perPerson = ct.getLimitType() != com.erp.accounting.expensecontrol.ExpenseLimitType.TOTAL;
            Long emp = perPerson ? l.employeeId() : null;
            if (!seen.add("L" + item.getId() + ":" + emp)) continue;
            LocalDate use = l.useDate() != null ? l.useDate() : date;
            LocalDate[] range = periodOf(ct.getPeriodType(), use);
            java.math.BigDecimal now = req.lines().stream()
                    .filter(x -> item.getId().equals(x.expenseItemId()) && (emp == null || emp.equals(x.employeeId())) && x.amount() != null)
                    .map(ExpenseDtos.SlipLine::amount).reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
            java.math.BigDecimal used = range == null ? java.math.BigDecimal.ZERO
                    : expenseRepository.sumUsed(item.getId(), range[0], range[1], emp != null ? emp : 0L, exclude);
            if (used.add(now).compareTo(limit) > 0) {
                out.add(new ExpenseDtos.ControlViolation("한도 체크", item.getCode(), item.getName(),
                        List.copyOf(item.getEmployeeIds()), emp, limit, used.add(now), block));
            }
        }
        return out;
    }

    /** 통제 [기간] → 누적 기간. 매회반복 · 지정기간은 이 전표만 본다(지정기간 날짜 칸은 못 잼). */
    private static LocalDate[] periodOf(com.erp.accounting.expensecontrol.ExpensePeriodType t, LocalDate d) {
        if (t == null) return null;
        return switch (t) {
            case DAILY -> new LocalDate[]{d, d};
            case WEEKLY -> new LocalDate[]{d.with(java.time.DayOfWeek.MONDAY), d.with(java.time.DayOfWeek.SUNDAY)};
            case MONTHLY -> new LocalDate[]{d.withDayOfMonth(1), d.withDayOfMonth(d.lengthOfMonth())};
            case YEARLY -> new LocalDate[]{d.withDayOfYear(1), d.withDayOfYear(d.lengthOfYear())};
            case EACH, DESIGNATED -> null;
        };
    }

    /**
     * 삭제 — 비용내역 전표 한 장(줄 전부)을 지운다. 원본 수정 창 [삭제] '전표를 삭제하겠습니까?' → 두 줄 전표가 통째로 사라진다(2026-10-20).
     * 옛 지출(전표 묶음 없음)은 그 행 하나.
     */
    @Transactional
    public void delete(Long id, String username) {
        Expense head = find(id);
        List<Expense> slip = head.getSlipDocNo() != null ? expenseRepository.findSlip(head.getSlipDocNo()) : List.of(head);
        // 한 정산서가 여러 줄을 묶었으니 정산서는 한 번만 지운다.
        java.util.Set<Long> journals = new java.util.LinkedHashSet<>();
        for (Expense e : slip) {
            if (e.getSettledJournalId() != null) journals.add(e.getSettledJournalId());
            e.setSettledJournalId(null);
        }
        expenseRepository.flush();
        for (Long j : journals) fastVoucherService.delete(fastVoucherService.findByJournal(j).id(), username);
        for (Expense e : slip) deleteRow(e, username);
    }

    private void deleteRow(Expense e, String username) {
        Long id = e.getId();
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
