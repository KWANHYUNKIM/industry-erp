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

    @Query("select p from AsPart p join fetch p.item join fetch p.warehouse join fetch p.asRequest a join fetch a.partner " +
            "order by p.createdAt desc, p.id desc")
    List<AsPart> findAllWithRefs();
}
