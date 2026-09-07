package com.erp.quality.repository;

import com.erp.quality.domain.AsPart;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AsPartRepository extends JpaRepository<AsPart, Long> {

    @Query("select p from AsPart p join fetch p.item join fetch p.warehouse join fetch p.asRequest a join fetch a.partner " +
            "where p.asRequest.id = :asId order by p.id")
    List<AsPart> findByAsRequestIdWithRefs(@Param("asId") Long asId);

    /* A/S소모현황이 [수리품목]으로 거르므로 a.item 까지 함께 읽는다 — 둘 다 not null 이라 안전하다. */
    @Query("select p from AsPart p join fetch p.item join fetch p.warehouse join fetch p.asRequest a " +
            "join fetch a.partner join fetch a.item " +
            "order by p.createdAt desc, p.id desc")
    List<AsPart> findAllWithRefs();
}
