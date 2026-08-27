package com.erp.inventory.repository;

import com.erp.inventory.domain.Item;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

import java.util.List;

public interface ItemRepository extends JpaRepository<Item, Long> {

    boolean existsByCode(String code);

    /**
     * 목록용 — 연관을 한 번에 가져온다. 응답이 그룹·관리항목·이미지 이름을 쓰기 때문에
     * 그냥 findAll 로 뽑으면 품목 수만큼 추가 쿼리가 나간다(N+1).
     */
    @Query("select i from Item i "
            + "left join fetch i.itemGroup "
            + "left join fetch i.managementItem "
            + "left join fetch i.imageFile "
            + "order by i.code")
    List<Item> findAllForList();

    Optional<Item> findByCode(String code);

    /** 통합검색: 코드·품목명 부분일치 상위 N건. 전체를 메모리로 올리지 않는다. */
    @Query("select i from Item i where lower(i.code) like :q or lower(i.name) like :q " +
           "or lower(i.searchKeyword) like :q order by i.code")
    List<Item> searchTop(@Param("q") String q, Pageable pageable);

    @Query("select count(i) from Item i where lower(i.code) like :q or lower(i.name) like :q " +
           "or lower(i.searchKeyword) like :q")
    long searchCount(@Param("q") String q);

}
