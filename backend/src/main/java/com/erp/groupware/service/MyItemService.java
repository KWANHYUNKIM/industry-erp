package com.erp.groupware.service;

import com.erp.auth.domain.User;
import com.erp.auth.repository.UserRepository;
import com.erp.common.ApiException;
import com.erp.groupware.domain.MyItem;
import com.erp.groupware.dto.MyItemDtos.AddMyItemRequest;
import com.erp.groupware.dto.MyItemDtos.MyItemResponse;
import com.erp.groupware.repository.MyItemRepository;
import com.erp.inventory.service.ItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * My품목 — 사용자별 자주 쓰는 품목 묶음. 판매입력·구매입력 툴바의 [My품목 ▾] 이 읽는다.
 */
@Service
@RequiredArgsConstructor
public class MyItemService {

    private final MyItemRepository myItemRepository;
    private final UserRepository userRepository;
    // 다른 모듈(inventory)은 리포지토리가 아니라 공개 service 를 거친다 — CLAUDE.md 4.2
    private final ItemService itemService;

    @Transactional(readOnly = true)
    public List<MyItemResponse> findMine(String username) {
        return myItemRepository.findMine(username).stream().map(MyItemResponse::from).toList();
    }

    @Transactional
    public MyItemResponse add(AddMyItemRequest req, String username) {
        if (myItemRepository.existsByOwner_UsernameAndItem_Id(username, req.itemId())) {
            throw ApiException.conflict("이미 My품목에 있는 품목입니다.");
        }
        User owner = userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다: " + username));
        // 새로 담는 것은 맨 뒤로. 기존 최대값 + 1 (비어 있으면 0).
        int next = myItemRepository.findMine(username).stream()
                .mapToInt(MyItem::getSortOrder).max().orElse(-1) + 1;
        MyItem m = MyItem.builder()
                .owner(owner)
                .item(itemService.get(req.itemId()))
                .defaultQty(req.defaultQty() == null ? 1 : req.defaultQty())
                .sortOrder(next)
                .build();
        return MyItemResponse.from(myItemRepository.save(m));
    }

    @Transactional
    public void remove(Long itemId, String username) {
        MyItem m = myItemRepository.findByOwner_UsernameAndItem_Id(username, itemId)
                .orElseThrow(() -> ApiException.notFound("My품목에 없는 품목입니다. itemId=" + itemId));
        myItemRepository.delete(m);
    }
}
