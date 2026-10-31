package com.erp.trade.purchaseorder;

import com.erp.common.history.ChangeHistoryService;
import com.erp.trade.purchase.PurchaseLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 발주서 진행상태를 <b>구매 전표</b>로 다시 정한다. 구매입력에서 발주서를 불러와 끊을 때마다 부른다.
 *
 * <p>예전엔 [입고전환] 버튼으로만 닫혀서, 구매입력에서 발주를 불러와 전량을 사도 '발주요청' 그대로였다
 * (QA 9회차). 원본 이카운트는 구매입력이 발주서를 불러오면 발주서를 완료로 닫는다(진행상태변경설정 '자동변경')
 * — 주문서 쪽(SalesOrderService.refreshProgress, #19)과 같은 규칙이다.
 *
 * <p>PurchaseOrderService 는 입고전환에서 PurchaseService 를 부르므로, PurchaseService 가 그쪽을 부르면
 * 순환이 된다. 그래서 상태 판단만 이 작은 컴포넌트로 뺐다 — 둘 다 이것을 쓴다.
 */
@Component
@RequiredArgsConstructor
public class PurchaseOrderProgress {

    private final PurchaseLineRepository purchaseLineRepository;
    private final PurchaseOrderHistoryRepository historyRepository;
    private final ChangeHistoryService changeHistory;

    /**
     * 전 품목을 샀으면 입고전환, 아니면 — 구매로 닫혔던 것만 — 닫히기 직전 단계로 되돌린다.
     * [입고전환] 버튼으로 닫힌 것(convertedPurchaseId 가 있다)은 그 전표를 지울 때 PurchaseService 가 되돌린다.
     */
    @Transactional
    public void refresh(PurchaseOrder po, String username) {
        if (po.getStatus() == PurchaseOrderStatus.CANCELLED || po.getLines().isEmpty()) return;

        Map<Long, BigDecimal> ordered = new HashMap<>();
        for (PurchaseOrderLine l : po.getLines()) ordered.merge(l.getItem().getId(), l.getQuantity(), BigDecimal::add);
        Map<Long, BigDecimal> bought = new HashMap<>();
        for (PurchaseLineRepository.OrderItemAggregate a : purchaseLineRepository.aggregateBoughtByOrder(po.getId(), null)) {
            bought.merge(a.getItemId(), a.getQty(), BigDecimal::add);
        }
        boolean allBought = ordered.entrySet().stream()
                .allMatch(e -> bought.getOrDefault(e.getKey(), BigDecimal.ZERO).compareTo(e.getValue()) >= 0);

        if (allBought && po.getStatus() != PurchaseOrderStatus.RECEIVED) {
            trace(po, po.getStatus(), PurchaseOrderStatus.RECEIVED, username, "구매입력으로 전량 입고");
            po.setStatus(PurchaseOrderStatus.RECEIVED);
            recordSlip(po, ChangeHistoryService.STATUS_CHANGED, PurchaseOrderStatus.RECEIVED);
        } else if (!allBought && po.getStatus() == PurchaseOrderStatus.RECEIVED && po.getConvertedPurchaseId() == null) {
            PurchaseOrderStatus back = statusBeforeReceived(po);
            trace(po, PurchaseOrderStatus.RECEIVED, back, username, "구매 삭제·수정으로 잔량이 생김");
            po.setStatus(back);
            recordSlip(po, ChangeHistoryService.STATUS_CHANGED, back);
        }
    }

    /** 입고전환 바로 앞 단계. 이력이 없으면(옛 자료) 발주확정으로 둔다. */
    private PurchaseOrderStatus statusBeforeReceived(PurchaseOrder po) {
        List<PurchaseOrderHistory> h = historyRepository.findByOrderIdOrderByChangedAtAscIdAsc(po.getId());
        for (int i = h.size() - 1; i >= 0; i--) {
            if (h.get(i).getToStatus() == PurchaseOrderStatus.RECEIVED && h.get(i).getFromStatus() != null) {
                return h.get(i).getFromStatus();
            }
        }
        return PurchaseOrderStatus.ORDERED;
    }

    /**
     * 전표 이력(거래이력조회(재고) · 발주서/발주요청/단가요청 [이력조회] 창 · [H]) 한 줄 — 판매 · 구매 전표와 같은 꼴(SlipSnapshot).
     * 발주서 한 엔티티가 상태로 세 메뉴다(원본 메뉴검색 '발주요청' · '단가요청' · '발주서').
     * 발주요청 → 발주요청, 단가요청 · 단가확정 → 단가요청, 발주계획 · 발주확정 · 입고전환 · 취소 → 발주서.
     * (발주계획은 원본 메뉴검색에 없음 — 어느 메뉴에 묶이는지 원본 재기 필요.)
     *
     * <p>구매입력이 발주를 끊어 상태가 바뀔 때(여기 refresh)도 남긴다 — 예전엔 PurchaseOrderService 만 남겨서
     * 구매입력으로 닫힌 발주서는 [이력조회] 에 '신규' 하나뿐이었다.
     */
    void recordSlip(PurchaseOrder po, String action, PurchaseOrderStatus status) {
        String menu = switch (status) {
            case REQUESTED -> "발주요청";
            case PRICE_REQUESTED, PRICED -> "단가요청";
            default -> "발주서";
        };
        PurchaseOrderLine first = po.getLines().isEmpty() ? null : po.getLines().get(0);
        changeHistory.recordSlip(PurchaseOrderService.HISTORY_TARGET, po.getId(), action, new ChangeHistoryService.SlipSnapshot(menu,
                po.getOrderDate(), po.getOrderNo(),
                po.getPartner() != null ? po.getPartner().getCode() : null,
                po.getPartner() != null ? po.getPartner().getName() : null,
                first == null ? null : ChangeHistoryService.itemSummary(first.effectiveItemName(), first.effectiveSpec(), po.getLines().size()),
                po.getEmployee() != null ? po.getEmployee().getCode() : null,
                po.getEmployee() != null ? po.getEmployee().getName() : null,
                status.getDisplayName()));
    }

    void trace(PurchaseOrder po, PurchaseOrderStatus from, PurchaseOrderStatus to, String username, String note) {
        historyRepository.save(PurchaseOrderHistory.builder()
                .order(po)
                .changedAt(LocalDateTime.now())
                .fromStatus(from)
                .toStatus(to)
                .changedBy(username)
                .note(note)
                .build());
    }
}
