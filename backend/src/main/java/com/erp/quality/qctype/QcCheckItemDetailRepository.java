package com.erp.quality.qctype;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QcCheckItemDetailRepository extends JpaRepository<QcCheckItemDetail, Long> {

    List<QcCheckItemDetail> findByCheckItemIdOrderByCodeAsc(Long checkItemId);

    boolean existsByCheckItemIdAndCode(Long checkItemId, String code);

    void deleteByCheckItemId(Long checkItemId);
}
