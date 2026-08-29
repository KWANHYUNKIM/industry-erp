package com.erp.quality.repository;

import com.erp.quality.domain.AsRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface AsRequestRepository extends JpaRepository<AsRequest, Long> {

    @Query("select a from AsRequest a join fetch a.partner join fetch a.item " +
            "order by a.receiptDate desc, a.id desc")
    List<AsRequest> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select a from AsRequest a join fetch a.partner join fetch a.item " +
            "where a.receiptDate between :from and :to " +
            "order by a.receiptDate desc, a.id desc")
    List<AsRequest> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
