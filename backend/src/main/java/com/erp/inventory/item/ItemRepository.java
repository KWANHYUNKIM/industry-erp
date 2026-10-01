package com.erp.inventory.item;

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


    /*
     * 자동완성 — 품목명·규격을 다 외울 수 없어서 칠 때 이미 등록된 값을 띄운다.
     * 회사별 스키마로 갈라져 있어(TenantContext) 같은 쿼리가 <b>그 회사 품목에서만</b> 찾는다.
     * 같은 이름·규격이 여러 품목에 있으면 한 번만 보이게 묶는다(group by).
     * 순서: 친 글자로 <b>시작하는</b> 것 먼저, 그다음 짧은 것, 그다음 가나다.
     */
    @Query("select i.name from Item i where lower(i.name) like :like escape '\\' group by i.name " +
           "order by case when lower(i.name) like :prefix escape '\\' then 0 else 1 end, length(i.name), i.name")
    List<String> suggestNames(@Param("like") String like, @Param("prefix") String prefix, Pageable pageable);

    @Query("select i.spec from Item i where i.spec is not null and lower(i.spec) like :like escape '\\' " +
           "group by i.spec " +
           "order by case when lower(i.spec) like :prefix escape '\\' then 0 else 1 end, length(i.spec), i.spec")
    List<String> suggestSpecs(@Param("like") String like, @Param("prefix") String prefix, Pageable pageable);

    /** 아직 아무것도 안 쳤을 때 — 많이 쓰는 것부터 보여 준다. */
    @Query("select i.name from Item i group by i.name order by count(i) desc, i.name")
    List<String> frequentNames(Pageable pageable);

    @Query("select i.spec from Item i where i.spec is not null and trim(i.spec) <> '' " +
           "group by i.spec order by count(i) desc, i.spec")
    List<String> frequentSpecs(Pageable pageable);

    /** 그 대표품목을 가리키는 형제들. [대표품목으로 합산] 이 가족을 세울 때 쓴다. */
    List<Item> findByParentItemId(Long parentItemId);
}
