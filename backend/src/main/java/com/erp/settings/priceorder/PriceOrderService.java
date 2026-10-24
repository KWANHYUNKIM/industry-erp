package com.erp.settings.priceorder;

import com.erp.common.ApiException;
import com.erp.settings.priceorder.dto.PriceOrderDtos.PriceOrderLine;
import com.erp.settings.priceorder.dto.PriceOrderDtos.SavePriceOrderRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.settings.priceorder.dto.PriceOrderDtos;

@Service
@RequiredArgsConstructor
public class PriceOrderService {

    private final PriceOrderSettingRepository repository;
    private final com.erp.common.history.ChangeHistoryService historyService;

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
        /*
         * 2026-10-14 원본 실측: 마지막 줄이 영업관리(E040126)는 [출고단가], 구매관리(E040125)는 <b>[입고단가]</b>다.
         * 우리는 구매관리 탭에도 출고단가를 냈다 — 사는 값의 기준이 파는 값으로 적혀 있었다.
         */
        String base = cat.equals("PURCHASE") ? "입고단가" : "출고단가";
        return java.util.stream.IntStream.range(0, DEFAULT_FUNCTIONS.size())
                .mapToObj(i -> {
                    String name = i == DEFAULT_FUNCTIONS.size() - 1 ? base : DEFAULT_FUNCTIONS.get(i);
                    return new PriceOrderLine(name, i + 1, name.equals(base));
                })
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
        // 원본 [H] '이력' — 마지막으로 고친 때 · 사람 한 줄(영업 · 구매 탭 따로). 대상 id 1 영업 · 2 구매.
        historyService.record("PRICE_ORDER", cat.equals("SALES") ? 1L : 2L, com.erp.common.history.ChangeHistoryService.UPDATED);
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
