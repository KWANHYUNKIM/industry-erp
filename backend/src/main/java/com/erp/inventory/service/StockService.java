package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Stock;
import com.erp.inventory.domain.StockTransaction;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.Warehouse;
import com.erp.inventory.dto.StockDtos.StockResponse;
import com.erp.inventory.dto.StockDtos.StockTransactionRequest;
import com.erp.inventory.dto.StockDtos.StockTransactionResponse;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.StockRepository;
import com.erp.inventory.repository.StockTransactionRepository;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import com.erp.inventory.dto.StockDtos;

@Service
@RequiredArgsConstructor
public class StockService {

    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockRepository stockRepository;
    private final StockTransactionRepository transactionRepository;

    /** 현재고 목록 (품목 x 창고) */
    @Transactional(readOnly = true)
    public List<StockResponse> currentStock() {
        return stockRepository.findAllWithItemAndWarehouse().stream()
                .map(StockResponse::from)
                .toList();
    }

    /**
     * <b>그 시점의 재고</b>. 재고현황·창고별재고·일별재고·BOM재고가 [기준일자]로 부른다.
     *
     * <p>이 화면들은 기준일자 칸을 <b>받아 놓고 무시하고 있었다</b> — 날짜를 바꿔도 늘
     * 현재고가 나왔다. 화면에 "과거 시점 재고 계산은 아직 없다" 고 적어 두긴 했지만,
     * 조건이 있으면 사람은 그 값이 반영된 줄 안다. 그게 제일 나쁜 거짓말이다.
     *
     * <p>계산은 <b>현재고 − 그 뒤의 변동</b>이다. 이력만 더해서 구하지 않는다 —
     * 이력이 지워지거나 잔량만 손으로 고쳐진 자료가 섞이면 그 시점 숫자가 통째로 틀린다.
     * (잔량과 이력 합이 같은지는 schema-check 가 따로 지킨다.)
     *
     * <p>오늘 이후 날짜를 주면 현재고 그대로다 — 앞날의 재고를 지어내지 않는다.
     */
    @Transactional(readOnly = true)
    public List<StockResponse> stockAsOf(LocalDate asOf) {
        if (asOf == null || !asOf.isBefore(LocalDate.now())) return currentStock();

        Map<String, BigDecimal> after = new HashMap<>();
        for (Object[] row : transactionRepository.sumChangeAfter(asOf)) {
            after.put(row[0] + "/" + row[1], (BigDecimal) row[2]);
        }
        return stockRepository.findAllWithItemAndWarehouse().stream()
                .map((s) -> {
                    BigDecimal moved = after.getOrDefault(
                            s.getItem().getId() + "/" + s.getWarehouse().getId(), BigDecimal.ZERO);
                    return StockResponse.asOf(s, s.getQuantity().subtract(moved));
                })
                .toList();
    }

    /** 특정 (품목, 창고)의 현재고. 없으면 0. WMS 로케이션 배치가 이 수량을 넘지 못한다. */
    @Transactional(readOnly = true)
    public BigDecimal quantityOf(Long itemId, Long warehouseId) {
        return stockRepository.findByItemIdAndWarehouseId(itemId, warehouseId)
                .map(Stock::getQuantity)
                .orElse(BigDecimal.ZERO);
    }

    /** 입출고 이력 (최신순, 페이지) */
    @Transactional(readOnly = true)
    public Page<StockTransactionResponse> transactions(int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return transactionRepository.findAllWithRefs(pageable)
                .map(StockTransactionResponse::from);
    }

    /**
     * 재고수불부 — 기간·창고·품목으로 거른 입출고 원장(일자·id 오름차순).
     * 품목·창고를 모두 특정하면 기초재고(opening)를 함께 산출한다. 저장된 balanceAfter는 입력(id)순
     * 기준이라 일자정렬 화면에서 어긋날 수 있으므로, 화면은 opening에 변동량을 누적해 잔량을 재계산한다.
     */
    /**
     * 한 번에 내려보낼 줄 수의 문턱. 원본 [오천건이상조회] 와 같은 자리다.
     * 이 위로는 화면이 그 버튼을 눌러 <b>일부러</b> 가져가야 한다.
     */
    public static final int LEDGER_PAGE_ROWS = 5000;

    @Transactional(readOnly = true)
    public StockDtos.StockLedgerResponse ledger(Long itemId, Long warehouseId, LocalDate from, LocalDate to) {
        return ledger(itemId, warehouseId, from, to, false);
    }

    @Transactional(readOnly = true)
    public StockDtos.StockLedgerResponse ledger(Long itemId, Long warehouseId,
                                                LocalDate from, LocalDate to, boolean all) {
        return ledger(itemId, warehouseId, from, to, all, false);
    }

    /**
     * 재고수불부. <code>rollUp</code> 이면 고른 품목을 <b>대표품목의 가족</b>으로 넓혀서 본다
     * (원본 조건 [대표품목으로 합산]).
     *
     * <p>거르기를 <b>서버가</b> 해야 하는 까닭: 이 화면은 5천 줄에서 자르고 기초잔량을
     * 따로 센다. 화면에서 걸러 봐야 <b>잘린 뒤에</b> 거르는 것이라 대표 줄의 수량이
     * 조용히 모자라고, 기초잔량은 고른 품목 하나 것만 남는다.
     */
    @Transactional(readOnly = true)
    public StockDtos.StockLedgerResponse ledger(Long itemId, Long warehouseId,
                                                LocalDate from, LocalDate to, boolean all,
                                                boolean rollUp) {
        // 날짜는 항상 non-null로 (PostgreSQL 42P18 회피). 미지정이면 넓은 경계로 채운다.
        LocalDate effFrom = from != null ? from : LocalDate.of(1900, 1, 1);
        LocalDate effTo = to != null ? to : LocalDate.of(9999, 12, 31);
        /*
         * 다 꺼내 놓고 자르면 이미 늦다 — 서버가 그 자료를 전부 메모리에 든 뒤다.
         * 몇 줄인지 <b>먼저 세고</b>, 넘치면 앞부분만 꺼낸다.
         */
        /* 합산이 켜져 있고 품목을 골랐을 때만 가족으로 넓힌다 — 안 고르면 넓힐 것이 없다. */
        List<Long> family = (rollUp && itemId != null) ? familyOf(itemId) : null;

        long totalRows = family != null
                ? transactionRepository.countLedgerOfItems(family, warehouseId, effFrom, effTo)
                : transactionRepository.countLedger(itemId, warehouseId, effFrom, effTo);
        boolean truncated = !all && totalRows > LEDGER_PAGE_ROWS;
        var page = truncated
                ? org.springframework.data.domain.PageRequest.of(0, LEDGER_PAGE_ROWS)
                : org.springframework.data.domain.Pageable.unpaged();
        List<StockTransactionResponse> rows = (family != null
                ? transactionRepository.findLedgerOfItems(family, warehouseId, effFrom, effTo, page)
                : truncated
                        ? transactionRepository.findLedgerPage(itemId, warehouseId, effFrom, effTo, page)
                        : transactionRepository.findLedger(itemId, warehouseId, effFrom, effTo)).stream()
                .map(StockTransactionResponse::from)
                .toList();
        BigDecimal opening = null;
        if (itemId != null && warehouseId != null) {
            opening = from == null ? BigDecimal.ZERO   // from 미지정 → 전기간, 첫 거래 이전 재고는 0
                    : family != null
                            ? transactionRepository.sumChangeBeforeOfItems(family, warehouseId, from)
                            : transactionRepository.sumChangeBefore(itemId, warehouseId, from);
        }
        return new StockDtos.StockLedgerResponse(opening, rows, totalRows, truncated);
    }

    /**
     * 재고변동표 — 품목별 기초·입고·출고·기말. warehouseId가 null이면 전 창고 합산.
     * 기간 이전에 활동이 있었거나 기간 내 입출고가 있는 품목만 포함한다.
     */
    @Transactional(readOnly = true)
    public List<StockDtos.StockMovementRow> movement(LocalDate from, LocalDate to, Long warehouseId) {
        LocalDate effFrom = from != null ? from : LocalDate.of(1900, 1, 1);
        LocalDate effTo = to != null ? to : LocalDate.of(9999, 12, 31);

        Map<Long, BigDecimal> openingByItem = new LinkedHashMap<>();
        for (Object[] r : transactionRepository.aggregateOpening(effFrom, warehouseId)) {
            openingByItem.put(((Number) r[0]).longValue(), toBig(r[1]));
        }
        Map<Long, BigDecimal[]> inOutByItem = new LinkedHashMap<>();
        for (Object[] r : transactionRepository.aggregateMovement(effFrom, effTo, warehouseId)) {
            inOutByItem.put(((Number) r[0]).longValue(), new BigDecimal[]{ toBig(r[1]), toBig(r[2]) });
        }

        // 대상 품목 = 기초 또는 기간활동이 있는 품목의 합집합
        Set<Long> itemIds = new LinkedHashSet<>();
        itemIds.addAll(openingByItem.keySet());
        itemIds.addAll(inOutByItem.keySet());
        Map<Long, Item> items = itemRepository.findAllById(itemIds).stream()
                .collect(Collectors.toMap(Item::getId, it -> it));

        List<StockDtos.StockMovementRow> rows = new java.util.ArrayList<>();
        for (Long id : itemIds) {
            Item it = items.get(id);
            if (it == null) continue;   // 품목이 지워진 경우 방어
            BigDecimal opening = openingByItem.getOrDefault(id, BigDecimal.ZERO);
            BigDecimal[] io = inOutByItem.getOrDefault(id, new BigDecimal[]{ BigDecimal.ZERO, BigDecimal.ZERO });
            BigDecimal closing = opening.add(io[0]).subtract(io[1]);
            rows.add(new StockDtos.StockMovementRow(
                    it.getId(), it.getCode(), it.getName(), it.getUnit(),
                    opening, io[0], io[1], closing));
        }
        rows.sort(java.util.Comparator.comparing(StockDtos.StockMovementRow::itemName));
        return rows;
    }

    private static BigDecimal toBig(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal b) return b;
        return BigDecimal.valueOf(((Number) v).doubleValue());
    }

    /** 입고/출고/조정 처리 (재고 화면에서 직접 등록) */
    @Transactional
    public StockTransactionResponse record(StockTransactionRequest req, String username) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        BigDecimal delta = resolveDelta(req);
        LocalDate date = req.transactionDate() != null ? req.transactionDate() : LocalDate.now();
        // 재고 이동 전표를 직접 만드는 자리다 — 수량관리제외 품목은 만들 전표가 없다.
        requireStockTracked(item);
        /*
         * 사용중지한 품목은 <b>늘리는 것만</b> 막는다.
         *
         * 안 쓰기로 한 품목을 새로 들여올 이유는 없다. 하지만 줄이는 것까지 막으면
         * 이미 창고에 남아 있는 재고를 털어낼 길이 없어져 영영 장부에 붙어 있게 된다 —
         * 사용중지 처리의 뒤처리가 바로 그 출고다.
         */
        if (delta.signum() > 0 && !item.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 품목은 재고를 늘릴 수 없습니다: " + item.getCode() + " " + item.getName()
                            + " (남은 재고를 줄이는 것은 됩니다)");
        }
        StockTransaction tx = applyDelta(item, warehouse, delta, req.type(), req.unitPrice(), date, req.note(), username);
        return StockTransactionResponse.from(tx);
    }

    /**
     * 잔량을 원자적으로 갱신하고 이력을 남긴다. 판매(출고)/구매(입고) 등 다른 서비스에서도 재사용.
     * delta 는 부호 있는 변동량(입고 +, 출고 -).
     *
     * <p><b>수량관리제외 품목이면 아무 일도 하지 않고 null 을 돌려준다.</b>
     * 용역·운반비 같은 품목은 재고가 없다 — 잡으려 들면 팔 때마다 "재고가 부족합니다" 로
     * 막힌다. 부르는 쪽이 25 군데라 여기 한 곳에서 막는다.
     *
     * <p>돌아온 전표가 필요한 쪽(재고조정)은 <b>미리</b> 걸러야 한다. 여기서 예외를 던지면
     * 판매·생산이 그 품목 때문에 통째로 롤백된다.
     */
    @Transactional
    public StockTransaction applyDelta(Item item, Warehouse warehouse, BigDecimal delta,
                                       StockTransactionType type, BigDecimal unitPrice,
                                       LocalDate date, String note, String username) {
        if (!item.isStockTracked()) return null;

        // 잔량 행을 잠그고 조회, 없으면 생성
        Stock stock = stockRepository.findForUpdate(item.getId(), warehouse.getId())
                .orElseGet(() -> stockRepository.save(Stock.builder()
                        .item(item)
                        .warehouse(warehouse)
                        .quantity(BigDecimal.ZERO)
                        .build()));

        BigDecimal newBalance = stock.getQuantity().add(delta);
        if (newBalance.compareTo(BigDecimal.ZERO) < 0) {
            throw ApiException.badRequest(String.format(
                    "재고가 부족합니다. 현재고 %s, 요청 %s (%s)",
                    stock.getQuantity().toPlainString(),
                    delta.abs().toPlainString(),
                    item.getName()));
        }
        stock.setQuantity(newBalance);

        StockTransaction tx = StockTransaction.builder()
                .item(item)
                .warehouse(warehouse)
                .type(type)
                .quantityChange(delta)
                .balanceAfter(newBalance)
                .unitPrice(unitPrice)
                .transactionDate(date != null ? date : LocalDate.now())
                .note(note)
                .createdBy(username)
                .build();
        return transactionRepository.save(tx);
    }

    /**
     * 재고를 잡지 않는 품목이면 거절한다.
     *
     * <p>조용히 건너뛰지 않는 이유는, 이 자리들(재고조정·실사·재고이동·재고전표 직접입력)이
     * <b>재고를 움직이는 것 자체가 목적</b>이기 때문이다. 아무 일도 안 하고 성공했다고
     * 답하면 사람이 조정한 줄 알고 넘어간다.
     */
    void requireStockTracked(Item item) {
        if (!item.isStockTracked()) {
            throw ApiException.badRequest(
                    "'" + item.getName() + "' 은(는) 수량관리제외 품목이라 재고를 움직일 수 없습니다.");
        }
    }

    /**
     * 실사수량(targetQty)에 맞춰 잔량을 조정한다. 차이 계산과 반영을 같은 잠금 안에서 하므로
     * 조회 시점과 반영 시점 사이에 다른 전표가 끼어들어 조정량이 어긋나는 일이 없다.
     */
    @Transactional
    public StockTransaction adjustTo(Item item, Warehouse warehouse, BigDecimal targetQty,
                                     LocalDate date, String note, String username) {
        requireStockTracked(item);
        BigDecimal current = stockRepository.findForUpdate(item.getId(), warehouse.getId())
                .map(Stock::getQuantity)
                .orElse(BigDecimal.ZERO);
        BigDecimal delta = targetQty.subtract(current);
        if (delta.signum() == 0) {
            throw ApiException.badRequest("실사수량이 현재고(" + current.toPlainString() + ")와 같아 조정할 차이가 없습니다.");
        }
        return applyDelta(item, warehouse, delta, StockTransactionType.ADJUST, null, date, note, username);
    }

    /**
     * 잔량재집계(E040607).
     *
     * 두 가지를 점검하고, {@code apply=true} 면 고친다.
     * <ol>
     *   <li><b>거래별 잔량(balanceAfter)</b> — 저장값은 입력 순서로 매겨진다. 과거 일자 거래가 뒤늦게
     *       입력되면 일자순으로 읽을 때의 잔량과 어긋난다. 기간의 기초재고에서 출발해 일자·id 순으로
     *       다시 누적해 정규화한다.</li>
     *   <li><b>잔량 테이블(stocks.quantity)</b> — 모든 재고 변동이 이력을 남기므로
     *       {@code sum(quantityChange) == stocks.quantity} 가 불변식이다. 어긋나면 이력 합계를 진실로 본다.</li>
     * </ol>
     *
     * 잔량 대조는 기간과 무관하게 전 (품목,창고) 조합을 본다 — 기간을 좁혀 놓고 "이상 없음"이라고
     * 답하면 재집계를 돌린 의미가 없다. balanceAfter 정규화만 기간 안으로 한정한다.
     */
    @Transactional
    public StockDtos.StockRecalcResult recalculate(LocalDate from, LocalDate to, boolean apply) {
        List<StockTransaction> txs = transactionRepository.findLedger(null, null, from, to);

        // (품목,창고)별로 모아 기초재고에서부터 일자순 누적으로 잔량을 다시 매긴다
        Map<String, List<StockTransaction>> grouped = txs.stream()
                .collect(Collectors.groupingBy(t -> t.getItem().getId() + ":" + t.getWarehouse().getId(),
                        LinkedHashMap::new, Collectors.toList()));

        Map<String, int[]> mismatchByKey = new LinkedHashMap<>();   // key → [기간거래수, 잔량어긋난건수]
        Map<String, BigDecimal> openingByKey = new LinkedHashMap<>();
        int balanceMismatch = 0;

        /*
         * 기초재고는 <b>한 번에 묶어</b> 묻는다. 예전에는 (품목,창고) 무리마다
         * {@code sumChangeBefore} 를 한 번씩 불러서, 이번 달만 재집계해도 1.3초,
         * 석 달이면 5.6초가 걸렸다 — 무리가 늘수록 질의도 그만큼 늘었다.
         */
        Map<String, BigDecimal> openingAll = new LinkedHashMap<>();
        for (Object[] r : transactionRepository.aggregateOpeningByItemWarehouse(from)) {
            openingAll.put(((Number) r[0]).longValue() + ":" + ((Number) r[1]).longValue(), toBig(r[2]));
        }

        for (Map.Entry<String, List<StockTransaction>> e : grouped.entrySet()) {
            List<StockTransaction> list = e.getValue();
            BigDecimal running = openingAll.getOrDefault(e.getKey(), BigDecimal.ZERO);
            openingByKey.put(e.getKey(), running);

            int fixed = 0;
            for (StockTransaction t : list) {
                running = running.add(t.getQuantityChange());
                if (t.getBalanceAfter().compareTo(running) != 0) {
                    fixed++;
                    if (apply) {
                        t.setBalanceAfter(running);
                    }
                }
            }
            balanceMismatch += fixed;
            mismatchByKey.put(e.getKey(), new int[] { list.size(), fixed });
        }

        /*
         * 잔량 테이블 대조 — 이력 전체 합계와 맞는지.
         *
         * <p>여기에도 같은 함정이 있었다. 재고 줄마다 {@code sumChangeBefore} 를 불러
         * <b>그 (품목,창고)의 전 기간 이력을 매번 훑었다.</b> 위와 같은 묶음 질의로 한 번에 받는다.
         */
        Map<String, BigDecimal> computedAll = new LinkedHashMap<>();
        for (Object[] r : transactionRepository.aggregateOpeningByItemWarehouse(LocalDate.of(2999, 12, 31))) {
            computedAll.put(((Number) r[0]).longValue() + ":" + ((Number) r[1]).longValue(), toBig(r[2]));
        }

        List<StockDtos.StockRecalcRow> rows = new java.util.ArrayList<>();
        int quantityMismatch = 0;
        for (Stock s : stockRepository.findAllWithItemAndWarehouse()) {
            String key = s.getItem().getId() + ":" + s.getWarehouse().getId();
            BigDecimal computed = computedAll.getOrDefault(key, BigDecimal.ZERO);
            BigDecimal stored = s.getQuantity();
            BigDecimal diff = computed.subtract(stored);
            int[] m = mismatchByKey.getOrDefault(key, new int[] { 0, 0 });

            if (diff.signum() != 0) {
                quantityMismatch++;
                if (apply) {
                    s.setQuantity(computed);
                }
            }
            if (m[0] > 0 || diff.signum() != 0) {
                rows.add(new StockDtos.StockRecalcRow(
                        s.getItem().getId(), s.getItem().getCode(), s.getItem().getName(),
                        s.getWarehouse().getId(), s.getWarehouse().getCode(), s.getWarehouse().getName(),
                        openingByKey.getOrDefault(key, BigDecimal.ZERO), m[0], m[1],
                        stored, computed, diff));
            }
        }

        return new StockDtos.StockRecalcResult(
                from.toString().substring(0, 7), to.toString().substring(0, 7),
                apply, txs.size(), balanceMismatch, quantityMismatch, rows);
    }

    /** 유형과 방향으로 실제 증감량(부호 있음) 계산 */
    private BigDecimal resolveDelta(StockTransactionRequest req) {
        BigDecimal qty = req.quantity().abs();
        return switch (req.type()) {
            case INBOUND -> qty;
            case OUTBOUND -> qty.negate();
            case ADJUST -> Boolean.FALSE.equals(req.increase()) ? qty.negate() : qty;
        };
    }

    /**
     * 그 품목이 속한 <b>대표품목의 가족</b> — 대표와 그 대표를 가리키는 형제들 전부.
     * 대표가 없으면 자기가 곧 대표라 자기와 자기를 가리키는 것들이 가족이다.
     */
    private List<Long> familyOf(Long itemId) {
        Item item = itemRepository.findById(itemId).orElse(null);
        if (item == null) return List.of(itemId);
        Long head = item.getParentItem() != null ? item.getParentItem().getId() : item.getId();
        List<Long> ids = new java.util.ArrayList<>();
        ids.add(head);
        for (Item sibling : itemRepository.findByParentItemId(head)) ids.add(sibling.getId());
        return ids;
    }

}
