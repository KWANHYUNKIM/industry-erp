package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Item;
import com.erp.dto.ItemDtos.CreateItemRequest;
import com.erp.dto.ItemDtos.ItemResponse;
import com.erp.dto.ItemDtos.UpdateItemRequest;
import com.erp.repository.ItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ItemService {

    private final ItemRepository itemRepository;

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
                .safetyStock(req.safetyStock())
                .barcode(req.barcode())
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
        item.setSafetyStock(req.safetyStock());
        item.setBarcode(req.barcode());
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
