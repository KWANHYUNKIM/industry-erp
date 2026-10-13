package com.erp.accounting.vatreturn;

import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnDocResponse;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnDocSummary;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnRequest;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 부가세신고서(일반) 목록(원본 E200928) · 부가세신고서 PDF 다운로드(E030216)가 같이 쓰는 신고서 목록.
 * 목록은 신고기간이 늦은 것부터(원본 '2026년 2기 예정(7~9)' 위에 '2026년 1기 확정(4~6)').
 */
@Service
@RequiredArgsConstructor
public class VatReturnService {

    private final VatReturnRepository repository;
    private final VatReturnDocRepository docRepository;

    /** [신고서등] 창에서 저장하는 서류 — 신고서 · 첨부서류 1 · 2 · 6 · 15. */
    private static final Set<String> DOC_CODES = Set.of("RETURN", "SALES_INVOICE", "PURCHASE_INVOICE", "CARD_SALES", "CARD_RECEIPT");

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

    @Transactional(readOnly = true)
    public List<VatReturnDocSummary> docs(Long id) {
        return docRepository.findByVatReturnId(id).stream()
                .map(d -> new VatReturnDocSummary(d.getDocCode(), d.getWrittenAt())).toList();
    }

    /** 저장된 서류 한 장 — 아직 만든 적이 없으면 null(화면이 세어 저장한다). */
    @Transactional(readOnly = true)
    public VatReturnDocResponse doc(Long id, String docCode) {
        return docRepository.findByVatReturnIdAndDocCode(id, docCode)
                .map(d -> new VatReturnDocResponse(d.getDocCode(), d.getData(), d.getWrittenAt())).orElse(null);
    }

    /** [조회](처음) · [새로불러오기] · 신고서 '다시 작성' — 화면이 센 숫자를 그 서류로 저장하고 만든 때를 지금으로. */
    @Transactional
    public VatReturnDocResponse writeDoc(Long id, String docCode, String data) {
        if (!DOC_CODES.contains(docCode)) throw ApiException.badRequest("알 수 없는 서류입니다. " + docCode);
        VatReturn v = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("부가가치세 신고서를 찾을 수 없습니다. id=" + id));
        VatReturnDoc d = docRepository.findByVatReturnIdAndDocCode(id, docCode)
                .orElseGet(() -> VatReturnDoc.builder().vatReturn(v).docCode(docCode).build());
        d.setData(data);
        d.setWrittenAt(LocalDateTime.now());
        VatReturnDoc saved = docRepository.save(d);
        return new VatReturnDocResponse(saved.getDocCode(), saved.getData(), saved.getWrittenAt());
    }
}
