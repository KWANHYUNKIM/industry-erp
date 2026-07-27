package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.inventory.service.ItemService;
import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.SpecialPrice;
import com.erp.trade.domain.enums.SpecialPriceType;
import com.erp.trade.dto.SpecialPriceDtos.CreateSpecialPriceRequest;
import com.erp.trade.dto.SpecialPriceDtos.ResolveResponse;
import com.erp.trade.dto.SpecialPriceDtos.SpecialPriceResponse;
import com.erp.trade.repository.SpecialPriceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 특별단가(E040124): 표준단가를 덮어쓰는 예외 단가의 CRUD와 유효단가 해석(resolve).
 * 적용범위는 거래처별(partner) 또는 특별단가그룹별(priceGroup) 중 하나.
 * resolve 는 거래처별을 1순위로, 없으면 그 거래처의 단가그룹(BusinessPartner.salesPriceGroup /
 * purchasePriceGroup)으로 지정된 그룹별 특별단가를 2순위로 찾는다.
 */
@Service
@RequiredArgsConstructor
public class SpecialPriceService {

    private final SpecialPriceRepository repository;
    private final ItemService itemService;         // inventory 공개 API
    private final PartnerService partnerService;    // 같은 모듈(trade)

    @Transactional(readOnly = true)
    public List<SpecialPriceResponse> findAll() {
        return repository.findAllWithRefs().stream().map(SpecialPriceResponse::from).toList();
    }

    @Transactional
    public SpecialPriceResponse create(CreateSpecialPriceRequest req, String username) {
        boolean hasPartner = req.partnerId() != null;
        boolean hasGroup = req.priceGroup() != null && !req.priceGroup().isBlank();
        if (hasPartner == hasGroup) {
            throw ApiException.badRequest("적용범위는 거래처 또는 특별단가그룹 중 하나만 지정하세요.");
        }

        Item item = itemService.get(req.itemId());
        BusinessPartner partner = hasPartner ? partnerService.get(req.partnerId()) : null;

        SpecialPrice sp = SpecialPrice.builder()
                .tradeType(req.tradeType())
                .item(item)
                .partner(partner)
                .priceGroup(hasGroup ? req.priceGroup().trim() : null)
                .unitPrice(req.unitPrice())
                .active(true)
                .remark(req.remark())
                .createdBy(username)
                .build();
        return SpecialPriceResponse.from(repository.save(sp));
    }

    /** 사용/사용중단 토글 */
    @Transactional
    public SpecialPriceResponse setActive(Long id, boolean active) {
        SpecialPrice sp = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("특별단가를 찾을 수 없습니다. id=" + id));
        sp.setActive(active);
        return SpecialPriceResponse.from(sp);
    }

    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw ApiException.notFound("특별단가를 찾을 수 없습니다. id=" + id);
        }
        repository.deleteById(id);
    }

    /**
     * 유효 특별단가 해석: (구분, 품목, 거래처)로 적용될 특별단가를 찾는다.
     * 1순위 거래처별 → 2순위 거래처의 단가그룹별. 없으면 found=false.
     */
    @Transactional(readOnly = true)
    public ResolveResponse resolve(SpecialPriceType type, Long itemId, Long partnerId) {
        List<SpecialPrice> byPartner = repository.findActiveByPartner(type, itemId, partnerId);
        if (!byPartner.isEmpty()) {
            SpecialPrice sp = byPartner.get(0);
            return new ResolveResponse(true, sp.getUnitPrice(), "PARTNER", null);
        }
        BusinessPartner partner = partnerService.get(partnerId);
        String group = (type == SpecialPriceType.SALES)
                ? partner.getSalesPriceGroup()
                : partner.getPurchasePriceGroup();
        if (group != null && !group.isBlank()) {
            List<SpecialPrice> byGroup = repository.findActiveByGroup(type, itemId, group);
            if (!byGroup.isEmpty()) {
                SpecialPrice sp = byGroup.get(0);
                return new ResolveResponse(true, sp.getUnitPrice(), "GROUP", group);
            }
        }
        return ResolveResponse.none();
    }
}
