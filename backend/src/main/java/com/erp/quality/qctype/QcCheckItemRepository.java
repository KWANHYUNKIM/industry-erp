package com.erp.quality.qctype;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QcCheckItemRepository extends JpaRepository<QcCheckItem, Long> {

    boolean existsByCode(String code);

    List<QcCheckItem> findAllByOrderByCodeAsc();
}
