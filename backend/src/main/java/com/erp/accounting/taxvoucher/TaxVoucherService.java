package com.erp.accounting.taxvoucher;

import com.erp.accounting.taxvoucher.dto.TaxVoucherDtos.TaxVoucherRequest;
import com.erp.accounting.taxvoucher.dto.TaxVoucherDtos.TaxVoucherResponse;
import com.erp.inventory.project.ProjectService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * (세금)계산서발행/수령(원본 E030202) — 부가세 신고용 계산서의 등록 · 조회 · 수정 · 삭제.
 * 분개를 만들지 않는다(원본에서 저장 뒤 분개장에 줄이 없었다).
 */
@Service
@RequiredArgsConstructor
public class TaxVoucherService {

    private final TaxVoucherRepository repository;
    private final DocumentNoGenerator docNoGenerator;
    private final PartnerService partnerService;
    private final ProjectService projectService;

    @Transactional(readOnly = true)
    public List<TaxVoucherResponse> list(LocalDate from, LocalDate to, TaxVoucherSide side) {
        return repository.findBetween(from, to).stream()
                .filter(v -> side == null || v.getSide() == side)
                .map(TaxVoucherResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public TaxVoucherResponse get(Long id) {
        return TaxVoucherResponse.from(find(id));
    }

    @Transactional
    public TaxVoucherResponse create(TaxVoucherRequest req, String username) {
        LocalDate date = req.entryDate() != null ? req.entryDate() : LocalDate.now();
        TaxVoucher v = TaxVoucher.builder()
                .side(req.side())
                .entryDate(date)
                .entryNo(docNoGenerator.nextSeq("tax_vouchers", date, repository.maxEntryNo(date)))
                .createdBy(username)
                .build();
        apply(v, req);
        return TaxVoucherResponse.from(repository.save(v));
    }

    @Transactional
    public TaxVoucherResponse update(Long id, TaxVoucherRequest req, String username) {
        TaxVoucher v = find(id);
        apply(v, req);
        v.setUpdatedBy(username);
        return TaxVoucherResponse.from(v);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(find(id));
    }

    private void apply(TaxVoucher v, TaxVoucherRequest req) {
        v.setVatType(req.vatType().trim());
        v.setPartner(partnerService.get(req.partnerId()));
        v.setSupplyAmount(req.supplyAmount());
        v.setVatAmount(req.vatAmount() != null ? req.vatAmount() : BigDecimal.ZERO);
        v.setDepartmentId(req.departmentId());
        v.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        v.setRemark(req.remark() == null || req.remark().isBlank() ? null : req.remark().trim());
    }

    private TaxVoucher find(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계산서를 찾을 수 없습니다. id=" + id));
    }
}
