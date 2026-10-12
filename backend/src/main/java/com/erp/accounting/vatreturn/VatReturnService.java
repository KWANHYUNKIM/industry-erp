package com.erp.accounting.vatreturn;

import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnRequest;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/**
 * 부가세신고서(일반) 목록(원본 E200928) · 부가세신고서 PDF 다운로드(E030216)가 같이 쓰는 신고서 목록.
 * 목록은 신고기간이 늦은 것부터(원본 '2026년 2기 예정(7~9)' 위에 '2026년 1기 확정(4~6)').
 */
@Service
@RequiredArgsConstructor
public class VatReturnService {

    private final VatReturnRepository repository;

    @Transactional(readOnly = true)
    public List<VatReturnResponse> list(int fromYear, int toYear) {
        return repository.findByAttributionYearBetween(fromYear, toYear).stream()
                .sorted(Comparator.comparing(VatReturn::getAttributionYear)
                        .thenComparing(VatReturn::getMonthTo)
                        .thenComparing(VatReturn::getMonthFrom).reversed())
                .map(VatReturnResponse::from).toList();
    }

    @Transactional
    public VatReturnResponse create(VatReturnRequest req) {
        int from, to;
        Integer omittedFrom = null, omittedTo = null;
        if (req.returnKind() == VatReturnKind.MONTHLY) {
            if (req.month() == null) throw ApiException.badRequest("신고기간을 선택하세요.");
            from = to = req.month();
        } else {
            if (req.term() == null) throw ApiException.badRequest("신고기간을 선택하세요.");
            int first = (req.term() - 1) * 6 + 1;
            from = req.returnKind() == VatReturnKind.PRELIM ? first : first + 3;
            to = from + 2;
            /* 원본: 확정을 고르면 예정누락이 그 기의 예정 석 달(01월 ~ 03월)로 채워지고, 목록 [예정누락 포함여부] YES. */
            if (req.returnKind() == VatReturnKind.FINAL) { omittedFrom = first; omittedTo = first + 2; }
        }
        if (repository.existsByAttributionYearAndMonthFromAndMonthToAndReturnKind(req.year(), from, to, req.returnKind())) {
            throw ApiException.conflict("동일한 부가가치세 신고서가 있습니다.");
        }
        VatReturn v = VatReturn.builder()
                .filingType(req.filingType()).returnKind(req.returnKind())
                .attributionYear(req.year()).monthFrom(from).monthTo(to)
                .omittedFrom(omittedFrom).omittedTo(omittedTo)
                .reportDate(req.reportDate()).dueDate(req.dueDate())
                .taxAgent(req.taxAgent()).closure(req.closure())
                .build();
        return VatReturnResponse.from(repository.save(v));
    }

    @Transactional
    public VatReturnResponse update(Long id, VatReturnRequest req) {
        VatReturn v = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("부가가치세 신고서를 찾을 수 없습니다. id=" + id));
        v.setFilingType(req.filingType());
        v.setReportDate(req.reportDate());
        v.setDueDate(req.dueDate());
        v.setTaxAgent(req.taxAgent());
        v.setClosure(req.closure());
        return VatReturnResponse.from(v);
    }

    @Transactional
    public void delete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("선택된 자료가 없습니다.");
        repository.deleteAllById(ids);
    }
}
