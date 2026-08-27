package com.erp.accounting.service;

import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.SettlementType;
import com.erp.accounting.domain.JournalSourceType;
import com.erp.accounting.dto.LedgerDtos.PartnerBalanceResponse;
import com.erp.accounting.dto.LedgerDtos.PartnerMovementResponse;
import com.erp.accounting.repository.JournalLineRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.SalesRepository;
import com.erp.trade.repository.SettlementRepository;
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
import com.erp.accounting.dto.LedgerDtos;

@Service
@RequiredArgsConstructor
public class LedgerService {

    private final BusinessPartnerRepository partnerRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SettlementRepository settlementRepository;
    private final JournalLineRepository journalLineRepository;

    /**
     * 채권·채무의 <b>통제계정</b> 코드.
     *
     * <p>회계전표가 이 계정을 직접 움직이면 그것도 채권·채무다. 어음으로 받았으면
     * 외상매출금은 줄고 받을어음이 는다. 그런데 우리 잔액은 <b>판매전표와 정산전표만</b> 센다 —
     * 개발 자료에서 외상매출금 대변 4.4억(어음 2.7억 · 수표 1.7억), 외상매입금 차변 1.5억이
     * 그렇게 잔액 바깥에 떠 있었다.
     *
     * <p>그 미반영분을 잔액 공식에 바로 넣지는 않는다. 넣어 보니 시드 어음이 판매보다 훨씬 커서
     * 채권 잔액이 통째로 음수가 됐다 — 자료가 짝이 안 맞는다는 뜻이지, 그 상태로 채권현황·
     * 미수금까지 숫자를 갈아엎을 근거는 아니다. 대신 <b>거래처별채권의 [기타할인등차액]</b> 이
     * 그 차이를 드러내게 한다. 원본에서 그 열이 하는 일이 정확히 그것이다.
     *
     * <p>판매·구매전표에서 자동으로 만들어진 회계전표는 뺀다 — 그건 전표 자체로 이미 세고 있다.
     */
    private static final String AR_ACCOUNT = "108";   // 외상매출금
    private static final String AP_ACCOUNT = "251";   // 외상매입금

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

        return partnerRepository.findAllWithGroup().stream()
                .map(p -> toBalance(p, receivables, payables))
                .toList();
    }

    /** 통제계정 한 곳의 거래처별 차변·대변 합. */
    private record Move(BigDecimal debit, BigDecimal credit) {}

    private Map<Long, Move> controlMoves(String accountCode, JournalSourceType exclude,
                                         LocalDate from, LocalDate to) {
        Map<Long, Move> m = new HashMap<>();
        for (Object[] row : journalLineRepository.sumControlAccountByPartner(accountCode, exclude, from, to)) {
            m.put((Long) row[0], new Move((BigDecimal) row[1], (BigDecimal) row[2]));
        }
        return m;
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

        Map<Long, Move> moves = controlMoves(
                receivableSide ? AR_ACCOUNT : AP_ACCOUNT,
                receivableSide ? JournalSourceType.SALES : JournalSourceType.PURCHASE,
                from, to);

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
                                             Map<Long, BigDecimal> payables) {
        return new PartnerBalanceResponse(
                p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                receivables.getOrDefault(p.getId(), BigDecimal.ZERO),
                payables.getOrDefault(p.getId(), BigDecimal.ZERO),
                p.getPartnerGroup() != null ? p.getPartnerGroup().getId() : null,
                p.getPartnerGroup() != null ? p.getPartnerGroup().getName() : null,
                p.getManager(), p.isActive());
    }
}
