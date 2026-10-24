package com.erp.production.bom;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface BomRepository extends JpaRepository<Bom, Long> {

    boolean existsByProductId(Long productId);

    /** 제품의 <b>기본</b> BOM. 버전을 고르지 않는 자리는 모두 이것을 쓴다. */
    @Query("select b from Bom b join fetch b.product where b.product.id = :productId and b.defaultVersion = true")
    Optional<Bom> findByProductIdWithProduct(Long productId);

    /** 제품의 모든 버전(기본이 앞). */
    @Query("select b from Bom b join fetch b.product where b.product.id = :productId order by b.defaultVersion desc, b.id")
    List<Bom> findVersions(Long productId);

    /** 모든 버전 — 화면이 줄마다 버전을 고를 때. */
    @Query("select b from Bom b join fetch b.product order by b.product.code, b.defaultVersion desc, b.id")
    List<Bom> findAllVersionsWithProduct();

    /** 기본 BOM 만 — 제품마다 하나(예전처럼 제품 → BOM 으로 읽는 자리가 많다). */
    @Query("select distinct b from Bom b join fetch b.product where b.defaultVersion = true order by b.product.code")
    List<Bom> findAllWithProduct();
}
