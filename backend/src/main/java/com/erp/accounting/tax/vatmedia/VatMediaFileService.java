package com.erp.accounting.tax.vatmedia;

import com.erp.accounting.tax.vatmedia.dto.VatMediaFileDtos.VatMediaFileRequest;
import com.erp.accounting.tax.vatmedia.dto.VatMediaFileDtos.VatMediaFileResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/** 세무 › 부가세 › 과세자료전산매체(원본 E030208) — 전산매체 파일생성 목록. */
@Service
@RequiredArgsConstructor
public class VatMediaFileService {

    private final VatMediaFileRepository repository;

    @Transactional(readOnly = true)
    public List<VatMediaFileResponse> list(int fromYear, int toYear) {
        return repository.findByAttributionYearBetween(fromYear, toYear).stream()
                .sorted(Comparator.comparing(VatMediaFile::getAttributionYear)
                        .thenComparing(VatMediaFile::getMonthTo)
                        .thenComparing(VatMediaFile::getMonthFrom).reversed())
                .map(VatMediaFileResponse::from).toList();
    }

    @Transactional
    public VatMediaFileResponse create(VatMediaFileRequest req) {
        if (!req.invoiceSummary() && !req.taxInvoiceSummary()) throw ApiException.badRequest("전산매체를 선택하세요.");
        if (req.monthFrom() > req.monthTo()) throw ApiException.badRequest("신고기간을 확인하세요.");
        if (repository.existsByAttributionYearAndMonthFromAndMonthTo(req.year(), req.monthFrom(), req.monthTo())) {
            throw ApiException.conflict("동일한 기간에 이미 생성된 자료가 있습니다.\n\n해당 기간의 자료를 새로불러오거나\n삭제 후 재생성 하시기 바랍니다.");
        }
        VatMediaFile v = VatMediaFile.builder()
                .attributionYear(req.year()).monthFrom(req.monthFrom()).monthTo(req.monthTo())
                .omittedFrom(req.omittedFrom()).omittedTo(req.omittedTo())
                .invoiceSummary(req.invoiceSummary()).taxInvoiceSummary(req.taxInvoiceSummary())
                .reportDate(req.reportDate())
                .build();
        return VatMediaFileResponse.from(repository.save(v));
    }

    /** 원본 수정 창은 신고작성일자만 열려 있다. */
    @Transactional
    public VatMediaFileResponse update(Long id, VatMediaFileRequest req) {
        VatMediaFile v = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("전산매체 자료를 찾을 수 없습니다. id=" + id));
        v.setReportDate(req.reportDate());
        return VatMediaFileResponse.from(v);
    }

    @Transactional
    public void delete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("선택된 자료가 없습니다.");
        repository.deleteAllById(ids);
    }
}
