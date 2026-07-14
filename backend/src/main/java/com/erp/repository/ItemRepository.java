package com.erp.repository;

import com.erp.domain.Item;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

import java.util.List;

public interface ItemRepository extends JpaRepository<Item, Long> {

    boolean existsByCode(String code);

    Optional<Item> findByCode(String code);

    /** 통합검색: 코드·품목명 부분일치 상위 N건. 전체를 메모리로 올리지 않는다. */
    @Query("select i from Item i where lower(i.code) like :q or lower(i.name) like :q order by i.code")
    List<Item> searchTop(@Param("q") String q, Pageable pageable);

    @Query("select count(i) from Item i where lower(i.code) like :q or lower(i.name) like :q")
    long searchCount(@Param("q") String q);

}
