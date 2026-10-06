package com.erp.accounting.reflection;

import com.erp.accounting.journal.JournalService;
import com.erp.common.ApiException;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalSourceType;
import com.erp.accounting.journal.JournalEntryRepository;
import com.erp.trade.purchase.Purchase;
import com.erp.trade.sales.Sales;
import com.erp.trade.settlement.Settlement;
import com.erp.trade.settlement.SettlementRepository;
import com.erp.accounting.reflection.dto.AccountingReflectionDtos.ReflectRequest;
import com.erp.accounting.reflection.dto.AccountingReflectionDtos.ReflectResult;
import com.erp.accounting.reflection.dto.AccountingReflectionDtos.SlipKind;
import com.erp.accounting.reflection.dto.AccountingReflectionDtos.SlipResponse;
import com.erp.trade.purchase.PurchaseRepository;
import com.erp.trade.sales.SalesRepository;
import com.erp.trade.sales.SalesService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.erp.accounting.reflection.dto.AccountingReflectionDtos;

/** 판매/구매 전표의 회계반영 현황 조회 및 일괄반영. 반영 시 실제 회계전표(분개)를 생성한다. */
@Service
@RequiredArgsConstructor
public class AccountingReflectionService {

    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SettlementRepository settlementRepository;
    private final JournalEntryRepository entryRepository;
    private final JournalService journalService;
    private final SalesService salesService;
    private final com.erp.accounting.bankcard.BankCardService bankCardService;

    /**
     * 회계반영된 판매를 <b>매출전표(회계전표)까지 함께</b> 지운다 — 원본 판매조회 [선택삭제]의 [매출전표포함].
     *
     * <p>2026-10-06 loginaa 실측: 반영된 판매(2026/10/06-9)를 선택삭제하자 '회계반영된 전표의 경우, 매출전표의 삭제 여부를
     * 선택해주시기 바랍니다' 창에 판매전표 · 연결회계전표 · [매출전표포함](기본 체크)이 떴고, 삭제하자 회계전표 ·
     * 세금계산서까지 같이 사라졌다. 우리는 '회계반영을 먼저 취소하세요' 로 막아 두 번 일해야 했다.
     * 분개 삭제 → 반영 표시 내림 → 판매 삭제(재고 되돌림)를 <b>한 트랜잭션</b>에서 해서 어느 하나만 남는 일이 없다.
     * 반영 안 된 판매도 받는다(그냥 지운다). 판매가 확인 · 결재중 · 세금계산서 발행이면 판매 쪽 규칙대로 거절된다.
     */
    @Transactional
    public ReflectResult deleteSalesWithJournal(List<Long> ids, String username) {
        if (ids.isEmpty()) throw ApiException.badRequest("지울 전표를 선택하세요.");
        int count = 0;
        for (Sales s : salesRepository.findAllById(ids)) {
            if (s.isAccountingReflected()) {
                journalService.deleteBySource(JournalSourceType.SALES, s.getId());
                s.setAccountingReflected(false);
                salesRepository.flush();
            }
            salesService.delete(s.getId(), username);
            count++;
        }
        return new ReflectResult(count);
    }

    @Transactional(readOnly = true)
    public List<SlipResponse> list(SlipKind kind, boolean onlyUnreflected) {
        List<SlipResponse> slips = switch (kind) {
            case SALES -> salesRepository.findAllWithRefsAndLines().stream()
                    .map(SlipResponse::fromSales).toList();
            case PURCHASE -> purchaseRepository.findAllWithRefsAndLines().stream()
                    .map(SlipResponse::fromPurchase).toList();
            case SETTLEMENT -> settlementRepository.findAll().stream()
                    .map(SlipResponse::fromSettlement).toList();
        };
        if (onlyUnreflected) {
            return slips.stream().filter(s -> !s.reflected()).toList();
        }
        return withJournalNos(kind, slips);
    }

    /**
     * 원본 판매·구매일괄회계반영의 <b>[회계전표No.]</b> 열.
     *
     * <p>반영했다는 표시만 있고 <b>어느 분개가 됐는지가 없으면</b> 그 전표를 찾아갈 길이
     * 없다. 금액이 이상할 때 사람이 회계전표를 뒤져 짝을 맞춰야 했다.
     *
     * <p>출처(source_type, source_id)로 한 번에 끌어와 붙인다 — 줄마다 찾으면 N+1 이다.
     */
    private List<SlipResponse> withJournalNos(SlipKind kind, List<SlipResponse> slips) {
        List<Long> reflected = slips.stream().filter(SlipResponse::reflected)
                .map(SlipResponse::id).toList();
        if (reflected.isEmpty()) return slips;

        JournalSourceType source = switch (kind) {
            case SALES -> JournalSourceType.SALES;
            case PURCHASE -> JournalSourceType.PURCHASE;
            case SETTLEMENT -> JournalSourceType.SETTLEMENT;
        };
        Map<Long, JournalEntry> bySource = entryRepository
                .findBySourceTypeAndSourceIdIn(source, reflected).stream()
                .collect(Collectors.toMap(JournalEntry::getSourceId, e -> e, (a, b) -> a));

        return slips.stream().map(s -> {
            JournalEntry e = bySource.get(s.id());
            return e == null ? s : s.withJournal(e.getId(), e.getDocNo());
        }).toList();
    }

    @Transactional
    public ReflectResult reflect(ReflectRequest req) {
        if (req.ids().isEmpty()) {
            throw ApiException.badRequest("반영할 전표를 선택하세요.");
        }
        int count = 0;
        if (req.kind() == SlipKind.SETTLEMENT) {
            for (Settlement st : settlementRepository.findAllById(req.ids())) {
                if (!st.isAccountingReflected()) {
                    JournalEntry entry = journalService.createFromSettlement(st);
                    recordBankMove(st, entry);
                    st.setAccountingReflected(true);
                    count++;
                }
            }
        } else if (req.kind() == SlipKind.SALES) {
            List<Sales> targets = salesRepository.findAllById(req.ids());
            for (Sales s : targets) {
                if (!s.isAccountingReflected()) {
                    journalService.createFromSales(s);   // 실제 분개 생성
                    s.setAccountingReflected(true);
                    count++;
                }
            }
        } else {
            List<Purchase> targets = purchaseRepository.findAllById(req.ids());
            for (Purchase p : targets) {
                if (!p.isAccountingReflected()) {
                    journalService.createFromPurchase(p);
                    p.setAccountingReflected(true);
                    count++;
                }
            }
        }
        return new ReflectResult(count);
    }

    /**
     * 계좌로 받은 · 준 결제는 분개와 함께 <b>그 계좌의 잔액 · 입출금 내역</b>도 움직인다 — 계좌 계정(분개)만 늘고
     * 계좌잔액은 그대로면 계좌별 잔액과 장부가 어긋난다. 수금은 받은 돈(금액 − 수수료)만큼 입금,
     * 지급은 나간 돈(금액 + 수수료)만큼 출금. 되돌린 돈(음수)은 방향을 뒤집는다. 반영 취소 때 reverseExternal 로 되돌린다.
     */
    private void recordBankMove(Settlement st, JournalEntry entry) {
        if (st.getBankAccountId() == null) return;
        java.math.BigDecimal fee = st.getFee() != null ? st.getFee() : java.math.BigDecimal.ZERO;
        boolean receipt = st.getType() == com.erp.trade.settlement.SettlementType.RECEIPT;
        java.math.BigDecimal moved = receipt ? st.getAmount().subtract(fee) : st.getAmount().add(fee);
        if (moved.signum() == 0) return;
        boolean deposit = receipt == (moved.signum() > 0);
        bankCardService.recordExternal(st.getBankAccountId(), deposit, moved.abs(), st.getSettleDate(),
                st.getType().getDisplayName() + " " + st.getDocNo() + " " + st.getPartner().getName(), entry, st.getCreatedBy());
    }

    /** 회계반영 취소: 연결된 회계전표를 삭제하고 플래그를 내린다. */
    @Transactional
    public ReflectResult unreflect(ReflectRequest req) {
        if (req.ids().isEmpty()) {
            throw ApiException.badRequest("반영취소할 전표를 선택하세요.");
        }
        int count = 0;
        if (req.kind() == SlipKind.SETTLEMENT) {
            for (Settlement st : settlementRepository.findAllById(req.ids())) {
                if (st.isAccountingReflected()) {
                    entryRepository.findBySourceTypeAndSourceId(JournalSourceType.SETTLEMENT, st.getId())
                            .ifPresent(e -> bankCardService.reverseExternal(e, "회계반영 취소 " + st.getDocNo(), st.getCreatedBy()));
                    journalService.deleteBySource(JournalSourceType.SETTLEMENT, st.getId());
                    st.setAccountingReflected(false);
                    count++;
                }
            }
        } else if (req.kind() == SlipKind.SALES) {
            for (Sales s : salesRepository.findAllById(req.ids())) {
                if (s.isAccountingReflected()) {
                    journalService.deleteBySource(JournalSourceType.SALES, s.getId());
                    s.setAccountingReflected(false);
                    count++;
                }
            }
        } else {
            for (Purchase p : purchaseRepository.findAllById(req.ids())) {
                if (p.isAccountingReflected()) {
                    journalService.deleteBySource(JournalSourceType.PURCHASE, p.getId());
                    p.setAccountingReflected(false);
                    count++;
                }
            }
        }
        return new ReflectResult(count);
    }
}
