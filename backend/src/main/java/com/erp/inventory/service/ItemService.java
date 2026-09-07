package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.common.StoredFile;
import com.erp.common.StoredFileRepository;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.ItemGroup;
import com.erp.inventory.dto.ItemDtos.CreateItemRequest;
import com.erp.inventory.dto.ItemDtos.ItemResponse;
import com.erp.inventory.dto.ItemDtos.UpdateItemRequest;
import com.erp.inventory.repository.ItemGroupRepository;
import com.erp.inventory.repository.ItemRepository;
import java.math.BigDecimal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.inventory.dto.ItemDtos;

@Service
@RequiredArgsConstructor
public class ItemService {

    private final ItemRepository itemRepository;
    private final ItemGroupRepository itemGroupRepository;
    private final StoredFileRepository storedFileRepository;
    // 같은 inventory 모듈이지만 리포지토리가 아니라 공개 service 를 거친다 — CLAUDE.md 4.2
    private final ManagementItemService managementItemService;

    @Transactional(readOnly = true)
    public List<ItemResponse> findAll() {
        return itemRepository.findAllForList().stream()
                .map(ItemResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ItemResponse findById(Long id) {
        return ItemResponse.from(getItem(id));
    }

    @Transactional
    public ItemResponse create(CreateItemRequest req) {
        if (itemRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 품목코드입니다: " + req.code());
        }
        Item item = Item.builder()
                .code(req.code())
                .name(req.name())
                .spec(req.spec())
                .unit(req.unit())
                .category(req.category())
                .unitPrice(req.unitPrice())
                // 안 주면 0 — "구매 기준단가를 안 정했다" 는 뜻이고, 구매할인을 계산하지 않는다.
                .purchasePrice(req.purchasePrice() != null ? req.purchasePrice() : BigDecimal.ZERO)
                .itemGroup(groupOf(req.itemGroupId()))
                .safetyStock(req.safetyStock())
                .barcode(req.barcode())
                .searchKeyword(req.searchKeyword())
                // 안 주면 관리대상. 모르고 껐다가 재고가 조용히 안 움직이는 것보다 낫다.
                .stockTracked(req.stockTracked() == null || req.stockTracked())
                .supplierId(req.supplierId())
                .imageFile(imageOf(req.imageFileId()))
                .udiDi(req.udiDi())
                .managementItem(req.managementItemId() == null ? null : managementItemService.getUsable(req.managementItemId()))
                .active(true)
                .build();
        applyExtras(item, req.remark(), req.vatRateSales(), req.vatRatePurchase(),
                req.subcontractPrice(), req.leadTimeDays(), req.minPurchaseUnit(),
                req.setItem(), req.sharedItem(), req.itemType(), req.parentItemId(),
                req.lotManaged(), req.qcType(), req.qcMethod(),
                req.qcOnPurchase(), req.qcOnProduction(),
                req.autoProductionOnSales(), req.autoProductionOnTransfer());
        return ItemResponse.from(itemRepository.save(item));
    }

    @Transactional
    public ItemResponse update(Long id, UpdateItemRequest req) {
        Item item = getItem(id);
        item.setName(req.name());
        item.setSpec(req.spec());
        item.setUnit(req.unit());
        item.setCategory(req.category());
        item.setUnitPrice(req.unitPrice());
        item.setPurchasePrice(req.purchasePrice() != null ? req.purchasePrice() : BigDecimal.ZERO);
        item.setItemGroup(groupOf(req.itemGroupId()));
        item.setSafetyStock(req.safetyStock());
        item.setBarcode(req.barcode());
        item.setSearchKeyword(req.searchKeyword());
        if (req.stockTracked() != null) item.setStockTracked(req.stockTracked());
        item.setSupplierId(req.supplierId());
        item.setImageFile(imageOf(req.imageFileId()));
        item.setUdiDi(req.udiDi());
        item.setManagementItem(req.managementItemId() == null ? null : managementItemService.getUsable(req.managementItemId()));
        applyExtras(item, req.remark(), req.vatRateSales(), req.vatRatePurchase(),
                req.subcontractPrice(), req.leadTimeDays(), req.minPurchaseUnit(),
                req.setItem(), req.sharedItem(), req.itemType(), req.parentItemId(),
                req.lotManaged(), req.qcType(), req.qcMethod(),
                req.qcOnPurchase(), req.qcOnProduction(),
                req.autoProductionOnSales(), req.autoProductionOnTransfer());
        if (req.active() != null) {
            item.setActive(req.active());
        }
        return ItemResponse.from(item);
    }

    @Transactional
    public void delete(Long id) {
        Item item = getItem(id);
        itemRepository.delete(item);
    }

    /** 다른 서비스가 품목 엔티티를 얻는 진입점 (리포지토리를 직접 주입하지 않도록). */
    @Transactional(readOnly = true)
    public Item get(Long id) {
        return getItem(id);
    }

    /**
     * 새 전표에 <b>쓸 수 있는</b> 품목을 얻는다. 사용중지된 품목이면 거절한다.
     *
     * <p>{@link #get(Long)} 은 그대로 둔다 — 이미 저장된 전표를 읽거나 지울 때는
     * 그 품목이 지금 중지됐는지와 상관없이 꺼내 와야 하기 때문이다.
     * "지금부터 새로 쓰겠다"는 자리에서만 이쪽을 부른다.
     */
    @Transactional(readOnly = true)
    public Item getUsable(Long id) {
        Item item = getItem(id);
        if (!item.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 품목입니다: " + item.getCode() + " " + item.getName());
        }
        return item;
    }

    /**
     * 원본 [이미지]. null 이면 사진을 안 붙인 것이다 — 없는 id 를 주면 그건 오류다.
     * 조용히 null 로 저장하면 사람은 붙인 줄 알고 넘어간다.
     */
    private StoredFile imageOf(Long id) {
        if (id == null) return null;
        StoredFile f = storedFileRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("이미지 파일을 찾을 수 없습니다. id=" + id));
        /* 붙는 순간 이 파일의 주인을 적는다 — 품목 이미지는 기초등록 권한 아래에 있다. */
        if (f.getOwnerCode() == null) f.setOwnerCode("INV_MASTER");
        return f;
    }

    /** 품목그룹. null 이면 그룹 없음 — 없는 id 를 주면 조용히 무시하지 않고 알린다. */
    private ItemGroup groupOf(Long groupId) {
        if (groupId == null) return null;
        return itemGroupRepository.findById(groupId)
                .orElseThrow(() -> ApiException.badRequest("품목그룹을 찾을 수 없습니다. id=" + groupId));
    }

    /**
     * 원본 폼의 나머지 칸들을 한 자리에서 옮긴다 — 등록과 수정 두 곳에 같은 줄을 늘어놓으면
     * 한쪽만 고쳐 <b>등록에서는 저장되는데 수정하면 사라지는</b> 칸이 생긴다.
     *
     * <p>참/거짓과 세율은 <b>안 보내면 기본값</b>을 쓴다. null 을 그대로 넣으면
     * NOT NULL 칸이 저장할 때 터지고, 세율은 0% 가 되어 <b>부가세가 조용히 사라진다.</b>
     */
    private void applyExtras(Item item,
                             String remark, BigDecimal vatRateSales, BigDecimal vatRatePurchase,
                             BigDecimal subcontractPrice, Integer leadTimeDays, BigDecimal minPurchaseUnit,
                             Boolean setItem, Boolean sharedItem, String itemType, Long parentItemId,
                             Boolean lotManaged, String qcType, String qcMethod,
                             Boolean qcOnPurchase, Boolean qcOnProduction,
                             Boolean autoProductionOnSales, Boolean autoProductionOnTransfer) {
        item.setRemark(remark);
        item.setVatRateSales(vatRateSales != null ? vatRateSales : BigDecimal.TEN);
        item.setVatRatePurchase(vatRatePurchase != null ? vatRatePurchase : BigDecimal.TEN);
        item.setSubcontractPrice(subcontractPrice != null ? subcontractPrice : BigDecimal.ZERO);
        item.setLeadTimeDays(leadTimeDays != null ? leadTimeDays : 0);
        item.setMinPurchaseUnit(minPurchaseUnit != null ? minPurchaseUnit : BigDecimal.ZERO);
        item.setSetItem(Boolean.TRUE.equals(setItem));
        item.setSharedItem(Boolean.TRUE.equals(sharedItem));
        item.setItemType(itemType);
        item.setParentItem(parentOf(item, parentItemId));
        item.setLotManaged(Boolean.TRUE.equals(lotManaged));
        item.setQcType(qcType);
        item.setQcMethod(qcMethod);
        item.setQcOnPurchase(Boolean.TRUE.equals(qcOnPurchase));
        item.setQcOnProduction(Boolean.TRUE.equals(qcOnProduction));
        item.setAutoProductionOnSales(Boolean.TRUE.equals(autoProductionOnSales));
        item.setAutoProductionOnTransfer(Boolean.TRUE.equals(autoProductionOnTransfer));
    }

    /**
     * 원본 <b>[대표품목]</b>. 안 정하면 자기가 곧 대표다.
     *
     * <p><b>자기를 자기 대표로 두지 못하게 막는다.</b> 그러면 대표로 묶어 보는 화면이
     * 자기를 따라가다 제자리를 돈다 — 목록이 통째로 멈춘다.
     */
    private Item parentOf(Item item, Long parentItemId) {
        if (parentItemId == null) return null;
        if (item.getId() != null && parentItemId.equals(item.getId())) {
            throw ApiException.badRequest("자기 자신을 대표품목으로 둘 수 없습니다.");
        }
        return getItem(parentItemId);
    }

    private Item getItem(Long id) {
        return itemRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + id));
    }

    /** 통합검색용. 부분일치 상위 limit 건과 총 건수. DB 에서 걸러 오므로 전체를 메모리로 올리지 않는다. */
    @Transactional(readOnly = true)
    public List<ItemResponse> search(String like, int limit) {
        return itemRepository.searchTop(like, PageRequest.of(0, limit)).stream()
                .map(ItemResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long searchCount(String like) {
        return itemRepository.searchCount(like);
    }

}
