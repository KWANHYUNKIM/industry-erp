package com.erp.accounting.promissorynote;

import com.erp.accounting.bankcard.BankCardService;
import com.erp.accounting.journal.JournalService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.account.Account;
import com.erp.trade.partner.BusinessPartner;
import com.erp.accounting.bankcard.dto.BankCardDtos.BankTxnRequest;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.CreateNoteRequest;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.DiscountRequest;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.DishonorRequest;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.NoteResponse;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.NoteSummary;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.SettleRequest;
import com.erp.accounting.account.AccountRepository;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.accounting.journal.JournalService.NoteEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.bankcard.dto.BankCardDtos;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos;

/**
 * 어음거래: 받을어음 수취 / 지급어음 발행 → 만기결제 · 할인 · 부도.
 *
 * 모든 단계가 회계전표를 남긴다. 만기결제와 할인 입금은 계좌 잔액이 함께 움직이므로
 * BankCardService 의 입출금을 거친다 — 잔액 잠금과 잔액부족 검증을 그쪽이 소유하고,
 * 예금 분개도 그쪽이 만든다. 어음 계정(받을어음/지급어음)은 그 입출금의 상대계정으로 넣는다.
 */
@Service
@RequiredArgsConstructor
public class PromissoryNoteService {

    private static final String ACC_NOTES_RECEIVABLE = "110";   // 받을어음
    private static final String ACC_NOTES_PAYABLE = "252";      // 지급어음

    private final PromissoryNoteRepository noteRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final AccountRepository accountRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;
    private final com.erp.accounting.bankcard.BankAccountRepository bankAccountRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.accounting.fastvoucher.FastVoucherService fastVoucherService;
    private final com.erp.accounting.fastvoucher.FastVoucherRepository fastVoucherRepository;

    /** 한 번에 내려보낼 어음 수의 문턱. 원본 [오천건이상조회] 와 같은 자리다. */
    public static final int LIST_PAGE_ROWS = 5000;

    @Transactional(readOnly = true)
    public NoteSummary findAll() {
        return findAll(null, null, false);
    }

    @Transactional(readOnly = true)
    public NoteSummary findAll(java.time.LocalDate from, java.time.LocalDate to) {
        return findAll(from, to, false);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 예전에는 물어보지도 않고 전 기간을 통째로 주었다.
     *
     * <p>안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 로 쓰면
     * PostgreSQL 이 파라미터 타입을 못 정해 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public NoteSummary findAll(java.time.LocalDate from, java.time.LocalDate to, boolean all) {
        List<PromissoryNote> notes = noteRepository.findAllWithPartner(
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31));
        LocalDate soon = LocalDate.now().plusDays(30);

        BigDecimal recvHeld = BigDecimal.ZERO;
        BigDecimal payHeld = BigDecimal.ZERO;
        BigDecimal recvSoon = BigDecimal.ZERO;
        BigDecimal paySoon = BigDecimal.ZERO;

        for (PromissoryNote n : notes) {
            if (n.getStatus() != NoteStatus.HELD) continue;
            boolean dueSoon = !n.getDueDate().isAfter(soon);
            if (n.getType().isReceivable()) {
                recvHeld = recvHeld.add(n.getAmount());
                if (dueSoon) recvSoon = recvSoon.add(n.getAmount());
            } else {
                payHeld = payHeld.add(n.getAmount());
                if (dueSoon) paySoon = paySoon.add(n.getAmount());
            }
        }
        /*
         * 요약 넷은 <b>기간 전체</b>로 이미 다 더했다. 목록만 자른다 — 자른 몫으로 더하면
         * 화면 위의 잔액이 조용히 줄어든다.
         */
        boolean truncated = !all && notes.size() > LIST_PAGE_ROWS;
        List<PromissoryNote> shown = truncated ? notes.subList(0, LIST_PAGE_ROWS) : notes;
        return new NoteSummary(recvHeld, payHeld, recvSoon, paySoon,
                shown.stream().map(NoteResponse::from).toList(),
                notes.size(), truncated);
    }

    /** 어음 수취(받을어음) / 발행(지급어음). 채권·채무가 어음으로 대체된다. */
    @Transactional
    public NoteResponse create(CreateNoteRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        LocalDate issueDate = req.issueDate() != null ? req.issueDate() : LocalDate.now();
        if (req.dueDate().isBefore(issueDate)) {
            throw ApiException.badRequest("만기일이 발행일보다 빠를 수 없습니다.");
        }

        boolean recordOnly = Boolean.TRUE.equals(req.recordOnly());
        String typedNo = req.noteNo() != null && !req.noteNo().isBlank() ? req.noteNo().trim() : null;
        // 원본 받을어음증가 · 지급어음증가 창에도 [어음번호] 칸이 있다(2026-10-13 실측 — 'QA회계1-001' 로 저장됨). 비우면 서버가 매긴다.
        if (typedNo != null && noteRepository.existsByNoteNo(typedNo)) {
            throw ApiException.conflict("이미 있는 어음번호입니다: " + typedNo);
        }
        PromissoryNote n = PromissoryNote.builder()
                .noteNo(typedNo != null ? typedNo
                        : docNoGenerator.next("BN-", "promissory_notes", "note_no", "issue_date", issueDate))
                .recordOnly(recordOnly)
                .type(req.type())
                .partner(partner)
                .issueDate(issueDate)
                .dueDate(req.dueDate())
                .amount(req.amount())
                .status(NoteStatus.HELD)
                .bankName(req.bankName())
                .remark(req.remark())
                .createdBy(username)
                .departmentId(req.departmentId())
                .projectId(req.projectId())
                .build();
        noteRepository.save(n);

        /* [내역만등록]은 분개를 만들지 않는다(원본: 회계거래조회에 전표가 생기지 않는다). */
        if (!recordOnly) journalService.createFromNote(n, NoteEvent.ISSUE);
        return NoteResponse.from(n);
    }

    /**
     * 받을어음증가 · 지급어음증가 수정 — 원본 받을어음조회 증가 줄 [일자] → 수정 창 [저장(F8)].
     * 2026-10-21 loginaa 실측: QA1-N9 123,000 → 125,000 저장하면 목록 금액이 바뀌고 회계전표No.(26/10/21 -26)는 그대로.
     * 보유 중인 어음만 고친다(감소 · 결제가 붙은 어음은 그쪽을 먼저 지운다). 분개는 지우고 다시 만들되 같은 날이면 옛 번호를 다시 쓴다.
     */
    @Transactional
    public NoteResponse updateIssue(Long id, CreateNoteRequest req, String username) {
        PromissoryNote n = held(id, "수정");
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        if (req.dueDate().isBefore(n.getIssueDate())) {
            throw ApiException.badRequest("만기일이 발행일보다 빠를 수 없습니다.");
        }
        String typedNo = req.noteNo() != null && !req.noteNo().isBlank() ? req.noteNo().trim() : null;
        if (typedNo != null && !typedNo.equals(n.getNoteNo())) {
            if (noteRepository.existsByNoteNo(typedNo)) throw ApiException.conflict("이미 있는 어음번호입니다: " + typedNo);
            n.setNoteNo(typedNo);
        }
        n.setPartner(partner);
        n.setDueDate(req.dueDate());
        n.setAmount(req.amount());
        n.setRemark(req.remark());
        n.setDepartmentId(req.departmentId());
        n.setProjectId(req.projectId());
        if (!n.isRecordOnly()) {
            var old = journalService.findBySource(com.erp.accounting.journal.JournalSourceType.NOTE, id).orElse(null);
            String oldDocNo = old == null ? null : old.getDocNo();
            java.time.LocalDate oldDate = old == null ? null : old.getEntryDate();
            journalService.deleteBySource(com.erp.accounting.journal.JournalSourceType.NOTE, id);
            noteRepository.flush();   // 옛 분개 delete 를 먼저 내보내야 같은 번호를 다시 쓸 수 있다(unique)
            var renewed = journalService.createFromNote(n, NoteEvent.ISSUE);
            if (oldDocNo != null && renewed != null && renewed.getEntryDate().equals(oldDate)) renewed.setDocNo(oldDocNo);
        }
        return NoteResponse.from(n);
    }

    /**
     * 원본 [내역만등록] 전표구분 [감소] — 어음번호로 찾은 보유 어음을 분개 없이 닫는다(거래유형 '어음만감소').
     * 2026-10-13 loginaa 실측: QA1-N3 증가(어음만증가) 뒤 감소 → 받을어음조회 [2026/10/13-4 · QA1-N3 · 감소 · … · 어음만감소 · (빈칸)].
     * 원본은 없는 어음번호도 받지만(QA1-N9 감소가 만기일자 빈칸으로 저장됨) 우리는 어음 한 장이 줄 하나라 있는 어음만 닫는다.
     */
    @Transactional
    public NoteResponse recordDecrease(PromissoryNoteDtos.RecordDecreaseRequest req) {
        String no = req.noteNo().trim();
        PromissoryNote n = noteRepository.findByNoteNo(no)
                .filter(x -> x.getType() == req.type())
                .orElseThrow(() -> ApiException.badRequest("어음번호를 찾을 수 없습니다: " + no));
        n = held(n.getId(), "감소");
        LocalDate date = req.date() != null ? req.date() : LocalDate.now();
        requireNotBeforeIssue(n, date, "감소일");
        n.setStatus(NoteStatus.RECORD_DECREASED);
        n.setClosedDate(date);
        n.setCloseRemark(req.remark() == null || req.remark().isBlank() ? null : req.remark().trim());
        n.setCloseDepartmentId(req.departmentId());
        n.setCloseProjectId(req.projectId());
        return NoteResponse.from(n);
    }

    /** [내역만등록] 감소 줄 지우기 — 어음을 다시 보유로 돌린다. 감소로 닫힌 어음만. */
    @Transactional
    public NoteResponse cancelRecordDecrease(Long id) {
        PromissoryNote n = noteRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("어음을 찾을 수 없습니다. id=" + id));
        if (n.getStatus() != NoteStatus.RECORD_DECREASED) {
            throw ApiException.conflict(n.getNoteNo() + " 은(는) [내역만등록] 감소로 닫힌 어음이 아닙니다.");
        }
        n.setStatus(NoteStatus.HELD);
        n.setClosedDate(null);
        n.setCloseRemark(null);
        n.setCloseDepartmentId(null);
        n.setCloseProjectId(null);
        return NoteResponse.from(n);
    }

    /**
     * 받을어음감소(E010602) — 어음번호로 찾은 보유 받을어음을 입금계좌로 받는다. 수수료가 있으면 이자비용으로.
     * 2026-10-20 loginaa 실측: QA1-N1 총 100,000 · 금액 99,000 · 수수료 1,000 · 기업은행-1122 →
     * 회계거래조회 '26/10/20-26 | 받을어음감소 | 100,000 | QA회계1', 전표 차) 보통예금 99,000 · 이자비용 1,000 / 대) 받을어음 100,000.
     * 원본은 총금액이 어음 금액과 달라도 받는다(199,000 저장됨) — 우리는 어음 한 장이 줄 하나라 같아야 한다.
     */
    @Transactional
    public NoteResponse decrease(PromissoryNoteDtos.DecreaseRequest req, String username) {
        String no = req.noteNo().trim();
        PromissoryNote n = noteRepository.findByNoteNo(no)
                .orElseThrow(() -> ApiException.badRequest("어음번호를 찾을 수 없습니다: " + no));
        n = held(n.getId(), "감소");
        LocalDate date = req.date() != null ? req.date() : LocalDate.now();
        requireNotBeforeIssue(n, date, "감소일");
        if (!n.getType().isReceivable()) return decreasePayable(n, req, date, username);
        BigDecimal fee = req.fee() != null ? req.fee() : BigDecimal.ZERO;
        BigDecimal total = req.amount().add(fee);
        if (total.compareTo(n.getAmount()) != 0) {
            throw ApiException.badRequest(String.format("총금액(%s)이 어음 %s 의 금액(%s)과 다릅니다.",
                    total.stripTrailingZeros().toPlainString(), n.getNoteNo(), n.getAmount().stripTrailingZeros().toPlainString()));
        }
        com.erp.accounting.bankcard.BankAccount bank = bankAccountRepository.findById(req.bankAccountId())
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + req.bankAccountId()));
        if (bank.getGlAccount() == null) {
            throw ApiException.badRequest("입금계좌 " + bank.getName() + " 에 [계정]이 없습니다 — 계좌등록에서 정하세요.");
        }
        String remark = req.remark() == null || req.remark().isBlank() ? null : req.remark().trim();
        var entry = journalService.createFromNoteDecrease(n, bank.getGlAccount(), req.amount(), fee, date, remark,
                req.departmentId(), req.projectId(), username);
        if (req.amount().signum() > 0) {
            bankCardService.recordExternal(bank.getId(), true, req.amount(), date,
                    "받을어음감소 " + n.getNoteNo(), entry, username);
        }
        n.setStatus(NoteStatus.SETTLED);
        n.setClosedDate(date);
        n.setDiscountFee(fee.signum() > 0 ? fee : null);
        n.setCloseRemark(remark);
        n.setCloseDepartmentId(req.departmentId());
        n.setCloseProjectId(req.projectId());
        n.setCloseJournalEntry(entry);
        return NoteResponse.from(n);
    }

    /**
     * 지급어음감소(E010605) — 보유(미지급) 지급어음을 출금계좌에서 갚는다. 칸은 출금계좌 · 어음번호 · 금액 · 적요(수수료 없음).
     * 2026-10-20 loginaa 실측: QA1-P1 100,000 · 기업은행-1122 → 지급어음조회 감소 줄 거래유형 '지급어음감소',
     * 전표 '26/10/20-37 | 지급어음감소 | 100,000' = 차) 지급어음(어음 거래처, 적요 'QA회계1(No.QA1-P1,2026/10/20 )') / 대) 보통예금(기업은행-1122).
     */
    private NoteResponse decreasePayable(PromissoryNote n, PromissoryNoteDtos.DecreaseRequest req, LocalDate date, String username) {
        if (req.amount().compareTo(n.getAmount()) != 0) {
            throw ApiException.badRequest(String.format("금액(%s)이 어음 %s 의 금액(%s)과 다릅니다.",
                    req.amount().stripTrailingZeros().toPlainString(), n.getNoteNo(), n.getAmount().stripTrailingZeros().toPlainString()));
        }
        com.erp.accounting.bankcard.BankAccount bank = bankAccountRepository.findById(req.bankAccountId())
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + req.bankAccountId()));
        if (bank.getGlAccount() == null) {
            throw ApiException.badRequest("출금계좌 " + bank.getName() + " 에 [계정]이 없습니다 — 계좌등록에서 정하세요.");
        }
        String remark = req.remark() == null || req.remark().isBlank() ? null : req.remark().trim();
        var entry = journalService.createFromPayableNoteDecrease(n, bank.getGlAccount(), req.amount(), date, remark,
                req.departmentId(), req.projectId(), username);
        bankCardService.recordExternal(bank.getId(), false, req.amount(), date, "지급어음감소 " + n.getNoteNo(), entry, username);
        n.setStatus(NoteStatus.SETTLED);
        n.setClosedDate(date);
        n.setDiscountFee(null);
        n.setCloseRemark(remark);
        n.setCloseDepartmentId(req.departmentId());
        n.setCloseProjectId(req.projectId());
        n.setCloseJournalEntry(entry);
        return NoteResponse.from(n);
    }

    /**
     * 받을어음일괄감소(E010621) [입금보고서작성] · 지급어음일괄감소(E010629) [지출결의서작성] → 결의서 [저장].
     * 2026-10-20 loginaa 실측: 지급어음 QA1-P1 100,000 → 지출결의서작성 창(돈나간계좌번호 · 적요 · 묶음기준) → [적용] →
     * 지출결의서 줄 [돈 나간 계좌 기업은행-1122 · 계정 지급어음 · 거래처 서강대학교 · 100,000 · 적요 · 추가정보 '지급어음 QA1-P1'].
     * 저장하면 결의서 한 장(회계전표 차) 지급어음 / 대) 보통예금 — 받을어음은 차) 보통예금 / 대) 받을어음)이 생기고
     * 고른 어음이 감소로 닫힌다. 결의서를 지우면 V420 트리거가 어음을 보유로 되돌린다(수령수표입금처리 V392 와 같은 길).
     */
    @Transactional
    public List<NoteResponse> voucherReport(NoteType type, PromissoryNoteDtos.VoucherReportRequest req, String username) {
        boolean receivable = type.isReceivable();
        boolean cash = Boolean.TRUE.equals(req.cash()) || req.bankAccountId() == null;
        Long account = accountRepository.findByCode(receivable ? ACC_NOTES_RECEIVABLE : ACC_NOTES_PAYABLE)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + (receivable ? ACC_NOTES_RECEIVABLE : ACC_NOTES_PAYABLE))).getId();
        List<PromissoryNote> notes = new java.util.ArrayList<>();
        List<String> memos = new java.util.ArrayList<>();
        List<com.erp.accounting.fastvoucher.dto.FastVoucherDtos.LineInput> vLines = new java.util.ArrayList<>();
        for (PromissoryNoteDtos.VoucherReportLine l : req.lines()) {
            PromissoryNote n = held(l.noteId(), receivable ? "입금보고서" : "지출결의서");
            if (n.getType() != type) {
                throw ApiException.badRequest(n.getNoteNo() + " 은(는) " + type.getDisplayName() + "이 아닙니다.");
            }
            if (n.isRecordOnly()) {
                throw ApiException.badRequest(n.getNoteNo() + " 은(는) [내역만등록] 어음입니다 — 어음만감소로 닫으세요.");
            }
            requireNotBeforeIssue(n, req.date(), "일자");
            String memo = l.memo() == null || l.memo().isBlank() ? null : l.memo().trim();
            vLines.add(new com.erp.accounting.fastvoucher.dto.FastVoucherDtos.LineInput(
                    account, n.getAmount(), memo, cash ? null : req.bankAccountId(), cash ? Boolean.TRUE : null,
                    n.getPartner().getId(), null, null));
            notes.add(n);
            memos.add(memo);
        }
        var v = fastVoucherService.create(new com.erp.accounting.fastvoucher.dto.FastVoucherDtos.CreateVoucherRequest(
                receivable ? com.erp.accounting.fastvoucher.FastVoucherType.DEPOSIT_REPORT : com.erp.accounting.fastvoucher.FastVoucherType.EXPENSE_REPORT,
                req.date(), com.erp.accounting.PaymentMethod.CASH,
                null, null, null, vLines, req.description() == null || req.description().isBlank() ? null : req.description().trim(),
                null, null, null, null, null, null, null, null, null), username);
        var entry = fastVoucherRepository.findById(v.id()).map(com.erp.accounting.fastvoucher.FastVoucher::getJournalEntry)
                .orElseThrow(() -> ApiException.notFound((receivable ? "입금보고서" : "지출결의서") + "를 찾을 수 없습니다. id=" + v.id()));
        List<NoteResponse> out = new java.util.ArrayList<>();
        for (int i = 0; i < notes.size(); i++) {
            PromissoryNote n = notes.get(i);
            n.setStatus(NoteStatus.SETTLED);
            n.setClosedDate(req.date());
            n.setDiscountFee(null);
            n.setCloseRemark(memos.get(i));
            n.setCloseJournalEntry(entry);
            out.add(NoteResponse.from(n));
        }
        return out;
    }

    /** 받을어음감소 수정(원본 수정 창 [저장(F8)] — 같은 전표를 고쳐 쓴다). 지우고 다시 넣는 것을 한 트랜잭션으로. */
    @Transactional
    public NoteResponse updateDecrease(Long id, PromissoryNoteDtos.DecreaseRequest req, String username) {
        cancelDecrease(id, username);
        return decrease(req, username);
    }

    /** 받을어음감소 지우기 — 원본 '전표를 삭제하겠습니까? - 받을어음감소' 뒤 어음이 다시 보유로(받을어음조회 감소 줄이 빠진다). */
    @Transactional
    public NoteResponse cancelDecrease(Long id, String username) {
        PromissoryNote n = noteRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("어음을 찾을 수 없습니다. id=" + id));
        var entry = n.getCloseJournalEntry();
        if (n.getStatus() != NoteStatus.SETTLED || entry == null) {
            throw ApiException.conflict(n.getNoteNo() + " 은(는) 어음감소로 닫힌 어음이 아닙니다.");
        }
        if (entry.getSourceType() == com.erp.accounting.journal.JournalSourceType.VOUCHER) {
            throw ApiException.conflict(n.getNoteNo() + " 은(는) " + (n.getType().isReceivable() ? "입금보고서" : "지출결의서")
                    + "로 닫힌 어음입니다 — 그 " + (n.getType().isReceivable() ? "입금보고서" : "지출결의서") + "를 지우세요.");
        }
        n.setCloseJournalEntry(null);
        n.setStatus(NoteStatus.HELD);
        n.setClosedDate(null);
        n.setDiscountFee(null);
        n.setCloseRemark(null);
        n.setCloseDepartmentId(null);
        n.setCloseProjectId(null);
        bankCardService.reverseExternal(entry, n.getType().getDisplayName() + "감소 삭제 " + n.getNoteNo(), username);
        journalService.deleteEntry(entry);
        return NoteResponse.from(n);
    }

    /**
     * 받을어음거래처지급(E010603) — 보유 받을어음을 거래처에 넘겨(배서) 외상매입금을 갚는다.
     * 2026-10-20 loginaa 실측: QA1-N2 100,000 → 거래처 QA · 지급금액 100,000 → 받을어음조회 감소 줄 거래유형 '받을어음거래처지급',
     * 전표 '26/10/20-32 | 받을어음거래처지급 | 100,000' = 차) 외상매입금(QA) / 대) 받을어음(QA).
     * 원본은 지급금액을 어음 금액과 달리 적어도 받는다 — 우리는 어음 한 장이 줄 하나라 같아야 한다(감소와 같은 규칙).
     */
    @Transactional
    public NoteResponse endorse(PromissoryNoteDtos.EndorseRequest req, String username) {
        String no = req.noteNo().trim();
        PromissoryNote n = noteRepository.findByNoteNo(no)
                .filter(x -> x.getType() == NoteType.RECEIVABLE)
                .orElseThrow(() -> ApiException.badRequest("어음번호를 찾을 수 없습니다: " + no));
        n = held(n.getId(), "거래처지급");
        LocalDate date = req.date() != null ? req.date() : LocalDate.now();
        requireNotBeforeIssue(n, date, "지급일");
        if (req.amount().compareTo(n.getAmount()) != 0) {
            throw ApiException.badRequest(String.format("지급금액(%s)이 어음 %s 의 금액(%s)과 다릅니다.",
                    req.amount().stripTrailingZeros().toPlainString(), n.getNoteNo(), n.getAmount().stripTrailingZeros().toPlainString()));
        }
        BusinessPartner payee = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        String remark = req.remark() == null || req.remark().isBlank() ? null : req.remark().trim();
        var entry = journalService.createFromNoteEndorse(n, payee, req.amount(), date, remark,
                req.departmentId(), req.projectId(), username);
        n.setStatus(NoteStatus.ENDORSED);
        n.setClosedDate(date);
        n.setClosePartner(payee);
        n.setCloseRemark(remark);
        n.setCloseDepartmentId(req.departmentId());
        n.setCloseProjectId(req.projectId());
        n.setCloseJournalEntry(entry);
        return NoteResponse.from(n);
    }

    /** 거래처지급 수정 창 [저장(F8)] — 지우고 다시 넣는 것을 한 트랜잭션으로. */
    @Transactional
    public NoteResponse updateEndorse(Long id, PromissoryNoteDtos.EndorseRequest req, String username) {
        cancelEndorse(id);
        return endorse(req, username);
    }

    /** 거래처지급 지우기(원본 '전표를 삭제하겠습니까? - 받을어음거래처지급') — 전표를 지우고 어음을 보유로. */
    @Transactional
    public NoteResponse cancelEndorse(Long id) {
        PromissoryNote n = noteRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("어음을 찾을 수 없습니다. id=" + id));
        var entry = n.getCloseJournalEntry();
        if (n.getStatus() != NoteStatus.ENDORSED || entry == null) {
            throw ApiException.conflict(n.getNoteNo() + " 은(는) 거래처지급으로 닫힌 어음이 아닙니다.");
        }
        n.setCloseJournalEntry(null);
        n.setClosePartner(null);
        n.setStatus(NoteStatus.HELD);
        n.setClosedDate(null);
        n.setCloseRemark(null);
        n.setCloseDepartmentId(null);
        n.setCloseProjectId(null);
        journalService.deleteEntry(entry);
        return NoteResponse.from(n);
    }

    /** 만기결제: 받을어음이면 계좌 입금, 지급어음이면 계좌 출금. 어음이 예금으로 정리된다. */
    @Transactional
    public NoteResponse settle(Long id, SettleRequest req, String username) {
        PromissoryNote n = held(id, "결제");
        if (req == null || req.bankAccountId() == null) {
            throw ApiException.badRequest("결제될 계좌를 선택하세요.");
        }
        LocalDate date = req.settleDate() != null ? req.settleDate() : LocalDate.now();
        requireNotBeforeIssue(n, date, "결제일");
        n.setStatus(NoteStatus.SETTLED);
        n.setClosedDate(date);

        boolean receivable = n.getType().isReceivable();
        bankCardService.createTxn(new BankTxnRequest(
                req.bankAccountId(),
                receivable,                       // 받을어음이면 입금, 지급어음이면 출금
                n.getAmount(),
                noteAccount(n).getId(),           // 상대계정 = 받을어음 / 지급어음
                n.getPartner().getId(),
                date,
                n.getType().getDisplayName() + " 만기결제 " + n.getNoteNo()
        ), username);

        return NoteResponse.from(n);
    }

    /**
     * 어음할인(받을어음 전용): 만기 전에 은행에 넘기고 할인료를 뗀 금액을 받는다.
     * 예금 입금분은 계좌 입출금이 분개하고, 할인료는 매출채권처분손실로 따로 분개한다.
     */
    @Transactional
    public NoteResponse discount(Long id, DiscountRequest req, String username) {
        PromissoryNote n = held(id, "할인");
        if (n.getType() != NoteType.RECEIVABLE) {
            throw ApiException.badRequest("지급어음은 할인할 수 없습니다. 받을어음만 할인 대상입니다.");
        }
        if (req.bankAccountId() == null) {
            throw ApiException.badRequest("할인 대금이 입금될 계좌를 선택하세요.");
        }
        BigDecimal fee = req.discountFee();
        if (fee.compareTo(n.getAmount()) >= 0) {
            throw ApiException.badRequest("할인료가 어음 금액 이상입니다. 어음 " + n.getAmount().toPlainString()
                    + ", 할인료 " + fee.toPlainString());
        }
        LocalDate date = req.discountDate() != null ? req.discountDate() : LocalDate.now();
        requireNotBeforeIssue(n, date, "할인일");
        /* 할인은 <b>만기 전에</b> 은행에 넘기는 것이다. 만기가 지났으면 만기결제로 받는다. */
        if (date.isAfter(n.getDueDate())) {
            throw ApiException.badRequest(String.format("%s 은(는) 만기(%s)가 지난 어음입니다 — 할인이 아니라 [만기결제]로 처리하세요.",
                    n.getNoteNo(), n.getDueDate()));
        }

        n.setStatus(NoteStatus.DISCOUNTED);
        n.setClosedDate(date);
        n.setDiscountFee(fee);

        // 1) 할인 대금 입금 (차)예금 / 대)받을어음)
        bankCardService.createTxn(new BankTxnRequest(
                req.bankAccountId(), true,
                n.getAmount().subtract(fee),
                noteAccount(n).getId(),
                n.getPartner().getId(),
                date,
                "어음할인 입금 " + n.getNoteNo()
        ), username);

        // 2) 할인료 (차)매출채권처분손실 / 대)받을어음)
        if (fee.signum() > 0) {
            journalService.createFromNote(n, NoteEvent.DISCOUNT_FEE);
        }
        return NoteResponse.from(n);
    }

    /** 부도(받을어음 전용): 어음채권을 외상매출금으로 되돌린다. 현금은 오가지 않는다. */
    @Transactional
    public NoteResponse dishonor(Long id, DishonorRequest req) {
        PromissoryNote n = held(id, "부도 처리");
        if (n.getType() != NoteType.RECEIVABLE) {
            throw ApiException.badRequest("지급어음은 부도 처리할 수 없습니다. 받을어음만 대상입니다.");
        }
        LocalDate date = req != null && req.dishonorDate() != null ? req.dishonorDate() : LocalDate.now();
        requireNotBeforeIssue(n, date, "부도일");
        n.setStatus(NoteStatus.DISHONORED);
        n.setClosedDate(date);

        journalService.createFromNote(n, NoteEvent.DISHONOR);
        return NoteResponse.from(n);
    }

    /**
     * 어음 삭제 — <b>보유</b> 중일 때만(QA 58회차 — 잘못 받아 적은 어음을 지울 길이 없었다).
     * 수취·발행 분개만 있으므로 그것을 지우면 외상매출금(매입금)이 그대로 돌아온다.
     * 결제·할인·부도로 계좌·손익이 움직인 어음은 지우지 않는다.
     */
    @Transactional
    public void delete(Long id) {
        PromissoryNote n = held(id, "삭제");
        noteRepository.delete(n);
        if (!n.isRecordOnly()) journalService.deleteBySource(com.erp.accounting.journal.JournalSourceType.NOTE, id);
    }

    /**
     * 결제·할인·부도는 어음을 받은(발행한) 날 이후다. 앞 날짜를 받아 주면 그 분개가 어음 수취 전에 잡혀
     * 그 사이 받을어음 잔액이 음수가 된다(QA 57회차 — 10/2 받은 어음을 9/30 에 할인할 수 있었다).
     */
    private static void requireNotBeforeIssue(PromissoryNote n, LocalDate date, String what) {
        if (date.isBefore(n.getIssueDate())) {
            throw ApiException.badRequest(String.format("%s(%s)이 %s 의 수취·발행일(%s)보다 빠를 수 없습니다.",
                    what, date, n.getNoteNo(), n.getIssueDate()));
        }
    }

    /** 어음 계정: 받을어음(110) / 지급어음(252) */
    private Account noteAccount(PromissoryNote n) {
        String code = n.getType().isReceivable() ? ACC_NOTES_RECEIVABLE : ACC_NOTES_PAYABLE;
        return accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code + " (계정과목등록 필요)"));
    }

    private PromissoryNote held(Long id, String action) {
        PromissoryNote n = noteRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("어음을 찾을 수 없습니다. id=" + id));
        if (n.getStatus().isClosed()) {
            throw ApiException.conflict("이미 " + n.getStatus().getDisplayName() + " 처리된 어음입니다: "
                    + n.getNoteNo() + " (" + action + " 불가)");
        }
        return n;
    }
}
