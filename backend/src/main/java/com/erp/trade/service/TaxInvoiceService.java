package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;
import com.erp.trade.domain.TaxInvoice;
import com.erp.trade.domain.TaxInvoiceStatus;
import com.erp.trade.domain.TaxInvoiceType;
import com.erp.trade.dto.TaxInvoiceDtos.IssueRequest;
import com.erp.trade.dto.TaxInvoiceDtos.TaxInvoiceResponse;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.SalesRepository;
import com.erp.trade.repository.TaxInvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.TaxInvoiceDtos;

/** 전자(세금)계산서: 판매/구매 전표에서 발행, 진행단계 전이, 종류별 조회. */
@Service
@RequiredArgsConstructor
public class TaxInvoiceService {

    private final TaxInvoiceRepository repository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<TaxInvoiceResponse> list(TaxInvoiceType type, LocalDate from, LocalDate to) {
        return repository.findByTypeAndPeriod(type, from, to).stream()
                .map(TaxInvoiceResponse::from)
                .toList();
    }

    @Transactional
    public TaxInvoiceResponse issue(IssueRequest req, String username) {
        LocalDate issueDate = req.issueDate() != null ? req.issueDate() : LocalDate.now();
        String invoiceNo = docNoGenerator.next("TI-", "tax_invoices", "invoice_no", "issue_date", issueDate);

        TaxInvoice.TaxInvoiceBuilder b = TaxInvoice.builder()
                .invoiceNo(invoiceNo)
                .invoiceType(req.type())
                .status(TaxInvoiceStatus.DRAFT)
                .issueDate(issueDate)
                .remark(req.remark())
                .createdBy(username);

        if (req.type() == TaxInvoiceType.SALES) {
            Sales s = salesRepository.findById(req.sourceId())
                    .orElseThrow(() -> ApiException.notFound("판매전표를 찾을 수 없습니다. id=" + req.sourceId()));
            if (repository.existsBySales_Id(s.getId())) {
                throw ApiException.conflict("이미 세금계산서가 발행된 판매전표입니다: " + s.getDocNo());
            }
            b.sales(s).partner(s.getPartner())
                    .supplyAmount(s.getSupplyAmount()).vatAmount(s.getVatAmount()).totalAmount(s.getTotalAmount());
        } else {
            Purchase p = purchaseRepository.findById(req.sourceId())
                    .orElseThrow(() -> ApiException.notFound("구매전표를 찾을 수 없습니다. id=" + req.sourceId()));
            if (repository.existsByPurchase_Id(p.getId())) {
                throw ApiException.conflict("이미 세금계산서가 발행된 구매전표입니다: " + p.getDocNo());
            }
            b.purchase(p).partner(p.getPartner())
                    .supplyAmount(p.getSupplyAmount()).vatAmount(p.getVatAmount()).totalAmount(p.getTotalAmount());
        }
        return TaxInvoiceResponse.from(repository.save(b.build()));
    }

    /** 다음 진행단계로 전진 (작성→발행→전송→승인) */
    @Transactional
    public TaxInvoiceResponse advance(Long id) {
        TaxInvoice t = get(id);
        if (t.getStatus() == TaxInvoiceStatus.APPROVED) {
            throw ApiException.badRequest("이미 승인된 세금계산서입니다.");
        }
        t.advance();
        return TaxInvoiceResponse.from(t);
    }

    @Transactional
    public void delete(Long id) {
        TaxInvoice t = get(id);
        if (t.getStatus() == TaxInvoiceStatus.APPROVED) {
            throw ApiException.badRequest("승인된 세금계산서는 삭제할 수 없습니다.");
        }
        repository.delete(t);
    }

    private TaxInvoice get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("세금계산서를 찾을 수 없습니다. id=" + id));
    }
}
