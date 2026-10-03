package com.erp.settings.collectdata;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CollectDataRepository extends JpaRepository<CollectData, Long> {
    /** 원본 차례: 기본 줄(거래명세서 · 견적서 · 발주서) 다음에 더한 줄을 만든 차례로. */
    List<CollectData> findAllByOrderByBuiltInDescIdAsc();

    List<CollectData> findByDocType(CollectDocType docType);
}
