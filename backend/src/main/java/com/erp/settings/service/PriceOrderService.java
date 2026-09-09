package com.erp.settings.service;

import com.erp.common.ApiException;
import com.erp.settings.domain.PriceOrderSetting;
import com.erp.settings.dto.PriceOrderDtos.PriceOrderLine;
import com.erp.settings.dto.PriceOrderDtos.SavePriceOrderRequest;
import com.erp.settings.repository.PriceOrderSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.settings.dto.PriceOrderDtos;

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
        /*
         * 저장값이 없으면 기본 순서를 낸다.
         *
         * <p><b>2026-09-09 원본(E040125) 실측</b> — 기능 일곱과 그 차례는 우리와 같았는데
         * [사용구분]이 달랐다. 원본은 <b>[출고단가] 하나만 '사용'</b>이고 나머지 여섯은
         * '사용안함'으로 열린다. 우리는 일곱을 모두 '사용'으로 냈다 —
         * 아무것도 설정하지 않은 회사에 <b>특별단가·조정률이 다 켜져 있는 것처럼</b> 보이고,
         * 그 줄을 한 줄도 안 넣었으니 실제로는 아무 일도 안 하는데 화면만 그렇게 말했다.
         * 원본대로 출고단가만 켠다(이미 저장한 회사의 값은 그대로다 - 여기는 미저장일 때만 탄다).
         */
        return java.util.stream.IntStream.range(0, DEFAULT_FUNCTIONS.size())
                .mapToObj(i -> new PriceOrderLine(
                        DEFAULT_FUNCTIONS.get(i), i + 1,
                        "출고단가".equals(DEFAULT_FUNCTIONS.get(i))))
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
        if (category == null) throw ApiException.badRequest("영업관리·구매관리 중 어느 쪽인지 고르세요.");
        String c = category.trim().toUpperCase();
        if (!c.equals("SALES") && !c.equals("PURCHASE")) {
            throw ApiException.badRequest("구분은 영업관리·구매관리 중 하나여야 합니다.");
        }
        return c;
    }
}
