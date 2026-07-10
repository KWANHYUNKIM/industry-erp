package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.PriceOrderSetting;
import com.erp.dto.PriceOrderDtos.PriceOrderLine;
import com.erp.dto.PriceOrderDtos.SavePriceOrderRequest;
import com.erp.repository.PriceOrderSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PriceOrderService {

    private final PriceOrderSettingRepository repository;

    /** 미설정 시 노출할 기본 단가적용순서 기능 목록 */
    private static final List<String> DEFAULT_FUNCTIONS = List.of(
            "창고별특별단가(품목별)",
            "창고별특별단가(품목그룹별)",
            "거래처별특별단가(품목별)",
            "거래처별특별단가(품목그룹별)",
            "최종단가",
            "거래처조정률",
            "출고단가"
    );

    @Transactional(readOnly = true)
    public List<PriceOrderLine> get(String category) {
        String cat = normalize(category);
        List<PriceOrderSetting> saved = repository.findByCategoryOrderByApplyOrderAsc(cat);
        if (!saved.isEmpty()) {
            return saved.stream().map(PriceOrderLine::from).toList();
        }
        // 저장값이 없으면 기본 순서 반환(미저장)
        return java.util.stream.IntStream.range(0, DEFAULT_FUNCTIONS.size())
                .mapToObj(i -> new PriceOrderLine(DEFAULT_FUNCTIONS.get(i), i + 1, true))
                .toList();
    }

    @Transactional
    public List<PriceOrderLine> save(SavePriceOrderRequest req) {
        String cat = normalize(req.category());
        repository.deleteByCategory(cat);
        repository.flush();
        for (PriceOrderLine line : req.settings()) {
            repository.save(PriceOrderSetting.builder()
                    .category(cat)
                    .functionName(line.functionName())
                    .applyOrder(line.applyOrder())
                    .active(line.active())
                    .build());
        }
        return get(cat);
    }

    private String normalize(String category) {
        if (category == null) throw ApiException.badRequest("구분(category)을 지정하세요.");
        String c = category.trim().toUpperCase();
        if (!c.equals("SALES") && !c.equals("PURCHASE")) {
            throw ApiException.badRequest("구분은 SALES 또는 PURCHASE 여야 합니다: " + category);
        }
        return c;
    }
}
