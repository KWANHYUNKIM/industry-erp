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

    /** 그 날 남아 있는 선입선출 층 — 품목별 수량 · 금액(원본 일별재고현황 원가 [선입선출(판매)]). */
    public record OnHand(Long itemId, BigDecimal quantity, BigDecimal value) {}

    @Transactional(readOnly = true)
    public List<SaleCost> saleCosts(LocalDate to) {
        return walk(to).sales();
    }

    /**
     * 원본 일별재고현황(E040807)의 기본 원가 [선입선출(판매)](2026-10-13 실측) — 그 날까지 걸은 뒤 <b>남은 층</b>의 금액.
     * 판매원가와 같은 걸음이라 판매가 꺼내 간 층은 이미 빠져 있다.
     */
    @Transactional(readOnly = true)
    public List<OnHand> onHand(LocalDate asOf) {
        List<OnHand> rows = new ArrayList<>();
        walk(asOf).layers().forEach((itemId, qd) -> {
            BigDecimal q = BigDecimal.ZERO;
            BigDecimal v = BigDecimal.ZERO;
            for (BigDecimal[] l : qd) { q = q.add(l[0]); v = v.add(l[0].multiply(l[1])); }
            if (q.signum() > 0) rows.add(new OnHand(itemId, q, v.setScale(2, RoundingMode.HALF_UP)));
        });
        return rows;
    }

    private record Walk(List<SaleCost> sales, Map<Long, Deque<BigDecimal[]>> layers) {}

    /** 걸음에 쓰는 수불 한 줄 — 엔티티 대신 필요한 칸만 든다(38만 줄을 엔티티로 올리면 힙이 터진다). */
    private record Move(long id, long itemId, long warehouseId, BigDecimal quantityChange, BigDecimal unitPrice, String note) {}

    private List<Move> moves(LocalDate to) {
        List<Move> all = new ArrayList<>();
        try (java.util.stream.Stream<Object[]> s = transactionRepository.streamFifoMoves(to)) {
            s.forEach(r -> all.add(new Move(((Number) r[0]).longValue(), ((Number) r[1]).longValue(),
                    ((Number) r[2]).longValue(), (BigDecimal) r[3], (BigDecimal) r[4], (String) r[5])));
        }
        return all;
    }

    private Walk walk(LocalDate to) {
        List<Move> all = moves(to);

        /* 1) 되돌림 줄과 그 앞선 짝을 지운다. */
        Map<String, Deque<Move>> applied = new HashMap<>();
        Set<Long> dropped = new HashSet<>();
        for (Move t : all) {
            String note = t.note() == null ? "" : t.note();
            Matcher m = DOC.matcher(note);
            if (!m.find()) continue;
            String key = m.group(1) + "#" + t.itemId() + "#" + t.warehouseId();
            if (isRevert(note)) {
                Deque<Move> stack = applied.get(key);
                Move prev = stack == null ? null : stack.pollLast();
                dropped.add(t.id());
                if (prev != null) dropped.add(prev.id());
            } else {
                applied.computeIfAbsent(key, k -> new ArrayDeque<>()).add(t);
            }
        }

        /* 2) 품목마다 층을 쌓고 꺼낸다. */
        Map<Long, Deque<BigDecimal[]>> layers = new HashMap<>();
        Map<Long, BigDecimal> lastPrice = new HashMap<>();
        Map<String, BigDecimal[]> out = new LinkedHashMap<>();
        for (Move t : all) {
            if (dropped.contains(t.id())) continue;
            String note = t.note() == null ? "" : t.note();
            if (note.startsWith("창고이동")) continue;
            Long itemId = t.itemId();
            BigDecimal q = t.quantityChange();
            if (q == null || q.signum() == 0) continue;
            Deque<BigDecimal[]> qd = layers.computeIfAbsent(itemId, k -> new ArrayDeque<>());
            if (q.signum() > 0) {
                BigDecimal price = note.startsWith("판매반품") ? lastPrice.getOrDefault(itemId, nz(t.unitPrice()))
                        : t.unitPrice() != null ? t.unitPrice() : lastPrice.getOrDefault(itemId, BigDecimal.ZERO);
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
        return new Walk(rows, layers);
    }

    /** '판매삭제 원복 SO-…' · '생산입고취소 PI-…' · 'A/S소모 취소 …' 처럼 앞선 움직임을 되돌리는 줄. */
    private static boolean isRevert(String note) {
        String head = note.replaceAll("\\s*[A-Z]{1,4}-\\d{8}-\\d+\\s*$", "").trim();
        return head.endsWith("원복") || head.endsWith("취소");
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
}
