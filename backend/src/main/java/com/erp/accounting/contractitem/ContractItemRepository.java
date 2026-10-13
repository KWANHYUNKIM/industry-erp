package com.erp.accounting.contractitem;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ContractItemRepository extends JpaRepository<ContractItem, Long> {

    boolean existsByCode(String code);

    @Query("select i from ContractItem i left join fetch i.salesAccount order by i.code")
    List<ContractItem> findAllWithRefs();
}
