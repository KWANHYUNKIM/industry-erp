package com.erp.trade.purchaseorder;

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
        } else if (!allBought && po.getStatus() == PurchaseOrderStatus.RECEIVED && po.getConvertedPurchaseId() == null) {
            PurchaseOrderStatus back = statusBeforeReceived(po);
            trace(po, PurchaseOrderStatus.RECEIVED, back, username, "구매 삭제·수정으로 잔량이 생김");
            po.setStatus(back);
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
