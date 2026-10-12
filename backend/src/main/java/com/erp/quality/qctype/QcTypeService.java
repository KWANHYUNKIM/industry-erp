package com.erp.quality.qctype;

import com.erp.common.ApiException;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.item.dto.ItemDtos.ItemResponse;
import com.erp.quality.qctype.dto.QcTypeDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 품질검사유형등록(E040632) — 2026-10-12 loginaa 실측.
 *
 * <ul>
 *   <li>검사유형: [신규(F2)] 창(품질검사유형코드 · 품질검사유형명, 둘 다 필수) · 코드를 눌러 수정 ·
 *       [사용중단/재사용 ▲] 의 사용중단 · 삭제('삭제하시겠습니까?') · 재사용.</li>
 *   <li>[검사항목등록]: 검사항목리스트(검사항목코드 · 검사항목명 · 형식 · 필수항목 · 사용 · 상세항목). 신규 창은
 *       형식(코드형식 · 숫자형식 · 문자형식) · 검사항목코드(다음 번호 00001 이 미리 채워짐) · 검사항목명 · 필수입력항목(Y).
 *       삭제는 '코드형일 경우 하위 상세항목코드도 같이 삭제됩니다.' 를 묻고 상세항목까지 지운다.</li>
 *   <li>[검사항목설정]: 형식마다 칸 넷(코드형검사항목1~4 · 숫자형검사항목1~4 · 문자형검사항목1~4).</li>
 *   <li>[품목설정]: 이 유형을 쓰는 품목(품목코드 · 품목명) — [추가] · [선택삭제].</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class QcTypeService {

    private final QcTypeRepository typeRepository;
    private final QcCheckItemRepository checkItemRepository;
    private final QcCheckItemDetailRepository detailRepository;
    // 품목은 재고 모듈의 공개 service 로 읽는다 — CLAUDE.md 4.2
    private final ItemService itemService;

    /* ───────────── 검사유형 ───────────── */

    @Transactional(readOnly = true)
    public List<TypeResponse> findTypes() {
        return typeRepository.findAllByOrderByCodeAsc().stream()
                .map(t -> new TypeResponse(t.getId(), t.getCode(), t.getName(), t.isActive(),
                        !t.getCheckSlots().isEmpty(), !t.getItemIds().isEmpty()))
                .toList();
    }

    @Transactional
    public TypeResponse createType(CreateTypeRequest req) {
        String code = req.code().trim();
        if (typeRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 사용중인 품질검사유형코드입니다: " + code);
        }
        QcType t = typeRepository.save(QcType.builder().code(code).name(req.name().trim()).build());
        return new TypeResponse(t.getId(), t.getCode(), t.getName(), true, false, false);
    }

    @Transactional
    public TypeResponse updateType(Long id, UpdateTypeRequest req) {
        QcType t = getType(id);
        t.setName(req.name().trim());
        return new TypeResponse(t.getId(), t.getCode(), t.getName(), t.isActive(),
                !t.getCheckSlots().isEmpty(), !t.getItemIds().isEmpty());
    }

    /** [사용중단/재사용 ▲] — active 가 null 이면 삭제. 삭제하면 그 유형의 검사항목설정 · 품목설정도 같이 사라진다. */
    @Transactional
    public void bulkTypes(BulkRequest req) {
        for (Long id : req.ids()) {
            QcType t = getType(id);
            if (req.active() == null) {
                typeRepository.delete(t);
            } else {
                t.setActive(req.active());
            }
        }
    }

    private QcType getType(Long id) {
        return typeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("품질검사유형을 찾을 수 없습니다: " + id));
    }

    /* ───────────── 검사항목설정 ───────────── */

    @Transactional(readOnly = true)
    public List<SlotResponse> findSlots(Long typeId) {
        QcType t = getType(typeId);
        Map<Long, QcCheckItem> items = checkItemRepository.findAllById(
                        t.getCheckSlots().stream().map(QcTypeCheckSlot::getCheckItemId).toList()).stream()
                .collect(Collectors.toMap(QcCheckItem::getId, Function.identity()));
        return t.getCheckSlots().stream()
                .filter(s -> items.containsKey(s.getCheckItemId()))
                .map(s -> {
                    QcCheckItem c = items.get(s.getCheckItemId());
                    return new SlotResponse(c.getFormat(), s.getSlot(), c.getId(), c.getCode(), c.getName());
                })
                .sorted(Comparator.comparing(SlotResponse::format).thenComparingInt(SlotResponse::slot))
                .toList();
    }

    /** 칸을 통째로 갈아 끼운다. 같은 형식의 같은 칸에 둘, 같은 항목을 두 칸에 넣을 수 없다. */
    @Transactional
    public List<SlotResponse> saveSlots(Long typeId, SaveSlotsRequest req) {
        QcType t = getType(typeId);
        List<SlotRequest> slots = req.slots() == null ? List.of() : req.slots();
        Set<String> taken = new HashSet<>();
        Set<Long> used = new HashSet<>();
        List<QcTypeCheckSlot> next = new ArrayList<>();
        for (SlotRequest s : slots) {
            if (s.slot() < 1 || s.slot() > 4) {
                throw ApiException.badRequest("검사항목 칸은 1~4 입니다.");
            }
            QcCheckItem c = getCheckItem(s.checkItemId());
            if (!used.add(c.getId())) {
                throw ApiException.badRequest("같은 검사항목을 두 번 설정할 수 없습니다: " + c.getName());
            }
            if (!taken.add(c.getFormat() + "-" + s.slot())) {
                throw ApiException.badRequest(c.getFormat().getDisplayName() + " 검사항목" + s.slot() + " 칸이 겹칩니다.");
            }
            next.add(new QcTypeCheckSlot(c.getId(), s.slot().shortValue()));
        }
        t.getCheckSlots().clear();
        t.getCheckSlots().addAll(next);
        return findSlots(typeId);
    }

    /* ───────────── 품목설정 ───────────── */

    @Transactional(readOnly = true)
    public List<TypeItemResponse> findTypeItems(Long typeId) {
        Set<Long> ids = getType(typeId).getItemIds();
        return itemService.findAll().stream()
                .filter(i -> ids.contains(i.id()))
                .map(i -> new TypeItemResponse(i.id(), i.code(), i.name(), i.spec()))
                .toList();
    }

    /** [추가] — 한 품목은 한 유형에만 붙는다(원본 [품목별설정리스트] 의 [검사유형] 이 한 칸). */
    @Transactional
    public List<TypeItemResponse> addTypeItems(Long typeId, ItemIdsRequest req) {
        QcType t = getType(typeId);
        for (Long itemId : req.itemIds()) {
            ItemResponse item = itemService.findById(itemId);
            for (QcType other : typeRepository.findByItemId(itemId)) {
                if (!other.getId().equals(typeId)) {
                    throw ApiException.conflict("[" + item.name() + "] 은(는) 이미 검사유형 [" + other.getName()
                            + "] 에 설정된 품목입니다.");
                }
            }
            t.getItemIds().add(itemId);
        }
        return findTypeItems(typeId);
    }

    /** [선택삭제] */
    @Transactional
    public List<TypeItemResponse> removeTypeItems(Long typeId, ItemIdsRequest req) {
        getType(typeId).getItemIds().removeAll(req.itemIds());
        return findTypeItems(typeId);
    }

    /** [품목별설정리스트] — 모든 품목의 품질 설정과 붙은 검사유형. */
    @Transactional(readOnly = true)
    public List<ItemSettingResponse> findItemSettings() {
        Map<Long, QcType> byItem = new HashMap<>();
        for (QcType t : typeRepository.findAll()) {
            for (Long itemId : t.getItemIds()) {
                byItem.put(itemId, t);
            }
        }
        return itemService.findAll().stream()
                .filter(ItemResponse::active)
                .map(i -> {
                    QcType t = byItem.get(i.id());
                    return new ItemSettingResponse(i.id(), i.code(), i.name(), i.spec(),
                            i.qcOnPurchase(), i.qcOnProduction(), i.qcMethod(),
                            t == null ? null : t.getCode(), t == null ? null : t.getName());
                })
                .toList();
    }

    /* ───────────── 검사항목 ───────────── */

    @Transactional(readOnly = true)
    public List<CheckItemResponse> findCheckItems() {
        return checkItemRepository.findAllByOrderByCodeAsc().stream().map(this::toResponse).toList();
    }

    /** 신규 창이 미리 채워 둘 다음 코드 — 숫자만으로 된 코드 중 가장 큰 것 + 1, 다섯 자리. */
    @Transactional(readOnly = true)
    public String nextCheckItemCode() {
        return nextCode(checkItemRepository.findAll().stream().map(QcCheckItem::getCode).toList());
    }

    @Transactional
    public CheckItemResponse createCheckItem(SaveCheckItemRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextCheckItemCode() : req.code().trim();
        if (checkItemRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 사용중인 검사항목코드입니다: " + code);
        }
        QcCheckItem c = checkItemRepository.save(QcCheckItem.builder()
                .code(code).name(req.name().trim()).format(req.format()).required(req.required()).build());
        return toResponse(c);
    }

    /** 코드는 못 바꾼다. 형식을 코드형식에서 바꾸면 상세항목이 쓸모없어지므로, 상세항목이 있으면 막는다. */
    @Transactional
    public CheckItemResponse updateCheckItem(Long id, SaveCheckItemRequest req) {
        QcCheckItem c = getCheckItem(id);
        if (c.getFormat() != req.format()) {
            if (c.getFormat() == QcCheckFormat.CODE && !detailRepository.findByCheckItemIdOrderByCodeAsc(id).isEmpty()) {
                throw ApiException.badRequest("상세항목이 있는 코드형식 검사항목은 형식을 바꿀 수 없습니다.");
            }
            if (typeRepository.existsByCheckItemId(id)) {
                throw ApiException.badRequest("검사유형에 설정된 검사항목은 형식을 바꿀 수 없습니다.");
            }
        }
        c.setName(req.name().trim());
        c.setFormat(req.format());
        c.setRequired(req.required());
        return toResponse(c);
    }

    /** 삭제는 상세항목까지 지운다. 검사유형에 설정된 항목은 먼저 그 칸을 비워야 한다. */
    @Transactional
    public void bulkCheckItems(BulkRequest req) {
        for (Long id : req.ids()) {
            QcCheckItem c = getCheckItem(id);
            if (req.active() != null) {
                c.setActive(req.active());
                continue;
            }
            if (typeRepository.existsByCheckItemId(id)) {
                throw ApiException.badRequest("검사유형에 설정된 검사항목은 삭제할 수 없습니다: " + c.getName());
            }
            detailRepository.deleteByCheckItemId(id);
            checkItemRepository.delete(c);
        }
    }

    private QcCheckItem getCheckItem(Long id) {
        return checkItemRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("검사항목을 찾을 수 없습니다: " + id));
    }

    private CheckItemResponse toResponse(QcCheckItem c) {
        int details = c.getFormat() == QcCheckFormat.CODE
                ? detailRepository.findByCheckItemIdOrderByCodeAsc(c.getId()).size() : 0;
        return new CheckItemResponse(c.getId(), c.getCode(), c.getName(), c.getFormat(),
                c.getFormat().getDisplayName(), c.isRequired(), c.isActive(), details);
    }

    /* ───────────── 상세항목 ───────────── */

    @Transactional(readOnly = true)
    public List<DetailResponse> findDetails(Long checkItemId) {
        getCheckItem(checkItemId);
        return detailRepository.findByCheckItemIdOrderByCodeAsc(checkItemId).stream()
                .map(d -> new DetailResponse(d.getId(), d.getCode(), d.getName(), d.isActive()))
                .toList();
    }

    @Transactional(readOnly = true)
    public String nextDetailCode(Long checkItemId) {
        return nextCode(detailRepository.findByCheckItemIdOrderByCodeAsc(checkItemId).stream()
                .map(QcCheckItemDetail::getCode).toList());
    }

    /** 상세항목은 코드형식 검사항목에만 있다 — 원본 [상세항목] 열의 [추가] 가 코드형식 줄에만 있다. */
    @Transactional
    public DetailResponse createDetail(Long checkItemId, SaveDetailRequest req) {
        QcCheckItem c = getCheckItem(checkItemId);
        if (c.getFormat() != QcCheckFormat.CODE) {
            throw ApiException.badRequest("상세항목은 코드형식 검사항목에만 등록할 수 있습니다.");
        }
        String code = req.code() == null || req.code().isBlank() ? nextDetailCode(checkItemId) : req.code().trim();
        if (detailRepository.existsByCheckItemIdAndCode(checkItemId, code)) {
            throw ApiException.conflict("이미 사용중인 상세항목코드입니다: " + code);
        }
        QcCheckItemDetail d = detailRepository.save(QcCheckItemDetail.builder()
                .checkItem(c).code(code).name(req.name().trim()).build());
        return new DetailResponse(d.getId(), d.getCode(), d.getName(), d.isActive());
    }

    @Transactional
    public DetailResponse updateDetail(Long detailId, SaveDetailRequest req) {
        QcCheckItemDetail d = getDetail(detailId);
        d.setName(req.name().trim());
        return new DetailResponse(d.getId(), d.getCode(), d.getName(), d.isActive());
    }

    @Transactional
    public void bulkDetails(BulkRequest req) {
        for (Long id : req.ids()) {
            QcCheckItemDetail d = getDetail(id);
            if (req.active() == null) {
                detailRepository.delete(d);
            } else {
                d.setActive(req.active());
            }
        }
    }

    private QcCheckItemDetail getDetail(Long id) {
        return detailRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("상세항목을 찾을 수 없습니다: " + id));
    }

    private static String nextCode(List<String> codes) {
        long max = codes.stream().filter(s -> s.matches("\\d{5}")).mapToLong(Long::parseLong).max().orElse(0);
        return String.format("%05d", max + 1);
    }
}
