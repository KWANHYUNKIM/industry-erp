package com.erp.accounting.cost;

import com.erp.accounting.cost.dto.CostPeriodDtos.CostPeriodResponse;
import com.erp.accounting.cost.dto.CostPeriodDtos.CostRunResult;
import com.erp.accounting.cost.dto.CostPeriodDtos.CreateCostPeriodRequest;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * 원본 이익관리 &gt; 원가생성/수정(E040802) — 원가 기간을 만들고 그 기간에 사전작업 · 원가계산 · 삭제를 한다.
 *
 * <p>2026-10-12 loginaa 실측 흐름: [신규] → 기본등록 저장 → 맨 위에 새 줄(시작월은 앞 기간 다음 달) →
 * 원가생성전 점검사항이 저절로 뜬다 → 사전작업 [노무비/경비등록] · [표준원가생성] → 원가계산 [생성] →
 * 원가현황 [조회] · [삭제]. 버튼이 펼쳐진 것은 맨 위(가장 최근) 줄뿐이다 — 지나간 기간은 손대지 않는다.
 * [삭제] 는 '삭제한 데이터는 복구되지 않습니다.' 를 묻고 그 기간의 원가까지 지운다.
 */
@Service
@RequiredArgsConstructor
public class CostPeriodService {

    private final CostPeriodRepository periodRepository;
    private final ItemCostRepository itemCostRepository;
    private final CostService costService;

    @Transactional(readOnly = true)
    public List<CostPeriodResponse> findAll() {
        List<CostPeriod> all = periodRepository.findAllByOrderByStartMonthDesc();
        List<CostPeriodResponse> out = new ArrayList<>();
        for (int i = 0; i < all.size(); i++) out.add(CostPeriodResponse.from(all.get(i), i == 0));
        return out;
    }

    @Transactional
    public CostPeriodResponse create(CreateCostPeriodRequest req) {
        YearMonth start = periodRepository.findFirstByOrderByStartMonthDesc()
                .map(p -> YearMonth.parse(p.getEndMonth()).plusMonths(1))
                .orElseGet(() -> {
                    if (req.startMonth() == null || req.startMonth().isBlank()) {
                        throw ApiException.badRequest("시작월을 입력하세요.");
                    }
                    return YearMonth.parse(req.startMonth());
                });
        YearMonth end = YearMonth.parse(req.endMonth());
        if (end.isBefore(start)) {
            throw ApiException.badRequest("종료월은 시작월(" + start + ") 보다 빠를 수 없습니다.");
        }
        CostPeriod saved = periodRepository.save(CostPeriod.builder()
                .startMonth(start.toString()).endMonth(end.toString())
                .method(req.method()).outsourcingBasis(req.outsourcingBasis()).build());
        return CostPeriodResponse.from(saved, true);
    }

    /** 사전작업 [표준원가생성] — 기간의 달마다 원가계산법으로 자재 단가를 잰다. */
    @Transactional
    public CostRunResult buildStandard(Long id) {
        CostPeriod p = latest(id);
        if (p.getMethod() == CostMethod.FIFO) {
            throw ApiException.badRequest("선입선출법은 입고분별 잔량(입고 레이어)을 남기지 않아 계산할 수 없습니다. 총평균법이나 최종매입원가법으로 기간을 다시 만드세요.");
        }
        String basis = p.getMethod() == CostMethod.TOTAL_AVERAGE ? "WEIGHTED_AVG" : "LAST_PURCHASE";
        int rows = 0;
        List<String> months = months(p);
        for (String m : months) rows += costService.build(m, basis).size();
        return new CostRunResult(months.size(), rows);
    }

    /** 원가계산 [생성] — 기간의 달마다 생산실적 · 노무비/경비로 실제원가를 낸다. */
    @Transactional
    public CostRunResult generate(Long id) {
        CostPeriod p = latest(id);
        int rows = 0;
        List<String> months = months(p);
        for (String m : months) rows += costService.calcActual(m).size();
        p.setGenerated(true);
        return new CostRunResult(months.size(), rows);
    }

    /** 원가현황 [삭제] — 기간과 그 기간에 잡은 원가를 함께 지운다. */
    @Transactional
    public void delete(Long id) {
        CostPeriod p = latest(id);
        itemCostRepository.deleteByPeriodRange(p.getStartMonth(), p.getEndMonth());
        periodRepository.delete(p);
    }

    /** 원본은 맨 위(가장 최근) 줄에만 버튼을 펼친다 — 지나간 기간을 고치면 다음 기간의 기초가 어긋난다. */
    private CostPeriod latest(Long id) {
        CostPeriod p = periodRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원가 기간을 찾을 수 없습니다. id=" + id));
        CostPeriod top = periodRepository.findFirstByOrderByStartMonthDesc().orElseThrow();
        if (!top.getId().equals(p.getId())) {
            throw ApiException.badRequest("가장 최근 기간(" + top.getStartMonth() + " ~ " + top.getEndMonth() + ")만 작업할 수 있습니다.");
        }
        return p;
    }

    private static List<String> months(CostPeriod p) {
        List<String> out = new ArrayList<>();
        for (YearMonth m = YearMonth.parse(p.getStartMonth()); !m.isAfter(YearMonth.parse(p.getEndMonth())); m = m.plusMonths(1)) {
            out.add(m.toString());
        }
        return out;
    }
}
