package com.erp.settings.preference;

import com.erp.common.NegativeStockPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 환경설정의 '재고 마이너스 허용'(preference.negative_stock) 을 재고 쪽에 알려 준다. 설정 줄이 없으면 막는다(엔티티 기본값). */
@Component
@RequiredArgsConstructor
public class PreferenceNegativeStockPolicy implements NegativeStockPolicy {

    private final PreferenceRepository preferenceRepository;

    @Override
    public boolean allowsNegativeStock() {
        return preferenceRepository.findFirstByOrderByIdAsc()
                .map(p -> Boolean.TRUE.equals(p.getNegativeStock()))
                .orElse(false);
    }
}
