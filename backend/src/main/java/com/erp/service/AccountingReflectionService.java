package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Purchase;
import com.erp.domain.Sales;
import com.erp.dto.AccountingReflectionDtos.ReflectRequest;
import com.erp.dto.AccountingReflectionDtos.ReflectResult;
import com.erp.dto.AccountingReflectionDtos.SlipKind;
import com.erp.dto.AccountingReflectionDtos.SlipResponse;
import com.erp.repository.PurchaseRepository;
import com.erp.repository.SalesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 판매/구매 전표의 회계반영 현황 조회 및 일괄반영 */
@Service
@RequiredArgsConstructor
public class AccountingReflectionService {

    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;

    @Transactional(readOnly = true)
    public List<SlipResponse> list(SlipKind kind, boolean onlyUnreflected) {
        List<SlipResponse> slips = switch (kind) {
            case SALES -> salesRepository.findAllWithRefs().stream()
                    .map(SlipResponse::fromSales).toList();
            case PURCHASE -> purchaseRepository.findAllWithRefs().stream()
                    .map(SlipResponse::fromPurchase).toList();
        };
        if (onlyUnreflected) {
            return slips.stream().filter(s -> !s.reflected()).toList();
        }
        return slips;
    }

    @Transactional
    public ReflectResult reflect(ReflectRequest req) {
        int count = 0;
        if (req.kind() == SlipKind.SALES) {
            List<Sales> targets = salesRepository.findAllById(req.ids());
            for (Sales s : targets) {
                if (!s.isAccountingReflected()) {
                    s.setAccountingReflected(true);
                    count++;
                }
            }
        } else {
            List<Purchase> targets = purchaseRepository.findAllById(req.ids());
            for (Purchase p : targets) {
                if (!p.isAccountingReflected()) {
                    p.setAccountingReflected(true);
                    count++;
                }
            }
        }
        if (count == 0 && req.ids().isEmpty()) {
            throw ApiException.badRequest("반영할 전표를 선택하세요.");
        }
        return new ReflectResult(count);
    }
}
