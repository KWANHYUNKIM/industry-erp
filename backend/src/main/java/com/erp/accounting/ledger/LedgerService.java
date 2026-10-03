package com.erp.accounting.ledger;

import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.settlement.SettlementType;
import com.erp.accounting.journal.JournalSourceType;
import com.erp.accounting.ledger.dto.LedgerDtos.PartnerBalanceResponse;
import com.erp.accounting.ledger.dto.LedgerDtos.PartnerMovementResponse;
import com.erp.accounting.journal.JournalLineRepository;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.trade.purchase.PurchaseRepository;
import com.erp.trade.sales.SalesRepository;
import com.erp.trade.settlement.SettlementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.erp.accounting.ledger.dto.LedgerDtos;

@Service
@RequiredArgsConstructor
public class LedgerService {

    private final BusinessPartnerRepository partnerRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SettlementRepository settlementRepository;
    private final JournalLineRepository journalLineRepository;
    /*
     * <b>새 코드는 다른 모듈의 서비스를 거친다</b>(CLAUDE.md §4.2). 위 네 리포지토리는
     * 그 규칙이 생기기 전부터 있던 자리라 그대로 두었다 — 전부 집계 쿼리(projection)여서
     * 서비스로 옮기면 리포지토리 타입이 서비스 API 로 새어 나간다. 원장은 돈 화면이라
     * 새 기능과 같은 판에서 갈아엎지 않는다.
     */
    private final com.erp.trade.sales.SalesService salesService;
    private final com.erp.trade.purchase.PurchaseService purchaseService;
    private final com.erp.trade.settlement.SettlementService settlementService;

    /**
     * 채권·채무의 <b>통제계정</b> 코드.
     *
     * <p>회계전표가 이 계정을 직접 움직이면 그것도 채권·채무다. 어음으로 받았으면
     * 외상매출금은 줄고 받을어음이 는다. 그런데 우리 잔액은 <b>판매전표와 정산전표만</b> 센다 —
     * 개발 자료에서 외상매출금 대변 4.4억(어음 2.7억 · 수표 1.7억), 외상매입금 차변 1.5억이
     * 그렇게 잔액 바깥에 떠 있었다.
     *
     * <p><b>그 이동을 잔액에 넣는다(QA 60회차).</b> 예전엔 넣지 않고 [기타할인등차액] 으로만 드러냈다 —
     * 시드 어음이 판매보다 커서 채권이 음수가 된다는 까닭이었다. 그런데 그러면 어음·수표로 받은 거래처의
     * 외상매출금이 <b>영영 줄지 않고</b>, 외주비 회계반영(대 251 외상매입금)으로 생긴 외주처 채무는
     * <b>아예 안 잡힌다</b>(원본은 외주비회계반영이 매입전표를 만들어 채무를 올린다). 잔액이 음수인 것은
     * 그 거래처 자료가 짝이 안 맞는다는 사실이고, 숨길 일이 아니다. 개발 DB 에서 영향받는 거래처는
     * QA고객사·QA매입처뿐이었다.
     *
     * <p>판매·구매·정산(수금·지급)전표에서 자동으로 만들어진 회계전표는 뺀다 — 그건 전표 자체로 이미 세고 있다.
     */
    private static final String AR_ACCOUNT = "108";   // 외상매출금
    private static final String AP_ACCOUNT = "251";   // 외상매입금
    /** 전표 자체로 세는 출처 — 이 출처의 회계전표를 또 더하면 두 번 센다. */
    private static final java.util.Set<JournalSourceType> COUNTED_BY_SLIP = java.util.EnumSet.of(
            JournalSourceType.SALES, JournalSourceType.PURCHASE, JournalSourceType.SETTLEMENT);

    /** 거래처별 채권(매출−수금)·채무(매입−지급) 현황 — 현재 시점 잔액. */
    @Transactional(readOnly = true)
    public List<PartnerBalanceResponse> partnerBalances() {
        return partnerBalances(null);
    }

    /**
     * 거래처별 채권·채무 현황.
     *
     * {@code asOf} 를 주면 그 날짜까지의 전표·정산만 더한 <b>기준일자 잔액</b>이다
     * (채권/채무현황 E040703·채권현황 E040721 의 '기준일자'). null 이면 전체 기간.
     */
    @Transactional(readOnly = true)
    public List<PartnerBalanceResponse> partnerBalances(java.time.LocalDate asOf) {
        List<SalesRepository.PartnerAmount> salesSums = asOf == null
                ? salesRepository.sumTotalByPartner() : salesRepository.sumTotalByPartnerUntil(asOf);
        Map<Long, BigDecimal> receivables = salesSums.stream()
                .collect(Collectors.toMap(SalesRepository.PartnerAmount::getPartnerId,
                        SalesRepository.PartnerAmount::getTotal));
        Map<Long, BigDecimal> payables = new HashMap<>();
        (asOf == null ? purchaseRepository.sumTotalByPartner() : purchaseRepository.sumTotalByPartnerUntil(asOf))
                .forEach(pa -> payables.put(pa.getPartnerId(), pa.getTotal()));

        // 수금 차감 → 순 미수금, 지급 차감 → 순 미지급
        (asOf == null ? settlementRepository.sumByPartner(SettlementType.RECEIPT)
                : settlementRepository.sumByPartnerUntil(SettlementType.RECEIPT, asOf)).forEach(pa ->
                receivables.merge(pa.getPartnerId(), pa.getTotal().negate(), BigDecimal::add));
        (asOf == null ? settlementRepository.sumByPartner(SettlementType.PAYMENT)
                : settlementRepository.sumByPartnerUntil(SettlementType.PAYMENT, asOf)).forEach(pa ->
                payables.merge(pa.getPartnerId(), pa.getTotal().negate(), BigDecimal::add));

        // 회계전표가 통제계정을 직접 움직인 것(어음·수표·대체·외주비 회계반영 …). 채권은 차변이, 채무는 대변이 늘린다.
        LocalDate until = asOf != null ? asOf : LocalDate.of(9999, 12, 31);
        Map<Long, BigDecimal> arJournal = new HashMap<>();
        Map<Long, BigDecimal> apJournal = new HashMap<>();
        controlMoves(AR_ACCOUNT, EARLIEST, until).forEach((id, mv) -> {
            BigDecimal v = mv.debit().subtract(mv.credit());
            arJournal.put(id, v);
            receivables.merge(id, v, BigDecimal::add);
        });
        controlMoves(AP_ACCOUNT, EARLIEST, until).forEach((id, mv) -> {
            BigDecimal v = mv.credit().subtract(mv.debit());
            apJournal.put(id, v);
            payables.merge(id, v, BigDecimal::add);
        });

        return partnerRepository.findAllWithGroup().stream()
                .map(p -> toBalance(p, receivables, payables, arJournal, apJournal))
                .toList();
    }

    /** 통제계정 한 곳의 거래처별 차변·대변 합. */
    private record Move(BigDecimal debit, BigDecimal credit) {}

    private static final LocalDate EARLIEST = LocalDate.of(1900, 1, 1);

    private Map<Long, Move> controlMoves(String accountCode, LocalDate from, LocalDate to) {
        Map<Long, Move> m = new HashMap<>();
        for (Object[] row : journalLineRepository.sumControlAccountByPartner(accountCode, COUNTED_BY_SLIP, from, to)) {
            m.put((Long) row[0], new Move((BigDecimal) row[1], (BigDecimal) row[2]));
        }
        return m;
    }

    /**
     * <b>[전표별] 원장.</b> 기간 안의 전표를 날짜 차례로 늘어놓는다 —
     * 채권이면 판매(올림)와 수금(내림), 채무면 구매(올림)와 지급(내림)이다.
     *
     * <p>잔액 누계는 화면이 <b>기초잔액에서부터</b> 더해 간다(기초는 partner-movements 가 낸다).
     * 서버가 미리 더해 주지 않는 까닭은, 화면이 거래처를 하나로 좁히거나 날짜·달로 묶을 때
     * <b>누계가 그때마다 다시 서야</b> 하기 때문이다.
     */
    @Transactional(readOnly = true)
    public List<LedgerDtos.PartnerEntryResponse> partnerEntries(LocalDate from, LocalDate to,
                                                                boolean receivableSide) {
        List<LedgerDtos.PartnerEntryResponse> out = new java.util.ArrayList<>();
        if (receivableSide) {
            salesService.findAll(from, to).forEach(s -> out.add(new LedgerDtos.PartnerEntryResponse(
                    s.saleDate(), s.docNo(), "판매", s.partnerId(), s.partnerName(),
                    s.totalAmount(), BigDecimal.ZERO)));
            settlementService.findBetween(SettlementType.RECEIPT, from, to)
                    .forEach(s -> out.add(new LedgerDtos.PartnerEntryResponse(
                            s.settleDate(), s.docNo(), "수금", s.partnerId(), s.partnerName(),
                            BigDecimal.ZERO, s.amount())));
        } else {
            purchaseService.findAll(from, to).forEach(p -> out.add(new LedgerDtos.PartnerEntryResponse(
                    p.purchaseDate(), p.docNo(), "구매", p.partnerId(), p.partnerName(),
                    p.totalAmount(), BigDecimal.ZERO)));
            settlementService.findBetween(SettlementType.PAYMENT, from, to)
                    .forEach(s -> out.add(new LedgerDtos.PartnerEntryResponse(
                            s.settleDate(), s.docNo(), "지급", s.partnerId(), s.partnerName(),
                            BigDecimal.ZERO, s.amount())));
        }
        /*
         * 회계전표가 통제계정을 직접 움직인 것(어음·수표·대체·외주비 회계반영 …). 잔액이 이것을 세므로(60회차)
         * 여기도 줄로 세워야 [전표별] 누계가 기말 잔액에 닿는다(QA 64회차 — 어음 수취 19억이 줄 없이 잔액에만 있었다).
         * 채권은 차변이 올리고 대변이 내린다. 채무는 반대.
         */
        for (Object[] r : journalLineRepository.controlAccountLines(
                receivableSide ? AR_ACCOUNT : AP_ACCOUNT, COUNTED_BY_SLIP, from, to)) {
            BigDecimal dr = (BigDecimal) r[5];
            BigDecimal cr = (BigDecimal) r[6];
            out.add(new LedgerDtos.PartnerEntryResponse(
                    (LocalDate) r[0], (String) r[1], ((JournalSourceType) r[2]).getDisplayName(),
                    (Long) r[3], (String) r[4],
                    receivableSide ? dr : cr, receivableSide ? cr : dr));
        }
        /* 날짜 차례. 같은 날이면 올린 것(판매·구매)을 먼저 세운다 — 원장을 읽는 차례다. */
        out.sort(java.util.Comparator
                .comparing(LedgerDtos.PartnerEntryResponse::date)
                .thenComparing(e -> e.increase().signum() == 0 ? 1 : 0)
                .thenComparing(e -> e.docNo() == null ? "" : e.docNo()));
        return out;
    }

    /**
     * 거래처별채권·거래처별채무의 기간 움직임 — 원본 열 그대로 쪼갠다.
     *
     * <p>기초 + 재고 + 회계 − 수금(지급) + 기타차액 = 잔액. 기타차액은 <b>나머지</b>라
     * 우리가 이름 붙여 세지 못한 움직임이 있으면 여기 남는다. 0 이 아니면 빠뜨린 것이 있다는
     * 뜻이므로 감추지 않고 그대로 보여 준다.
     *
     * <p>수금합계에는 정산전표뿐 아니라 <b>회계전표가 통제계정을 줄인 것</b>(어음·수표·상계)도
     * 넣는다. 그러지 않으면 어음으로 받은 것이 통째로 '기타차액' 으로 밀려 무슨 일이 있었는지
     * 알 수 없게 된다.
     */
    @Transactional(readOnly = true)
    public List<PartnerMovementResponse> partnerMovements(LocalDate from, LocalDate to, boolean receivableSide) {
        Map<Long, BigDecimal> opening = balanceMap(from.minusDays(1), receivableSide);
        Map<Long, BigDecimal> closing = balanceMap(to, receivableSide);

        Map<Long, BigDecimal> stock = new HashMap<>();
        if (receivableSide) {
            salesRepository.sumTotalByPartnerBetween(from, to)
                    .forEach(pa -> stock.put(pa.getPartnerId(), pa.getTotal()));
        } else {
            purchaseRepository.sumTotalByPartnerBetween(from, to)
                    .forEach(pa -> stock.put(pa.getPartnerId(), pa.getTotal()));
        }

        Map<Long, BigDecimal> settled = new HashMap<>();
        settlementRepository.sumByPartnerBetween(
                        receivableSide ? SettlementType.RECEIPT : SettlementType.PAYMENT, from, to)
                .forEach(pa -> settled.put(pa.getPartnerId(), pa.getTotal()));

        Map<Long, Move> moves = controlMoves(receivableSide ? AR_ACCOUNT : AP_ACCOUNT, from, to);

        List<PartnerMovementResponse> out = new java.util.ArrayList<>();
        for (BusinessPartner p : partnerRepository.findAllWithGroup()) {
            Long id = p.getId();
            BigDecimal op = opening.getOrDefault(id, BigDecimal.ZERO);
            BigDecimal cl = closing.getOrDefault(id, BigDecimal.ZERO);
            BigDecimal st = stock.getOrDefault(id, BigDecimal.ZERO);
            Move mv = moves.getOrDefault(id, new Move(BigDecimal.ZERO, BigDecimal.ZERO));
            // 채권이면 차변이 늘리는 쪽, 채무면 대변이 늘리는 쪽이다.
            BigDecimal acct = receivableSide ? mv.debit() : mv.credit();
            BigDecimal paid = settled.getOrDefault(id, BigDecimal.ZERO)
                    .add(receivableSide ? mv.credit() : mv.debit());
            BigDecimal other = cl.subtract(op.add(st).add(acct).subtract(paid));

            if (op.signum() == 0 && cl.signum() == 0 && st.signum() == 0
                    && acct.signum() == 0 && paid.signum() == 0) {
                continue;   // 이 기간에 아무 일도 없었던 거래처는 줄을 만들지 않는다
            }
            out.add(new PartnerMovementResponse(
                    id, p.getCode(), p.getName(), p.getManager(), op, st, acct, paid, other, cl));
        }
        out.sort((a, b) -> b.closing().compareTo(a.closing()));
        return out;
    }

    /** 기준일자 잔액을 거래처별 map 으로. */
    private Map<Long, BigDecimal> balanceMap(LocalDate asOf, boolean receivableSide) {
        Map<Long, BigDecimal> m = new HashMap<>();
        for (PartnerBalanceResponse b : partnerBalances(asOf)) {
            m.put(b.partnerId(), receivableSide ? b.receivable() : b.payable());
        }
        return m;
    }

    private PartnerBalanceResponse toBalance(BusinessPartner p,
                                             Map<Long, BigDecimal> receivables,
                                             Map<Long, BigDecimal> payables,
                                             Map<Long, BigDecimal> arJournal,
                                             Map<Long, BigDecimal> apJournal) {
        return new PartnerBalanceResponse(
                p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                receivables.getOrDefault(p.getId(), BigDecimal.ZERO),
                payables.getOrDefault(p.getId(), BigDecimal.ZERO),
                p.getPartnerGroup() != null ? p.getPartnerGroup().getId() : null,
                p.getPartnerGroup() != null ? p.getPartnerGroup().getName() : null,
                p.getManager(), p.isActive(),
                p.getParent() != null ? p.getParent().getId() : null,
                p.getParent() != null ? p.getParent().getName() : null,
                arJournal.getOrDefault(p.getId(), BigDecimal.ZERO),
                apJournal.getOrDefault(p.getId(), BigDecimal.ZERO));
    }
}
