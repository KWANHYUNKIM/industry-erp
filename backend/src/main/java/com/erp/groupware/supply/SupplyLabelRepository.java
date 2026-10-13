package com.erp.groupware.supply;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupplyLabelRepository extends JpaRepository<SupplyLabel, Long> {

    List<SupplyLabel> findAllByOrderByCodeAsc();

    boolean existsByCode(String code);
}
