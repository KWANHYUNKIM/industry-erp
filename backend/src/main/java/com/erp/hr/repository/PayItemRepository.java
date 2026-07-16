package com.erp.hr.repository;

import com.erp.hr.domain.PayItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PayItemRepository extends JpaRepository<PayItem, Long> {

    boolean existsByCode(String code);

    List<PayItem> findAllByOrderByKindAscCodeAsc();
}
