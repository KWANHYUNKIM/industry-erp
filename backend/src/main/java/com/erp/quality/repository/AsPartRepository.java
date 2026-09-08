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

    /*
     * A/S소모현황이 [수리품목]으로 거르므로 a.item 까지 함께 읽는다 — 둘 다 not null 이라 안전하다.
     * 2026-09-09 원본 실측으로 [거래처그룹1]·[품목그룹1]이 늘면서 그 둘의 그룹도 같이 읽는다 —
     * 안 읽으면 줄마다 지연로딩이 한 번씩 더 나간다(N+1). 그룹은 미지정 허용이라 left join 이다.
     */
    @Query("select p from AsPart p join fetch p.item join fetch p.warehouse join fetch p.asRequest a " +
            "join fetch a.partner pt left join fetch pt.partnerGroup " +
            "join fetch a.item ai left join fetch ai.itemGroup " +
            "order by p.createdAt desc, p.id desc")
    List<AsPart> findAllWithRefs();
}
