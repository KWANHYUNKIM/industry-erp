package com.erp.groupware.supply;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SupplyRepository extends JpaRepository<SupplyItem, Long> {

    boolean existsByCode(String code);
}
