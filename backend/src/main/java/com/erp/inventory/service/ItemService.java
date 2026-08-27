package com.erp.inventory.service;

import com.erp.common.ApiException;
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
    // 같은 inventory 모듈이지만 리포지토리가 아니라 공개 service 를 거친다 — CLAUDE.md 4.2
    private final ManagementItemService managementItemService;

    @Transactional(readOnly = true)
    public List<ItemResponse> findAll() {
        return itemRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
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
                .udiDi(req.udiDi())
                .managementItem(req.managementItemId() == null ? null : managementItemService.getUsable(req.managementItemId()))
                .active(true)
                .build();
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
        item.setUdiDi(req.udiDi());
        item.setManagementItem(req.managementItemId() == null ? null : managementItemService.getUsable(req.managementItemId()));
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

    /** 품목그룹. null 이면 그룹 없음 — 없는 id 를 주면 조용히 무시하지 않고 알린다. */
    private ItemGroup groupOf(Long groupId) {
        if (groupId == null) return null;
        return itemGroupRepository.findById(groupId)
                .orElseThrow(() -> ApiException.badRequest("품목그룹을 찾을 수 없습니다. id=" + groupId));
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
