package com.erp.accounting.ledger.bond;

import com.erp.accounting.ledger.account.AccountService;
import com.erp.accounting.ledger.bond.dto.BondDtos.BondEntryResponse;
import com.erp.accounting.ledger.bond.dto.BondDtos.CreateBondRequest;
import com.erp.accounting.ledger.bond.dto.BondDtos.DepositLine;
import com.erp.accounting.ledger.bond.dto.BondDtos.DepositReportRequest;
import com.erp.accounting.PaymentMethod;
import com.erp.accounting.ledger.fastvoucher.FastVoucherRepository;
import com.erp.accounting.ledger.fastvoucher.FastVoucherService;
import com.erp.accounting.ledger.fastvoucher.FastVoucherType;
import com.erp.accounting.ledger.fastvoucher.dto.FastVoucherDtos.CreateVoucherRequest;
import com.erp.accounting.ledger.fastvoucher.dto.FastVoucherDtos.LineInput;
import com.erp.accounting.ledger.fastvoucher.dto.FastVoucherDtos.VoucherResponse;
import com.erp.accounting.ledger.bond.dto.BondDtos.LineRequest;
import com.erp.accounting.ledger.bond.dto.BondDtos.UpdateBondRequest;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.project.ProjectService;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 회계 II &gt; 채권관리 · 채무관리 — 채권(채무)내역 보조장부.
 *
 * <p>원본(2026-10-12 loginaa 실측)에서 확인한 규칙:
 * <ul>
 *   <li>[채권번호]는 줄마다 필수다 — 비우고 저장하면 그 칸에 '유효키항목 필수입력'. [Fn ▸ 코드생성]이 번호를 만들어 준다.</li>
 *   <li>[일자-No.] 의 No. 는 같은 날 몇 번째 장인지다(2026/10/12 -1, -2).</li>
 *   <li>증가 장을 지워도 그 번호로 감소한 장이 남아 있으면 막지 않는다(선택삭제가 그대로 지웠다).</li>
 *   <li>저장해도 회계전표는 생기지 않는다([회계일자-No.] 빈칸 · 출처업무 '채권내역').</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class BondService {

    private final BondEntryRepository entryRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final AccountService accountService;
    private final PartnerService partnerService;
    private final ProjectService projectService;
    private final FastVoucherService fastVoucherService;
    private final FastVoucherRepository fastVoucherRepository;
    private final com.erp.accounting.fund.bankcheck.BankCheckService bankCheckService;
    private final com.erp.accounting.fund.promissorynote.PromissoryNoteService promissoryNoteService;

    /** 원본 선택삭제가 연결된 장을 뺄 때 쓰는 사유 글자(2026-10-13 실측). */
    public static final String LINKED_REASON = "파생관계로 연결된 전표";

    /** 기준일 끝까지의 모든 장 — 조회는 기간으로, 거래내역 · 현황은 이월잔액까지 화면이 다시 센다. */
    @Transactional(readOnly = true)
    public List<BondEntryResponse> findUpTo(BondSide side, LocalDate to) {
        return entryRepository.findUpTo(side, to != null ? to : LocalDate.of(9999, 12, 31))
                .stream().map(BondEntryResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public BondEntryResponse get(Long id) {
        return BondEntryResponse.from(load(id));
    }

    @Transactional
    public BondEntryResponse create(CreateBondRequest req, String username) {
        int no = docNoGenerator.nextSeq("bond_entries:" + req.side(), req.entryDate(), entryRepository.maxEntryNo(req.side(), req.entryDate()));
        BondEntry e = BondEntry.builder()
                .side(req.side()).entryDate(req.entryDate()).entryNo(no)
                .direction(req.direction()).createdBy(username).updatedBy(username)
                .build();
        e.replaceLines(toLines(req.lines(), req.direction()));
        return BondEntryResponse.from(entryRepository.save(e));
    }

    /**
     * 채권감소등록 [입금보고서작성] → 입금보고서 [저장] — 원본(2026-10-13 loginaa 실측): QA2B001 잔액 50,000 에서 20,000 을 기업은행-1122 로
     * 받으니 회계전표 2026/10/13-18(차 기업은행 20,000 / 대 외상매출금 20,000 김치좋아)과 채권 감소 2026/10/13-2(출처업무 입금보고서)가
     * 함께 생겨 잔액이 30,000 이 됐다. 입금보고서를 지우면 감소 줄도 사라진다(FK ON DELETE CASCADE).
     * 같은 트랜잭션이라 감소 줄이 막히면(채권번호 없음) 전표도 남지 않는다.
     */
    @Transactional
    public BondEntryResponse createDepositReport(BondSide side, DepositReportRequest req, String username) {
        /* 채무감소등록 [지출결의서작성](2026-10-13 loginaa 실측)이 거울이다: QA2P001 잔액 50,000 에서 20,000 을 기업은행-1122 로 내니
           지출결의서(돈 나간 계좌 기업은행-1122 · 계정코드(차변) 2519 외상매입금 · (주)구로) 회계전표 2026/10/13 -21 과
           채무 감소 2026/10/13 -2(출처업무 지출결의서)가 함께 생겨 잔액 30,000. */
        FastVoucherType type = side == BondSide.RECEIVABLE ? FastVoucherType.DEPOSIT_REPORT : FastVoucherType.EXPENSE_REPORT;
        boolean cash = Boolean.TRUE.equals(req.cash()) || req.bankAccountId() == null;
        boolean byCheck = req.lines().stream().anyMatch(l -> l.checkNo() != null && !l.checkNo().isBlank());
        if (byCheck && cash) {
            throw ApiException.badRequest((side == BondSide.RECEIVABLE ? "입금계좌" : "출금계좌") + "를 입력 바랍니다.");
        }
        if (byCheck && req.lines().stream().anyMatch(l -> l.checkNo() == null || l.checkNo().isBlank())) {
            throw ApiException.badRequest("수표번호를 입력 바랍니다.");
        }
        boolean byNote = req.noteAccountId() != null;
        if (byNote && req.lines().stream().anyMatch(l -> l.noteNo() == null || l.noteNo().isBlank())) {
            throw ApiException.badRequest("어음번호를 입력 바랍니다.");
        }
        List<LineInput> vLines = req.lines().stream().map(l -> byNote
                ? new LineInput(l.accountId(), l.amount(), blankToNull(l.memo()), null, null, l.partnerId(), null, null, null, req.noteAccountId())
                : new LineInput(l.accountId(), l.amount(), blankToNull(l.memo()),
                    cash ? null : req.bankAccountId(), cash ? Boolean.TRUE : null, l.partnerId(), null, null)).toList();
        /* 전표 묶음기준 '거래처별/계정별'(원본 2026-10-21 실측): QA1B1 10,000 · QA1B2 20,000(김치좋아 1089) → 입금보고서 한 줄 30,000,
           적요는 첫 줄 것, 추가정보 '채권 QA1B1 외'. 채권 감소는 채권번호마다 그대로 남긴다. */
        if (Boolean.TRUE.equals(req.groupByPartner())) {
            java.util.Map<String, LineInput> merged = new java.util.LinkedHashMap<>();
            for (LineInput l : vLines) {
                merged.merge(l.accountId() + ":" + l.partnerId(), l, (a, b) -> new LineInput(a.accountId(), a.amount().add(b.amount()),
                        a.description(), a.bankAccountId(), a.cash(), a.partnerId(), null, null, null, a.settleAccountId()));
            }
            vLines = List.copyOf(merged.values());
        }
        VoucherResponse v = fastVoucherService.create(new CreateVoucherRequest(
                type, req.date(), PaymentMethod.CASH, null, null, null, vLines,
                blankToNull(req.description()), null, null, null, null, null, null, null, null, null), username);

        int no = docNoGenerator.nextSeq("bond_entries:" + side, req.date(), entryRepository.maxEntryNo(side, req.date()));
        BondEntry e = BondEntry.builder()
                .side(side).entryDate(req.date()).entryNo(no)
                .direction(BondDirection.DECREASE).createdBy(username).updatedBy(username)
                .sourceVoucher(fastVoucherRepository.getReferenceById(v.id()))
                .build();
        e.replaceLines(toLines(req.lines().stream().map(BondService::toLineRequest).toList(), BondDirection.DECREASE));
        entryRepository.saveAndFlush(e);
        /* 수금(지급)형태 '어음'(원본 2026-10-21): 입금보고서 줄마다 받을어음이 증가(받을어음조회 거래유형 '입금보고서' · 회계전표 = 그 입금보고서),
           입금보고서를 지우면 어음도 사라진다(source_voucher_id ON DELETE CASCADE). 채무는 지출결의서 · 지급어음. */
        if (byNote) {
            promissoryNoteService.createFromVoucher(
                    side == BondSide.RECEIVABLE ? com.erp.accounting.fund.promissorynote.NoteType.RECEIVABLE : com.erp.accounting.fund.promissorynote.NoteType.PAYABLE,
                    req.date(), v.id(),
                    req.lines().stream().map(l -> new com.erp.accounting.fund.promissorynote.PromissoryNoteService.VoucherNoteLine(
                            l.noteNo().trim(), l.noteDue() != null ? l.noteDue() : req.date(), l.amount(), l.partnerId(),
                            l.departmentId(), l.projectId(), blankToNull(l.memo()))).toList(),
                    username);
        }
        /* 수금(지급)형태 '수표' — 원본은 같은 입금보고서(지출결의서)로 수령(발행)수표가 줄마다 하나 는다. 돈 들어온(나간) 계좌가 수표계좌다. */
        if (byCheck) {
            bankCheckService.createFromVoucher(
                    side == BondSide.RECEIVABLE ? com.erp.accounting.fund.bankcheck.CheckType.RECEIVED : com.erp.accounting.fund.bankcheck.CheckType.ISSUED,
                    req.date(), req.bankAccountId(), v.id(),
                    req.lines().stream().map(l -> new com.erp.accounting.fund.bankcheck.BankCheckService.VoucherCheckLine(
                            l.checkNo(), l.amount(), l.partnerId(), l.departmentId(), l.projectId(), blankToNull(l.memo()))).toList(),
                    username);
        }
        return BondEntryResponse.from(load(e.getId()));
    }

    private static LineRequest toLineRequest(DepositLine l) {
        return new LineRequest(l.accountId(), l.partnerId(), l.bondNo(), l.amount(), null,
                l.departmentId(), l.projectId(), blankToNull(l.memo()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    @Transactional
    public BondEntryResponse update(Long id, UpdateBondRequest req, String username) {
        BondEntry e = load(id);
        if (e.getSourceVoucher() != null) {
            throw ApiException.badRequest(LINKED_REASON + "는 " + e.getSourceVoucher().getType().getDisplayName() + "에서 고칩니다.");
        }
        e.replaceLines(toLines(req.lines(), e.getDirection()));
        e.setUpdatedBy(username);
        return BondEntryResponse.from(e);
    }

    @Transactional
    public void delete(List<Long> ids) {
        List<BondEntry> es = ids.stream().map(this::load).toList();
        /* 원본: 연결된 장은 '선택한 전표 중 아래에 해당하는 내역은 제외됩니다 — 파생관계로 연결된 전표'로 빼고 나머지만 지운다.
           화면이 미리 빼서 보내므로, 여기 닿았다면 막는다. */
        if (es.stream().anyMatch(e -> e.getSourceVoucher() != null)) {
            throw ApiException.badRequest(LINKED_REASON + "는 지울 수 없습니다.");
        }
        entryRepository.deleteAll(es);
    }

    private BondEntry load(Long id) {
        return entryRepository.findWithLines(id)
                .orElseThrow(() -> ApiException.notFound("전표를 찾을 수 없습니다. id=" + id));
    }

    private List<BondLine> toLines(List<LineRequest> reqs, BondDirection direction) {
        List<BondLine> out = new ArrayList<>();
        for (LineRequest r : reqs) {
            if (r.bondNo() == null || r.bondNo().isBlank()) {
                throw ApiException.badRequest("채권번호 : 유효키항목 필수입력");
            }
            if (r.amount().compareTo(BigDecimal.ZERO) == 0) {
                throw ApiException.badRequest("금액 : 필수입력");
            }
            out.add(BondLine.builder()
                    .account(accountService.getUsable(r.accountId()))
                    .partner(r.partnerId() != null ? partnerService.get(r.partnerId()) : null)
                    .bondNo(r.bondNo().trim())
                    .amount(r.amount())
                    .dueDate(direction == BondDirection.INCREASE ? r.dueDate() : null)
                    .departmentId(r.departmentId())
                    .project(r.projectId() != null ? projectService.get(r.projectId()) : null)
                    .memo(r.memo())
                    .build());
        }
        return out;
    }
}
