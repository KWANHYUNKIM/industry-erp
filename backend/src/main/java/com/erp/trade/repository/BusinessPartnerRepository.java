package com.erp.trade.repository;

import com.erp.trade.domain.BusinessPartner;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BusinessPartnerRepository extends JpaRepository<BusinessPartner, Long> {

    boolean existsByCode(String code);

    /** 이 거래처를 대표로 삼는 종속거래처가 있는가. 관계를 두 단계로 묶어 두는 데 쓴다. */
    boolean existsByParentId(Long parentId);

    /** 자유입력된 거래처명이 마스터와 정확히 일치할 때만 연결한다(부분일치로 엮으면 엉뚱한 거래처가 붙는다). */
    java.util.Optional<BusinessPartner> findByName(String name);

    /** 통합검색: 코드·거래처명 부분일치 상위 N건 */
    @Query("select p from BusinessPartner p where lower(p.code) like :q or lower(p.name) like :q " +
           "or lower(p.searchKeyword) like :q order by p.code")
    List<BusinessPartner> searchTop(@Param("q") String q, Pageable pageable);

    @Query("select count(p) from BusinessPartner p where lower(p.code) like :q or lower(p.name) like :q " +
           "or lower(p.searchKeyword) like :q")
    long searchCount(@Param("q") String q);

    /**
     * 거래처그룹·대표거래처까지 한 번에 (채권/채무현황처럼 그룹으로 묶는 목록의 N+1 방지)
     *
     * <p>대표거래처를 뒤에 붙이면서 <b>parent 를 같이 안 물고 오면</b> 거래처 수만큼
     * 쿼리가 더 나간다 — 목록 하나에 수백 번이다. 조인을 같이 늘린다.
     */
    @Query("select p from BusinessPartner p left join fetch p.partnerGroup left join fetch p.parent order by p.code")
    List<BusinessPartner> findAllWithGroup();

}
