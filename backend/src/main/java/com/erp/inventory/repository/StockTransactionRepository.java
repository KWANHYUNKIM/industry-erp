package com.erp.inventory.repository;

import com.erp.inventory.domain.StockTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
}
