package com.erp.inventory.repository;

import com.erp.inventory.domain.StockTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface StockTransactionRepository extends JpaRepository<StockTransaction, Long> {

    /** 최근 입출고 이력 (품목/창고 함께 로딩, 최신순) */
    @Query(value = "select t from StockTransaction t " +
            "join fetch t.item join fetch t.warehouse " +
            "order by t.transactionDate desc, t.id desc",
            countQuery = "select count(t) from StockTransaction t")
    Page<StockTransaction> findAllWithRefs(Pageable pageable);

    /**
     * 재고수불부 — 기간·창고·품목으로 거른 입출고 원장.
     * 잔량을 위→아래로 읽도록 <b>오름차순</b>(일자·id)으로 정렬한다.
     * itemId/warehouseId는 null이면 해당 조건을 생략한다.
     * 날짜(from/to)는 <b>항상 non-null</b>로 넘긴다 — PostgreSQL이 {@code :param is null}
     * 문맥의 날짜 파라미터 타입을 추론하지 못해(42P18) 서비스에서 넓은 기본값으로 채운다.
     */
    @Query("select t from StockTransaction t " +
            "join fetch t.item join fetch t.warehouse " +
            "where (:itemId is null or t.item.id = :itemId) " +
            "and (:warehouseId is null or t.warehouse.id = :warehouseId) " +
            "and t.transactionDate >= :from and t.transactionDate <= :to " +
            "order by t.transactionDate asc, t.id asc")
    List<StockTransaction> findLedger(@Param("itemId") Long itemId,
                                      @Param("warehouseId") Long warehouseId,
                                      @Param("from") LocalDate from,
                                      @Param("to") LocalDate to);

    /**
     * 위와 <b>같은 조건으로 줄 수만</b> 센다. 다 꺼내 놓고 세면 이미 늦다 —
     * 너무 넓게 물었는지 먼저 알아야 앞부분만 꺼낼 수 있다.
     */
    @Query("select count(t) from StockTransaction t " +
            "where (:itemId is null or t.item.id = :itemId) " +
            "and (:warehouseId is null or t.warehouse.id = :warehouseId) " +
            "and t.transactionDate >= :from and t.transactionDate <= :to")
    long countLedger(@Param("itemId") Long itemId,
                     @Param("warehouseId") Long warehouseId,
                     @Param("from") LocalDate from,
                     @Param("to") LocalDate to);

    /** 위와 같은 조건·차례로 <b>앞에서 몇 줄만</b> 꺼낸다. 문턱을 넘었을 때 쓴다. */
    @Query("select t from StockTransaction t " +
            "join fetch t.item join fetch t.warehouse " +
            "where (:itemId is null or t.item.id = :itemId) " +
            "and (:warehouseId is null or t.warehouse.id = :warehouseId) " +
            "and t.transactionDate >= :from and t.transactionDate <= :to " +
            "order by t.transactionDate asc, t.id asc")
    List<StockTransaction> findLedgerPage(@Param("itemId") Long itemId,
                                          @Param("warehouseId") Long warehouseId,
                                          @Param("from") LocalDate from,
                                          @Param("to") LocalDate to,
                                          org.springframework.data.domain.Pageable pageable);

    /** 기간 시작 직전의 기초재고 = 해당 (품목,창고)에서 {@code from} 이전 변동량의 합(순증감). */
    @Query("select coalesce(sum(t.quantityChange), 0) from StockTransaction t " +
            "where t.item.id = :itemId and t.warehouse.id = :warehouseId " +
            "and t.transactionDate < :from")
    java.math.BigDecimal sumChangeBefore(@Param("itemId") Long itemId,
                                         @Param("warehouseId") Long warehouseId,
                                         @Param("from") LocalDate from);

    /**
     * 재고변동표 — 품목별 기간 입고·출고 합계. 반환: [itemId, inQty, outQty].
     * warehouseId가 null이면 전 창고 합산. 날짜는 서비스에서 항상 non-null로 넘긴다(42P18 회피).
     */
    @Query("select t.item.id, " +
            "coalesce(sum(case when t.quantityChange > 0 then t.quantityChange else 0 end), 0), " +
            "coalesce(sum(case when t.quantityChange < 0 then -t.quantityChange else 0 end), 0) " +
            "from StockTransaction t " +
            "where t.transactionDate >= :from and t.transactionDate <= :to " +
            "and (:warehouseId is null or t.warehouse.id = :warehouseId) " +
            "group by t.item.id")
    List<Object[]> aggregateMovement(@Param("from") LocalDate from,
                                     @Param("to") LocalDate to,
                                     @Param("warehouseId") Long warehouseId);

    /**
     * 잔량재집계 기초 — <b>(품목,창고)별</b> {@code from} 이전 순증감 합. 반환: [itemId, warehouseId, opening].
     *
     * <p>재집계는 (품목,창고) 무리마다 기초재고가 필요한데, 예전에는 무리 하나당
     * {@code sumChangeBefore} 를 <b>한 번씩</b> 불렀다. 이번 달만 재집계해도 1.3초,
     * 석 달이면 5.6초가 걸렸다. 한 번에 묶어 묻는다.
     *
     * <p>바로 아래 {@code aggregateOpening} 은 <b>품목별</b>이라 재고변동표 것이다 —
     * 창고를 가르지 않으므로 여기서는 못 쓴다.
     */
    @Query("select t.item.id, t.warehouse.id, coalesce(sum(t.quantityChange), 0) " +
            "from StockTransaction t " +
            "where t.transactionDate < :from " +
            "group by t.item.id, t.warehouse.id")
    List<Object[]> aggregateOpeningByItemWarehouse(@Param("from") LocalDate from);

    /** 재고변동표 기초 — 품목별 {@code from} 이전 순증감 합. 반환: [itemId, opening]. */
    @Query("select t.item.id, coalesce(sum(t.quantityChange), 0) " +
            "from StockTransaction t " +
            "where t.transactionDate < :from " +
            "and (:warehouseId is null or t.warehouse.id = :warehouseId) " +
            "group by t.item.id")
    List<Object[]> aggregateOpening(@Param("from") LocalDate from,
                                    @Param("warehouseId") Long warehouseId);

    /**
     * <b>기준일 다음날부터 지금까지</b>의 변동 합 — (품목, 창고)별.
     *
     * <p>과거 시점 재고는 <b>현재고에서 그 뒤 변동을 빼서</b> 구한다. 이력만 더해서 구하지
     * 않는 이유는, 이력이 지워지거나 잔량만 손으로 고쳐진 자료가 섞이면 그 시점 숫자가
     * 통째로 틀리기 때문이다. 현재고는 화면들이 이미 믿고 쓰는 값이다.
     */
    @Query("select t.item.id, t.warehouse.id, coalesce(sum(t.quantityChange), 0) " +
           "from StockTransaction t where t.transactionDate > :asOf " +
           "group by t.item.id, t.warehouse.id")
    List<Object[]> sumChangeAfter(@Param("asOf") java.time.LocalDate asOf);

    /*
     * <b>[대표품목으로 합산]</b> 용. 위 질의들은 품목을 <b>하나</b>만 받는데, 합산은 대표와
     * 형제들을 <b>한꺼번에</b> 봐야 한다.
     *
     * <p>기존 질의에 <code>(:itemIds is null or t.item.id in :itemIds)</code> 를 얹지 않고
     * <b>따로</b> 둔다. PostgreSQL 은 <code>is null</code> 비교에서 파라미터 타입을 못 정해
     * 42P18 로 터진다 — 기타이동 기간 조건에서 겪은 것과 같은 함정이다. 여기서는 ids 가
     * 결코 비지 않으므로 null 갈래가 아예 필요 없다.
     */
    @Query("select t from StockTransaction t " +
            "join fetch t.item join fetch t.warehouse " +
            "where t.item.id in :itemIds " +
            "and (:warehouseId is null or t.warehouse.id = :warehouseId) " +
            "and t.transactionDate >= :from and t.transactionDate <= :to " +
            "order by t.transactionDate asc, t.id asc")
    List<StockTransaction> findLedgerOfItems(@Param("itemIds") List<Long> itemIds,
                                             @Param("warehouseId") Long warehouseId,
                                             @Param("from") LocalDate from,
                                             @Param("to") LocalDate to,
                                             Pageable pageable);

    @Query("select count(t) from StockTransaction t " +
            "where t.item.id in :itemIds " +
            "and (:warehouseId is null or t.warehouse.id = :warehouseId) " +
            "and t.transactionDate >= :from and t.transactionDate <= :to")
    long countLedgerOfItems(@Param("itemIds") List<Long> itemIds,
                            @Param("warehouseId") Long warehouseId,
                            @Param("from") LocalDate from,
                            @Param("to") LocalDate to);

    /** 합산일 때의 기초잔량 — 형제들의 그 날 이전 움직임을 다 더한다. */
    @Query("select coalesce(sum(t.quantityChange), 0) from StockTransaction t " +
            "where t.item.id in :itemIds and t.warehouse.id = :warehouseId " +
            "and t.transactionDate < :date")
    BigDecimal sumChangeBeforeOfItems(@Param("itemIds") List<Long> itemIds,
                                      @Param("warehouseId") Long warehouseId,
                                      @Param("date") LocalDate date);

}
