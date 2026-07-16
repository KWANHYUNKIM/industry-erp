package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.ItemGroup;
import com.erp.inventory.dto.ItemGroupDtos.CreateItemGroupRequest;
import com.erp.inventory.dto.ItemGroupDtos.ItemGroupResponse;
import com.erp.inventory.dto.ItemGroupDtos.UpdateItemGroupRequest;
import com.erp.inventory.repository.ItemGroupRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.inventory.dto.ItemGroupDtos;

@Service
@RequiredArgsConstructor
public class ItemGroupService {

    private final ItemGroupRepository itemGroupRepository;

    @Transactional(readOnly = true)
    public List<ItemGroupResponse> findAll() {
        return itemGroupRepository.findAll(Sort.by(Sort.Direction.ASC, "sortOrder", "code")).stream()
                .map(ItemGroupResponse::from)
                .toList();
    }

    @Transactional
    public ItemGroupResponse create(CreateItemGroupRequest req) {
        if (itemGroupRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 품목그룹 코드입니다: " + req.code());
        }
        ItemGroup g = ItemGroup.builder()
                .code(req.code())
                .name(req.name())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(true)
                .build();
        return ItemGroupResponse.from(itemGroupRepository.save(g));
    }

    @Transactional
    public ItemGroupResponse update(Long id, UpdateItemGroupRequest req) {
        ItemGroup g = getItemGroup(id);
        g.setName(req.name());
        if (req.sortOrder() != null) {
            g.setSortOrder(req.sortOrder());
        }
        if (req.active() != null) {
            g.setActive(req.active());
        }
        return ItemGroupResponse.from(g);
    }

    /** 품목이 참조 중인 그룹은 지울 수 없다. 사용을 멈추려면 active=false 로 내린다. */
    @Transactional
    public void delete(Long id) {
        ItemGroup g = getItemGroup(id);
        try {
            itemGroupRepository.delete(g);
            itemGroupRepository.flush();
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict(
                    "이 품목그룹을 사용하는 품목이 있어 삭제할 수 없습니다. 사용중지하려면 '사용여부'를 해제하세요.");
        }
    }

    private ItemGroup getItemGroup(Long id) {
        return itemGroupRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("품목그룹을 찾을 수 없습니다. id=" + id));
    }
}
