package com.erp.trade.price;

import com.erp.trade.partner.PartnerService;
import com.erp.common.ApiException;
import com.erp.inventory.item.Item;
import com.erp.inventory.item.ItemService;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.price.dto.SpecialPriceDtos.CreateSpecialPriceRequest;
import com.erp.trade.price.dto.SpecialPriceDtos.ResolveResponse;
import com.erp.trade.price.dto.SpecialPriceDtos.SpecialPriceResponse;
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
    /** 단가적용순서설정 — 거래처별특별단가를 '사용' 으로 둔 때만 특별단가를 쓴다(51회차). trade → settings 는 허용된 간선. */
    private final com.erp.settings.priceorder.PriceOrderService priceOrderService;

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
        /*
         * 단가적용순서설정의 [거래처별특별단가] 가 '사용안함' 이면 특별단가를 쓰지 않는다. 예전엔 설정과 상관없이
         * 늘 썼다 — 원본 기본값은 [출고단가]만 '사용' 이라, 설정 화면을 보면 특별단가가 안 걸려야 하는데 걸렸다(51회차).
         * 우리 특별단가의 두 갈래(거래처 지정 · 거래처 단가그룹)는 둘 다 '거래처별' 이라 두 줄 중 하나라도 '사용' 이면 켠다.
         */
        if (!partnerSpecialPriceEnabled(type)) return ResolveResponse.none();
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

    /** 단가적용순서설정에서 거래처별특별단가(품목별·품목그룹별) 중 하나라도 '사용' 인가. */
    public boolean partnerSpecialPriceEnabled(SpecialPriceType type) {
        return priceOrderService.get(type == SpecialPriceType.SALES ? "SALES" : "PURCHASE").stream()
                .anyMatch(l -> l.active() && l.functionName().startsWith("거래처별특별단가"));
    }
}
