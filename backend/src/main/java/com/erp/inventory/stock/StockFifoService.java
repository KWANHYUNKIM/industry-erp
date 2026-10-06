package com.erp.inventory.stock;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 원본 이익현황(일별 · 월별)의 원가 [선입선출(판매)] — 회사 전체 품목별로 먼저 들어온 것부터 판다고 보고,
 * 판매 출고가 꺼내 간 입고 단가로 원가를 셈한다(2026-10-04: 원본 일별이익현황 기본값이 선입선출(판매)다).
 *
 * <p>재고 이력에는 전표를 고치거나 지울 때 남는 <b>되돌림 줄</b>('판매삭제 원복 SO-…', '생산입고취소 PI-…')이 섞여 있다.
 * 이것들을 그대로 걸으면 지운 판매의 원복이 판매단가로 다시 '입고' 되어 층을 어지럽힌다. 그래서 먼저 <b>같은 전표 · 같은 품목의
 * 앞선 줄과 짝지어 둘 다 지운다</b> — 남는 것은 지금 살아 있는 움직임뿐이다. 창고이동은 회사 전체로는 들고 나는 것이 같아 뺀다.
 *
 * <p>판매반품 입고는 그 품목이 마지막으로 나간 단가로 층을 다시 쌓는다(되돌아온 물건이 원가로 돌아온다).
 * 층이 바닥났는데 팔면(음수 재고) 마지막으로 안 단가로 셈한다.
 */
@Service
@RequiredArgsConstructor
public class StockFifoService {

    private final StockTransactionRepository transactionRepository;

    /** 판매 전표번호 · 품목별로 선입선출 원가(수량 · 금액). */
    public record SaleCost(String docNo, Long itemId, BigDecimal quantity, BigDecimal cost) {}

    private static final Pattern DOC = Pattern.compile("([A-Z]{1,4}-\\d{8}-\\d+)\\s*$");

    @Transactional(readOnly = true)
    public List<SaleCost> saleCosts(LocalDate to) {
        List<StockTransaction> all = transactionRepository.findUpToWithItem(to);

        /* 1) 되돌림 줄과 그 앞선 짝을 지운다. */
        Map<String, Deque<StockTransaction>> applied = new HashMap<>();
        Set<Long> dropped = new HashSet<>();
        for (StockTransaction t : all) {
            String note = t.getNote() == null ? "" : t.getNote();
            Matcher m = DOC.matcher(note);
            if (!m.find()) continue;
            String key = m.group(1) + "#" + t.getItem().getId() + "#" + t.getWarehouse().getId();
            if (isRevert(note)) {
                Deque<StockTransaction> stack = applied.get(key);
                StockTransaction prev = stack == null ? null : stack.pollLast();
                dropped.add(t.getId());
                if (prev != null) dropped.add(prev.getId());
            } else {
                applied.computeIfAbsent(key, k -> new ArrayDeque<>()).add(t);
            }
        }

        /* 2) 품목마다 층을 쌓고 꺼낸다. */
        Map<Long, Deque<BigDecimal[]>> layers = new HashMap<>();
        Map<Long, BigDecimal> lastPrice = new HashMap<>();
        Map<String, BigDecimal[]> out = new LinkedHashMap<>();
        for (StockTransaction t : all) {
            if (dropped.contains(t.getId())) continue;
            String note = t.getNote() == null ? "" : t.getNote();
            if (note.startsWith("창고이동")) continue;
            Long itemId = t.getItem().getId();
            BigDecimal q = t.getQuantityChange();
            if (q == null || q.signum() == 0) continue;
            Deque<BigDecimal[]> qd = layers.computeIfAbsent(itemId, k -> new ArrayDeque<>());
            if (q.signum() > 0) {
                BigDecimal price = note.startsWith("판매반품") ? lastPrice.getOrDefault(itemId, nz(t.getUnitPrice()))
                        : t.getUnitPrice() != null ? t.getUnitPrice() : lastPrice.getOrDefault(itemId, BigDecimal.ZERO);
                qd.addLast(new BigDecimal[]{q, price});
                lastPrice.put(itemId, price);
            } else {
                BigDecimal need = q.negate();
                BigDecimal cost = BigDecimal.ZERO;
                while (need.signum() > 0 && !qd.isEmpty()) {
                    BigDecimal[] head = qd.peekFirst();
                    BigDecimal take = head[0].min(need);
                    cost = cost.add(take.multiply(head[1]));
                    lastPrice.put(itemId, head[1]);
                    head[0] = head[0].subtract(take);
                    need = need.subtract(take);
                    if (head[0].signum() == 0) qd.pollFirst();
                }
                if (need.signum() > 0) cost = cost.add(need.multiply(lastPrice.getOrDefault(itemId, BigDecimal.ZERO)));
                if (note.startsWith("판매 ")) {
                    Matcher m = DOC.matcher(note);
                    if (m.find()) {
                        BigDecimal[] acc = out.computeIfAbsent(m.group(1) + "#" + itemId, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                        acc[0] = acc[0].add(q.negate());
                        acc[1] = acc[1].add(cost);
                    }
                }
            }
        }
        List<SaleCost> rows = new ArrayList<>();
        out.forEach((k, v) -> {
            String[] p = k.split("#");
            rows.add(new SaleCost(p[0], Long.valueOf(p[1]), v[0], v[1].setScale(2, RoundingMode.HALF_UP)));
        });
        return rows;
    }

    /** '판매삭제 원복 SO-…' · '생산입고취소 PI-…' · 'A/S소모 취소 …' 처럼 앞선 움직임을 되돌리는 줄. */
    private static boolean isRevert(String note) {
        String head = note.replaceAll("\\s*[A-Z]{1,4}-\\d{8}-\\d+\\s*$", "").trim();
        return head.endsWith("원복") || head.endsWith("취소");
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
}
