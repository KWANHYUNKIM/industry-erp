package com.erp.trade.price;

import com.erp.common.ApiException;
import com.erp.inventory.item.Item;
import com.erp.inventory.item.ItemGroupService;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.item.dto.ItemDtos.ItemResponse;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.settings.priceorder.PriceOrderService;
import com.erp.settings.priceorder.dto.PriceOrderDtos.PriceOrderLine;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.partner.PartnerService;
import com.erp.trade.price.dto.SpecialPriceDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * 특별단가등록(E040124) — 원본 모델: 특별단가그룹 마스터에 품목별 단가 · 품목그룹별 조정을 붙이고,
 * 거래처(영업 · 구매 단가그룹)와 창고(구분별)가 그룹을 든다.
 *
 * <p>전표의 단가 불러오기({@link #resolve})는 단가적용순서설정의 <b>사용</b> 줄을 순서대로 본다 —
 * 창고별특별단가(품목별 · 품목그룹별) · 거래처별특별단가(품목별 · 품목그룹별) 중 먼저 걸리는 값.
 * 기준단가 줄(출고단가 · 입고단가)에 닿으면 멈춘다(화면이 이미 채운 기준단가를 그대로 둔다).
 * 최종단가 · 거래처조정률은 아직 여기서 계산하지 않는다(건너뛴다).
 */
@Service
@RequiredArgsConstructor
public class SpecialPriceService {

    public static final List<String> PRICE_BASES = List.of("출고단가", "입고단가");
    public static final List<String> ROUND_UNITS =
            List.of("소수3자리미만", "소수2자리미만", "소수1자리미만", "소수0자리미만", "십원미만", "백원미만", "천원미만");
    public static final List<String> ROUND_MODES = List.of("반올림", "절사", "절상");

    private final SpecialPriceGroupRepository groupRepository;
    private final SpecialPriceRepository priceRepository;
    private final SpecialPriceItemGroupRepository itemGroupPriceRepository;
    private final SpecialPriceGroupWarehouseRepository warehouseLinkRepository;
    private final ItemService itemService;              // inventory 공개 API
    private final ItemGroupService itemGroupService;    // inventory 공개 API
    private final WarehouseService warehouseService;    // inventory 공개 API
    private final PartnerService partnerService;        // 같은 모듈(trade)
    /** 단가적용순서설정 — trade → settings 는 허용된 간선. */
    private final PriceOrderService priceOrderService;

    // ── 특별단가그룹 ────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<GroupResponse> groups() {
        Set<String> withPartners = new HashSet<>(partnerService.priceGroupCodesInUse());
        return groupRepository.findAllByOrderByCodeAsc().stream()
                .map(g -> GroupResponse.of(g, withPartners.contains(g.getCode()),
                        warehouseLinkRepository.existsByGroupId(g.getId()),
                        priceRepository.existsByGroupId(g.getId()),
                        itemGroupPriceRepository.existsByGroupId(g.getId())))
                .toList();
    }

    @Transactional
    public GroupResponse createGroup(SaveGroupRequest req, String username) {
        String code = req.code().trim();
        if (groupRepository.existsByCode(code)) throw ApiException.conflict("이미 특별단가그룹등록에 존재하는 코드입니다.");
        SpecialPriceGroup g = groupRepository.save(SpecialPriceGroup.builder()
                .code(code).name(req.name().trim()).active(true).createdBy(username).build());
        return GroupResponse.of(g, false, false, false, false);
    }

    @Transactional
    public GroupResponse updateGroup(Long id, SaveGroupRequest req) {
        SpecialPriceGroup g = group(id);
        g.setName(req.name().trim());   // 코드는 잠긴다(바꾸려면 각종코드변경)
        return GroupResponse.of(g, false, false, false, false);
    }

    @Transactional
    public void setGroupActive(Long id, boolean active) {
        group(id).setActive(active);
    }

    @Transactional
    public void deleteGroup(Long id) {
        SpecialPriceGroup g = group(id);
        if (priceRepository.existsByGroupId(id) || itemGroupPriceRepository.existsByGroupId(id)
                || warehouseLinkRepository.existsByGroupId(id) || partnerService.priceGroupCodesInUse().contains(g.getCode())) {
            throw ApiException.conflict("거래처 · 창고 · 품목 · 품목그룹이 설정된 특별단가그룹은 삭제할 수 없습니다: " + g.getCode());
        }
        groupRepository.delete(g);
    }

    private SpecialPriceGroup group(Long id) {
        return groupRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("특별단가그룹을 찾을 수 없습니다. id=" + id));
    }

    // ── 거래처설정 ─────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MemberResponse> partners(Long groupId) {
        String code = group(groupId).getCode();
        List<MemberResponse> out = new ArrayList<>();
        for (BusinessPartner p : partnerService.inPriceGroup(code)) {
            if (code.equals(p.getSalesPriceGroup()))
                out.add(new MemberResponse(p.getId(), SpecialPriceType.SALES, "영업", p.getId(), p.getCode(), p.getName()));
            if (code.equals(p.getPurchasePriceGroup()))
                out.add(new MemberResponse(p.getId(), SpecialPriceType.PURCHASE, "구매", p.getId(), p.getCode(), p.getName()));
        }
        return out;
    }

    /** 거래처추가 — 영업단가그룹 · 구매단가그룹 체크칸. 거래처는 구분마다 그룹 하나라 다른 그룹에 있었으면 옮긴다. */
    @Transactional
    public void addPartner(Long groupId, MemberRequest req) {
        if (!req.sales() && !req.purchase()) throw ApiException.badRequest("구분(영업단가그룹 · 구매단가그룹)을 선택 바랍니다.");
        String code = group(groupId).getCode();
        partnerService.assignPriceGroup(req.targetId(), req.sales() ? code : null, req.purchase() ? code : null);
    }

    @Transactional
    public void removePartner(Long groupId, Long partnerId, SpecialPriceType type) {
        String code = group(groupId).getCode();
        partnerService.releasePriceGroup(partnerId, code, type == SpecialPriceType.SALES);
    }

    // ── 창고설정 ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MemberResponse> warehouses(Long groupId) {
        return warehouseLinkRepository.findAllWithRefs().stream()
                .filter(w -> w.getGroup().getId().equals(groupId))
                .map(MemberResponse::warehouse).toList();
    }

    @Transactional
    public void addWarehouse(Long groupId, MemberRequest req) {
        if (!req.sales() && !req.purchase()) throw ApiException.badRequest("구분(영업단가그룹 · 구매단가그룹)을 선택 바랍니다.");
        SpecialPriceGroup g = group(groupId);
        var wh = warehouseService.get(req.targetId());
        for (SpecialPriceType t : SpecialPriceType.values()) {
            if (t == SpecialPriceType.SALES ? !req.sales() : !req.purchase()) continue;
            var cur = warehouseLinkRepository.findByWarehouse(wh.getId(), t);
            if (cur.isPresent()) cur.get().setGroup(g);
            else warehouseLinkRepository.save(SpecialPriceGroupWarehouse.builder().group(g).warehouse(wh).tradeType(t).build());
        }
    }

    @Transactional
    public void removeWarehouse(Long linkId) {
        warehouseLinkRepository.delete(warehouseLinkRepository.findById(linkId)
                .orElseThrow(() -> ApiException.notFound("창고설정을 찾을 수 없습니다. id=" + linkId)));
    }

    // ── 품목별 ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ItemPriceResponse> itemPrices() {
        return priceRepository.findAllWithRefs().stream().map(ItemPriceResponse::from).toList();
    }

    @Transactional
    public ItemPriceResponse createItemPrice(SaveItemPriceRequest req, String username) {
        SpecialPriceGroup g = group(req.groupId());
        Item item = itemService.get(req.itemId());
        if (priceRepository.existsByGroupIdAndItemId(g.getId(), item.getId())) {
            throw ApiException.conflict("이미 특별단가그룹에 존재하는 코드입니다.");
        }
        SpecialPrice sp = priceRepository.save(SpecialPrice.builder()
                .group(g).item(item)
                .unitPrice(req.unitPrice() != null ? req.unitPrice() : BigDecimal.ZERO)
                .vatIncluded(req.vatIncluded()).active(true).remark(req.remark()).createdBy(username)
                .build());
        return ItemPriceResponse.from(sp);
    }

    /** 변경 — 적용단가 · VAT포함만(그룹 · 품목은 잠긴다). */
    @Transactional
    public ItemPriceResponse updateItemPrice(Long id, SaveItemPriceRequest req) {
        SpecialPrice sp = itemPrice(id);
        sp.setUnitPrice(req.unitPrice() != null ? req.unitPrice() : BigDecimal.ZERO);
        sp.setVatIncluded(req.vatIncluded());
        sp.setRemark(req.remark());
        return ItemPriceResponse.from(sp);
    }

    @Transactional
    public void setItemPriceActive(Long id, boolean active) {
        itemPrice(id).setActive(active);
    }

    @Transactional
    public void deleteItemPrice(Long id) {
        priceRepository.delete(itemPrice(id));
    }

    private SpecialPrice itemPrice(Long id) {
        return priceRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("특별단가를 찾을 수 없습니다. id=" + id));
    }

    // ── 품목그룹별 ────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ItemGroupPriceResponse> itemGroupPrices() {
        return itemGroupPriceRepository.findAllWithRefs().stream()
                .map(g -> ItemGroupPriceResponse.from(g, adjustText(g))).toList();
    }

    @Transactional
    public ItemGroupPriceResponse createItemGroupPrice(SaveItemGroupPriceRequest req, String username) {
        SpecialPriceGroup g = group(req.groupId());
        var ig = itemGroupService.get(req.itemGroupId());
        if (itemGroupPriceRepository.existsByGroupIdAndItemGroupId(g.getId(), ig.getId())) {
            throw ApiException.conflict("이미 특별단가그룹에 존재하는 코드입니다.");
        }
        SpecialPriceItemGroup row = SpecialPriceItemGroup.builder().group(g).itemGroup(ig).active(true).createdBy(username).build();
        applyAdjust(row, req);
        row = itemGroupPriceRepository.save(row);
        return ItemGroupPriceResponse.from(row, adjustText(row));
    }

    @Transactional
    public ItemGroupPriceResponse updateItemGroupPrice(Long id, SaveItemGroupPriceRequest req) {
        SpecialPriceItemGroup row = itemGroupPrice(id);
        applyAdjust(row, req);
        return ItemGroupPriceResponse.from(row, adjustText(row));
    }

    @Transactional
    public void setItemGroupPriceActive(Long id, boolean active) {
        itemGroupPrice(id).setActive(active);
    }

    @Transactional
    public void deleteItemGroupPrice(Long id) {
        itemGroupPriceRepository.delete(itemGroupPrice(id));
    }

    private SpecialPriceItemGroup itemGroupPrice(Long id) {
        return itemGroupPriceRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("품목그룹별 특별단가를 찾을 수 없습니다. id=" + id));
    }

    private void applyAdjust(SpecialPriceItemGroup row, SaveItemGroupPriceRequest req) {
        String basis = blankOr(req.priceBasis(), "출고단가");
        String unit = blankOr(req.roundUnit(), "소수0자리미만");
        String mode = blankOr(req.roundMode(), "반올림");
        if (!PRICE_BASES.contains(basis)) throw ApiException.badRequest("단가기준은 " + String.join(" · ", PRICE_BASES) + " 중 하나입니다.");
        if (!ROUND_UNITS.contains(unit)) throw ApiException.badRequest("조정_단위처리는 " + String.join(" · ", ROUND_UNITS) + " 중 하나입니다.");
        if (!ROUND_MODES.contains(mode)) throw ApiException.badRequest("조정_단위처리는 " + String.join(" · ", ROUND_MODES) + " 중 하나입니다.");
        row.setPriceBasis(basis);
        row.setAdjustRate(req.adjustRate() != null ? req.adjustRate() : BigDecimal.ZERO);
        row.setRoundUnit(unit);
        row.setRoundMode(mode);
    }

    private static String blankOr(String v, String dflt) {
        return v == null || v.isBlank() ? dflt : v.trim();
    }

    static String adjustText(SpecialPriceItemGroup g) {
        String rate = g.getAdjustRate().stripTrailingZeros().toPlainString();
        if (g.getAdjustRate().signum() >= 0) rate = "+" + rate;
        return g.getPriceBasis() + " " + rate + "% (" + g.getRoundUnit() + " " + g.getRoundMode() + ")";
    }

    /** 단가기준 × (100 + 조정_비율) / 100 을 조정_단위처리로. */
    static BigDecimal adjust(BigDecimal base, SpecialPriceItemGroup g) {
        BigDecimal raw = base.multiply(BigDecimal.valueOf(100).add(g.getAdjustRate())).divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP);
        int scale = switch (g.getRoundUnit()) {
            case "소수3자리미만" -> 3;
            case "소수2자리미만" -> 2;
            case "소수1자리미만" -> 1;
            case "십원미만" -> -1;
            case "백원미만" -> -2;
            case "천원미만" -> -3;
            default -> 0;
        };
        RoundingMode mode = switch (g.getRoundMode()) {
            case "절사" -> RoundingMode.DOWN;
            case "절상" -> RoundingMode.UP;
            default -> RoundingMode.HALF_UP;
        };
        BigDecimal r = raw.setScale(scale, mode);
        return scale < 0 ? r.setScale(0) : r;
    }

    // ── 적용단가 ─────────────────────────────────────────────

    /** 품목 × 그룹마다 실제로 걸리는 값 — 품목별단가가 있으면 그것, 없으면 품목그룹별 조정값. */
    @Transactional(readOnly = true)
    public List<AppliedPriceRow> appliedPrices() {
        List<AppliedPriceRow> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (SpecialPrice sp : priceRepository.findAllWithRefs()) {
            if (!sp.isActive() || !sp.getGroup().isActive()) continue;
            Item i = sp.getItem();
            seen.add(i.getId() + ":" + sp.getGroup().getId());
            out.add(new AppliedPriceRow(i.getId(), i.getCode(), i.getName(), i.getSpec(),
                    i.getItemGroup() != null ? i.getItemGroup().getName() : null,
                    "품목별단가", sp.getGroup().getCode(), sp.getGroup().getName(), "",
                    sp.getUnitPrice(), sp.isVatIncluded()));
        }
        List<SpecialPriceItemGroup> adjusts = itemGroupPriceRepository.findAllWithRefs();
        if (!adjusts.isEmpty()) {
            List<ItemResponse> items = itemService.findAll();
            for (SpecialPriceItemGroup g : adjusts) {
                if (!g.isActive() || !g.getGroup().isActive()) continue;
                for (ItemResponse i : items) {
                    if (!g.getItemGroup().getId().equals(i.itemGroupId()) || !seen.add(i.id() + ":" + g.getGroup().getId())) continue;
                    BigDecimal base = "입고단가".equals(g.getPriceBasis()) ? i.purchasePrice() : i.unitPrice();
                    out.add(new AppliedPriceRow(i.id(), i.code(), i.name(), i.spec(), i.itemGroupName(),
                            "품목그룹별", g.getGroup().getCode(), g.getGroup().getName(), adjustText(g),
                            adjust(base != null ? base : BigDecimal.ZERO, g), false));
                }
            }
        }
        out.sort(Comparator.comparing(AppliedPriceRow::itemCode, Comparator.nullsLast(String::compareTo))
                .thenComparing(AppliedPriceRow::groupCode));
        return out;
    }

    // ── 전표의 단가 불러오기 ────────────────────────────────────

    /**
     * (구분, 품목, 거래처, 창고) → 단가적용순서설정의 사용 줄을 순서대로 보며 먼저 걸리는 특별단가.
     * 거래처 · 창고는 없어도 된다(그 줄은 건너뛴다).
     */
    @Transactional(readOnly = true)
    public ResolveResponse resolve(SpecialPriceType type, Long itemId, Long partnerId, Long warehouseId) {
        List<PriceOrderLine> lines = priceOrderService.get(type == SpecialPriceType.SALES ? "SALES" : "PURCHASE").stream()
                .sorted(Comparator.comparingInt(PriceOrderLine::applyOrder)).toList();
        Item item = null;
        for (PriceOrderLine line : lines) {
            if (!line.active()) continue;
            String fn = line.functionName();
            if (PRICE_BASES.contains(fn)) break;                     // 기준단가 — 화면이 채운 값 그대로
            boolean byWarehouse = fn.startsWith("창고별특별단가");
            boolean byPartner = fn.startsWith("거래처별특별단가");
            if (!byWarehouse && !byPartner) continue;                // 최종단가 · 거래처조정률 — 아직 계산 안 함
            SpecialPriceGroup g = byWarehouse ? warehouseGroup(warehouseId, type) : partnerGroup(partnerId, type);
            if (g == null || !g.isActive()) continue;
            if (fn.endsWith("(품목별)")) {
                var hit = priceRepository.findActive(g.getId(), itemId);
                if (hit.isPresent()) {
                    return new ResolveResponse(true, hit.get().getUnitPrice(), fn, g.getCode(), g.getName(), hit.get().isVatIncluded());
                }
            } else {
                if (item == null) item = itemService.get(itemId);
                if (item.getItemGroup() == null) continue;
                var hit = itemGroupPriceRepository.findActive(g.getId(), item.getItemGroup().getId());
                if (hit.isPresent()) {
                    BigDecimal base = "입고단가".equals(hit.get().getPriceBasis()) ? item.getPurchasePrice() : item.getUnitPrice();
                    return new ResolveResponse(true, adjust(base != null ? base : BigDecimal.ZERO, hit.get()), fn,
                            g.getCode(), g.getName(), false);
                }
            }
        }
        return ResolveResponse.none();
    }

    private SpecialPriceGroup warehouseGroup(Long warehouseId, SpecialPriceType type) {
        if (warehouseId == null) return null;
        return warehouseLinkRepository.findByWarehouse(warehouseId, type).map(SpecialPriceGroupWarehouse::getGroup).orElse(null);
    }

    private SpecialPriceGroup partnerGroup(Long partnerId, SpecialPriceType type) {
        if (partnerId == null) return null;
        BusinessPartner p = partnerService.get(partnerId);
        String code = type == SpecialPriceType.SALES ? p.getSalesPriceGroup() : p.getPurchasePriceGroup();
        return code == null ? null : groupRepository.findByCode(code).orElse(null);
    }

    /** 단가적용순서설정에서 특별단가 줄(창고별 · 거래처별) 중 하나라도 '사용' 인가 — 화면 안내용. */
    public boolean partnerSpecialPriceEnabled(SpecialPriceType type) {
        return priceOrderService.get(type == SpecialPriceType.SALES ? "SALES" : "PURCHASE").stream()
                .anyMatch(l -> l.active() && l.functionName().contains("특별단가"));
    }
}
