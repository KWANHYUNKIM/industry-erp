package com.erp.trade.price;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SpecialPriceGroupRepository extends JpaRepository<SpecialPriceGroup, Long> {

    List<SpecialPriceGroup> findAllByOrderByCodeAsc();

    Optional<SpecialPriceGroup> findByCode(String code);

    boolean existsByCode(String code);
}
