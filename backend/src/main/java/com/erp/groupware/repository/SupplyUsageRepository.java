package com.erp.groupware.repository;

import com.erp.groupware.domain.SupplyUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface SupplyUsageRepository extends JpaRepository<SupplyUsage, Long> {

    /** 기간 조회. 목록이 공용품명·사용자명을 바로 쓰므로 fetch join 으로 같이 가져온다(N+1 방지). */
    @Query("select u from SupplyUsage u join fetch u.supplyItem join fetch u.user " +
            "where u.useDate between :from and :to " +
            "order by u.useDate desc, u.startTime asc, u.id desc")
    List<SupplyUsage> findInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    boolean existsBySupplyItemId(Long supplyItemId);
}
