package com.erp.inventory.salesrep;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SalesRepRepository extends JpaRepository<SalesRep, Long> {

    boolean existsByCode(String code);

    List<SalesRep> findAllByOrderByCodeAsc();

    List<SalesRep> findByActiveTrueOrderByCodeAsc();
}
