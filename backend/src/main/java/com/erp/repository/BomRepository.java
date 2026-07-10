package com.erp.repository;

import com.erp.domain.Bom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface BomRepository extends JpaRepository<Bom, Long> {

    boolean existsByProductId(Long productId);

    @Query("select b from Bom b join fetch b.product where b.product.id = :productId")
    Optional<Bom> findByProductIdWithProduct(Long productId);

    @Query("select distinct b from Bom b join fetch b.product order by b.product.code")
    List<Bom> findAllWithProduct();
}
