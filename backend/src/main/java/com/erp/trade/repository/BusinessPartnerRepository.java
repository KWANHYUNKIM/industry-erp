package com.erp.trade.repository;

import com.erp.trade.domain.BusinessPartner;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BusinessPartnerRepository extends JpaRepository<BusinessPartner, Long> {

    boolean existsByCode(String code);

    /** 자유입력된 거래처명이 마스터와 정확히 일치할 때만 연결한다(부분일치로 엮으면 엉뚱한 거래처가 붙는다). */
    java.util.Optional<BusinessPartner> findByName(String name);

    /** 통합검색: 코드·거래처명 부분일치 상위 N건 */
    @Query("select p from BusinessPartner p where lower(p.code) like :q or lower(p.name) like :q order by p.code")
    List<BusinessPartner> searchTop(@Param("q") String q, Pageable pageable);

    @Query("select count(p) from BusinessPartner p where lower(p.code) like :q or lower(p.name) like :q")
    long searchCount(@Param("q") String q);

}
