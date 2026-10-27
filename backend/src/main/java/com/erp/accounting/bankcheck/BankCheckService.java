package com.erp.accounting.bankcheck;

import com.erp.accounting.StandardAccounts;
import com.erp.accounting.bankcard.BankCardService;
import com.erp.accounting.journal.JournalService;
import com.erp.common.ApiException;
import com.erp.accounting.bankcard.BankAccount;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalEntryRepository;
import com.erp.accounting.journal.JournalSourceType;
import com.erp.accounting.bankcheck.dto.BankCheckDtos.CheckResponse;
import com.erp.accounting.bankcheck.dto.BankCheckDtos.CreateCheckRequest;
import com.erp.accounting.bankcheck.dto.BankCheckDtos.DepositRequest;
import com.erp.accounting.bankcheck.dto.BankCheckDtos.SettleRequest;
import com.erp.accounting.bankcard.BankAccountRepository;
import com.erp.trade.partner.BusinessPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.bankcheck.dto.BankCheckDtos;

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
    private final JournalEntryRepository journalRepository;
    private final BankCardService bankCardService;
    private final com.erp.accounting.fastvoucher.FastVoucherService fastVoucherService;
    private final com.erp.accounting.fastvoucher.FastVoucherRepository fastVoucherRepository;
    private final com.erp.accounting.account.AccountRepository accountRepository;
    private final com.erp.inventory.project.ProjectService projectService;
    private final com.erp.common.history.ChangeHistoryService changeHistory;

    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager em;

    @Transactional(readOnly = true)
    public List<CheckResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 안 주면 <b>넓은 경계</b>로 채운다 —
     * <code>:from is null or …</code> 로 쓰면 PostgreSQL 이 파라미터 타입을 못 정해
     * 42P18 로 터진다(기타이동 기간 조건에서 겪은 함정이다).
     */
    @Transactional(readOnly = true)
    public List<CheckResponse> findAll(java.time.LocalDate from, java.time.LocalDate to) {
        List<BankCheck> checks = checkRepository.findAllWithRefs(
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31));
        /*
         * 원본 수령수표증가 · 감소현황의 [일자-No.] — 받을 때 분개(source_id = 수표)와 손을 떠날 때 분개(settle_journal_id)의 번호.
         * 한 번에 모아 찾는다(수표마다 따로 찾으면 N+1).
         */
        java.util.Map<Long, String> issueNo = new java.util.HashMap<>();
        java.util.List<Long> ids = checks.stream().map(BankCheck::getId).toList();
        if (!ids.isEmpty()) {
            for (JournalEntry j : journalRepository.findBySourceTypeAndSourceIdIn(JournalSourceType.CHECK, ids)) {
                issueNo.putIfAbsent(j.getSourceId(), j.getDocNo());
            }
        }
        /* 채권(채무)감소의 입금보고서(지출결의서)로 늘어난 수표 — 증가 줄 [회계전표일자-No.] 는 그 전표(조회 쿼리가 함께 가져온다). */
        for (BankCheck c : checks) {
            if (c.getSourceVoucher() != null && c.getSourceVoucher().getJournalEntry() != null) {
                issueNo.put(c.getId(), c.getSourceVoucher().getJournalEntry().getDocNo());
            }
        }
        java.util.List<Long> settleIds = checks.stream().map(BankCheck::getSettleJournalId).filter(java.util.Objects::nonNull).toList();
        java.util.Map<Long, String> settleNo = new java.util.HashMap<>();
        java.util.Set<Long> byVoucher = new java.util.HashSet<>();
        for (JournalEntry j : journalRepository.findAllById(settleIds)) {
            settleNo.put(j.getId(), j.getDocNo());
            if (j.getSourceType() == JournalSourceType.VOUCHER) byVoucher.add(j.getId());
        }
        return checks.stream()
                .map((c) -> CheckResponse.from(c, issueNo.get(c.getId()),
                        c.getSettleJournalId() != null ? settleNo.get(c.getSettleJournalId()) : null,
                        c.getSettleJournalId() != null && byVoucher.contains(c.getSettleJournalId())))
                .toList();
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
                .updatedBy(username)
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
        requireJournaled(c);

        BankAccount account = bankAccount(req.bankAccountId());
        LocalDate date = req.depositDate() != null ? req.depositDate() : LocalDate.now();
        requireNotBeforeIssue(c, date, "입금일");
        c.setBankAccount(account);
        c.setStatus(CheckStatus.DEPOSITED);
        c.setUpdatedBy(username);
        c.setSettledDate(date);

        JournalEntry entry = journalService.createFromCheckDeposit(c, date, username);
        c.setSettleJournalId(entry.getId());
        bankCardService.recordExternal(account.getId(), true, c.getAmount(), date,
                "수표 입금 " + c.getCheckNo(), entry, username);
        return CheckResponse.from(c);
    }

    /**
     * 원본 수령수표입금처리(E060602) [입금보고서작성] → 입금보고서 [저장] (2026-10-13 loginaa 실측).
     * QA2C701 70,000(수표만증가 · 수표계좌 기업은행-1122) → 입금계좌 외환은행-2211 → 입금보고서 한 줄
     * [돈 들어온 계좌 5544332211 외환은행-2211 · 계정코드(대변) 1039 보통예금(수표계좌의 계정) · 거래처 1122334455 기업은행-1122 · 70,000 · 적요 QA회계2 · 추가정보 수령수표 QA2C701]
     * → 회계전표 2026/10/13 -22, 수령수표조회에 감소 줄 '2026/10/13 -12 · 거래유형 입금보고서' (수표 전표 번호도 하나 받는다), 입금처리 목록에서 빠진다.
     * 입금보고서를 지우면('전표를 삭제하겠습니까?') 감소 줄이 사라지고 수표는 다시 보유 — 그 되돌림은 회계전표가 지워질 때
     * DB 트리거(bank_checks_release_settle_journal)가 한다. 입금보고서는 회계 I 전표라 그쪽 삭제 경로가 수표를 모르기 때문이다.
     *
     * <p>대변 계정은 분개로 받은 수표면 받을수표(104), 수표내역입력으로 넣은 수표면 그 수표계좌의 계정이다(원본은 수표계좌를 거래처 칸에 찍는다 —
     * 우리 분개 줄 거래처는 수표의 거래처다).
     */
    @Transactional
    public List<CheckResponse> depositReport(BankCheckDtos.DepositReportRequest req, String username) {
        return settleByVoucher(CheckType.RECEIVED, req, username);
    }

    /**
     * 원본 발행수표출금처리(E060606) [지출결의서작성] → 지출결의서 [저장] (2026-10-14 loginaa 실측) — 수령수표입금처리의 거울.
     * 26101401562790400001 40,000(수표만증가 · 수표계좌 기업은행-1122 · 거래처 김치좋아) → 돈나간계좌번호 외환은행-2211 → 지출결의서 한 줄
     * [돈 나간 계좌 5544332211 외환은행-2211 · 계정코드(차변) 1039 보통예금(수표계좌의 계정) · 거래처 1122334455 기업은행-1122 · 40,000 · 적요 QA회계2 발행 · 추가정보 발행수표 …]
     * → 회계전표 2026/10/14 -4, 발행수표조회에 감소 줄 '2026/10/14 -2 · 거래유형 지출결의서'(체크칸 막힘), 출금처리 목록에서 빠진다.
     * 지출결의서를 지우면 V392 트리거가 수표를 보유로 되돌린다(발행수표는 수표계좌를 그대로 둔다).
     *
     * <p>차변 계정은 수표계좌의 계정이다(발행수표는 늘 수표계좌가 있다).
     */
    @Transactional
    public List<CheckResponse> withdrawReport(BankCheckDtos.DepositReportRequest req, String username) {
        return settleByVoucher(CheckType.ISSUED, req, username);
    }

    /** 입금보고서(받은수표) · 지출결의서(발행수표) 한 장으로 고른 수표를 줄인다. */
    private List<CheckResponse> settleByVoucher(CheckType type, BankCheckDtos.DepositReportRequest req, String username) {
        boolean received = type == CheckType.RECEIVED;
        boolean cash = Boolean.TRUE.equals(req.cash()) || req.bankAccountId() == null;
        List<BankCheck> checks = new java.util.ArrayList<>();
        List<com.erp.accounting.fastvoucher.dto.FastVoucherDtos.LineInput> vLines = new java.util.ArrayList<>();
        for (BankCheckDtos.DepositReportLine l : req.lines()) {
            BankCheck c = check(l.checkId());
            requireType(c, type, received ? "받은수표만 입금할 수 있습니다" : "발행수표만 출금할 수 있습니다");
            requireHeld(c, received ? "입금" : "출금");
            requireNotBeforeIssue(c, req.date(), "일자");
            Long account = (!received || c.isDirectEntry()) && c.getBankAccount() != null && c.getBankAccount().getGlAccount() != null
                    ? c.getBankAccount().getGlAccount().getId()
                    : received ? accountRepository.findByCode(StandardAccounts.CHECK_RECEIVABLE)
                        .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: 104")).getId()
                    : null;
            if (account == null) throw ApiException.badRequest(c.getCheckNo() + " 의 수표계좌에 계정이 없습니다.");
            String memo = l.memo() == null || l.memo().isBlank() ? null : l.memo().trim();
            vLines.add(new com.erp.accounting.fastvoucher.dto.FastVoucherDtos.LineInput(
                    account, c.getAmount(), memo, cash ? null : req.bankAccountId(), cash ? Boolean.TRUE : null,
                    c.getPartner() != null ? c.getPartner().getId() : null, null, null));
            checks.add(c);
        }
        var v = fastVoucherService.create(new com.erp.accounting.fastvoucher.dto.FastVoucherDtos.CreateVoucherRequest(
                received ? com.erp.accounting.fastvoucher.FastVoucherType.DEPOSIT_REPORT : com.erp.accounting.fastvoucher.FastVoucherType.EXPENSE_REPORT,
                req.date(), com.erp.accounting.PaymentMethod.CASH,
                null, null, null, vLines, req.description() == null || req.description().isBlank() ? null : req.description().trim(),
                null, null, null, null, null, null, null, null, null), username);
        JournalEntry entry = fastVoucherRepository.findById(v.id()).map(com.erp.accounting.fastvoucher.FastVoucher::getJournalEntry)
                .orElseThrow(() -> ApiException.notFound((received ? "입금보고서" : "지출결의서") + "를 찾을 수 없습니다. id=" + v.id()));
        int entryNo = nextEntryNo(type, req.date());
        BankAccount into = cash ? null : bankAccount(req.bankAccountId());
        List<CheckResponse> out = new java.util.ArrayList<>();
        for (BankCheck c : checks) {
            if (received && !c.isDirectEntry()) c.setBankAccount(into);
            c.setStatus(received ? CheckStatus.DEPOSITED : CheckStatus.PAID);
            c.setSettledDate(req.date());
            c.setSettleJournalId(entry.getId());
            c.setDirectOutNo(entryNo);
            c.setUpdatedBy(username);
            out.add(CheckResponse.from(c, null, entry.getDocNo(), true));
        }
        return out;
    }

    /**
     * 채권감소등록 [입금보고서작성] 수금형태 '수표' → 수표번호입력 → 입금보고서 [저장](채무감소등록 [지출결의서작성] 지급형태 '수표'가 거울) —
     * 2026-10-14 loginaa 실측: 김치좋아 채권 98,000 · 입금계좌 1122334455 기업은행-1122 · 생성방식 자동생성 '26101403162966200001' →
     * 입금보고서 2026/10/14 -9 [돈 들어온 계좌 기업은행-1122 · 계정코드(대변) 1089 외상매출금 · 김치좋아 · 98,000 · 추가정보 '채권 …, 수령수표 …']
     * 와 함께 수령수표조회에 증가 줄 '2026/10/14 -5 · 증가 · 김치좋아 · 98,000 · 거래유형 입금보고서 · 2026/10/14 -9'(체크칸 막힘),
     * 수령수표입금처리 목록에 '계정명 보통예금 · 수령수표계좌명 기업은행-1122'. 입금보고서를 지우면 수표도 사라진다.
     * 채무 쪽: 도서출판책사 1,800,000 → 지출결의서 2026/10/14 -10 · 발행수표조회 '2026/10/14 -3 · 증가 · 도서출판책사 · 지출결의서'.
     *
     * <p>입금보고서의 돈 들어온 계좌가 수표계좌다 — 돈이 그 계좌 계정으로 이미 잡혔으므로 수표내역입력 수표처럼(directEntry) 수표계좌 기준이다.
     * 수표 전표 번호(원본 [일자] '-5')는 전표 한 장에 하나.
     */
    @Transactional
    public List<CheckResponse> createFromVoucher(CheckType type, LocalDate date, Long bankAccountId, Long voucherId,
                                                 List<VoucherCheckLine> lines, String username) {
        if (bankAccountId == null) {
            throw ApiException.badRequest((type == CheckType.RECEIVED ? "입금계좌" : "출금계좌") + "를 입력 바랍니다.");
        }
        BankAccount account = bankAccount(bankAccountId);
        var voucher = fastVoucherRepository.getReferenceById(voucherId);
        int entryNo = nextEntryNo(type, date);
        List<CheckResponse> out = new java.util.ArrayList<>();
        for (VoucherCheckLine l : lines) {
            String no = l.checkNo().trim();
            if (checkRepository.existsByCheckNo(no)) {
                throw ApiException.conflict("이미 등록된 수표번호입니다: " + no);
            }
            BankCheck c = checkRepository.save(BankCheck.builder()
                    .checkNo(no).type(type).status(CheckStatus.HELD)
                    .issueDate(date).amount(l.amount())
                    .partner(l.partnerId() == null ? null : partnerRepository.findById(l.partnerId())
                            .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + l.partnerId())))
                    .bankAccount(account).remark(l.memo())
                    .departmentId(l.departmentId()).project(project(l.projectId()))
                    .createdBy(username).updatedBy(username).directEntry(true).directInNo(entryNo)
                    .sourceVoucher(voucher)
                    .build());
            out.add(CheckResponse.from(c));
        }
        return out;
    }

    /** 입금보고서(지출결의서) 한 줄이 늘리는 수표. */
    public record VoucherCheckLine(String checkNo, java.math.BigDecimal amount, Long partnerId,
                                   Long departmentId, Long projectId, String memo) {}

    /** 받은수표 부도 — 현금은 움직이지 않고 채권으로 되돌린다 */
    @Transactional
    public CheckResponse dishonor(Long id, SettleRequest req, String username) {
        BankCheck c = check(id);
        requireType(c, CheckType.RECEIVED, "받은수표만 부도 처리할 수 있습니다");
        requireHeld(c, "부도");
        requireJournaled(c);

        LocalDate date = req != null && req.settledDate() != null ? req.settledDate() : LocalDate.now();
        requireNotBeforeIssue(c, date, "부도일");
        c.setStatus(CheckStatus.DISHONORED);
        c.setUpdatedBy(username);
        c.setSettledDate(date);
        c.setSettleJournalId(journalService.createFromCheckDishonor(c, date, username).getId());
        return CheckResponse.from(c);
    }

    /**
     * 발행수표가 은행에서 인출됐음을 확인. 회계는 발행 시 이미 반영됐으므로 상태만 바꾼다.
     */
    @Transactional
    public CheckResponse settle(Long id, SettleRequest req, String username) {
        BankCheck c = check(id);
        requireType(c, CheckType.ISSUED, "발행수표만 결제 확인할 수 있습니다");
        requireHeld(c, "결제 확인");

        LocalDate date = req != null && req.settledDate() != null ? req.settledDate() : LocalDate.now();
        requireNotBeforeIssue(c, date, "결제일");
        c.setStatus(CheckStatus.PAID);
        c.setUpdatedBy(username);
        c.setSettledDate(date);
        return CheckResponse.from(c);
    }

    /**
     * 원본 수령(발행)수표내역입력(수표조회의 [신규(F2)]) — 분개 없이 수표만 늘리거나 줄인다(2026-10-13 loginaa 실측: 거래유형 '수표만증가' · '수표만감소',
     * [회계전표일자-No.] 빈칸). 증가는 줄마다 보유 수표를 하나 만들고, 감소는 같은 번호의 보유 수표를 손을 떠난 것으로 바꾼다
     * (받은수표는 입금완료, 발행수표는 결제완료 자리). 분개로 받은 수표를 분개 없이 줄이면 받을수표 잔액만 남아 장부가 어긋나므로
     * 감소는 이 창으로 넣은 수표에만 받는다.
     */
    @Transactional
    public List<CheckResponse> directEntry(BankCheckDtos.DirectEntryRequest req, String username) {
        BankAccount account = bankAccount(req.bankAccountId());
        var partner = req.partnerId() == null ? null : partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        List<CheckResponse> out = new java.util.ArrayList<>();
        int entryNo = nextEntryNo(req.type(), req.date());
        for (BankCheckDtos.DirectLine line : req.lines()) {
            String no = line.checkNo().trim();
            if (req.increase()) {
                if (checkRepository.existsByCheckNo(no)) {
                    throw ApiException.conflict("이미 등록된 수표번호입니다: " + no);
                }
                BankCheck c = BankCheck.builder()
                        .checkNo(no).type(req.type()).status(CheckStatus.HELD)
                        .issueDate(req.date()).amount(line.amount())
                        .partner(partner).bankAccount(account).remark(line.remark())
                        .departmentId(line.departmentId()).project(project(line.projectId()))
                        .createdBy(username).updatedBy(username).directEntry(true).directInNo(entryNo)
                        .build();
                out.add(CheckResponse.from(checkRepository.save(c)));
            } else {
                out.add(CheckResponse.from(decreaseDirect(req.type(), no, req.date(), entryNo, line.remark(), username)));
            }
        }
        changeHistory.record(historyTarget(req.type(), req.increase()), historyId(req.date(), entryNo), com.erp.common.history.ChangeHistoryService.CREATED);
        return out;
    }

    /**
     * 수표조회 [일자-No.] 링크로 연 수표내역입력 전표를 고쳐 저장한다(2026-10-13 loginaa 실측: 전표일자 · 전표구분은 막히고
     * 거래처 · 수표계좌 · 줄의 수표번호 · 금액 · 적요를 고친다. 저장해도 번호(-10)는 그대로).
     * 증가 전표: 남은 줄은 고치고, 새 줄은 같은 번호로 수표를 더하고, 빠진 수표는 지운다(감소가 있으면 그 감소부터 취소 — [선택삭제]와 같다).
     * 감소 전표: 수표 한 장의 금액 · 적요는 증가 쪽 것이라 그대로 두고, 새 줄은 같은 번호로 줄이고, 빠진 줄은 감소를 취소한다.
     */
    @Transactional
    public List<CheckResponse> updateDirect(BankCheckDtos.DirectEditRequest req, String username) {
        List<BankCheck> current = req.increase()
                ? checkRepository.findByTypeAndIssueDateAndDirectInNoOrderByIdAsc(req.type(), req.date(), req.entryNo())
                : checkRepository.findByTypeAndSettledDateAndDirectOutNoOrderByIdAsc(req.type(), req.date(), req.entryNo());
        if (current.isEmpty()) {
            throw ApiException.notFound("전표를 찾을 수 없습니다: " + req.date() + " -" + req.entryNo());
        }
        requireNotFromVoucher(current.get(0));
        java.util.Set<Long> mine = current.stream().map(BankCheck::getId).collect(java.util.stream.Collectors.toSet());
        java.util.Set<Long> kept = new java.util.HashSet<>();
        for (BankCheckDtos.DirectEditLine l : req.lines()) {
            if (l.id() == null) continue;
            if (!mine.contains(l.id())) throw ApiException.badRequest("이 전표의 줄이 아닙니다. id=" + l.id());
            kept.add(l.id());
        }
        List<Long> dropped = current.stream().map(BankCheck::getId).filter((id) -> !kept.contains(id)).toList();
        if (!dropped.isEmpty()) {
            removeMoves(req.increase() ? List.of() : dropped, req.increase() ? dropped : List.of(), username);
        }

        BankAccount account = bankAccount(req.bankAccountId());
        var partner = req.partnerId() == null ? null : partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        List<CheckResponse> out = new java.util.ArrayList<>();
        for (BankCheckDtos.DirectEditLine l : req.lines()) {
            String no = l.checkNo().trim();
            if (!req.increase()) {
                BankCheck d;
                if (l.id() != null) {
                    d = check(l.id());
                    d.setOutRemark(blankToNull(l.remark()));
                    d.setUpdatedBy(username);
                } else {
                    d = decreaseDirect(req.type(), no, req.date(), req.entryNo(), l.remark(), username);
                }
                out.add(CheckResponse.from(d));
                continue;
            }
            BankCheck c;
            if (l.id() != null) {
                c = check(l.id());
                if (!c.getCheckNo().equals(no) && checkRepository.existsByCheckNo(no)) {
                    throw ApiException.conflict("이미 등록된 수표번호입니다: " + no);
                }
                c.setCheckNo(no);
                c.setAmount(l.amount());
                c.setRemark(l.remark());
                c.setDepartmentId(l.departmentId());
                c.setProject(project(l.projectId()));
                c.setPartner(partner);
                c.setBankAccount(account);
                c.setUpdatedBy(username);
            } else {
                if (checkRepository.existsByCheckNo(no)) {
                    throw ApiException.conflict("이미 등록된 수표번호입니다: " + no);
                }
                c = checkRepository.save(BankCheck.builder()
                        .checkNo(no).type(req.type()).status(CheckStatus.HELD)
                        .issueDate(req.date()).amount(l.amount())
                        .partner(partner).bankAccount(account).remark(l.remark())
                        .departmentId(l.departmentId()).project(project(l.projectId()))
                        .createdBy(username).updatedBy(username).directEntry(true).directInNo(req.entryNo())
                        .build());
            }
            out.add(CheckResponse.from(c));
        }
        changeHistory.record(historyTarget(req.type(), req.increase()), historyId(req.date(), req.entryNo()), com.erp.common.history.ChangeHistoryService.UPDATED);
        return out;
    }

    /** 수표내역입력 감소 한 줄 — 같은 번호의 보유 수표를 손을 떠난 것으로(받은수표는 입금완료, 발행수표는 결제완료 자리). */
    private BankCheck decreaseDirect(CheckType type, String no, LocalDate date, int entryNo, String remark, String username) {
        BankCheck c = checkRepository.findByCheckNo(no)
                .orElseThrow(() -> ApiException.notFound("수표를 찾을 수 없습니다: " + no));
        requireType(c, type, (type == CheckType.RECEIVED ? "수령" : "발행") + "수표만 줄일 수 있습니다");
        requireHeld(c, "감소");
        if (!c.isDirectEntry()) {
            throw ApiException.badRequest(no + " 은(는) 회계전표로 받은 수표입니다 — 수표관리에서 입금 · 부도(결제) 처리하세요.");
        }
        requireNotBeforeIssue(c, date, "전표일자");
        c.setStatus(type == CheckType.RECEIVED ? CheckStatus.DEPOSITED : CheckStatus.PAID);
        c.setSettledDate(date);
        c.setDirectOutNo(entryNo);
        c.setOutRemark(blankToNull(remark));
        c.setUpdatedBy(username);
        return c;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /**
     * 원본 수령(발행)수표조회 [선택삭제] — 한 줄은 수표의 <b>움직임</b>이라 감소 줄과 증가 줄을 따로 지운다(2026-10-13 loginaa 실측).
     *
     * <p><b>감소 줄</b>(입금완료 · 부도 · 결제완료)을 지우면 수표가 다시 보유로 돌아온다 — 입금 분개를 지우고
     * 계좌에 들어간 돈은 반대 내역으로 빼낸다(계좌간이동을 지울 때와 같은 방식). 부도 분개도 지운다.
     * <b>증가 줄</b>(수령 · 발행)을 지우면 수표가 사라진다 — 받을 때(끊을 때) 분개를 지우고, 발행수표는 빠진 예금을 되돌린다.
     * 원본은 감소 줄이 남은 수표의 증가 줄도 막지 않고 지운다(감소 줄만 홀로 남는다). 우리 수표는 증가 · 감소가 한 장이라
     * 감소만 남길 수 없어, 그 감소를 먼저 취소하고 수표를 지운다.
     */
    @Transactional
    public void deleteMoves(List<Long> decreaseIds, List<Long> increaseIds, String username) {
        /* 지우는 수표내역입력 전표마다 이력 '삭제' 한 줄(원본 [H] 는 전표 한 장의 이력이다). 지우기 전에 번호를 모은다. */
        java.util.Set<String> vouchers = new java.util.LinkedHashSet<>();
        for (Long id : decreaseIds == null ? List.<Long>of() : decreaseIds) {
            BankCheck c = check(id);
            if (c.getDirectOutNo() != null && c.getSettledDate() != null && c.getSettleJournalId() == null) {
                vouchers.add(historyTarget(c.getType(), false) + "|" + historyId(c.getSettledDate(), c.getDirectOutNo()));
            }
        }
        for (Long id : increaseIds == null ? List.<Long>of() : increaseIds) {
            BankCheck c = check(id);
            if (c.getDirectInNo() != null) vouchers.add(historyTarget(c.getType(), true) + "|" + historyId(c.getIssueDate(), c.getDirectInNo()));
        }
        removeMoves(decreaseIds, increaseIds, username);
        for (String v : vouchers) {
            String[] p = v.split("\\|");
            changeHistory.record(p[0], Long.valueOf(p[1]), com.erp.common.history.ChangeHistoryService.DELETED);
        }
    }

    private void removeMoves(List<Long> decreaseIds, List<Long> increaseIds, String username) {
        java.util.Set<Long> inc = new java.util.LinkedHashSet<>(increaseIds == null ? List.of() : increaseIds);
        java.util.Set<Long> dec = new java.util.LinkedHashSet<>(decreaseIds == null ? List.of() : decreaseIds);
        for (Long id : inc) {
            requireNotFromVoucher(check(id));
            if (check(id).getStatus() != CheckStatus.HELD) dec.add(id);
        }
        for (Long id : dec) {
            BankCheck c = check(id);
            if (c.getStatus() == CheckStatus.HELD) {
                throw ApiException.badRequest(c.getCheckNo() + " 은(는) 감소 내역이 없습니다.");
            }
            /* 원본: 입금보고서로 줄인 감소 줄은 체크칸이 막혀 있다 — 입금보고서(회계전표)를 지우면 함께 사라진다. */
            if (c.getSettleJournalId() != null && journalRepository.findById(c.getSettleJournalId())
                    .map((j) -> j.getSourceType() == JournalSourceType.VOUCHER).orElse(false)) {
                String doc = c.getType() == CheckType.RECEIVED ? "입금보고서" : "지출결의서";
                throw ApiException.badRequest(c.getCheckNo() + " 은(는) " + doc + "로 감소한 수표입니다 — " + doc + "에서 삭제하세요.");
            }
            if (c.getSettleJournalId() != null) {
                JournalEntry e = journalRepository.findById(c.getSettleJournalId()).orElse(null);
                if (c.getStatus() == CheckStatus.DEPOSITED) {
                    bankCardService.reverseExternal(e, "수표 입금 취소 " + c.getCheckNo(), username);
                }
                journalService.deleteEntry(e);
            }
            if (c.getType() == CheckType.RECEIVED && !c.isDirectEntry()) c.setBankAccount(null);
            c.setStatus(CheckStatus.HELD);
            c.setSettledDate(null);
            c.setSettleJournalId(null);
            c.setDirectOutNo(null);
            c.setOutRemark(null);
            c.setUpdatedBy(username);
        }
        for (Long id : inc) {
            BankCheck c = check(id);
            JournalEntry e = journalRepository.findBySourceTypeAndSourceIdIn(JournalSourceType.CHECK, List.of(c.getId()))
                    .stream().findFirst().orElse(null);
            if (c.getType() == CheckType.ISSUED) {
                bankCardService.reverseExternal(e, "수표 발행 취소 " + c.getCheckNo(), username);
            }
            journalService.deleteEntry(e);
            checkRepository.delete(c);
        }
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    /**
     * 원본 수표내역입력(수정) 창의 [H] — 이력은 수표가 아니라 <b>전표 한 장</b>(머리 '[2026/10/14 -4]')의 것이다(2026-10-14 loginaa 실측:
     * 저장 → '신규', 고쳐 저장 → '수정'). 대상 이름은 (수표 종류, 증가/감소) 마다 하나, id 는 날짜와 번호를 이은 수(20261014 0004).
     * 한 번 정하면 바꾸지 않는다(이미 적힌 이력과 묶이는 열쇠다). 화면(CheckDirectEntryModal)이 같은 규칙으로 부른다.
     */
    public static String historyTarget(CheckType type, boolean increase) {
        return "CHECK_ENTRY_" + (type == CheckType.RECEIVED ? "R" : "I") + (increase ? "_IN" : "_OUT");
    }

    public static long historyId(LocalDate date, int entryNo) {
        return (date.getYear() * 10000L + date.getMonthValue() * 100L + date.getDayOfMonth()) * 10000L + entryNo;
    }

    private com.erp.inventory.project.Project project(Long id) {
        return id == null ? null : projectService.get(id);
    }

    /**
     * 수표내역입력 전표 번호 — (수표 종류, 날짜) 마다 1 부터, 지운 번호는 다시 주지 않는다(원본 실측: -1 ~ -4 를 지운 뒤 -5).
     * upsert 한 줄이 행 잠금으로 동시 저장을 줄 세운다.
     */
    private int nextEntryNo(CheckType type, LocalDate date) {
        Object n = em.createNativeQuery(
                        "insert into check_entry_counters (check_type, entry_date, last_no) values (:t, :d, 1)"
                                + " on conflict (check_type, entry_date) do update set last_no = check_entry_counters.last_no + 1"
                                + " returning last_no")
                .setParameter("t", type.name())
                .setParameter("d", date)
                .getSingleResult();
        return ((Number) n).intValue();
    }

    private void requireType(BankCheck c, CheckType type, String message) {
        if (c.getType() != type) {
            throw ApiException.badRequest(message + ": " + c.getCheckNo() + "은(는) " + c.getType().getDisplayName() + "입니다.");
        }
    }

    /**
     * 입금 · 부도 · 결제는 수표를 받은(발행한) 날 이후다. 앞 날짜를 받아 주면 그 분개가 수표 수취 전에 잡혀
     * 그 사이 받을수표 잔액이 음수가 되고, 수령수표현황 · 거래내역이 받기도 전에 손을 떠난 수표를 그린다.
     * 어음은 QA 57회차에 같은 검사를 넣었는데 수표에는 없었다.
     */
    private static void requireNotBeforeIssue(BankCheck c, LocalDate date, String what) {
        if (date.isBefore(c.getIssueDate())) {
            throw ApiException.badRequest(String.format("%s(%s)이 %s 의 %s일(%s)보다 빠를 수 없습니다.",
                    what, date, c.getCheckNo(), c.getType() == CheckType.RECEIVED ? "수령" : "발행", c.getIssueDate()));
        }
    }

    /** 수표내역입력으로(분개 없이) 넣은 수표를 분개로 입금 · 부도하면 받은 분개 없이 받을수표가 빠진다. */
    private static void requireJournaled(BankCheck c) {
        if (c.isDirectEntry()) {
            throw ApiException.badRequest(c.getCheckNo() + " 은(는) 수표내역입력으로 넣은 수표입니다 — 수령수표조회 [신규] 에서 감소로 넣으세요.");
        }
    }

    /** 원본: 입금보고서(지출결의서)로 늘어난 증가 줄은 체크칸이 막혀 있다(2026-10-14 실측) — 그 전표를 지우면 함께 사라진다. */
    private static void requireNotFromVoucher(BankCheck c) {
        if (c.getSourceVoucher() != null) {
            String doc = c.getType() == CheckType.RECEIVED ? "입금보고서" : "지출결의서";
            throw ApiException.badRequest(c.getCheckNo() + " 은(는) " + doc + "로 증가한 수표입니다 — " + doc + "에서 삭제하세요.");
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
